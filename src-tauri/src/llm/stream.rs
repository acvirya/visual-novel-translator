use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;
use tauri::ipc::Channel;
use crate::http::{format_reqwest_error, get_http_client};
use super::types::{OpenRouterCompletionResponse, StreamEvent};

use std::sync::OnceLock;

pub static ABORT_STREAM_COUNTER: AtomicU64 = AtomicU64::new(0);
static CANCELLED_STREAM_IDS: OnceLock<std::sync::Mutex<std::collections::HashSet<String>>> = OnceLock::new();

pub fn get_cancelled_streams() -> &'static std::sync::Mutex<std::collections::HashSet<String>> {
    CANCELLED_STREAM_IDS.get_or_init(|| std::sync::Mutex::new(std::collections::HashSet::new()))
}

#[tauri::command]
pub fn cancel_all_llm_streams() {
    ABORT_STREAM_COUNTER.fetch_add(1, Ordering::SeqCst);
}

#[tauri::command]
pub fn cancel_llm_stream(stream_id: String) {
    let mut guard = get_cancelled_streams().lock().unwrap_or_else(|e| e.into_inner());
    guard.insert(stream_id);
}

/// Robust check if text is a completed JSON object or array (supports direct JSON and markdown fenced JSON)
pub fn is_json_completed(text: &str) -> bool {
    let t = text.trim();
    if t.is_empty() {
        return false;
    }
    // Direct JSON object or array
    if (t.ends_with('}') || t.ends_with(']')) && serde_json::from_str::<serde_json::Value>(t).is_ok() {
        return true;
    }
    // Markdown fenced JSON e.g. ```json ... ```
    if t.ends_with("```") {
        let stripped = t.trim_matches('`').trim();
        let stripped = stripped.strip_prefix("json").unwrap_or(stripped).trim();
        if ((stripped.starts_with('{') && stripped.ends_with('}'))
            || (stripped.starts_with('[') && stripped.ends_with(']')))
            && serde_json::from_str::<serde_json::Value>(stripped).is_ok()
        {
            return true;
        }
    }
    false
}

/// Internal helper for processing stream chunks with a custom event emitter closure
pub fn process_stream_content_chunk_generic<F: FnMut(StreamEvent)>(
    c: &str,
    tag_buffer: &mut String,
    in_think_tag: &mut bool,
    in_reasoning_phase: &mut bool,
    in_content_phase: &mut bool,
    accumulated_content: &mut String,
    accumulated_reasoning: &mut String,
    mut emit: F,
) {
    if c.is_empty() {
        return;
    }
    tag_buffer.push_str(c);

    loop {
        if *in_think_tag {
            if let Some(pos) = tag_buffer.find("</think>") {
                let reasoning_chunk = tag_buffer[..pos].to_string();
                if !reasoning_chunk.is_empty() {
                    accumulated_reasoning.push_str(&reasoning_chunk);
                    emit(StreamEvent::Reasoning(reasoning_chunk));
                }
                *in_think_tag = false;
                *tag_buffer = tag_buffer[pos + 8..].to_string();
                continue;
            } else {
                // Check if trailing slice of tag_buffer is a prefix of "</think>"
                let mut prefix_len = 0;
                for len in (1..8).rev() {
                    if tag_buffer.len() >= len && "</think>".starts_with(&tag_buffer[tag_buffer.len() - len..]) {
                        prefix_len = len;
                        break;
                    }
                }
                let emit_len = tag_buffer.len() - prefix_len;
                if emit_len > 0 {
                    let to_emit = tag_buffer[..emit_len].to_string();
                    *tag_buffer = tag_buffer[emit_len..].to_string();
                    accumulated_reasoning.push_str(&to_emit);
                    emit(StreamEvent::Reasoning(to_emit));
                }
                break;
            }
        } else {
            if let Some(pos) = tag_buffer.find("<think>") {
                let content_chunk = tag_buffer[..pos].to_string();
                if !content_chunk.is_empty() {
                    if !*in_content_phase {
                        *in_content_phase = true;
                        emit(StreamEvent::Status("translating".to_string()));
                    }
                    accumulated_content.push_str(&content_chunk);
                    emit(StreamEvent::Chunk(content_chunk));
                }
                *in_think_tag = true;
                if !*in_reasoning_phase {
                    *in_reasoning_phase = true;
                    emit(StreamEvent::Status("thinking".to_string()));
                }
                *tag_buffer = tag_buffer[pos + 7..].to_string();
                continue;
            } else {
                // Check if trailing slice of tag_buffer is a prefix of "<think>"
                let mut prefix_len = 0;
                for len in (1..7).rev() {
                    if tag_buffer.len() >= len && "<think>".starts_with(&tag_buffer[tag_buffer.len() - len..]) {
                        prefix_len = len;
                        break;
                    }
                }
                let emit_len = tag_buffer.len() - prefix_len;
                if emit_len > 0 {
                    let to_emit = tag_buffer[..emit_len].to_string();
                    *tag_buffer = tag_buffer[emit_len..].to_string();
                    if !*in_content_phase {
                        *in_content_phase = true;
                        emit(StreamEvent::Status("translating".to_string()));
                    }
                    accumulated_content.push_str(&to_emit);
                    emit(StreamEvent::Chunk(to_emit));
                }
                break;
            }
        }
    }
}

/// Helper that handles split `<think>` and `</think>` tags across token chunks using a sliding window buffer
pub fn process_stream_content_chunk(
    c: &str,
    tag_buffer: &mut String,
    in_think_tag: &mut bool,
    in_reasoning_phase: &mut bool,
    in_content_phase: &mut bool,
    accumulated_content: &mut String,
    accumulated_reasoning: &mut String,
    on_event: &Channel<StreamEvent>,
) {
    process_stream_content_chunk_generic(
        c,
        tag_buffer,
        in_think_tag,
        in_reasoning_phase,
        in_content_phase,
        accumulated_content,
        accumulated_reasoning,
        |ev| {
            let _ = on_event.send(ev);
        },
    );
}

pub fn flush_stream_content_buffer_generic<F: FnMut(StreamEvent)>(
    tag_buffer: &mut String,
    in_think_tag: bool,
    in_content_phase: &mut bool,
    accumulated_content: &mut String,
    accumulated_reasoning: &mut String,
    mut emit: F,
) {
    if !tag_buffer.is_empty() {
        if in_think_tag {
            accumulated_reasoning.push_str(tag_buffer);
            emit(StreamEvent::Reasoning(tag_buffer.clone()));
        } else {
            if !*in_content_phase {
                *in_content_phase = true;
                emit(StreamEvent::Status("translating".to_string()));
            }
            accumulated_content.push_str(tag_buffer);
            emit(StreamEvent::Chunk(tag_buffer.clone()));
        }
        tag_buffer.clear();
    }
}

pub fn flush_stream_content_buffer(
    tag_buffer: &mut String,
    in_think_tag: bool,
    in_content_phase: &mut bool,
    accumulated_content: &mut String,
    accumulated_reasoning: &mut String,
    on_event: &Channel<StreamEvent>,
) {
    flush_stream_content_buffer_generic(
        tag_buffer,
        in_think_tag,
        in_content_phase,
        accumulated_content,
        accumulated_reasoning,
        |ev| {
            let _ = on_event.send(ev);
        },
    );
}

struct StreamIdGuard<'a>(&'a Option<String>);
impl<'a> Drop for StreamIdGuard<'a> {
    fn drop(&mut self) {
        if let Some(ref sid) = self.0 {
            let mut guard = get_cancelled_streams().lock().unwrap_or_else(|e| e.into_inner());
            guard.remove(sid);
        }
    }
}

/// Unified SSE stream processor for both OpenRouter and Direct LLM Providers (Anthropic, OpenAI, etc.)
async fn handle_sse_stream(
    mut resp: reqwest::Response,
    timeout_duration: Duration,
    start_cancel_count: u64,
    stream_id: Option<String>,
    on_event: &Channel<StreamEvent>,
    is_anthropic: bool,
) -> Result<OpenRouterCompletionResponse, (bool, String)> {
    let _stream_guard = StreamIdGuard(&stream_id);
    let mut accumulated_content = String::new();
    let mut accumulated_reasoning = String::new();
    let mut prompt_tokens: u32 = 0;
    let mut completion_tokens: u32 = 0;
    let mut cached_tokens: u32 = 0;
    let mut cost: f64 = 0.0;
    let mut buffer = String::new();
    let mut tag_buffer = String::new();
    let mut in_reasoning_phase = false;
    let mut in_content_phase = false;
    let mut in_think_tag = false;
    let mut stream_failed = false;
    let mut content_finished = false;
    let mut has_usage = false;
    let mut last_error = String::new();

    'chunk_loop: loop {
        if ABORT_STREAM_COUNTER.load(Ordering::SeqCst) != start_cancel_count {
            return Err((false, "Stream aborted by user.".to_string()));
        }
        if let Some(ref sid) = stream_id {
            let guard = get_cancelled_streams().lock().unwrap_or_else(|e| e.into_inner());
            if guard.contains(sid) {
                return Err((false, "Stream aborted by user.".to_string()));
            }
        }

        let is_json_done = is_json_completed(&accumulated_content);
        let next_chunk_timeout = if is_json_done || content_finished {
            Duration::from_millis(1500)
        } else {
            timeout_duration
        };

        let chunk_opt = match tokio::time::timeout(next_chunk_timeout, resp.chunk()).await {
            Ok(Ok(Some(c))) => Some(c),
            Ok(Ok(None)) => None,
            Ok(Err(e)) => {
                last_error = format_reqwest_error("Error reading stream chunk", &e);
                stream_failed = true;
                break 'chunk_loop;
            }
            Err(_) => {
                if is_json_done || content_finished {
                    let _ = on_event.send(StreamEvent::Status("validating".to_string()));
                    break 'chunk_loop;
                } else {
                    last_error = "Stream connection timed out while waiting for next token".to_string();
                    stream_failed = true;
                    break 'chunk_loop;
                }
            }
        };

        let chunk = match chunk_opt {
            Some(c) => c,
            None => {
                let _ = on_event.send(StreamEvent::Status("validating".to_string()));
                break 'chunk_loop;
            }
        };

        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(newline_pos) = buffer.find('\n') {
            let line = buffer[..newline_pos].trim().to_string();
            buffer = buffer[newline_pos + 1..].to_string();

            if line.is_empty() {
                continue;
            }

            if let Some(stripped) = line.strip_prefix("data:") {
                let data = stripped.trim();
                if data == "[DONE]" {
                    let _ = on_event.send(StreamEvent::Status("validating".to_string()));
                    break 'chunk_loop;
                }

                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                    if let Some(err_obj) = parsed.get("error") {
                        let msg = err_obj["message"].as_str().unwrap_or("Upstream API error");
                        let code = err_obj["code"].as_i64().unwrap_or(0);
                        let is_transient = code == 429
                            || code == 500
                            || code == 502
                            || code == 503
                            || msg.contains("unreachable")
                            || msg.contains("queue-time")
                            || msg.contains("rate limit")
                            || msg.contains("temporarily unavailable");
                        return Err((is_transient, format!("Stream Upstream Error ({}): {}", code, msg)));
                    }

                    if is_anthropic {
                        let event_type = parsed["type"].as_str().unwrap_or("");
                        if event_type == "content_block_start" {
                            if let Some(cb) = parsed.get("content_block") {
                                if cb["type"] == "thinking" && !in_reasoning_phase {
                                    in_reasoning_phase = true;
                                    let _ = on_event.send(StreamEvent::Status("thinking".to_string()));
                                }
                            }
                        } else if event_type == "content_block_delta" {
                            if let Some(delta) = parsed.get("delta") {
                                let delta_type = delta["type"].as_str().unwrap_or("");
                                if delta_type == "thinking_delta" {
                                    if let Some(t) = delta["thinking"].as_str() {
                                        if !t.is_empty() {
                                            if !in_reasoning_phase {
                                                in_reasoning_phase = true;
                                                let _ = on_event.send(StreamEvent::Status("thinking".to_string()));
                                            }
                                            accumulated_reasoning.push_str(t);
                                            let _ = on_event.send(StreamEvent::Reasoning(t.to_string()));
                                        }
                                    }
                                } else if delta_type == "text_delta" {
                                    if let Some(text) = delta["text"].as_str() {
                                        if !text.is_empty() {
                                            if !in_content_phase {
                                                in_content_phase = true;
                                                let _ = on_event.send(StreamEvent::Status("translating".to_string()));
                                            }
                                            accumulated_content.push_str(text);
                                            let _ = on_event.send(StreamEvent::Chunk(text.to_string()));
                                        }
                                    }
                                }
                            }
                        } else if event_type == "message_start" {
                            if let Some(usage) = parsed["message"].get("usage") {
                                if let Some(it) = usage["input_tokens"].as_u64() {
                                    prompt_tokens = it as u32;
                                }
                                if let Some(cached) = usage["cache_read_input_tokens"].as_u64() {
                                    cached_tokens = cached as u32;
                                }
                            }
                        } else if event_type == "message_delta" {
                            if let Some(usage) = parsed.get("usage") {
                                has_usage = true;
                                if let Some(ot) = usage["output_tokens"].as_u64() {
                                    completion_tokens = ot as u32;
                                }
                                let _ = on_event.send(StreamEvent::Usage {
                                    prompt_tokens,
                                    completion_tokens,
                                    cached_tokens,
                                    cost,
                                });
                            }
                        } else if event_type == "message_stop" {
                            content_finished = true;
                        }
                    } else {
                        // OpenAI / OpenRouter format
                        if let Some(usage) = parsed.get("usage") {
                            has_usage = true;
                            if let Some(pt) = usage["prompt_tokens"].as_u64().or_else(|| usage["input_tokens"].as_u64()) {
                                prompt_tokens = pt as u32;
                            }
                            if let Some(ct) = usage["completion_tokens"].as_u64().or_else(|| usage["output_tokens"].as_u64()) {
                                completion_tokens = ct as u32;
                            }
                            if let Some(c) = usage["total_cost"].as_f64().or_else(|| usage["cost"].as_f64()) {
                                cost = c;
                            }
                            if let Some(ptd) = usage.get("prompt_tokens_details") {
                                if let Some(cached) = ptd["cached_tokens"].as_u64().or_else(|| ptd["cache_read_input_tokens"].as_u64()) {
                                    cached_tokens = cached as u32;
                                }
                            } else if let Some(cached) = usage["cached_tokens"].as_u64().or_else(|| usage["cache_read_input_tokens"].as_u64()).or_else(|| usage["cached_content_token_count"].as_u64()) {
                                cached_tokens = cached as u32;
                            }
                            let _ = on_event.send(StreamEvent::Usage {
                                prompt_tokens,
                                completion_tokens,
                                cached_tokens,
                                cost,
                            });
                        }

                        if let Some(choices) = parsed["choices"].as_array() {
                            if let Some(choice) = choices.get(0) {
                                if let Some(delta) = choice.get("delta") {
                                    let reasoning_chunk = delta["reasoning"].as_str()
                                        .or_else(|| delta["reasoning_content"].as_str())
                                        .or_else(|| delta["thinking"].as_str());

                                    if let Some(r) = reasoning_chunk {
                                        if !r.is_empty() {
                                            if !in_reasoning_phase {
                                                in_reasoning_phase = true;
                                                let _ = on_event.send(StreamEvent::Status("thinking".to_string()));
                                            }
                                            accumulated_reasoning.push_str(r);
                                            let _ = on_event.send(StreamEvent::Reasoning(r.to_string()));
                                        }
                                    }

                                    if let Some(c) = delta["content"].as_str() {
                                        process_stream_content_chunk(
                                            c,
                                            &mut tag_buffer,
                                            &mut in_think_tag,
                                            &mut in_reasoning_phase,
                                            &mut in_content_phase,
                                            &mut accumulated_content,
                                            &mut accumulated_reasoning,
                                            on_event,
                                        );
                                    }
                                }

                                if let Some(fr) = choice.get("finish_reason").and_then(|f| f.as_str()) {
                                    if !fr.is_empty() && fr != "null" {
                                        content_finished = true;
                                    }
                                }
                            }
                        }

                        if content_finished && has_usage {
                            let _ = on_event.send(StreamEvent::Status("validating".to_string()));
                            break 'chunk_loop;
                        }
                    }
                }
            }
        }

        if buffer.contains("[DONE]") {
            let _ = on_event.send(StreamEvent::Status("validating".to_string()));
            break 'chunk_loop;
        }
    }

    // Flush any remaining text held in tag_buffer at stream end
    flush_stream_content_buffer(
        &mut tag_buffer,
        in_think_tag,
        &mut in_content_phase,
        &mut accumulated_content,
        &mut accumulated_reasoning,
        on_event,
    );

    if stream_failed && !is_json_completed(&accumulated_content) {
        let err_msg = if !last_error.is_empty() {
            last_error
        } else {
            "Stream failed or disconnected prematurely before completing output".to_string()
        };
        return Err((true, err_msg));
    }

    let final_content = if !accumulated_content.trim().is_empty() {
        accumulated_content.trim().to_string()
    } else {
        String::new()
    };

    Ok(OpenRouterCompletionResponse {
        content: final_content,
        prompt_tokens,
        completion_tokens,
        cached_tokens,
        cost,
    })
}

#[tauri::command]
pub async fn openrouter_stream_chat_completion(
    api_key: String,
    model_id: String,
    messages_json: String,
    temperature: f64,
    max_tokens: Option<u32>,
    timeout_seconds: Option<u64>,
    providers: Option<Vec<String>>,
    reasoning: Option<serde_json::Value>,
    stream_id: Option<String>,
    on_event: Channel<StreamEvent>,
) -> Result<OpenRouterCompletionResponse, String> {
    let _stream_guard = StreamIdGuard(&stream_id);
    let client = get_http_client().map_err(|e| e.to_string())?;
    let timeout_duration = Duration::from_secs(timeout_seconds.unwrap_or(600));

    let messages: serde_json::Value = serde_json::from_str(&messages_json)
        .map_err(|e| format!("Invalid messages JSON: {}", e))?;

    let mut payload = serde_json::json!({
        "model": model_id,
        "messages": messages,
        "temperature": temperature,
        "response_format": { "type": "json_object" },
        "stream": true,
        "stream_options": { "include_usage": true },
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

    if let Some(tokens) = max_tokens {
        payload["max_tokens"] = serde_json::json!(tokens);
    }

    let start_cancel_count = ABORT_STREAM_COUNTER.load(Ordering::SeqCst);
    let max_attempts = 3;
    let mut last_error = String::new();

    for attempt in 1..=max_attempts {
        if ABORT_STREAM_COUNTER.load(Ordering::SeqCst) != start_cancel_count {
            return Err("Stream aborted by user.".to_string());
        }
        if let Some(ref sid) = stream_id {
            let guard = get_cancelled_streams().lock().unwrap_or_else(|e| e.into_inner());
            if guard.contains(sid) {
                return Err("Stream aborted by user.".to_string());
            }
        }

        let _ = on_event.send(StreamEvent::Status("connecting".to_string()));

        let req = client
            .post("https://openrouter.ai/api/v1/chat/completions")
            .timeout(timeout_duration)
            .header("Authorization", format!("Bearer {}", api_key.trim()))
            .header("Content-Type", "application/json")
            .header("Accept", "text/event-stream")
            .header("HTTP-Referer", "https://github.com/visual-novel-translator")
            .header("X-Title", "Visual Novel Translator")
            .json(&payload);

        let resp = match req.send().await {
            Ok(r) => r,
            Err(e) => {
                last_error = format_reqwest_error("Failed to connect to OpenRouter streaming API", &e);
                if attempt < max_attempts {
                    tokio::time::sleep(Duration::from_secs(2)).await;
                    continue;
                }
                return Err(last_error);
            }
        };

        let status = resp.status();
        if !status.is_success() {
            let bytes = resp.bytes().await.unwrap_or_default();
            let body_text = String::from_utf8_lossy(&bytes).to_string();

            let is_format_error = (status.as_u16() == 400 || status.as_u16() == 422)
                && (body_text.contains("response_format")
                    || body_text.contains("json_object")
                    || body_text.contains("structured output")
                    || body_text.contains("unsupported parameter")
                    || body_text.contains("stream_options")
                    || body_text.contains("schema"));

            if is_format_error {
                let mut fallback_payload = payload.clone();
                if let Some(map) = fallback_payload.as_object_mut() {
                    map.remove("response_format");
                    map.remove("stream_options");
                }
                payload = fallback_payload;
                continue;
            }

            let status_code = status.as_u16();
            let is_transient = status_code == 429 || status_code == 500 || status_code == 502 || status_code == 503 || status_code == 504 || body_text.contains("unreachable") || body_text.contains("temporarily unavailable") || body_text.contains("high demand");
            if is_transient && attempt < max_attempts {
                last_error = format!("OpenRouter API error (HTTP {}): {}", status, body_text);
                tokio::time::sleep(Duration::from_secs(2)).await;
                continue;
            }
            return Err(format!("OpenRouter API error (HTTP {}): {}", status, body_text));
        }

        match handle_sse_stream(resp, timeout_duration, start_cancel_count, stream_id.clone(), &on_event, false).await {
            Ok(result) => return Ok(result),
            Err((true, err)) => {
                last_error = err;
                if attempt < max_attempts {
                    tokio::time::sleep(Duration::from_secs(1)).await;
                    continue;
                }
                return Err(last_error);
            }
            Err((false, err)) => return Err(err),
        }
    }

    Err(last_error)
}

#[tauri::command]
pub async fn llm_stream_chat_completion(
    url: String,
    headers: HashMap<String, String>,
    payload_json: String,
    timeout_seconds: Option<u64>,
    stream_id: Option<String>,
    on_event: Channel<StreamEvent>,
) -> Result<OpenRouterCompletionResponse, String> {
    let _stream_guard = StreamIdGuard(&stream_id);
    let client = get_http_client().map_err(|e| e.to_string())?;
    let timeout_duration = Duration::from_secs(timeout_seconds.unwrap_or(600));

    let mut payload: serde_json::Value = serde_json::from_str(&payload_json)
        .map_err(|e| format!("Invalid payload JSON: {}", e))?;

    // Ensure stream is enabled in payload
    payload["stream"] = serde_json::json!(true);
    let is_anthropic = url.contains("/messages");
    if !is_anthropic {
        payload["stream_options"] = serde_json::json!({ "include_usage": true });
    }

    let start_cancel_count = ABORT_STREAM_COUNTER.load(Ordering::SeqCst);
    let max_attempts = 3;
    let mut last_error = String::new();

    for attempt in 1..=max_attempts {
        if ABORT_STREAM_COUNTER.load(Ordering::SeqCst) != start_cancel_count {
            return Err("Stream aborted by user.".to_string());
        }
        if let Some(ref sid) = stream_id {
            let guard = get_cancelled_streams().lock().unwrap_or_else(|e| e.into_inner());
            if guard.contains(sid) {
                return Err("Stream aborted by user.".to_string());
            }
        }

        let _ = on_event.send(StreamEvent::Status("connecting".to_string()));

        let mut req = client
            .post(&url)
            .timeout(timeout_duration)
            .header("Accept", "text/event-stream");

        for (k, v) in &headers {
            req = req.header(k, v);
        }

        let send_res = req.json(&payload).send().await;
        let resp = match send_res {
            Ok(r) => r,
            Err(e) => {
                last_error = format_reqwest_error(&format!("Failed to connect to LLM streaming API ({})", url), &e);
                if attempt < max_attempts {
                    tokio::time::sleep(Duration::from_secs(1)).await;
                    continue;
                }
                return Err(last_error);
            }
        };

        let status = resp.status();
        if !status.is_success() {
            let bytes = resp.bytes().await.unwrap_or_default();
            let body_text = String::from_utf8_lossy(&bytes).to_string();

            let is_format_error = (status.as_u16() == 400 || status.as_u16() == 422)
                && (body_text.contains("response_format")
                    || body_text.contains("json_object")
                    || body_text.contains("stream_options")
                    || body_text.contains("structured output")
                    || body_text.contains("unsupported parameter")
                    || body_text.contains("schema"));

            if is_format_error {
                let mut fallback_payload = payload.clone();
                if let Some(map) = fallback_payload.as_object_mut() {
                    map.remove("response_format");
                    map.remove("stream_options");
                }
                payload = fallback_payload;
                continue;
            }

            let status_code = status.as_u16();
            let is_transient = status_code == 429 || status_code == 500 || status_code == 502 || status_code == 503 || status_code == 504;
            if is_transient && attempt < max_attempts {
                last_error = format!("LLM API error (HTTP {}): {}", status, body_text);
                tokio::time::sleep(Duration::from_secs(1)).await;
                continue;
            }
            return Err(format!("LLM API error (HTTP {}): {}", status, body_text));
        }

        match handle_sse_stream(resp, timeout_duration, start_cancel_count, stream_id.clone(), &on_event, is_anthropic).await {
            Ok(result) => return Ok(result),
            Err((true, err)) => {
                last_error = err;
                if attempt < max_attempts {
                    tokio::time::sleep(Duration::from_secs(1)).await;
                    continue;
                }
                return Err(last_error);
            }
            Err((false, err)) => return Err(err),
        }
    }

    Err(last_error)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_json_completed_direct() {
        assert!(is_json_completed("{\"foo\": \"bar\"}"));
        assert!(is_json_completed("[1, 2, 3]"));
        assert!(!is_json_completed("{\"foo\":"));
        assert!(!is_json_completed("[1, 2,"));
        assert!(!is_json_completed(""));
    }

    #[test]
    fn test_is_json_completed_markdown() {
        assert!(is_json_completed("```json\n{\"foo\": \"bar\"}\n```"));
        assert!(is_json_completed("```\n[{\"id\": 1}]\n```"));
        assert!(!is_json_completed("```json\n{\"foo\": [incomplete...\n```"));
    }

    #[test]
    fn test_is_json_completed_prevents_false_positives() {
        // Mismatched or partial inner array
        assert!(!is_json_completed("Here is the partial output: [not json"));
        assert!(!is_json_completed("{\"result\": \"[loading..."));
    }

    #[test]
    fn test_process_stream_content_chunk_split_think_tags() {
        let chunks = vec![
            "<thi",
            "nk>Thinking about translation...",
            " almost done</thi",
            "nk>{\"translation\": \"Halo Dunia\"}",
        ];

        let mut tag_buffer = String::new();
        let mut in_think_tag = false;
        let mut in_reasoning_phase = false;
        let mut in_content_phase = false;
        let mut accumulated_content = String::new();
        let mut accumulated_reasoning = String::new();
        let mut events = Vec::new();

        for chunk in chunks {
            process_stream_content_chunk_generic(
                chunk,
                &mut tag_buffer,
                &mut in_think_tag,
                &mut in_reasoning_phase,
                &mut in_content_phase,
                &mut accumulated_content,
                &mut accumulated_reasoning,
                |ev| events.push(ev),
            );
        }

        flush_stream_content_buffer_generic(
            &mut tag_buffer,
            in_think_tag,
            &mut in_content_phase,
            &mut accumulated_content,
            &mut accumulated_reasoning,
            |ev| events.push(ev),
        );

        assert_eq!(
            accumulated_reasoning,
            "Thinking about translation... almost done"
        );
        assert_eq!(accumulated_content, "{\"translation\": \"Halo Dunia\"}");
        assert!(!in_think_tag);
        assert!(in_content_phase);
    }
}
