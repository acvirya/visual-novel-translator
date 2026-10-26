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
                let name = m
                    .name()
                    .cloned()
                    .unwrap_or_else(|| format!("Monitor {}", idx + 1));
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
        let monitor = win
            .current_monitor()
            .ok()
            .flatten()
            .or_else(|| win.primary_monitor().ok().flatten());
        if let Some(m) = monitor {
            let primary = win.primary_monitor().ok().flatten();
            let primary_name = primary.and_then(|p| p.name().cloned());
            let name = m
                .name()
                .cloned()
                .unwrap_or_else(|| "Target Monitor".to_string());
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

fn safe_scale_coord(base: i32, offset: i32, scale: f64) -> i32 {
    let scaled = (offset as f64 * scale).round();
    let clamped = scaled.clamp(-32768.0, 32767.0) as i32;
    base.saturating_add(clamped)
}

fn safe_scale_dim(dim: u32, scale: f64, min_val: u32) -> u32 {
    let scaled = (dim as f64 * scale).round();
    (scaled.clamp(min_val as f64, 32767.0) as u32).max(min_val)
}

fn resolve_target_monitor(
    window: &tauri::WebviewWindow,
    monitor_name: Option<&str>,
) -> Option<tauri::Monitor> {
    let monitors = window.available_monitors().ok()?;
    if let Some(name) = monitor_name {
        let trimmed = name.trim();
        // 1. Direct exact name match (e.g. "\\\\.\\DISPLAY1")
        if let Some(m) = monitors
            .iter()
            .find(|m| m.name().map(|n| n.as_str()) == Some(trimmed))
        {
            return Some(m.clone());
        }

        // 2. Case-insensitive name match
        let lower = trimmed.to_lowercase();
        if let Some(m) = monitors
            .iter()
            .find(|m| m.name().map(|n| n.to_lowercase() == lower).unwrap_or(false))
        {
            return Some(m.clone());
        }

        // 3. Match array index / alias (e.g. "0", "1", "monitor_1", "display 1", "display_1")
        let clean_num_str = lower
            .strip_prefix("monitor_")
            .or_else(|| lower.strip_prefix("monitor "))
            .or_else(|| lower.strip_prefix("display_"))
            .or_else(|| lower.strip_prefix("display "))
            .unwrap_or(&lower);

        if let Ok(idx) = clean_num_str.parse::<usize>() {
            // Support 1-based (1 -> monitors[0]) and 0-based (0 -> monitors[0])
            if idx >= 1 && idx <= monitors.len() {
                return Some(monitors[idx - 1].clone());
            } else if idx < monitors.len() {
                return Some(monitors[idx].clone());
            }
        }
    }

    // 4. Primary monitor fallback
    if let Ok(Some(primary)) = window.primary_monitor() {
        return Some(primary);
    }

    // 5. First available monitor fallback
    monitors.into_iter().next()
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
        if let Some(m) = resolve_target_monitor(&overlay_win, monitor_name.as_deref()) {
            let pos = m.position();
            let mon_size = m.size();

            if let (Some(bx), Some(by), Some(bw), Some(bh)) = (x, y, width, height) {
                let scale = m.scale_factor();
                let phys_x = safe_scale_coord(pos.x, bx, scale);
                let phys_y = safe_scale_coord(pos.y, by, scale);
                let phys_w = safe_scale_dim(bw, scale, 50);
                let phys_h = safe_scale_dim(bh, scale, 30);
                let _ = overlay_win.set_position(PhysicalPosition::new(phys_x, phys_y));
                let _ = overlay_win.set_size(PhysicalSize::new(phys_w, phys_h));
            } else {
                let _ = overlay_win.set_position(PhysicalPosition::new(pos.x, pos.y));
                let _ = overlay_win.set_size(PhysicalSize::new(mon_size.width, mon_size.height));
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
        if let Some(m) = resolve_target_monitor(&overlay_win, monitor_name.as_deref()) {
            let pos = m.position();
            let scale = m.scale_factor();
            let phys_x = safe_scale_coord(pos.x, x, scale);
            let phys_y = safe_scale_coord(pos.y, y, scale);
            let phys_w = safe_scale_dim(width, scale, 50);
            let phys_h = safe_scale_dim(height, scale, 30);

            let _ = overlay_win.set_position(PhysicalPosition::new(phys_x, phys_y));
            let _ = overlay_win.set_size(PhysicalSize::new(phys_w, phys_h));
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
#[allow(clippy::too_many_arguments)] // Named arguments are part of the public Tauri IPC contract.
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
        if let Some(m) = resolve_target_monitor(&overlay_win, monitor_name.as_deref()) {
            let pos = m.position();
            let mon_size = m.size();

            if is_editing {
                // Ensure window is resizable so OS permits setting fullscreen dimensions
                let _ = overlay_win.set_resizable(true);
                // Expand to full monitor for free dragging/resizing across the entire screen
                let _ = overlay_win.set_position(PhysicalPosition::new(pos.x, pos.y));
                let _ = overlay_win.set_size(PhysicalSize::new(mon_size.width, mon_size.height));
                let _ = overlay_win.set_ignore_cursor_events(false);
                let _ = overlay_win.show();
                let _ = overlay_win.set_focus();
            } else {
                // Shrink to dialogue box bounds with DPI scaling
                if let (Some(bx), Some(by), Some(bw), Some(bh)) = (x, y, width, height) {
                    let scale = m.scale_factor();
                    let phys_x = safe_scale_coord(pos.x, bx, scale);
                    let phys_y = safe_scale_coord(pos.y, by, scale);
                    let phys_w = safe_scale_dim(bw, scale, 50);
                    let phys_h = safe_scale_dim(bh, scale, 30);
                    let _ = overlay_win.set_position(PhysicalPosition::new(phys_x, phys_y));
                    let _ = overlay_win.set_size(PhysicalSize::new(phys_w, phys_h));
                }
                let click_through = is_click_through.unwrap_or(false);
                let _ = overlay_win.set_ignore_cursor_events(click_through);
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
        let _ = overlay_win.set_resizable(true);
        if let Some(m) = resolve_target_monitor(&overlay_win, monitor_name.as_deref()) {
            let pos = m.position();
            let size = m.size();
            let _ = overlay_win.set_position(PhysicalPosition::new(pos.x, pos.y));
            let _ = overlay_win.set_size(PhysicalSize::new(size.width, size.height));
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
        let _ = overlay_win.emit(
            "set-selector-mode",
            serde_json::json!({ "mode": target_mode }),
        );

        Ok(())
    } else {
        Err("Region selector overlay window not found".to_string())
    }
}

#[tauri::command]
pub fn close_region_selector_overlay(
    app: AppHandle,
    restore_main: Option<bool>,
) -> Result<(), String> {
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
