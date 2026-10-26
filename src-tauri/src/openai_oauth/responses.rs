use super::{access_token, OpenAiAuthState, RESOURCE};
use crate::llm::{
    stream::{get_global_stream_token, register_stream, StreamIdGuard},
    types::{OpenRouterCompletionResponse, StreamEvent},
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::time::Duration;
use tauri::{ipc::Channel, AppHandle, State};
use tokio_util::sync::CancellationToken;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OAuthRequest {
    model: String,
    messages: Vec<Message>,
    reasoning_effort: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Message {
    role: String,
    content: String,
}

fn payload(request: OAuthRequest) -> Result<Value, String> {
    if request.model.trim().is_empty() || request.messages.is_empty() {
        return Err("Model and messages are required".into());
    }
    let mut instructions = vec![];
    let mut input = vec![];
    let mut size = 0;
    for message in request.messages {
        size += message.content.len();
        if size > 8 * 1024 * 1024 {
            return Err("Translation request exceeds 8 MiB".into());
        }
        match message.role.as_str() {
            "system" | "developer" => instructions.push(message.content),
            "user" | "assistant" => {
                input.push(json!({ "role": message.role, "content": message.content }))
            }
            _ => return Err("Unsupported translation message role".into()),
        }
    }
    if input.is_empty() {
        return Err("A translation input message is required".into());
    }
    // ChatGPT plan preview rejects temperature/max_output_tokens and system input items.
    let mut body = json!({ "model": request.model, "instructions": instructions.join("\n\n"), "input": input, "store": false, "stream": true });
    if let Some(effort) = request.reasoning_effort {
        if matches!(
            effort.as_str(),
            "none" | "minimal" | "low" | "medium" | "high" | "xhigh"
        ) {
            body["reasoning"] = json!({"effort": effort});
        }
    }
    Ok(body)
}

#[derive(Default)]
struct ResponseAccumulator {
    text: String,
    prompt: u32,
    completion: u32,
    cached: u32,
    completed: bool,
}

impl ResponseAccumulator {
    fn event(&mut self, event: &Value, emit: &mut impl FnMut(StreamEvent)) -> Result<(), String> {
        match event["type"].as_str().unwrap_or_default() {
            "response.output_text.delta" => {
                if let Some(delta) = event["delta"].as_str() {
                    self.text.push_str(delta);
                    emit(StreamEvent::Status("translating".into()));
                    emit(StreamEvent::Chunk(delta.into()));
                }
            }
            "response.reasoning_summary_text.delta" => {
                if let Some(delta) = event["delta"].as_str() {
                    emit(StreamEvent::Status("thinking".into()));
                    emit(StreamEvent::Reasoning(delta.into()));
                }
            }
            "response.completed" => {
                // Require a terminal completion, even if the preceding text looks like valid JSON.
                if event["response"]["status"] != "completed" {
                    return Err("OpenAI did not complete the translation".into());
                }
                let usage = &event["response"]["usage"];
                self.prompt = usage["input_tokens"]
                    .as_u64()
                    .unwrap_or(0)
                    .min(u32::MAX as u64) as u32;
                self.completion = usage["output_tokens"]
                    .as_u64()
                    .unwrap_or(0)
                    .min(u32::MAX as u64) as u32;
                self.cached = usage["input_tokens_details"]["cached_tokens"]
                    .as_u64()
                    .unwrap_or(0)
                    .min(u32::MAX as u64) as u32;
                emit(StreamEvent::Usage {
                    prompt_tokens: self.prompt,
                    completion_tokens: self.completion,
                    cached_tokens: self.cached,
                    cost: 0.0,
                });
                self.completed = true;
            }
            "response.failed" | "response.incomplete" | "error" => {
                let code = event["response"]["error"]["code"]
                    .as_str()
                    .or_else(|| event["code"].as_str())
                    .unwrap_or("response_incomplete");
                return Err(match code {
                    "subscription_sharing_usage_limit_exceeded" | "subscription_sharing_usage_unavailable" => "ChatGPT plan usage is unavailable or has reached its limit. Open Manage usage in Translation Providers.".into(),
                    _ => "OpenAI could not complete the translation. Check model access or sign in again.".into(),
                });
            }
            _ => {}
        }
        if self.text.len() > 32 * 1024 * 1024 {
            return Err("Translation exceeds the 32 MiB response limit".into());
        }
        Ok(())
    }

    fn finish(self) -> Result<OpenRouterCompletionResponse, String> {
        if !self.completed {
            return Err(
                "OpenAI stream ended before response.completed; translation was not accepted"
                    .into(),
            );
        }
        if self.text.trim().is_empty() {
            return Err("OpenAI returned an empty translation".into());
        }
        Ok(OpenRouterCompletionResponse {
            content: self.text,
            prompt_tokens: self.prompt,
            completion_tokens: self.completion,
            cached_tokens: self.cached,
            cost: 0.0,
        })
    }
}

async fn consume(
    mut response: reqwest::Response,
    on_event: Option<Channel<StreamEvent>>,
) -> Result<OpenRouterCompletionResponse, String> {
    let mut bytes = vec![];
    let mut accumulator = ResponseAccumulator::default();
    let mut emit = |event| {
        if let Some(channel) = &on_event {
            let _ = channel.send(event);
        }
    };
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "OpenAI translation stream was interrupted")?
    {
        bytes.extend_from_slice(&chunk);
        if bytes.len() > 4 * 1024 * 1024 {
            return Err("OpenAI stream event exceeds size limit".into());
        }
        // Frame bytes before UTF-8 decoding so a split Japanese code point remains intact.
        while let Some(position) = bytes.iter().position(|b| *b == b'\n') {
            let line: Vec<_> = bytes.drain(..=position).collect();
            let line = std::str::from_utf8(&line)
                .map_err(|_| "OpenAI returned invalid stream text")?
                .trim_end_matches(['\r', '\n']);
            if let Some(data) = line.strip_prefix("data:") {
                let data = data.trim();
                if data != "[DONE]" && !data.is_empty() {
                    let event: Value = serde_json::from_str(data)
                        .map_err(|_| "OpenAI returned an invalid stream event")?;
                    accumulator.event(&event, &mut emit)?;
                    if accumulator.completed {
                        return accumulator.finish();
                    }
                }
            }
        }
    }
    accumulator.finish()
}

#[tauri::command]
pub async fn openai_oauth_completion(
    app: AppHandle,
    state: State<'_, OpenAiAuthState>,
    request: OAuthRequest,
    timeout_seconds: Option<u64>,
    stream_id: Option<String>,
    on_event: Channel<StreamEvent>,
) -> Result<OpenRouterCompletionResponse, String> {
    let body = payload(request)?;
    let cancel = CancellationToken::new();
    register_stream(&stream_id, &cancel)?;
    let _guard = StreamIdGuard(&stream_id);
    let global = get_global_stream_token();
    let auth_session = state
        .requests
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .child_token();
    let future = async {
        let _ = on_event.send(StreamEvent::Status("connecting".into()));
        let token = access_token(&app).await?;
        let response = crate::http::get_http_client()?
            .post(format!("{RESOURCE}/responses"))
            .bearer_auth(token)
            .json(&body)
            .send()
            .await
            .map_err(|_| "Could not contact OpenAI for translation")?;
        if !response.status().is_success() {
            return Err(format!("OpenAI translation failed (HTTP {}). Check your ChatGPT model access, Manage usage, or sign in again.", response.status().as_u16()));
        }
        consume(response, Some(on_event)).await
    };
    tokio::select! {
        _ = cancel.cancelled() => Err("Stream aborted by user.".into()),
        _ = global.cancelled() => Err("Stream aborted by user.".into()),
        _ = auth_session.cancelled() => Err("OpenAI authentication changed; translation cancelled.".into()),
        result = tokio::time::timeout(Duration::from_secs(timeout_seconds.unwrap_or(600).clamp(5, 1800)), future) => result.map_err(|_| "OpenAI translation timed out".to_string())?,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn responses_payload_uses_plan_contract_and_preserves_history() {
        let body = payload(OAuthRequest {
            model: "account-model".into(),
            messages: vec![
                Message {
                    role: "system".into(),
                    content: "Translate JSON".into(),
                },
                Message {
                    role: "assistant".into(),
                    content: "Earlier response".into(),
                },
                Message {
                    role: "user".into(),
                    content: "Next line".into(),
                },
            ],
            reasoning_effort: Some("low".into()),
        })
        .unwrap();
        assert_eq!(body["store"], false);
        assert_eq!(body["stream"], true);
        assert_eq!(body["instructions"], "Translate JSON");
        assert_eq!(body["input"].as_array().unwrap().len(), 2);
        for key in [
            "temperature",
            "max_output_tokens",
            "previous_response_id",
            "messages",
        ] {
            assert!(body.get(key).is_none());
        }
    }
    #[test]
    fn valid_json_is_not_success_until_terminal_completion() {
        let mut response = ResponseAccumulator::default();
        response
            .event(
                &json!({"type":"response.output_text.delta","delta":"{\"translation\":\"Hello\"}"}),
                &mut |_| {},
            )
            .unwrap();
        assert!(response.finish().is_err());
        let mut response = ResponseAccumulator::default();
        response
            .event(
                &json!({"type":"response.output_text.delta","delta":"Hello"}),
                &mut |_| {},
            )
            .unwrap();
        response.event(&json!({"type":"response.completed","response":{"status":"completed","usage":{"input_tokens":10,"output_tokens":2,"input_tokens_details":{"cached_tokens":5}}}}), &mut |_| {}).unwrap();
        let done = response.finish().unwrap();
        assert_eq!(done.content, "Hello");
        assert_eq!(done.cached_tokens, 5);
    }
    #[test]
    fn late_usage_errors_and_incomplete_responses_fail() {
        for event in [
            json!({"type":"response.failed","response":{"error":{"code":"subscription_sharing_usage_limit_exceeded"}}}),
            json!({"type":"response.incomplete"}),
        ] {
            assert!(ResponseAccumulator::default()
                .event(&event, &mut |_| {})
                .is_err());
        }
    }
}
