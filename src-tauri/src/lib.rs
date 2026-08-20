mod textractor;

use serde::{Deserialize, Serialize};
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
        // When editing: disable click-through and focus
        // When not editing: enable click-through
        overlay_win
            .set_ignore_cursor_events(!is_editing)
            .map_err(|e| e.to_string())?;
        if is_editing {
            let _ = overlay_win.set_focus();
        }
        Ok(())
    } else {
        Err("Overlay window not found".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(TextractorState::new())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // If main control panel is closed, terminate the entire application and overlay
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
            textractor::stop_textractor
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
