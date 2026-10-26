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
            // Provider-specific credentials (for example x-api-key) must never follow redirects.
            .redirect(reqwest::redirect::Policy::none())
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

pub fn validate_provider_url(value: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(value).map_err(|_| "Invalid provider URL".to_string())?;
    if !matches!(url.scheme(), "https" | "http") || url.host_str().is_none() {
        return Err("Provider URLs must use HTTP or HTTPS".into());
    }
    if !url.username().is_empty() || url.password().is_some() || url.fragment().is_some() {
        return Err("Provider URLs cannot contain embedded credentials or fragments".into());
    }
    Ok(url)
}

pub fn parse_request_payload(value: &str) -> Result<serde_json::Value, String> {
    let payload: serde_json::Value =
        serde_json::from_str(value).map_err(|e| format!("Invalid payload JSON: {e}"))?;
    if !payload.is_object() {
        return Err("LLM payload must be a JSON object".into());
    }
    Ok(payload)
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

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn provider_urls_reject_credentials_and_non_http_schemes() {
        assert!(validate_provider_url("http://localhost:11434/v1/chat/completions").is_ok());
        for url in [
            "file:///private/key",
            "https://user:secret@example.com",
            "https://example.com/#secret",
        ] {
            assert!(validate_provider_url(url).is_err());
        }
    }
    #[test]
    fn request_payload_rejects_values_that_would_panic_during_mutation() {
        for payload in ["[]", "null", "true", "1", "\"text\""] {
            assert!(parse_request_payload(payload).is_err());
        }
        assert!(parse_request_payload("{\"messages\":[]}").is_ok());
    }
}
