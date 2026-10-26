use std::env;
use std::fs;
use std::path::{Path, PathBuf};

fn main() {
    // OCR is optional: loading its functions must not prevent the app from
    // starting on a machine without Microsoft's OneOCR runtime.
    if env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc") {
        println!("cargo:rustc-link-arg=/DELAYLOAD:oneocr.dll");
        println!("cargo:rustc-link-lib=delayimp");
    }
    // Auto-copy OneOCR DLLs to output directory if available on Windows
    #[cfg(target_os = "windows")]
    {
        copy_oneocr_files_to_target();
    }

    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "get_monitors",
            "get_window_monitor",
            "show_overlay",
            "hide_overlay",
            "update_overlay_bounds",
            "set_overlay_click_through",
            "set_overlay_edit_mode",
            "open_region_selector_overlay",
            "close_region_selector_overlay",
            "list_target_processes",
            "start_textractor",
            "send_textractor_command",
            "stop_textractor",
            "find_textractor_installation",
            "detect_oneocr_path",
            "capture_regions_preview",
            "run_oneocr_scan",
            "translate_free_mt",
            "show_save_script_dialog",
            "show_open_script_dialog",
            "save_script_file",
            "read_script_file_by_path",
            "show_pick_files_dialog",
            "show_pick_directory_dialog",
            "append_debug_log",
            "read_debug_log",
            "clear_debug_log",
            "open_file_in_default_app",
            "load_app_settings",
            "save_app_settings",
            "openrouter_chat_completion",
            "openrouter_stream_chat_completion",
            "llm_chat_completion",
            "llm_stream_chat_completion",
            "test_llm_connection",
            "cancel_all_llm_streams",
            "cancel_llm_stream",
            "get_secure_key",
            "set_secure_key",
            "delete_secure_key",
        ]),
    ))
    .expect("failed to build Tauri permissions");
}

#[cfg(target_os = "windows")]
fn copy_oneocr_files_to_target() {
    let out_dir = env::var("OUT_DIR").unwrap_or_default();
    if out_dir.is_empty() {
        return;
    }

    let out_path = PathBuf::from(&out_dir);
    // Walk up to target/debug or target/release
    let target_dir = out_path.ancestors().nth(3).map(|p| p.to_path_buf());

    if let Some(target) = target_dir {
        if let Some(snipping_dir) = find_snipping_tool_dir() {
            let files = ["oneocr.dll", "oneocr.onemodel", "onnxruntime.dll"];
            for file in &files {
                let src = snipping_dir.join(file);
                let dest = target.join(file);
                if src.exists() && (!dest.exists() || is_file_different(&src, &dest)) {
                    let _ = fs::copy(&src, &dest);
                }
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn find_snipping_tool_dir() -> Option<PathBuf> {
    use std::os::windows::process::CommandExt;
    // 1. Try querying AppxPackage directly via PowerShell (bypasses WindowsApps ACL restrictions)
    if let Ok(output) = std::process::Command::new("powershell")
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Get-AppxPackage Microsoft.ScreenSketch | Select-Object -ExpandProperty InstallLocation",
        ])
        .output()
    {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for location in stdout.lines().map(str::trim).filter(|line| !line.is_empty()) {
                let pkg_dir = PathBuf::from(location);
                let candidate = pkg_dir.join("SnippingTool");
                if candidate.join("oneocr.dll").exists() {
                    return Some(candidate);
                }
                let candidate_sandbox = pkg_dir.join("SnippingToolSandbox");
                if candidate_sandbox.join("oneocr.dll").exists() {
                    return Some(candidate_sandbox);
                }
                if pkg_dir.join("oneocr.dll").exists() {
                    return Some(pkg_dir);
                }
            }
        }
    }

    // 2. Fallback to scanning WindowsApps directory
    let program_files = env::var("ProgramW6432")
        .or_else(|_| env::var("ProgramFiles"))
        .unwrap_or_else(|_| "C:\\Program Files".to_string());
    let win_apps = Path::new(&program_files).join("WindowsApps");
    if win_apps.exists() {
        if let Ok(entries) = fs::read_dir(win_apps) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with("Microsoft.ScreenSketch_") && name.contains("x64") {
                    let candidate = entry.path().join("SnippingTool");
                    if candidate.join("oneocr.dll").exists() {
                        return Some(candidate);
                    }
                    let candidate_sandbox = entry.path().join("SnippingToolSandbox");
                    if candidate_sandbox.join("oneocr.dll").exists() {
                        return Some(candidate_sandbox);
                    }
                }
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn is_file_different(src: &Path, dest: &Path) -> bool {
    match (fs::metadata(src), fs::metadata(dest)) {
        (Ok(s), Ok(d)) => s.len() != d.len(),
        _ => true,
    }
}
