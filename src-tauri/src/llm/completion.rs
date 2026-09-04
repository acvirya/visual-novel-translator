use std::collections::HashMap;
use crate::http::{format_reqwest_error, get_http_client};
use super::types::OpenRouterCompletionResponse;

pub fn parse_openrouter_payload(parsed: &serde_json::Value, raw_body: &str) -> Result<OpenRouterCompletionResponse, String> {
    if let Some(err_obj) = parsed.get("error") {
        let msg = err_obj["message"].as_str().unwrap_or("Unknown upstream API error");
        let code = err_obj["code"].as_i64().or_else(|| err_obj["code"].as_str().and_then(|s| s.parse().ok())).unwrap_or(0);
        if code > 0 {
            return Err(format!("Upstream Provider Error ({}): {}", code, msg));
        } else {
            return Err(format!("Upstream Provider Error: {}", msg));
        }
    }

    let content = if let Some(content) = parsed["choices"][0]["message"]["content"].as_str() {
        if !content.trim().is_empty() {
            Some(content.trim().to_string())
        } else {
            None
        }
    } else if let Some(reasoning) = parsed["choices"][0]["message"]["reasoning"].as_str() {
        if !reasoning.trim().is_empty() {
            Some(reasoning.trim().to_string())
        } else {
            None
        }
    } else if let Some(reasoning_content) = parsed["choices"][0]["message"]["reasoning_content"].as_str() {
        if !reasoning_content.trim().is_empty() {
            Some(reasoning_content.trim().to_string())
        } else {
            None
        }
    } else if let Some(text_content) = parsed["choices"][0]["text"].as_str() {
        if !text_content.trim().is_empty() {
            Some(text_content.trim().to_string())
        } else {
            None
        }
    } else if let Some(content_arr) = parsed["content"].as_array() {
        // Anthropic messages format: content: [{ type: "text", text: "..." }]
        let mut text = String::new();
        for item in content_arr {
            if let Some(t) = item["text"].as_str() {
                text.push_str(t);
            }
        }
        if !text.trim().is_empty() {
            Some(text.trim().to_string())
        } else {
            None
        }
    } else {
        None
    };

    let content = content.ok_or_else(|| format!("Empty or unexpected response payload: {}", raw_body))?;

    let prompt_tokens = parsed["usage"]["prompt_tokens"]
        .as_u64()
        .or_else(|| parsed["usage"]["input_tokens"].as_u64())
        .unwrap_or(0) as u32;
    let completion_tokens = parsed["usage"]["completion_tokens"]
        .as_u64()
        .or_else(|| parsed["usage"]["output_tokens"].as_u64())
        .unwrap_or(0) as u32;
    let cached_tokens = parsed["usage"]["prompt_tokens_details"]["cached_tokens"]
        .as_u64()
        .or_else(|| parsed["usage"]["cache_read_input_tokens"].as_u64())
        .unwrap_or(0) as u32;
    let cost = parsed["usage"]["total_cost"]
        .as_f64()
        .or_else(|| parsed["usage"]["cost"].as_f64())
        .unwrap_or(0.0);

    Ok(OpenRouterCompletionResponse {
        content,
        prompt_tokens,
        completion_tokens,
        cached_tokens,
        cost,
    })
}

#[tauri::command]
pub async fn openrouter_chat_completion(
    api_key: String,
    model_id: String,
    messages_json: String,
    temperature: f64,
    max_tokens: Option<u32>,
    timeout_seconds: Option<u64>,
    providers: Option<Vec<String>>,
    reasoning: Option<serde_json::Value>,
) -> Result<OpenRouterCompletionResponse, String> {
    let client = get_http_client().map_err(|e| e.to_string())?;
    let timeout_duration = std::time::Duration::from_secs(timeout_seconds.unwrap_or(600)); // Default 10 min

    let messages: serde_json::Value = serde_json::from_str(&messages_json)
        .map_err(|e| format!("Invalid messages JSON: {}", e))?;

    let mut payload = serde_json::json!({
        "model": model_id,
        "messages": messages,
        "temperature": temperature,
        "response_format": { "type": "json_object" },
        "include_reasoning": true,
    });

    if let Some(ref r) = reasoning {
        if r.is_object() && !r.as_object().unwrap().is_empty() {
            payload["reasoning"] = r.clone();
        }
    }

    let mut provider_obj = serde_json::json!({
        "allow_fallbacks": false,
    });
    if let Some(ref list) = providers {
        if !list.is_empty() {
            provider_obj["only"] = serde_json::json!(list);
        }
    }
    payload["provider"] = provider_obj;

    if let Some(mt) = max_tokens {
        if mt > 0 {
            payload["max_tokens"] = serde_json::json!(mt);
        }
    }

    let max_attempts = 3;
    let mut last_error = String::new();

    for attempt in 1..=max_attempts {
        let resp = match client
            .post("https://openrouter.ai/api/v1/chat/completions")
            .timeout(timeout_duration)
            .header("Authorization", format!("Bearer {}", api_key.trim()))
            .header("Content-Type", "application/json")
            .header("HTTP-Referer", "https://github.com/acvirya/visual-novel-translator")
            .header("X-Title", "VN Translator Desktop")
            .json(&payload)
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => {
                last_error = format_reqwest_error("Failed to connect to OpenRouter API", &e);
                if attempt < max_attempts {
                    tokio::time::sleep(std::time::Duration::from_millis(500 * attempt as u64)).await;
                    continue;
                }
                return Err(last_error);
            }
        };

        let status = resp.status();
        let bytes = match resp.bytes().await {
            Ok(b) => b,
            Err(e) => {
                last_error = format_reqwest_error("Failed to read OpenRouter response bytes", &e);
                if attempt < max_attempts {
                    tokio::time::sleep(std::time::Duration::from_millis(500 * attempt as u64)).await;
                    continue;
                }
                return Err(last_error);
            }
        };
        let body_text = String::from_utf8_lossy(&bytes).to_string();

        if !status.is_success() {
            // If the model rejected json_object parameter specifically (HTTP 400 or 422), retry without response_format
            let is_format_error = (status.as_u16() == 400 || status.as_u16() == 422)
                && (body_text.contains("response_format")
                    || body_text.contains("json_object")
                    || body_text.contains("structured output")
                    || body_text.contains("unsupported parameter")
                    || body_text.contains("schema"));

            if is_format_error {
                let mut fallback_payload = serde_json::json!({
                    "model": model_id,
                    "messages": messages,
                    "temperature": temperature,
                });

                if let Some(ref r) = reasoning {
                    if r.is_object() && !r.as_object().unwrap().is_empty() {
                        fallback_payload["reasoning"] = r.clone();
                    }
                }

                let mut fallback_provider_obj = serde_json::json!({
                    "allow_fallbacks": false,
                });
                if let Some(ref list) = providers {
                    if !list.is_empty() {
                        fallback_provider_obj["only"] = serde_json::json!(list);
                    }
                }
                fallback_payload["provider"] = fallback_provider_obj;

                if let Some(mt) = max_tokens {
                    if mt > 0 {
                        fallback_payload["max_tokens"] = serde_json::json!(mt);
                    }
                }

                let retry_resp = client
                    .post("https://openrouter.ai/api/v1/chat/completions")
                    .timeout(timeout_duration)
                    .header("Authorization", format!("Bearer {}", api_key.trim()))
                    .header("Content-Type", "application/json")
                    .header("HTTP-Referer", "https://github.com/acvirya/visual-novel-translator")
                    .header("X-Title", "VN Translator Desktop")
                    .json(&fallback_payload)
                    .send()
                    .await
                    .map_err(|e| format_reqwest_error("Failed to connect to OpenRouter API (format fallback retry)", &e))?;

                let retry_status = retry_resp.status();
                let retry_bytes = retry_resp.bytes().await.map_err(|e| format_reqwest_error("Failed to read format fallback retry response bytes", &e))?;
                let retry_body = String::from_utf8_lossy(&retry_bytes).to_string();
                if !retry_status.is_success() {
                    return Err(format!("OpenRouter API error (HTTP {}): {}", retry_status, retry_body));
                }
                let parsed: serde_json::Value = serde_json::from_str(&retry_body)
                    .map_err(|e| format!("Failed to parse OpenRouter response: {} (raw body: {})", e, retry_body))?;
                return parse_openrouter_payload(&parsed, &retry_body);
            }
            let status_code = status.as_u16();
            let is_transient = status_code == 429 || status_code == 500 || status_code == 502 || status_code == 503 || status_code == 504 || body_text.contains("unreachable") || body_text.contains("temporarily unavailable") || body_text.contains("high demand");
            if is_transient && attempt < max_attempts {
                last_error = format!("OpenRouter API error (HTTP {}): {}", status, body_text);
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                continue;
            }
            return Err(format!("OpenRouter API error (HTTP {}): {}", status, body_text));
        }

        let parsed: serde_json::Value = serde_json::from_str(&body_text)
            .map_err(|e| format!("Failed to parse OpenRouter response: {} (raw body: {})", e, body_text))?;

        match parse_openrouter_payload(&parsed, &body_text) {
            Ok(res) => return Ok(res),
            Err(e) => {
                let is_transient = e.contains("502") || e.contains("503") || e.contains("429") || e.contains("queue-time") || e.contains("rate limit") || e.contains("unreachable") || e.contains("temporarily unavailable");
                if is_transient && attempt < max_attempts {
                    last_error = e;
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                    continue;
                }
                return Err(e);
            }
        }
    }

    Err(last_error)
}

#[tauri::command]
pub async fn llm_chat_completion(
    url: String,
    headers: HashMap<String, String>,
    payload_json: String,
    timeout_seconds: Option<u64>,
) -> Result<OpenRouterCompletionResponse, String> {
    let client = get_http_client().map_err(|e| e.to_string())?;
    let timeout_duration = std::time::Duration::from_secs(timeout_seconds.unwrap_or(600));

    let payload: serde_json::Value = serde_json::from_str(&payload_json)
        .map_err(|e| format!("Invalid payload JSON: {}", e))?;

    let max_attempts = 3;
    let mut last_error = String::new();

    for attempt in 1..=max_attempts {
        let mut req = client.post(&url).timeout(timeout_duration);
        for (k, v) in &headers {
            req = req.header(k, v);
        }

        let send_res = req.json(&payload).send().await;
        let resp = match send_res {
            Ok(r) => r,
            Err(e) => {
                last_error = format_reqwest_error(&format!("Failed to connect to LLM API ({})", url), &e);
                if attempt < max_attempts {
                    tokio::time::sleep(std::time::Duration::from_millis(500 * attempt as u64)).await;
                    continue;
                }
                return Err(last_error);
            }
        };

        let status = resp.status();
        let bytes = match resp.bytes().await {
            Ok(b) => b,
            Err(e) => {
                last_error = format_reqwest_error("Failed to read response body", &e);
                if attempt < max_attempts {
                    tokio::time::sleep(std::time::Duration::from_millis(500 * attempt as u64)).await;
                    continue;
                }
                return Err(last_error);
            }
        };

        let body_text = String::from_utf8_lossy(&bytes).to_string();

        if !status.is_success() {
            let status_code = status.as_u16();
            let is_transient = status_code == 429 || status_code == 500 || status_code == 502 || status_code == 503 || status_code == 504;
            if is_transient && attempt < max_attempts {
                last_error = format!("LLM API error (HTTP {}): {}", status, body_text);
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                continue;
            }
            return Err(format!("LLM API error (HTTP {}): {}", status, body_text));
        }

        let parsed: serde_json::Value = serde_json::from_str(&body_text)
            .map_err(|e| format!("Failed to parse response JSON: {} (raw body: {})", e, body_text))?;

        match parse_openrouter_payload(&parsed, &body_text) {
            Ok(res) => return Ok(res),
            Err(e) => {
                let is_transient = e.contains("502") || e.contains("503") || e.contains("429") || e.contains("queue-time") || e.contains("rate limit");
                if is_transient && attempt < max_attempts {
                    last_error = e;
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                    continue;
                }
                return Err(e);
            }
        }
    }

    Err(last_error)
}

#[tauri::command]
pub async fn test_llm_connection(
    url: String,
    headers: HashMap<String, String>,
) -> Result<String, String> {
    let client = get_http_client().map_err(|e| e.to_string())?;
    let mut req = client.get(&url).timeout(std::time::Duration::from_secs(15));
    for (k, v) in headers {
        req = req.header(&k, &v);
    }

    let resp = req.send().await.map_err(|e| format_reqwest_error("Connection failed", &e))?;
    let status = resp.status();
    let bytes = resp.bytes().await.map_err(|e| format_reqwest_error("Failed to read body", &e))?;
    let body = String::from_utf8_lossy(&bytes).to_string();

    if status.is_success() {
        Ok(body)
    } else {
        Err(format!("HTTP {}: {}", status, body))
    }
}
