use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenRouterCompletionResponse {
    pub content: String,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub cached_tokens: u32,
    pub cost: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum StreamEvent {
    Chunk(String),
    Reasoning(String),
    Status(String),
    Usage {
        prompt_tokens: u32,
        completion_tokens: u32,
        cached_tokens: u32,
        cost: f64,
    },
}
