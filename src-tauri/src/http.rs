use std::error::Error as StdError;
use std::sync::OnceLock;

static HTTP_CLIENT: OnceLock<Result<reqwest::Client, String>> = OnceLock::new();

pub fn get_http_client() -> Result<&'static reqwest::Client, &'static str> {
    let res = HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .http1_only() // Enforce HTTP/1.1 to prevent HTTP/2 RST_STREAM / multiplexing timeouts on long LLM generations
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
            .timeout(std::time::Duration::from_secs(1800)) // 30 min ceiling timeout
            .connect_timeout(std::time::Duration::from_secs(45))
            .tcp_nodelay(true)
            .pool_idle_timeout(std::time::Duration::from_secs(90))
            .pool_max_idle_per_host(5)
            .build()
            .map_err(|e| format!("Failed to initialize shared HTTP client: {}", e))
    });
    match res {
        Ok(client) => Ok(client),
        Err(err) => Err(err.as_str()),
    }
}

pub fn format_reqwest_error(context: &str, err: &reqwest::Error) -> String {
    let mut details = format!("{}: {}", context, err);
    let mut curr_source = StdError::source(err);
    let mut chain = Vec::new();
    while let Some(src) = curr_source {
        chain.push(src.to_string());
        curr_source = src.source();
    }
    if !chain.is_empty() {
        details.push_str(&format!(" [Cause: {}]", chain.join(" -> ")));
    }
    details
}
