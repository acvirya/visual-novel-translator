use crate::http::{format_reqwest_error, get_http_client};

fn parse_google_translation(json: &serde_json::Value) -> Option<String> {
    let text = if let Some(sentences) = json.get("sentences").and_then(|value| value.as_array()) {
        sentences
            .iter()
            .filter_map(|sentence| sentence.get("trans").and_then(|value| value.as_str()))
            .collect::<String>()
    } else {
        let rows = json.as_array()?;
        match rows.first()? {
            serde_json::Value::String(text) => text.clone(),
            serde_json::Value::Array(segments) => {
                // clients5 returns [[translation, detected_language]], while
                // translate_a/single nests an array of translated segments.
                if let Some(text) = segments.first().and_then(|value| value.as_str()) {
                    text.to_string()
                } else {
                    segments
                        .iter()
                        .filter_map(|segment| segment.get(0).and_then(|value| value.as_str()))
                        .collect::<String>()
                }
            }
            _ => return None,
        }
    };
    let text = text.trim();
    if text.is_empty() {
        None
    } else {
        Some(text.to_string())
    }
}

#[tauri::command]
pub async fn translate_free_mt(
    text: String,
    source_lang: String,
    target_lang: String,
    provider: String,
    api_key: Option<String>,
) -> Result<String, String> {
    let client = get_http_client().map_err(|e| e.to_string())?;

    let prov = provider.to_lowercase();

    if !matches!(prov.as_str(), "deepl" | "google") {
        return Err("Unknown translation provider".into());
    }
    if text.trim().is_empty() {
        return Err("Translation text cannot be empty".into());
    }
    if text.len() > 128 * 1024 {
        return Err("Translation text exceeds 128 KiB".into());
    }
    // Respect the selected provider: failures must never disclose text to another service.
    if prov == "deepl" {
        let key = api_key
            .filter(|k| !k.trim().is_empty())
            .ok_or("A DeepL API key is required")?;
        let mut payload =
            serde_json::json!({ "text": [text], "target_lang": target_lang.to_uppercase() });
        if source_lang != "auto" {
            payload["source_lang"] = serde_json::json!(source_lang.to_uppercase());
        }
        let res = client
            .post("https://api-free.deepl.com/v2/translate")
            .timeout(std::time::Duration::from_secs(30))
            .header("Authorization", format!("DeepL-Auth-Key {}", key.trim()))
            .json(&payload)
            .send()
            .await
            .map_err(|e| format_reqwest_error("DeepL request failed", &e))?;
        if !res.status().is_success() {
            return Err(format!("DeepL API returned HTTP {}", res.status()));
        }
        let json: serde_json::Value = res
            .json()
            .await
            .map_err(|e| format_reqwest_error("Invalid DeepL response", &e))?;
        return json["translations"][0]["text"]
            .as_str()
            .filter(|s| !s.trim().is_empty())
            .map(|s| s.trim().to_string())
            .ok_or_else(|| "DeepL returned an empty translation".into());
    }

    // 2. Google Translate Free MT with Multi-Endpoint Fallback (L6)
    let endpoints = [
        "https://translate.googleapis.com/translate_a/single",
        "https://clients5.google.com/translate_a/t",
        "https://translate.google.com/translate_a/single",
    ];

    let mut last_error = String::new();

    for endpoint in &endpoints {
        let resp = client
            .get(*endpoint)
            .timeout(std::time::Duration::from_secs(30))
            .header(
                "User-Agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            )
            .query(&[
                ("client", "gtx"),
                ("sl", &source_lang),
                ("tl", &target_lang),
                ("dt", "t"),
                ("q", &text),
            ])
            .send()
            .await;

        match resp {
            Ok(r) if r.status().is_success() => {
                last_error = format!("Invalid or empty translation response from {}", endpoint);
                if let Ok(json) = r.json::<serde_json::Value>().await {
                    if let Some(text) = parse_google_translation(&json) {
                        return Ok(text);
                    }
                }
            }
            Ok(r) => {
                last_error = format!("HTTP error {} from {}", r.status(), endpoint);
            }
            Err(e) => {
                last_error =
                    format_reqwest_error("Google translation request failed", &e.without_url());
            }
        }
    }

    Err(format!(
        "Free translation failed across all endpoints: {}",
        last_error
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_google_segment_and_fallback_responses() {
        for response in [
            serde_json::json!([[["Hello ", "source"], ["world!", "source"]], null, "ja"]),
            serde_json::json!(["Hello world!"]),
            serde_json::json!([["Hello world!", "ja"]]),
            serde_json::json!({"sentences": [{"trans": "Hello "}, {"trans": "world!"}]}),
        ] {
            assert_eq!(
                parse_google_translation(&response).as_deref(),
                Some("Hello world!")
            );
        }
        assert!(parse_google_translation(&serde_json::json!([[""]])).is_none());
        assert!(parse_google_translation(&serde_json::json!({"error": "blocked"})).is_none());
    }

    #[tokio::test]
    #[ignore = "Requires access to the public Google Translate endpoint"]
    async fn google_translates_japanese_sample() {
        let text = "\u{3053}\u{3093}\u{306b}\u{3061}\u{306f}\u{3001}\u{4e16}\u{754c}\u{ff01}";
        let translated =
            translate_free_mt(text.into(), "ja".into(), "en".into(), "google".into(), None)
                .await
                .expect("Google MT request");
        assert_ne!(translated.trim(), text);
        assert!(translated.to_lowercase().contains("hello"));
    }
}
