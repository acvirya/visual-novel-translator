use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize};

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
pub fn get_monitors(app: AppHandle) -> Result<Vec<MonitorInfo>, String> {
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
pub fn get_window_monitor(app: AppHandle, label: String) -> Result<MonitorInfo, String> {
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
pub fn show_overlay(
    app: AppHandle,
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
pub fn update_overlay_bounds(
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
pub fn hide_overlay(app: AppHandle) -> Result<(), String> {
    if let Some(overlay_win) = app.get_webview_window("overlay") {
        overlay_win.hide().map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Overlay window not found".to_string())
    }
}

#[tauri::command]
pub fn set_overlay_click_through(app: AppHandle, enable: bool) -> Result<(), String> {
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
pub fn set_overlay_edit_mode(
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

#[tauri::command]
pub fn open_region_selector_overlay(
    app: AppHandle,
    monitor_name: Option<String>,
    mode: Option<String>,
) -> Result<(), String> {
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

        let is_snipping = mode.as_deref() == Some("snipping");

        // In setup mode, hide main window. In snipping mode, leave main window as-is so user stays in game
        if !is_snipping {
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.hide();
            }
        }

        let _ = overlay_win.set_always_on_top(true);
        let _ = overlay_win.set_ignore_cursor_events(false);
        overlay_win.show().map_err(|e| e.to_string())?;
        let _ = overlay_win.set_focus();

        let target_mode = mode.unwrap_or_else(|| "setup".to_string());
        let _ = overlay_win.emit("set-selector-mode", serde_json::json!({ "mode": target_mode }));

        Ok(())
    } else {
        Err("Region selector overlay window not found".to_string())
    }
}

#[tauri::command]
pub fn close_region_selector_overlay(app: AppHandle, restore_main: Option<bool>) -> Result<(), String> {
    if let Some(overlay_win) = app.get_webview_window("region-selector") {
        let _ = overlay_win.hide();
    }

    if restore_main.unwrap_or(true) {
        if let Some(main) = app.get_webview_window("main") {
            let _ = main.show();
            let _ = main.set_focus();
        }
    }

    Ok(())
}
