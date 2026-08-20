mod oneocr;
mod screen_capture;
mod textractor;

use oneocr::{find_oneocr_installation, scan_screen_regions, OcrEngineStatus, OcrScanResult, OcrStabilityConfig};
use screen_capture::{capture_screen_rect, image_to_base64_data_url, CaptureRegion};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize};
use textractor::TextractorState;

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
fn show_overlay(app: AppHandle, monitor_name: Option<String>) -> Result<(), String> {
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
                let size = m.size();
                let _ = overlay_win.set_position(PhysicalPosition::new(pos.x, pos.y));
                let _ = overlay_win.set_size(PhysicalSize::new(size.width, size.height));
            }
        }

        let _ = overlay_win.set_always_on_top(true);
        let _ = overlay_win.set_ignore_cursor_events(true);
        overlay_win.show().map_err(|e| e.to_string())?;
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
fn set_overlay_edit_mode(app: AppHandle, is_editing: bool) -> Result<(), String> {
    if let Some(overlay_win) = app.get_webview_window("overlay") {
        overlay_win
            .set_ignore_cursor_events(!is_editing)
            .map_err(|e| e.to_string())?;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(TextractorState::new())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if window.label() == "main" {
                    window.app_handle().exit(0);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_monitors,
            show_overlay,
            hide_overlay,
            set_overlay_click_through,
            set_overlay_edit_mode,
            textractor::list_target_processes,
            textractor::start_textractor,
            textractor::send_textractor_command,
            textractor::stop_textractor,
            detect_oneocr_path,
            capture_regions_preview,
            run_oneocr_scan,
            open_region_selector_overlay,
            close_region_selector_overlay
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

