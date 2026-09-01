mod oneocr;
mod screen_capture;
mod textractor;

use oneocr::{find_oneocr_installation, scan_screen_regions, OcrEngineStatus, OcrScanResult, OcrStabilityConfig};
use screen_capture::{capture_screen_rect, image_to_base64_data_url, CaptureRegion};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::OnceLock;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize};
use textractor::TextractorState;

static HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn get_http_client() -> &'static reqwest::Client {
    HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(1800)) // 30 min ceiling timeout
            .connect_timeout(std::time::Duration::from_secs(30))
            .tcp_keepalive(Some(std::time::Duration::from_secs(30)))
            .pool_idle_timeout(std::time::Duration::from_secs(180))
            .pool_max_idle_per_host(10)
            .build()
            .expect("Failed to initialize shared HTTP client")
    })
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MonitorInfo {
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub x: i32,
    pub y: i32,
    pub scale_factor: f64,
    pub is_primary: bool,
}

#[tauri::command]
fn get_monitors(app: AppHandle) -> Result<Vec<MonitorInfo>, String> {
    if let Some(main_win) = app.get_webview_window("main") {
        let available = main_win.available_monitors().map_err(|e| e.to_string())?;
        let primary = main_win.primary_monitor().ok().flatten();

        let primary_name = primary.and_then(|p| p.name().cloned());

        let list = available
            .into_iter()
            .enumerate()
            .map(|(idx, m)| {
                let name = m.name().cloned().unwrap_or_else(|| format!("Monitor {}", idx + 1));
                let is_primary = primary_name.as_ref() == Some(&name);
                let size = m.size();
                let pos = m.position();
                let scale = m.scale_factor();

                MonitorInfo {
                    name,
                    width: size.width,
                    height: size.height,
                    x: pos.x,
                    y: pos.y,
                    scale_factor: scale,
                    is_primary,
                }
            })
            .collect();

        Ok(list)
    } else {
        Ok(vec![])
    }
}

#[tauri::command]
fn get_window_monitor(app: AppHandle, label: String) -> Result<MonitorInfo, String> {
    if let Some(win) = app.get_webview_window(&label) {
        let monitor = win.current_monitor().ok().flatten().or_else(|| win.primary_monitor().ok().flatten());
        if let Some(m) = monitor {
            let primary = win.primary_monitor().ok().flatten();
            let primary_name = primary.and_then(|p| p.name().cloned());
            let name = m.name().cloned().unwrap_or_else(|| "Target Monitor".to_string());
            let is_primary = primary_name.as_ref() == Some(&name);
            let size = m.size();
            let pos = m.position();
            let scale = m.scale_factor();

            Ok(MonitorInfo {
                name,
                width: size.width,
                height: size.height,
                x: pos.x,
                y: pos.y,
                scale_factor: scale,
                is_primary,
            })
        } else {
            Err("No monitor found for window".to_string())
        }
    } else {
        Err(format!("Window {} not found", label))
    }
}

#[tauri::command]
fn show_overlay(
    app: AppHandle,
    monitor_name: Option<String>,
    x: Option<i32>,
    y: Option<i32>,
    width: Option<u32>,
    height: Option<u32>,
    is_click_through: Option<bool>,
) -> Result<(), String> {
    if let Some(overlay_win) = app.get_webview_window("overlay") {
        // Find matching monitor
        if let Ok(monitors) = overlay_win.available_monitors() {
            let target_monitor = if let Some(ref m_name) = monitor_name {
                monitors.into_iter().find(|m| m.name() == Some(m_name))
            } else {
                overlay_win.primary_monitor().ok().flatten()
            };

            if let Some(m) = target_monitor {
                let pos = m.position();
                let mon_size = m.size();

                if let (Some(bx), Some(by), Some(bw), Some(bh)) = (x, y, width, height) {
                    let scale = m.scale_factor();
                    let phys_x = pos.x + (bx as f64 * scale).round() as i32;
                    let phys_y = pos.y + (by as f64 * scale).round() as i32;
                    let phys_w = ((bw as f64 * scale).round() as u32).max(50);
                    let phys_h = ((bh as f64 * scale).round() as u32).max(30);
                    let _ = overlay_win.set_position(PhysicalPosition::new(phys_x, phys_y));
                    let _ = overlay_win.set_size(PhysicalSize::new(phys_w, phys_h));
                } else {
                    let _ = overlay_win.set_position(PhysicalPosition::new(pos.x, pos.y));
                    let _ = overlay_win.set_size(PhysicalSize::new(mon_size.width, mon_size.height));
                }
            }
        }

        let _ = overlay_win.set_always_on_top(true);
        let click_through = is_click_through.unwrap_or(false);
        let _ = overlay_win.set_ignore_cursor_events(click_through);
        overlay_win.show().map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Overlay window not found".to_string())
    }
}

#[tauri::command]
fn update_overlay_bounds(
    app: AppHandle,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    monitor_name: Option<String>,
) -> Result<(), String> {
    if let Some(overlay_win) = app.get_webview_window("overlay") {
        if let Ok(monitors) = overlay_win.available_monitors() {
            let target_monitor = if let Some(ref m_name) = monitor_name {
                monitors.into_iter().find(|m| m.name() == Some(m_name))
            } else {
                overlay_win.primary_monitor().ok().flatten()
            };

            if let Some(m) = target_monitor {
                let pos = m.position();
                let scale = m.scale_factor();
                let phys_x = pos.x + (x as f64 * scale).round() as i32;
                let phys_y = pos.y + (y as f64 * scale).round() as i32;
                let phys_w = ((width as f64 * scale).round() as u32).max(50);
                let phys_h = ((height as f64 * scale).round() as u32).max(30);

                let _ = overlay_win.set_position(PhysicalPosition::new(phys_x, phys_y));
                let _ = overlay_win.set_size(PhysicalSize::new(phys_w, phys_h));
            }
        }
        Ok(())
    } else {
        Err("Overlay window not found".to_string())
    }
}

#[tauri::command]
fn hide_overlay(app: AppHandle) -> Result<(), String> {
    if let Some(overlay_win) = app.get_webview_window("overlay") {
        overlay_win.hide().map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Overlay window not found".to_string())
    }
}

#[tauri::command]
fn set_overlay_click_through(app: AppHandle, enable: bool) -> Result<(), String> {
    if let Some(overlay_win) = app.get_webview_window("overlay") {
        overlay_win
            .set_ignore_cursor_events(enable)
            .map_err(|e| e.to_string())?;
        if !enable {
            let _ = overlay_win.set_focus();
        }
        Ok(())
    } else {
        Err("Overlay window not found".to_string())
    }
}

#[tauri::command]
fn set_overlay_edit_mode(
    app: AppHandle,
    is_editing: bool,
    monitor_name: Option<String>,
    x: Option<i32>,
    y: Option<i32>,
    width: Option<u32>,
    height: Option<u32>,
    is_click_through: Option<bool>,
) -> Result<(), String> {
    if let Some(overlay_win) = app.get_webview_window("overlay") {
        if let Ok(monitors) = overlay_win.available_monitors() {
            let target_monitor = if let Some(ref m_name) = monitor_name {
                monitors.into_iter().find(|m| m.name() == Some(m_name))
            } else {
                overlay_win.primary_monitor().ok().flatten()
            };

            if let Some(m) = target_monitor {
                let pos = m.position();
                let mon_size = m.size();

                if is_editing {
                    // Expand to full monitor for free dragging/resizing across the entire screen
                    let _ = overlay_win.set_position(PhysicalPosition::new(pos.x, pos.y));
                    let _ = overlay_win.set_size(PhysicalSize::new(mon_size.width, mon_size.height));
                    let _ = overlay_win.set_ignore_cursor_events(false);
                } else {
                    // Shrink to dialogue box bounds with DPI scaling
                    if let (Some(bx), Some(by), Some(bw), Some(bh)) = (x, y, width, height) {
                        let scale = m.scale_factor();
                        let phys_x = pos.x + (bx as f64 * scale).round() as i32;
                        let phys_y = pos.y + (by as f64 * scale).round() as i32;
                        let phys_w = ((bw as f64 * scale).round() as u32).max(50);
                        let phys_h = ((bh as f64 * scale).round() as u32).max(30);
                        let _ = overlay_win.set_position(PhysicalPosition::new(phys_x, phys_y));
                        let _ = overlay_win.set_size(PhysicalSize::new(phys_w, phys_h));
                    }
                    let click_through = is_click_through.unwrap_or(false);
                    let _ = overlay_win.set_ignore_cursor_events(click_through);
                }
            }
        }

        let main_win = app.get_webview_window("main");

        if is_editing {
            // Hide main app window so only overlay editor is visible over the game
            if let Some(main) = main_win {
                let _ = main.hide();
            }
            let _ = overlay_win.set_focus();
        } else {
            // Restore and focus main app window when exiting edit mode
            if let Some(main) = main_win {
                let _ = main.show();
                let _ = main.set_focus();
            }
        }
        Ok(())
    } else {
        Err("Overlay window not found".to_string())
    }
}

// ----------------------------------------------------
// OCR & Screen Region Commands
// ----------------------------------------------------

#[tauri::command]
fn detect_oneocr_path(custom_path: Option<String>) -> Result<OcrEngineStatus, String> {
    match find_oneocr_installation(custom_path) {
        Ok((dll, model, _onnx)) => Ok(OcrEngineStatus {
            is_available: true,
            dll_path: dll.to_string_lossy().to_string(),
            model_path: model.to_string_lossy().to_string(),
            error: None,
        }),
        Err(e) => Ok(OcrEngineStatus {
            is_available: false,
            dll_path: String::new(),
            model_path: String::new(),
            error: Some(e),
        }),
    }
}

#[tauri::command]
async fn capture_regions_preview(regions: Vec<CaptureRegion>) -> Result<HashMap<String, String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut map = HashMap::new();
        for r in regions {
            let x = r.physical_x.unwrap_or(r.x);
            let y = r.physical_y.unwrap_or(r.y);
            let w = r.physical_width.unwrap_or(r.width);
            let h = r.physical_height.unwrap_or(r.height);

            if w > 0 && h > 0 {
                if let Ok(cap) = capture_screen_rect(x, y, w, h) {
                    if let Ok(b64) = image_to_base64_data_url(&cap.dynamic_image) {
                        map.insert(r.id, b64);
                    }
                }
            }
        }
        Ok(map)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn run_oneocr_scan(
    regions: Vec<CaptureRegion>,
    scale_percent: u32,
    custom_path: Option<String>,
    stability_config: Option<OcrStabilityConfig>,
) -> Result<OcrScanResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        scan_screen_regions(regions, scale_percent, custom_path, stability_config)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn open_region_selector_overlay(app: AppHandle, monitor_name: Option<String>) -> Result<(), String> {
    if let Some(overlay_win) = app.get_webview_window("region-selector") {
        if let Ok(monitors) = overlay_win.available_monitors() {
            let target_monitor = if let Some(ref m_name) = monitor_name {
                monitors.into_iter().find(|m| m.name() == Some(m_name))
            } else {
                overlay_win.primary_monitor().ok().flatten()
            };

            if let Some(m) = target_monitor {
                let pos = m.position();
                let size = m.size();
                let _ = overlay_win.set_position(PhysicalPosition::new(pos.x, pos.y));
                let _ = overlay_win.set_size(PhysicalSize::new(size.width, size.height));
            }
        }

        // Hide main app window so only region selector overlay is visible over the game
        if let Some(main) = app.get_webview_window("main") {
            let _ = main.hide();
        }

        let _ = overlay_win.set_always_on_top(true);
        let _ = overlay_win.set_ignore_cursor_events(false);
        overlay_win.show().map_err(|e| e.to_string())?;
        let _ = overlay_win.set_focus();
        Ok(())
    } else {
        Err("Region selector overlay window not found".to_string())
    }
}

#[tauri::command]
fn close_region_selector_overlay(app: AppHandle) -> Result<(), String> {
    if let Some(overlay_win) = app.get_webview_window("region-selector") {
        let _ = overlay_win.hide();
    }

    // Restore and focus main app window
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.set_focus();
    }

    Ok(())
}

#[tauri::command]
async fn translate_free_mt(
    text: String,
    source_lang: String,
    target_lang: String,
    provider: String,
    api_key: Option<String>,
) -> Result<String, String> {
    let client = get_http_client();

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

#[tauri::command]
fn show_save_script_dialog(default_name: Option<String>) -> Result<Option<String>, String> {
    let mut dialog = rfd::FileDialog::new()
        .set_title("Create New Script File")
        .add_filter("JSON Lines (*.jsonl)", &["jsonl"])
        .add_filter("JSON File (*.json)", &["json"])
        .add_filter("All Files (*.*)", &["*"]);

    if let Some(name) = default_name {
        dialog = dialog.set_file_name(&name);
    } else {
        dialog = dialog.set_file_name("new_script.jsonl");
    }

    if let Some(path) = dialog.save_file() {
        let path_str = path.to_string_lossy().to_string();
        // Create initial empty file if it doesn't exist
        if !path.exists() {
            let _ = std::fs::write(&path, "");
        }
        Ok(Some(path_str))
    } else {
        Ok(None)
    }
}

#[tauri::command]
fn show_open_script_dialog() -> Result<Option<(String, String)>, String> {
    let file = rfd::FileDialog::new()
        .set_title("Open Script File")
        .add_filter("Script Files (*.jsonl, *.json)", &["jsonl", "json"])
        .add_filter("All Files (*.*)", &["*"])
        .pick_file();

    if let Some(path) = file {
        let path_str = path.to_string_lossy().to_string();
        let content = std::fs::read_to_string(&path).map_err(|e| format!("Failed to read script file: {}", e))?;
        Ok(Some((path_str, content)))
    } else {
        Ok(None)
    }
}

#[tauri::command]
fn save_script_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| format!("Failed to write script file: {}", e))?;
    Ok(())
}

#[tauri::command]
fn read_script_file_by_path(path: String) -> Result<Option<String>, String> {
    let p = std::path::Path::new(&path);
    if p.exists() && p.is_file() {
        let content = std::fs::read_to_string(p).map_err(|e| e.to_string())?;
        Ok(Some(content))
    } else {
        Ok(None)
    }
}

#[tauri::command]
fn show_pick_files_dialog() -> Result<Vec<(String, String, u64)>, String> {
    let files = rfd::FileDialog::new()
        .set_title("Select Script Files to Batch Translate")
        .add_filter("Script Files (*.jsonl, *.json, *.txt)", &["jsonl", "json", "txt"])
        .add_filter("All Files (*.*)", &["*"])
        .pick_files();

    if let Some(paths) = files {
        let mut results = Vec::new();
        for path in paths {
            let path_str = path.to_string_lossy().to_string();
            if let Ok(content) = std::fs::read_to_string(&path) {
                let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
                results.push((path_str, content, size));
            }
        }
        Ok(results)
    } else {
        Ok(Vec::new())
    }
}

#[tauri::command]
fn show_pick_directory_dialog() -> Result<Option<String>, String> {
    let folder = rfd::FileDialog::new()
        .set_title("Select Output Folder for Translations")
        .pick_folder();

    if let Some(path) = folder {
        Ok(Some(path.to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenRouterCompletionResponse {
    pub content: String,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub cached_tokens: u32,
    pub cost: f64,
}

fn parse_openrouter_payload(parsed: &serde_json::Value, raw_body: &str) -> Result<OpenRouterCompletionResponse, String> {
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
    } else {
        None
    };

    let content = content.ok_or_else(|| format!("Empty or unexpected OpenRouter response payload: {}", raw_body))?;

    let prompt_tokens = parsed["usage"]["prompt_tokens"].as_u64().unwrap_or(0) as u32;
    let completion_tokens = parsed["usage"]["completion_tokens"].as_u64().unwrap_or(0) as u32;
    let cached_tokens = parsed["usage"]["prompt_tokens_details"]["cached_tokens"].as_u64().unwrap_or(0) as u32;
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
async fn openrouter_chat_completion(
    api_key: String,
    model_id: String,
    messages_json: String,
    temperature: f64,
    max_tokens: Option<u32>,
    timeout_seconds: Option<u64>,
    providers: Option<Vec<String>>,
    reasoning: Option<serde_json::Value>,
) -> Result<OpenRouterCompletionResponse, String> {
    let client = get_http_client();
    let timeout_duration = std::time::Duration::from_secs(timeout_seconds.unwrap_or(600)); // Default 10 min

    let messages: serde_json::Value = serde_json::from_str(&messages_json)
        .map_err(|e| format!("Invalid messages JSON: {}", e))?;

    let mut payload = serde_json::json!({
        "model": model_id,
        "messages": messages,
        "temperature": temperature,
        "response_format": { "type": "json_object" },
    });

    if let Some(ref r) = reasoning {
        if r.is_object() && !r.as_object().unwrap().is_empty() {
            payload["reasoning"] = r.clone();
        }
    }

    if let Some(ref list) = providers {
        if !list.is_empty() {
            payload["provider"] = serde_json::json!({
                "allow_fallbacks": true,
                "only": list,
            });
        }
    }

    if let Some(mt) = max_tokens {
        if mt > 0 {
            payload["max_tokens"] = serde_json::json!(mt);
        }
    }

    let resp = client
        .post("https://openrouter.ai/api/v1/chat/completions")
        .timeout(timeout_duration)
        .header("Authorization", format!("Bearer {}", api_key.trim()))
        .header("Content-Type", "application/json")
        .header("Accept-Encoding", "identity")
        .header("HTTP-Referer", "https://github.com/acvirya/visual-novel-translator")
        .header("X-Title", "VN Translator Desktop")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to OpenRouter API: {}", e))?;

    let status = resp.status();
    let body_text = resp.text().await.map_err(|e| format!("Failed to read OpenRouter response text: {}", e))?;

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

            if let Some(ref list) = providers {
                if !list.is_empty() {
                    fallback_payload["provider"] = serde_json::json!({
                        "allow_fallbacks": true,
                        "only": list,
                    });
                }
            }

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
                .header("Accept-Encoding", "identity")
                .header("HTTP-Referer", "https://github.com/acvirya/visual-novel-translator")
                .header("X-Title", "VN Translator Desktop")
                .json(&fallback_payload)
                .send()
                .await
                .map_err(|e| format!("Failed to connect to OpenRouter API (retry): {}", e))?;

            let retry_status = retry_resp.status();
            let retry_body = retry_resp.text().await.map_err(|e| format!("Failed to read retry response text: {}", e))?;
            if !retry_status.is_success() {
                return Err(format!("OpenRouter API error (HTTP {}): {}", retry_status, retry_body));
            }
            let parsed: serde_json::Value = serde_json::from_str(&retry_body)
                .map_err(|e| format!("Failed to parse OpenRouter response: {}", e))?;
            return parse_openrouter_payload(&parsed, &retry_body);
        }
        return Err(format!("OpenRouter API error (HTTP {}): {}", status, body_text));
    }

    let parsed: serde_json::Value = serde_json::from_str(&body_text)
        .map_err(|e| format!("Failed to parse OpenRouter response: {}", e))?;

    parse_openrouter_payload(&parsed, &body_text)
}

#[tauri::command]
fn resolve_safe_log_path(file_name: &str) -> Result<std::path::PathBuf, String> {
    let p = std::path::Path::new(file_name);

    // Disallow path traversal components ('..')
    for component in p.components() {
        if component == std::path::Component::ParentDir {
            return Err("Invalid file path: path traversal is not permitted".to_string());
        }
    }

    if p.is_absolute() {
        let p_str = p.to_string_lossy().to_lowercase();
        if p_str.contains("windows\\system32") || p_str.contains("windows\\syswow64") {
            return Err("Access to system directories is prohibited".to_string());
        }
        Ok(p.to_path_buf())
    } else {
        // If relative path, write to workspace root (parent of src-tauri) to prevent triggering Tauri dev file watcher
        if let Ok(cwd) = std::env::current_dir() {
            if cwd.ends_with("src-tauri") {
                if let Some(parent) = cwd.parent() {
                    return Ok(parent.join(file_name));
                }
            }
            Ok(cwd.join(file_name))
        } else {
            Ok(std::env::temp_dir().join(file_name))
        }
    }
}

#[tauri::command]
fn append_debug_log(file_name: String, content: String) -> Result<(), String> {
    use std::fs::OpenOptions;
    use std::io::Write;

    let final_path = resolve_safe_log_path(&file_name)?;

    if let Some(parent) = final_path.parent() {
        if !parent.as_os_str().is_empty() {
            let _ = std::fs::create_dir_all(parent);
        }
    }

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&final_path)
        .map_err(|e| format!("Failed to open log file {:?}: {}", final_path, e))?;

    file.write_all(content.as_bytes())
        .map_err(|e| format!("Failed to write to log file: {}", e))?;

    Ok(())
}

#[tauri::command]
fn open_file_in_default_app(app_handle: tauri::AppHandle, path: String) -> Result<(), String> {
    let final_path = resolve_safe_log_path(&path)?;

    if !final_path.exists() {
        if let Some(parent) = final_path.parent() {
            if !parent.as_os_str().is_empty() {
                let _ = std::fs::create_dir_all(parent);
            }
        }
        let _ = std::fs::write(&final_path, "[BATCH TRANSLATE DEBUG LOG INITIALIZED]\nNo errors recorded yet.\n");
    }

    use tauri_plugin_opener::OpenerExt;
    let path_str = final_path.to_string_lossy().to_string();
    app_handle
        .opener()
        .open_path(path_str, None::<&str>)
        .map_err(|e| format!("Failed to open file: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(TextractorState::new())
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { .. } => {
                    if window.label() == "main" {
                        let state = window.state::<TextractorState>();
                        textractor::stop_textractor_internal(&state);
                        window.app_handle().exit(0);
                    } else if window.label() == "overlay" || window.label() == "region-selector" {
                        if let Some(main) = window.app_handle().get_webview_window("main") {
                            let _ = main.show();
                            let _ = main.set_focus();
                        }
                    }
                }
                tauri::WindowEvent::Destroyed => {
                    if window.label() == "overlay" || window.label() == "region-selector" {
                        if let Some(main) = window.app_handle().get_webview_window("main") {
                            let _ = main.show();
                        }
                    }
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_monitors,
            get_window_monitor,
            show_overlay,
            hide_overlay,
            update_overlay_bounds,
            set_overlay_click_through,
            set_overlay_edit_mode,
            textractor::list_target_processes,
            textractor::start_textractor,
            textractor::send_textractor_command,
            textractor::stop_textractor,
            textractor::find_textractor_installation,
            detect_oneocr_path,
            capture_regions_preview,
            run_oneocr_scan,
            open_region_selector_overlay,
            close_region_selector_overlay,
            translate_free_mt,
            show_save_script_dialog,
            show_open_script_dialog,
            save_script_file,
            read_script_file_by_path,
            show_pick_files_dialog,
            show_pick_directory_dialog,
            openrouter_chat_completion,
            append_debug_log,
            open_file_in_default_app
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                let state = app_handle.state::<TextractorState>();
                textractor::stop_textractor_internal(&state);
            }
        });
}

