use tauri_plugin_opener::OpenerExt;

#[tauri::command]
pub async fn show_save_script_dialog(default_name: Option<String>) -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || {
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
            if !path.exists() {
                let _ = std::fs::write(&path, "");
            }
            Ok(Some(path_str))
        } else {
            Ok(None)
        }
    })
    .await
    .map_err(|e| format!("Dialog task failed: {}", e))?
}

#[tauri::command]
pub async fn show_open_script_dialog() -> Result<Option<(String, String)>, String> {
    tokio::task::spawn_blocking(move || {
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
    })
    .await
    .map_err(|e| format!("Dialog task failed: {}", e))?
}

#[tauri::command]
pub async fn save_script_file(path: String, content: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let trimmed = path.trim();
        if trimmed.is_empty() || trimmed.contains('\0') {
            return Err("Invalid or empty file path".to_string());
        }
        let p = std::path::Path::new(trimmed);
        if let Some(parent) = p.parent() {
            if !parent.as_os_str().is_empty() && !parent.exists() {
                let _ = std::fs::create_dir_all(parent);
            }
        }
        std::fs::write(p, content).map_err(|e| format!("Failed to write script file: {}", e))?;
        Ok(())
    })
    .await
    .map_err(|e| format!("File save task failed: {}", e))?
}

#[tauri::command]
pub async fn read_script_file_by_path(path: String) -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || {
        let trimmed = path.trim();
        if trimmed.is_empty() || trimmed.contains('\0') {
            return Ok(None);
        }
        let p = std::path::Path::new(trimmed);
        if p.exists() && p.is_file() {
            let content = std::fs::read_to_string(p).map_err(|e| e.to_string())?;
            Ok(Some(content))
        } else {
            Ok(None)
        }
    })
    .await
    .map_err(|e| format!("File read task failed: {}", e))?
}

#[tauri::command]
pub async fn show_pick_files_dialog() -> Result<Vec<(String, String, u64)>, String> {
    tokio::task::spawn_blocking(move || {
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
    })
    .await
    .map_err(|e| format!("Pick files task failed: {}", e))?
}

#[tauri::command]
pub async fn show_pick_directory_dialog() -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || {
        let folder = rfd::FileDialog::new()
            .set_title("Select Output Folder for Translations")
            .pick_folder();

        if let Some(path) = folder {
            Ok(Some(path.to_string_lossy().to_string()))
        } else {
            Ok(None)
        }
    })
    .await
    .map_err(|e| format!("Pick directory task failed: {}", e))?
}

pub fn resolve_safe_log_path(file_name: &str) -> Result<std::path::PathBuf, String> {
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
pub fn append_debug_log(file_name: String, content: String) -> Result<(), String> {
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

    let payload = if content.ends_with('\n') {
        content
    } else {
        format!("{}\n", content)
    };

    file.write_all(payload.as_bytes())
        .map_err(|e| format!("Failed to write to log file: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn read_debug_log(file_name: String, max_lines: Option<usize>) -> Result<Vec<String>, String> {
    use std::fs::File;
    use std::io::{BufRead, BufReader};

    let final_path = resolve_safe_log_path(&file_name)?;
    if !final_path.exists() {
        return Ok(Vec::new());
    }

    let file = File::open(&final_path)
        .map_err(|e| format!("Failed to open log file {:?}: {}", final_path, e))?;
    let reader = BufReader::new(file);

    let lines: Vec<String> = reader
        .lines()
        .map_while(Result::ok)
        .filter(|l| !l.trim().is_empty())
        .collect();

    if let Some(limit) = max_lines {
        if lines.len() > limit {
            return Ok(lines[lines.len() - limit..].to_vec());
        }
    }

    Ok(lines)
}

#[tauri::command]
pub fn clear_debug_log(file_name: String) -> Result<(), String> {
    let final_path = resolve_safe_log_path(&file_name)?;
    if final_path.exists() {
        std::fs::remove_file(&final_path)
            .map_err(|e| format!("Failed to clear log file {:?}: {}", final_path, e))?;
    }
    Ok(())
}

#[tauri::command]
pub fn open_file_in_default_app(app_handle: tauri::AppHandle, path: String) -> Result<(), String> {
    let final_path = resolve_safe_log_path(&path)?;

    if !final_path.exists() {
        if let Some(parent) = final_path.parent() {
            if !parent.as_os_str().is_empty() {
                let _ = std::fs::create_dir_all(parent);
            }
        }
        let _ = std::fs::write(&final_path, "[BATCH TRANSLATE DEBUG LOG INITIALIZED]\nNo errors recorded yet.\n");
    }

    let path_str = final_path.to_string_lossy().to_string();
    app_handle
        .opener()
        .open_path(path_str, None::<&str>)
        .map_err(|e| format!("Failed to open file: {}", e))
}

#[tauri::command]
pub fn load_app_settings(app_handle: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri::Manager;
    let config_dir = app_handle
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to get app config dir: {}", e))?;
    let settings_path = config_dir.join("settings.json");
    if !settings_path.exists() {
        return Ok(None);
    }
    let content = std::fs::read_to_string(&settings_path)
        .map_err(|e| format!("Failed to read settings file: {}", e))?;
    Ok(Some(content))
}

#[tauri::command]
pub fn save_app_settings(app_handle: tauri::AppHandle, json_content: String) -> Result<(), String> {
    use tauri::Manager;
    let config_dir = app_handle
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to get app config dir: {}", e))?;
    if !config_dir.exists() {
        let _ = std::fs::create_dir_all(&config_dir);
    }
    let settings_path = config_dir.join("settings.json");
    let temp_path = config_dir.join("settings.json.tmp");
    std::fs::write(&temp_path, json_content.as_bytes())
        .map_err(|e| format!("Failed to write temp settings file: {}", e))?;
    let _ = std::fs::remove_file(&settings_path);
    std::fs::rename(&temp_path, &settings_path)
        .map_err(|e| format!("Failed to commit settings file: {}", e))?;
    Ok(())
}
