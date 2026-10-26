use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;

static SAVE_SEQUENCE: AtomicU64 = AtomicU64::new(0);
const MAX_SCRIPT_BYTES: u64 = 64 * 1024 * 1024;

/// Keep the old file intact until a complete, flushed replacement is ready.
fn atomic_write(path: &Path, content: &[u8]) -> Result<(), String> {
    use std::io::Write;
    let parent = path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    std::fs::create_dir_all(parent)
        .map_err(|e| format!("Failed to create output directory: {e}"))?;
    let name = path
        .file_name()
        .ok_or("Invalid output file name")?
        .to_string_lossy();
    let temp = parent.join(format!(
        ".{name}.{}.{}.tmp",
        std::process::id(),
        SAVE_SEQUENCE.fetch_add(1, Ordering::Relaxed)
    ));
    let result = (|| {
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)
            .map_err(|e| format!("Failed to create temporary file: {e}"))?;
        file.write_all(content)
            .and_then(|_| file.sync_all())
            .map_err(|e| format!("Failed to write file: {e}"))?;
        drop(file);
        std::fs::rename(&temp, path).map_err(|e| format!("Failed to commit file: {e}"))
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temp);
    }
    result
}

fn read_script(path: &Path) -> Result<String, String> {
    use std::io::Read;
    let file = std::fs::File::open(path).map_err(|e| format!("Failed to open script: {e}"))?;
    let mut content = String::new();
    file.take(MAX_SCRIPT_BYTES + 1)
        .read_to_string(&mut content)
        .map_err(|e| format!("Failed to read script: {e}"))?;
    if content.len() as u64 > MAX_SCRIPT_BYTES {
        return Err("Script exceeds the 64 MiB limit".into());
    }
    Ok(content)
}

#[tauri::command]
pub async fn show_save_script_dialog(
    default_name: Option<String>,
) -> Result<Option<String>, String> {
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
                atomic_write(&path, b"")?;
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
            let content = read_script(&path)?;
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
        atomic_write(p, content.as_bytes())
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
            let content = read_script(p)?;
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
            .add_filter(
                "Script Files (*.jsonl, *.json, *.txt)",
                &["jsonl", "json", "txt"],
            )
            .add_filter("All Files (*.*)", &["*"])
            .pick_files();

        if let Some(paths) = files {
            let mut results = Vec::new();
            for path in paths {
                let path_str = path.to_string_lossy().to_string();
                let content = read_script(&path).map_err(|e| format!("{}: {e}", path.display()))?;
                let size = content.len() as u64;
                results.push((path_str, content, size));
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

fn validate_log_name(file_name: &str) -> Result<(), String> {
    match file_name {
        "app_system_logs.jsonl" | "ai_usage_logs.jsonl" | "batch_debug_log.jsonl" => Ok(()),
        _ => Err("Only application log file names are permitted".into()),
    }
}

fn resolve_safe_log_path(app: &tauri::AppHandle, file_name: &str) -> Result<PathBuf, String> {
    validate_log_name(file_name)?;
    let directory = app
        .path()
        .app_log_dir()
        .map_err(|e| format!("Failed to resolve log directory: {e}"))?;
    std::fs::create_dir_all(&directory)
        .map_err(|e| format!("Failed to create log directory: {e}"))?;
    let path = directory.join(file_name);
    if std::fs::symlink_metadata(&path).is_ok_and(|m| m.file_type().is_symlink()) {
        return Err("Log files cannot be symbolic links".into());
    }
    Ok(path)
}

#[tauri::command]
pub fn append_debug_log(
    app: tauri::AppHandle,
    file_name: String,
    content: String,
) -> Result<(), String> {
    use std::fs::OpenOptions;
    use std::io::Write;

    let final_path = resolve_safe_log_path(&app, &file_name)?;

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
pub fn read_debug_log(
    app: tauri::AppHandle,
    file_name: String,
    max_lines: Option<usize>,
) -> Result<Vec<String>, String> {
    use std::fs::File;
    use std::io::{BufRead, BufReader};

    let final_path = resolve_safe_log_path(&app, &file_name)?;
    if !final_path.exists() {
        return Ok(Vec::new());
    }

    let file = File::open(&final_path)
        .map_err(|e| format!("Failed to open log file {:?}: {}", final_path, e))?;
    let reader = BufReader::new(file);

    let limit = max_lines.unwrap_or(10_000).min(100_000);
    let mut lines = std::collections::VecDeque::new();
    for line in reader.lines() {
        let line = line.map_err(|e| format!("Failed to read log: {e}"))?;
        if limit > 0 && !line.trim().is_empty() {
            if lines.len() == limit {
                lines.pop_front();
            }
            lines.push_back(line);
        }
    }
    Ok(lines.into_iter().collect())
}

#[tauri::command]
pub fn clear_debug_log(app: tauri::AppHandle, file_name: String) -> Result<(), String> {
    let final_path = resolve_safe_log_path(&app, &file_name)?;
    if final_path.exists() {
        std::fs::remove_file(&final_path)
            .map_err(|e| format!("Failed to clear log file {:?}: {}", final_path, e))?;
    }
    Ok(())
}

#[tauri::command]
pub fn open_file_in_default_app(app_handle: tauri::AppHandle, path: String) -> Result<(), String> {
    let final_path = resolve_safe_log_path(&app_handle, &path)?;

    if !final_path.exists() {
        if let Some(parent) = final_path.parent() {
            if !parent.as_os_str().is_empty() {
                let _ = std::fs::create_dir_all(parent);
            }
        }
        std::fs::write(
            &final_path,
            "[BATCH TRANSLATE DEBUG LOG INITIALIZED]\nNo errors recorded yet.\n",
        )
        .map_err(|e| format!("Failed to initialize log: {e}"))?;
    }

    let path_str = final_path.to_string_lossy().to_string();
    app_handle
        .opener()
        .open_path(path_str, None::<&str>)
        .map_err(|e| format!("Failed to open file: {}", e))
}

#[tauri::command]
pub fn load_app_settings(app_handle: tauri::AppHandle) -> Result<Option<String>, String> {
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
    let config_dir = app_handle
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to get app config dir: {}", e))?;
    let value: serde_json::Value =
        serde_json::from_str(&json_content).map_err(|e| format!("Invalid settings JSON: {e}"))?;
    if !value.is_object() {
        return Err("Settings must be a JSON object".into());
    }
    let settings_path = config_dir.join("settings.json");
    atomic_write(&settings_path, json_content.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn logs_reject_absolute_paths_traversal_and_other_files() {
        for path in [
            "../app_system_logs.jsonl",
            "C:\\secret.txt",
            "settings.json",
            "app_system_logs.jsonl:stream",
            "",
        ] {
            assert!(validate_log_name(path).is_err(), "accepted {path}");
        }
        assert!(validate_log_name("ai_usage_logs.jsonl").is_ok());
    }

    #[test]
    fn atomic_write_replaces_existing_file_and_preserves_it_on_failure() {
        let dir = std::env::temp_dir().join(format!(
            "vn-save-test-{}-{}",
            std::process::id(),
            SAVE_SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let target = dir.join("settings.json");
        atomic_write(&target, b"old").unwrap();
        atomic_write(&target, b"new").unwrap();
        assert_eq!(std::fs::read(&target).unwrap(), b"new");
        let blocked = dir.join("directory");
        std::fs::create_dir(&blocked).unwrap();
        assert!(atomic_write(&blocked, b"replacement").is_err());
        assert!(blocked.is_dir());
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
