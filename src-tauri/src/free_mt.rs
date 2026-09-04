use crate::http::get_http_client;

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

    // 1. DeepL Free API if API Key provided
    if prov.contains("deepl") {
        if let Some(key) = api_key.filter(|k| !k.trim().is_empty()) {
            let res = client
                .post("https://api-free.deepl.com/v2/translate")
                .header("Authorization", format!("DeepL-Auth-Key {}", key.trim()))
                .json(&serde_json::json!({
                    "text": [text],
                    "target_lang": target_lang.to_uppercase(),
                    "source_lang": if source_lang == "auto" { serde_json::Value::Null } else { serde_json::Value::String(source_lang.to_uppercase()) }
                }))
                .send()
                .await;

            if let Ok(resp) = res {
                if resp.status().is_success() {
                    if let Ok(json) = resp.json::<serde_json::Value>().await {
                        if let Some(txt) = json["translations"][0]["text"].as_str() {
                            return Ok(txt.trim().to_string());
                        }
                    }
                }
            }
        }
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
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
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
                if let Ok(json) = r.json::<serde_json::Value>().await {
                    if let Some(arr) = json.as_array() {
                        if let Some(first_arr) = arr.first().and_then(|v| v.as_array()) {
                            let mut result = String::new();
                            for seg in first_arr {
                                if let Some(seg_arr) = seg.as_array() {
                                    if let Some(txt) = seg_arr.first().and_then(|v| v.as_str()) {
                                        result.push_str(txt);
                                    }
                                }
                            }
                            if !result.is_empty() {
                                return Ok(result.trim().to_string());
                            }
                        } else if let Some(first_str) = arr.first().and_then(|v| v.as_str()) {
                            // Format from clients5: ["translated text"]
                            return Ok(first_str.trim().to_string());
                        }
                    }
                }
            }
            Ok(r) => {
                last_error = format!("HTTP error {} from {}", r.status(), endpoint);
            }
            Err(e) => {
                last_error = format!("Network error connecting to {}: {}", endpoint, e);
            }
        }
    }

    Err(format!("Free translation failed across all endpoints: {}", last_error))
}
