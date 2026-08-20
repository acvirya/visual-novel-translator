use std::env;
use std::fs;
use std::path::{Path, PathBuf};

fn main() {
    // Auto-copy OneOCR DLLs to output directory if available on Windows
    #[cfg(target_os = "windows")]
    {
        copy_oneocr_files_to_target();
    }

    tauri_build::build()
}

#[cfg(target_os = "windows")]
fn copy_oneocr_files_to_target() {
    let out_dir = env::var("OUT_DIR").unwrap_or_default();
    if out_dir.is_empty() {
        return;
    }

    let out_path = PathBuf::from(&out_dir);
    // Walk up to target/debug or target/release
    let target_dir = out_path
        .ancestors()
        .nth(3)
        .map(|p| p.to_path_buf());

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
    let win_apps = Path::new("C:\\Program Files\\WindowsApps");
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

