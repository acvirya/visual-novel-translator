/*!
 * Shared OpenRouter and LLM Payload Construction (ARCH-05)
 * Centralizes request payload assembly and fallback manipulation.
 */

pub fn build_openrouter_payload(
    model_id: &str,
    messages: serde_json::Value,
    temperature: f64,
    max_tokens: Option<u32>,
    providers: Option<&[String]>,
    reasoning: Option<&serde_json::Value>,
    stream: bool,
) -> serde_json::Value {
    let mut payload = serde_json::json!({
        "model": model_id,
        "messages": messages,
        "temperature": temperature,
        "response_format": { "type": "json_object" },
        "include_reasoning": true,
    });

    if stream {
        payload["stream"] = serde_json::json!(true);
        payload["stream_options"] = serde_json::json!({ "include_usage": true });
    }

    if let Some(r) = reasoning {
        if r.is_object() && !r.as_object().unwrap().is_empty() {
            payload["reasoning"] = r.clone();
        }
    }

    let mut provider_obj = serde_json::json!({
        "allow_fallbacks": false,
    });
    if let Some(list) = providers {
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

    payload
}

pub fn remove_format_from_payload(payload: &mut serde_json::Value) {
    if let Some(map) = payload.as_object_mut() {
        map.remove("response_format");
        map.remove("stream_options");
    }
}
