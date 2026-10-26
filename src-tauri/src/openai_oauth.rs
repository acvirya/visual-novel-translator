//! OpenAI's public-client Sign in with ChatGPT flow. Credentials never cross IPC.
mod responses;
mod storage;

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use jsonwebtoken::{decode, decode_header, jwk::JwkSet, Algorithm, DecodingKey, Validation};
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{collections::HashMap, sync::Mutex as StdMutex, time::Duration};
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
    sync::Mutex,
};
use tokio_util::sync::CancellationToken;

pub use responses::*;

const ISSUER: &str = "https://auth.openai.com";
const RESOURCE: &str = "https://api.openai.com/v1";
const AUTHORIZE: &str = "https://auth.openai.com/api/accounts/authorize";
const TOKEN: &str = "https://auth.openai.com/api/accounts/oauth/token";
const SCOPES: &str =
    "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";

#[derive(Default)]
pub struct OpenAiAuthState {
    vault: Mutex<Option<storage::LoadedVault>>,
    login: StdMutex<Option<CancellationToken>>,
    last_error: StdMutex<Option<String>>,
    requests: StdMutex<CancellationToken>,
}

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuthMethod {
    #[default]
    ApiKey,
    Oauth,
}

#[derive(Clone, Serialize, Deserialize)]
struct Credentials {
    access_token: String,
    refresh_token: String,
    id_token: String,
    scopes: Vec<String>,
    expires_at: u64,
}

#[derive(Clone, Serialize, Deserialize)]
struct Profile {
    id: String,
    client_id: String,
    subject: String,
    email: Option<String>,
    credentials: Option<Credentials>,
}

#[derive(Clone, Serialize, Deserialize)]
struct Vault {
    host_id: String,
    method: AuthMethod,
    selected_id: Option<String>,
    profiles: Vec<Profile>,
}

impl Default for Vault {
    fn default() -> Self {
        Self {
            host_id: format!("urn:uuid:{}", uuid_host_id()),
            method: AuthMethod::ApiKey,
            selected_id: None,
            profiles: vec![],
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountSummary {
    id: String,
    email: Option<String>,
    connected: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatus {
    auth_method: AuthMethod,
    selected_account_id: Option<String>,
    accounts: Vec<AccountSummary>,
    pending: bool,
    error: Option<String>,
}

fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn random_secret() -> String {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn uuid_host_id() -> String {
    let mut bytes = [0u8; 16];
    OsRng.fill_bytes(&mut bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    let hex: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
    format!(
        "{}-{}-{}-{}-{}",
        &hex[..8],
        &hex[8..12],
        &hex[12..16],
        &hex[16..20],
        &hex[20..]
    )
}

fn secrets_equal(a: &str, b: &str) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.bytes()
        .zip(b.bytes())
        .fold(0u8, |diff, (a, b)| diff | (a ^ b))
        == 0
}

async fn vault<'a>(
    app: &AppHandle,
    state: &'a OpenAiAuthState,
) -> Result<tokio::sync::MutexGuard<'a, Option<storage::LoadedVault>>, String> {
    let mut guard = state.vault.lock().await;
    if guard.is_none() {
        *guard = Some(storage::load(app)?);
    }
    Ok(guard)
}

fn stop_requests(state: &OpenAiAuthState) {
    let mut token = state.requests.lock().unwrap_or_else(|e| e.into_inner());
    token.cancel();
    *token = CancellationToken::new();
}

/// Associate API-key requests with the same exclusive OpenAI authentication session.
pub(crate) async fn api_key_request_session(
    app: &AppHandle,
    state: &OpenAiAuthState,
    provider_id: Option<&str>,
) -> Result<CancellationToken, String> {
    if provider_id != Some("openai") {
        return Ok(CancellationToken::new());
    }
    let guard = vault(app, state).await?;
    if !matches!(guard.as_ref().unwrap().data.method, AuthMethod::ApiKey) {
        return Err("OpenAI API-key requests are disabled while OAuth is selected".into());
    }
    Ok(state
        .requests
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .child_token())
}

fn cancel_login(state: &OpenAiAuthState) {
    if let Some(token) = state.login.lock().unwrap_or_else(|e| e.into_inner()).take() {
        token.cancel();
    }
}

#[tauri::command]
pub async fn openai_auth_status(
    app: AppHandle,
    state: State<'_, OpenAiAuthState>,
) -> Result<AuthStatus, String> {
    let guard = vault(&app, &state).await?;
    let data = &guard.as_ref().unwrap().data;
    Ok(AuthStatus {
        auth_method: data.method.clone(),
        selected_account_id: data.selected_id.clone(),
        accounts: data
            .profiles
            .iter()
            .map(|p| AccountSummary {
                id: p.id.clone(),
                email: p.email.clone(),
                connected: p
                    .credentials
                    .as_ref()
                    .is_some_and(|c| c.expires_at > now() || !c.refresh_token.is_empty()),
            })
            .collect(),
        pending: state
            .login
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .is_some(),
        error: state
            .last_error
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone(),
    })
}

#[tauri::command]
pub async fn openai_set_auth_method(
    app: AppHandle,
    state: State<'_, OpenAiAuthState>,
    method: AuthMethod,
) -> Result<(), String> {
    let mut guard = vault(&app, &state).await?;
    let loaded = guard.as_mut().unwrap();
    if std::mem::discriminant(&loaded.data.method) != std::mem::discriminant(&method) {
        let mut next = loaded.data.clone();
        next.method = method;
        loaded.save(next)?;
        stop_requests(&state);
        cancel_login(&state);
    }
    Ok(())
}

struct LoginAttempt {
    state: String,
    nonce: String,
    verifier: String,
    redirect: String,
    profile: Option<Profile>,
    host_id: String,
}

fn authorization_url(attempt: &LoginAttempt) -> String {
    let mut url = reqwest::Url::parse(AUTHORIZE).unwrap();
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(attempt.verifier.as_bytes()));
    {
        let mut query = url.query_pairs_mut();
        query.extend_pairs([
            (
                "client_id",
                attempt
                    .profile
                    .as_ref()
                    .map_or("dynamic_agent_client", |p| p.client_id.as_str()),
            ),
            ("ext_agent_host_id", &attempt.host_id),
            ("response_type", "code"),
            ("redirect_uri", &attempt.redirect),
            ("scope", SCOPES),
            ("resource", RESOURCE),
            ("state", &attempt.state),
            ("nonce", &attempt.nonce),
            ("code_challenge_method", "S256"),
            ("code_challenge", &challenge),
        ]);
        if let Some(profile) = &attempt.profile {
            if let Some(credentials) = &profile.credentials {
                query.append_pair("id_token_hint", &credentials.id_token);
            }
            if let Some(email) = &profile.email {
                query.append_pair("login_hint", email);
            }
        } else {
            query.append_pair("agent_name_hint", "Visual Novel Translator");
        }
    }
    url.into()
}

#[tauri::command]
pub async fn openai_oauth_start(
    app: AppHandle,
    state: State<'_, OpenAiAuthState>,
    account_id: Option<String>,
) -> Result<(), String> {
    let guard = vault(&app, &state).await?;
    let data = &guard.as_ref().unwrap().data;
    if !matches!(data.method, AuthMethod::Oauth) {
        return Err("Select OAuth before signing in.".into());
    }
    if state
        .login
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .is_some()
    {
        return Err("A sign-in is already in progress.".into());
    }
    let profile = match account_id {
        Some(id) => Some(
            data.profiles
                .iter()
                .find(|p| p.id == id)
                .ok_or("Account no longer exists")?
                .clone(),
        ),
        None => None,
    };
    // Bind before opening the browser. Use an ephemeral loopback port, never localhost/all interfaces.
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|_| "Could not start the local sign-in callback")?;
    let port = listener
        .local_addr()
        .map_err(|_| "Could not read callback address")?
        .port();
    let attempt = LoginAttempt {
        state: random_secret(),
        nonce: random_secret(),
        verifier: random_secret(),
        redirect: format!("http://127.0.0.1:{port}/auth/callback"),
        profile,
        host_id: data.host_id.clone(),
    };
    let url = authorization_url(&attempt);
    let token = CancellationToken::new();
    *state.login.lock().unwrap_or_else(|e| e.into_inner()) = Some(token.clone());
    *state.last_error.lock().unwrap_or_else(|e| e.into_inner()) = None;
    // The URL can contain an ID-token hint; it is intentionally never returned or logged.
    if app.opener().open_url(url, None::<&str>).is_err() {
        cancel_login(&state);
        return Err(
            "Could not open the system browser. Check your default browser and retry.".into(),
        );
    }
    drop(guard);
    tauri::async_runtime::spawn(async move {
        use tauri::Manager;
        let state = app.state::<OpenAiAuthState>();
        let result = tokio::select! {
            _ = token.cancelled() => return,
            result = tokio::time::timeout(Duration::from_secs(300), complete_login(&app, &state, listener, attempt)) => result.unwrap_or_else(|_| Err("Sign-in timed out. Please try again.".into())),
        };
        // Cancellation drops the exchange future before it can activate an account.
        let mut login = state.login.lock().unwrap_or_else(|e| e.into_inner());
        if token.is_cancelled() {
            return;
        }
        *state.last_error.lock().unwrap_or_else(|e| e.into_inner()) = result.err();
        login.take();
    });
    Ok(())
}

#[tauri::command]
pub fn openai_oauth_cancel(state: State<'_, OpenAiAuthState>) {
    cancel_login(&state);
}

fn callback_params(
    target: &str,
    attempt: &LoginAttempt,
) -> Result<HashMap<String, String>, String> {
    let uri = reqwest::Url::parse(&format!("http://127.0.0.1{target}"))
        .map_err(|_| "Invalid callback")?;
    if !target.starts_with("/auth/callback?") || uri.path() != "/auth/callback" {
        return Err("Invalid callback path".into());
    }
    let mut params = HashMap::new();
    for (key, value) in uri.query_pairs() {
        if params
            .insert(key.into_owned(), value.into_owned())
            .is_some()
        {
            return Err("Duplicate callback parameter".into());
        }
    }
    if !params
        .get("state")
        .is_some_and(|s| secrets_equal(s, &attempt.state))
    {
        return Err("Invalid callback state".into());
    }
    Ok(params)
}

async fn receive_callback(
    listener: &TcpListener,
    attempt: &LoginAttempt,
) -> Result<HashMap<String, String>, String> {
    loop {
        let (mut socket, _) = listener
            .accept()
            .await
            .map_err(|_| "Sign-in callback failed")?;
        let read = async {
            let mut bytes = vec![];
            let mut chunk = [0u8; 1024];
            while !bytes.windows(4).any(|w| w == b"\r\n\r\n") {
                let count = socket.read(&mut chunk).await.map_err(|_| ())?;
                if count == 0 || bytes.len() + count > 16384 {
                    return Err(());
                }
                bytes.extend_from_slice(&chunk[..count]);
            }
            String::from_utf8(bytes).map_err(|_| ())
        };
        let request = match tokio::time::timeout(Duration::from_secs(2), read).await {
            Ok(Ok(r)) => r,
            _ => continue,
        };
        let mut first = request
            .lines()
            .next()
            .unwrap_or_default()
            .split_whitespace();
        let method = first.next().unwrap_or_default();
        let params = if method == "GET" {
            callback_params(first.next().unwrap_or_default(), attempt)
        } else {
            Err("Invalid callback method".into())
        };
        // Send no reflected query/HTML. Referrer-Policy prevents authorization-code leakage.
        let (status, message) = if params.is_ok() {
            (
                "200 OK",
                "Return to Visual Novel Translator to finish signing in. You can close this tab.",
            )
        } else {
            ("400 Bad Request", "Invalid sign-in callback.")
        };
        let response = format!("HTTP/1.1 {status}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nContent-Security-Policy: default-src 'none'\r\nConnection: close\r\n\r\n{message}", message.len());
        let _ = tokio::time::timeout(
            Duration::from_secs(2),
            socket.write_all(response.as_bytes()),
        )
        .await;
        // Ignore stray/malicious requests instead of letting them consume the pending transaction.
        if let Ok(params) = params {
            return Ok(params);
        }
    }
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    id_token: Option<String>,
    token_type: String,
    expires_in: u64,
    scope: Option<String>,
}

async fn token_request(params: &[(&str, &str)]) -> Result<TokenResponse, String> {
    let response = crate::http::get_http_client()?
        .post(TOKEN)
        .timeout(Duration::from_secs(45))
        .form(params)
        .send()
        .await
        .map_err(|_| "Unable to contact OpenAI authentication. Please retry.")?;
    if !response.status().is_success() {
        return Err(format!("OpenAI authorization failed (HTTP {}). Sign in again if access has expired or was revoked.", response.status().as_u16()));
    }
    response
        .json()
        .await
        .map_err(|_| "OpenAI returned an invalid token response.".into())
}

fn credentials(
    tokens: TokenResponse,
    previous: Option<&Credentials>,
) -> Result<Credentials, String> {
    let scopes = tokens
        .scope
        .map(|s| s.split_whitespace().map(String::from).collect::<Vec<_>>())
        .or_else(|| previous.map(|p| p.scopes.clone()))
        .unwrap_or_default();
    if !scopes.iter().any(|s| s == "chatgpt.tokens.use.direct")
        || !scopes.iter().any(|s| s == "resource.invoke")
    {
        return Err(
            "ChatGPT plan usage was not authorized. Sign in again and allow plan usage.".into(),
        );
    }
    if !tokens.token_type.eq_ignore_ascii_case("bearer")
        || tokens.access_token.is_empty()
        || tokens.expires_in == 0
    {
        return Err("Invalid OpenAI credentials.".into());
    }
    // Rotating refresh tokens must be saved with the access token as one atomic record.
    let refresh_token = tokens
        .refresh_token
        .filter(|t| !t.is_empty())
        .ok_or("OpenAI did not return a renewable session. Sign in again.")?;
    let id_token = tokens
        .id_token
        .or_else(|| previous.map(|p| p.id_token.clone()))
        .ok_or("OpenAI did not return an ID token.")?;
    Ok(Credentials {
        access_token: tokens.access_token,
        refresh_token,
        id_token,
        scopes,
        expires_at: now().saturating_add(tokens.expires_in.min(86400)),
    })
}

#[derive(Deserialize)]
struct Identity {
    sub: String,
    nonce: String,
    email: Option<String>,
}

async fn verify_identity(id_token: &str, client_id: &str, nonce: &str) -> Result<Identity, String> {
    let header = decode_header(id_token).map_err(|_| "Invalid OpenAI identity token")?;
    if !matches!(header.alg, Algorithm::RS256 | Algorithm::ES256) {
        return Err("Unsupported identity signature".into());
    }
    let keys: JwkSet = crate::http::get_http_client()?
        .get(format!("{ISSUER}/.well-known/jwks.json"))
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(|_| "Could not verify OpenAI identity")?
        .error_for_status()
        .map_err(|_| "Could not verify OpenAI identity")?
        .json()
        .await
        .map_err(|_| "Invalid identity verification keys")?;
    verify_identity_with_keys(id_token, client_id, nonce, &keys)
}

fn verify_identity_with_keys(
    id_token: &str,
    client_id: &str,
    nonce: &str,
    keys: &JwkSet,
) -> Result<Identity, String> {
    let header = decode_header(id_token).map_err(|_| "Invalid OpenAI identity token")?;
    if !matches!(header.alg, Algorithm::RS256 | Algorithm::ES256) {
        return Err("Unsupported identity signature".into());
    }
    let jwk = keys
        .find(
            header
                .kid
                .as_deref()
                .ok_or("Missing identity signing key")?,
        )
        .ok_or("Unknown identity signing key")?;
    let key = DecodingKey::from_jwk(jwk).map_err(|_| "Invalid identity signing key")?;
    let mut validation = Validation::new(header.alg);
    validation.set_issuer(&[ISSUER]);
    validation.set_audience(&[client_id]);
    validation.set_required_spec_claims(&["sub", "exp", "iat", "iss", "aud"]);
    validation.leeway = 5;
    validation.validate_nbf = true;
    let identity = decode::<Identity>(id_token, &key, &validation)
        .map_err(|_| "OpenAI identity verification failed")?
        .claims;
    if identity.sub.is_empty() || !secrets_equal(&identity.nonce, nonce) {
        return Err("OpenAI identity did not match this sign-in attempt".into());
    }
    Ok(identity)
}

fn issued_client(
    params: &HashMap<String, String>,
    profile: Option<&Profile>,
) -> Result<String, String> {
    let client = match profile {
        Some(profile) => {
            if params
                .get("client_id")
                .is_some_and(|id| id != &profile.client_id)
            {
                return Err("Sign-in returned a different account registration".into());
            }
            profile.client_id.clone()
        }
        None => params
            .get("client_id")
            .cloned()
            .ok_or("Registration did not return a client ID")?,
    };
    if client == "dynamic_agent_client"
        || client.is_empty()
        || client.len() > 256
        || !client
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    {
        return Err("Invalid issued client ID".into());
    }
    Ok(client)
}

async fn complete_login(
    app: &AppHandle,
    state: &OpenAiAuthState,
    listener: TcpListener,
    attempt: LoginAttempt,
) -> Result<(), String> {
    let params = receive_callback(&listener, &attempt).await?;
    if params.contains_key("error") {
        return Err("Sign-in was declined or cancelled. No account was changed.".into());
    }
    let client_id = issued_client(&params, attempt.profile.as_ref())?;
    let code = params
        .get("code")
        .filter(|c| !c.is_empty())
        .ok_or("No authorization code was returned")?;
    // Keep the issued registration even if exchange fails; never redeem with the dynamic entrypoint.
    let profile_id = attempt
        .profile
        .as_ref()
        .map(|p| p.id.clone())
        .unwrap_or_else(random_secret);
    if attempt.profile.is_none() {
        let mut guard = vault(app, state).await?;
        let loaded = guard.as_mut().unwrap();
        let mut next = loaded.data.clone();
        next.profiles.push(Profile {
            id: profile_id.clone(),
            client_id: client_id.clone(),
            subject: String::new(),
            email: None,
            credentials: None,
        });
        loaded.save(next)?;
    }
    let tokens = token_request(&[
        ("grant_type", "authorization_code"),
        ("client_id", &client_id),
        ("code", code),
        ("code_verifier", &attempt.verifier),
        ("redirect_uri", &attempt.redirect),
        ("resource", RESOURCE),
    ])
    .await?;
    let identity = verify_identity(
        tokens.id_token.as_deref().ok_or("Missing ID token")?,
        &client_id,
        &attempt.nonce,
    )
    .await?;
    if attempt
        .profile
        .as_ref()
        .is_some_and(|p| !p.subject.is_empty() && p.subject != identity.sub)
    {
        return Err("The signed-in identity differs from the selected account".into());
    }
    let credentials = credentials(tokens, None)?;
    let mut guard = vault(app, state).await?;
    let loaded = guard.as_mut().unwrap();
    if !matches!(loaded.data.method, AuthMethod::Oauth) {
        return Err("Authentication method changed during sign-in".into());
    }
    let mut next = loaded.data.clone();
    let profile = next
        .profiles
        .iter_mut()
        .find(|p| p.id == profile_id)
        .ok_or("Account registration was removed")?;
    profile.subject = identity.sub;
    profile.email = identity.email;
    profile.credentials = Some(credentials);
    next.selected_id = Some(profile_id);
    loaded.save(next)?;
    stop_requests(state);
    Ok(())
}

#[tauri::command]
pub async fn openai_oauth_select(
    app: AppHandle,
    state: State<'_, OpenAiAuthState>,
    account_id: String,
) -> Result<(), String> {
    let mut guard = vault(&app, &state).await?;
    let loaded = guard.as_mut().unwrap();
    if !matches!(loaded.data.method, AuthMethod::Oauth) {
        return Err("Select OAuth first".into());
    }
    if !loaded
        .data
        .profiles
        .iter()
        .any(|p| p.id == account_id && p.credentials.is_some())
    {
        return Err("Sign in to this account first".into());
    }
    cancel_login(&state);
    let mut next = loaded.data.clone();
    next.selected_id = Some(account_id);
    loaded.save(next)?;
    stop_requests(&state);
    Ok(())
}

#[tauri::command]
pub async fn openai_oauth_disconnect(
    app: AppHandle,
    state: State<'_, OpenAiAuthState>,
    account_id: String,
) -> Result<bool, String> {
    let mut guard = vault(&app, &state).await?;
    let loaded = guard.as_mut().unwrap();
    let profile = loaded
        .data
        .profiles
        .iter()
        .find(|p| p.id == account_id)
        .ok_or("Account no longer exists")?;
    cancel_login(&state);
    stop_requests(&state);
    let mut revoked = profile.credentials.is_none();
    if let Some(credentials) = &profile.credentials {
        // Revocation endpoint is discovered, but credentials can only be sent to OpenAI HTTPS.
        if let Ok(client) = crate::http::get_http_client() {
            if let Ok(response) = client
                .get(format!("{ISSUER}/.well-known/openid-configuration"))
                .timeout(Duration::from_secs(15))
                .send()
                .await
            {
                if let Ok(discovery) = response.json::<Value>().await {
                    if let Some(endpoint) = discovery["revocation_endpoint"]
                        .as_str()
                        .and_then(|u| reqwest::Url::parse(u).ok())
                        .filter(|u| {
                            u.scheme() == "https"
                                && u.host_str() == Some("auth.openai.com")
                                && u.username().is_empty()
                                && u.password().is_none()
                        })
                    {
                        for retry in 0..2 {
                            if retry > 0 {
                                tokio::time::sleep(Duration::from_millis(400)).await;
                            }
                            match client
                                .post(endpoint.clone())
                                .timeout(Duration::from_secs(15))
                                .form(&[
                                    ("token", credentials.refresh_token.as_str()),
                                    ("token_type_hint", "refresh_token"),
                                    ("client_id", profile.client_id.as_str()),
                                ])
                                .send()
                                .await
                            {
                                Ok(response) if response.status() == reqwest::StatusCode::OK => {
                                    revoked = true;
                                    break;
                                }
                                Ok(response) if !response.status().is_server_error() => break,
                                _ => {}
                            }
                        }
                    }
                }
            }
        }
    }
    let mut next = loaded.data.clone();
    next.profiles
        .iter_mut()
        .find(|p| p.id == account_id)
        .unwrap()
        .credentials = None;
    if next.selected_id.as_deref() == Some(&account_id) {
        next.selected_id = None;
    }
    loaded.save(next)?;
    Ok(revoked)
}

async fn access_token(app: &AppHandle) -> Result<String, String> {
    // Detach renewal from the requesting stream: cancelling a translation must not
    // discard a replacement refresh token after OpenAI has already rotated it.
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        use tauri::Manager;
        let state = app.state::<OpenAiAuthState>();
        access_token_inner(&app, &state).await
    })
    .await
    .map_err(|_| "Could not complete OpenAI credential renewal".to_string())?
}

async fn access_token_inner(app: &AppHandle, state: &OpenAiAuthState) -> Result<String, String> {
    // One mutex plus the vault's process lock serializes rotating refreshes across windows/processes.
    let mut guard = vault(app, state).await?;
    let loaded = guard.as_mut().unwrap();
    if !matches!(loaded.data.method, AuthMethod::Oauth) {
        return Err("OpenAI OAuth is not the selected authentication method".into());
    }
    let profile = loaded
        .data
        .profiles
        .iter()
        .find(|p| Some(&p.id) == loaded.data.selected_id.as_ref())
        .ok_or("Sign in with ChatGPT in Translation Providers first")?;
    let saved = profile
        .credentials
        .as_ref()
        .ok_or("Your ChatGPT session has ended. Sign in again.")?;
    if saved.expires_at > now() + 60 {
        return Ok(saved.access_token.clone());
    }
    let tokens = token_request(&[
        ("grant_type", "refresh_token"),
        ("client_id", &profile.client_id),
        ("refresh_token", &saved.refresh_token),
        ("resource", RESOURCE),
    ])
    .await?;
    let refreshed = credentials(tokens, Some(saved))?;
    let token = refreshed.access_token.clone();
    let profile_id = profile.id.clone();
    let mut next = loaded.data.clone();
    next.profiles
        .iter_mut()
        .find(|p| p.id == profile_id)
        .unwrap()
        .credentials = Some(refreshed);
    loaded.save(next)?;
    Ok(token)
}

#[tauri::command]
pub async fn openai_oauth_models(app: AppHandle) -> Result<Value, String> {
    let token = access_token(&app).await?;
    let response = crate::http::get_http_client()?
        .get(format!("{RESOURCE}/models"))
        .bearer_auth(token)
        .timeout(Duration::from_secs(45))
        .send()
        .await
        .map_err(|_| "Could not fetch ChatGPT models")?;
    if !response.status().is_success() {
        return Err(format!(
            "Could not fetch ChatGPT models (HTTP {}). Check your plan access or sign in again.",
            response.status().as_u16()
        ));
    }
    let response: Value = response
        .json()
        .await
        .map_err(|_| "Invalid ChatGPT model catalog")?;
    // Return catalog fields only, never arbitrary authenticated server responses.
    let models = response["models"].as_array().ok_or("OpenAI returned no ChatGPT model catalog")?.iter().filter(|m| m["visibility"] == "list").filter_map(|m| Some(serde_json::json!({ "id": m["slug"].as_str()?, "name": m["display_name"].as_str().unwrap_or(m["slug"].as_str()?) }))).collect::<Vec<_>>();
    Ok(serde_json::json!(models))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn authentication_switch_cancels_both_request_modes_without_cancelling_other_providers() {
        let state = OpenAiAuthState::default();
        let first = state.requests.lock().unwrap().child_token();
        let second = state.requests.lock().unwrap().child_token();
        let other_provider = CancellationToken::new();
        first.cancel();
        assert!(!second.is_cancelled());
        stop_requests(&state);
        assert!(first.is_cancelled());
        assert!(second.is_cancelled());
        assert!(!other_provider.is_cancelled());
        assert!(!state.requests.lock().unwrap().child_token().is_cancelled());
    }
    // Throwaway fixture generated for these tests; never used for authentication or shipped account credentials.
    const TEST_SIGNING_KEY: &str = "-----BEGIN PRIVATE KEY-----\nMIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgPe8V3v4xoCmQn0H6\nX790ePApRawDD07gHtusgroYxI2hRANCAATLUU2cPDC/t7RSmNTsfNDnDSFD0tBI\nxTV6O/ERlJag9KtdpD25c+j0H8Ii6UnhZdYafzrU40V6CclFQsXXsAsZ\n-----END PRIVATE KEY-----\n";
    #[test]
    fn verifies_signature_issuer_audience_expiry_and_nonce() {
        let keys: JwkSet = serde_json::from_value(serde_json::json!({"keys":[{"kty":"EC","x":"y1FNnDwwv7e0UpjU7HzQ5w0hQ9LQSMU1ejvxEZSWoPQ","y":"q12kPblz6PQfwiLpSeFl1hp_OtTjRXoJyUVCxdewCxk","crv":"P-256","kid":"test-key","alg":"ES256","use":"sig"}]})).unwrap();
        let mut header = jsonwebtoken::Header::new(Algorithm::ES256);
        header.kid = Some("test-key".into());
        let key = jsonwebtoken::EncodingKey::from_ec_pem(TEST_SIGNING_KEY.as_bytes()).unwrap();
        let claims = serde_json::json!({"sub":"account-subject","iss":ISSUER,"aud":"oaiapp_test","exp":now()+3600,"iat":now(),"nonce":"fresh-nonce","email":"test@example.com"});
        let token = jsonwebtoken::encode(&header, &claims, &key).unwrap();
        assert_eq!(
            verify_identity_with_keys(&token, "oaiapp_test", "fresh-nonce", &keys)
                .unwrap()
                .sub,
            "account-subject"
        );
        for (field, value) in [
            ("iss", serde_json::json!("https://attacker.invalid")),
            ("aud", serde_json::json!("other-client")),
            ("exp", serde_json::json!(now() - 3600)),
            ("nonce", serde_json::json!("stale-nonce")),
        ] {
            let mut changed = claims.clone();
            changed[field] = value;
            let token = jsonwebtoken::encode(&header, &changed, &key).unwrap();
            assert!(
                verify_identity_with_keys(&token, "oaiapp_test", "fresh-nonce", &keys).is_err(),
                "{field}"
            );
        }
        let mut corrupted = token.into_bytes();
        let start = corrupted.iter().rposition(|b| *b == b'.').unwrap() + 1;
        corrupted[start] = if corrupted[start] == b'A' { b'B' } else { b'A' };
        assert!(verify_identity_with_keys(
            std::str::from_utf8(&corrupted).unwrap(),
            "oaiapp_test",
            "fresh-nonce",
            &keys
        )
        .is_err());
    }
    fn attempt() -> LoginAttempt {
        LoginAttempt {
            state: "secret-state".into(),
            nonce: random_secret(),
            verifier: random_secret(),
            redirect: "http://127.0.0.1:1234/auth/callback".into(),
            profile: None,
            host_id: "host".into(),
        }
    }
    #[test]
    fn authorization_uses_public_pkce_registration_and_exact_loopback() {
        let attempt = attempt();
        let url = reqwest::Url::parse(&authorization_url(&attempt)).unwrap();
        let pairs: HashMap<_, _> = url.query_pairs().into_owned().collect();
        assert_eq!(pairs["client_id"], "dynamic_agent_client");
        assert_eq!(pairs["redirect_uri"], attempt.redirect);
        assert_eq!(pairs["code_challenge_method"], "S256");
        assert_ne!(pairs["code_challenge"], attempt.verifier);
        assert!(!pairs.contains_key("client_secret"));
        assert_eq!(random_secret().len(), 43);
    }
    #[test]
    fn callback_rejects_csrf_duplicates_and_changed_registration() {
        let attempt = attempt();
        for target in [
            "/callback?state=secret-state",
            "/auth/callback?state=bad",
            "/auth/callback?state=secret-state&state=secret-state",
        ] {
            assert!(callback_params(target, &attempt).is_err());
        }
        let params = callback_params(
            "/auth/callback?code=code&state=secret-state&client_id=oaiapp_new",
            &attempt,
        )
        .unwrap();
        assert_eq!(issued_client(&params, None).unwrap(), "oaiapp_new");
        let profile = Profile {
            id: "id".into(),
            client_id: "oaiapp_existing".into(),
            subject: "sub".into(),
            email: None,
            credentials: None,
        };
        assert!(issued_client(&params, Some(&profile)).is_err());
        assert!(issued_client(&HashMap::new(), None).is_err());
    }
    #[test]
    fn identity_only_and_nonrenewable_credentials_are_rejected() {
        let tokens = || TokenResponse {
            access_token: "access".into(),
            refresh_token: Some("refresh".into()),
            id_token: Some("id".into()),
            token_type: "Bearer".into(),
            expires_in: 3600,
            scope: Some(SCOPES.into()),
        };
        let mut denied = tokens();
        denied.scope = Some("openid email".into());
        assert!(credentials(denied, None).is_err());
        let mut missing = tokens();
        missing.refresh_token = None;
        assert!(credentials(missing, None).is_err());
        assert!(credentials(tokens(), None).is_ok());
    }
}
