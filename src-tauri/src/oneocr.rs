use std::path::{Path, PathBuf};
use std::fs;
use crate::screen_capture::{capture_screen_rect, resize_image, CaptureRegion};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrEngineStatus {
    pub is_available: bool,
    pub dll_path: String,
    pub model_path: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegionRecognizedText {
    pub region_id: String,
    pub role: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrScanResult {
    pub speaker: String,
    pub message: String,
    pub raw_text: String,
    pub regions_text: Vec<RegionRecognizedText>,
    pub timestamp: String,
    pub latency_ms: u64,
}

struct SendOcrEngine(oneocr_rs::OcrEngine);
unsafe impl Send for SendOcrEngine {}

static OCR_ENGINE_INSTANCE: std::sync::Mutex<Option<SendOcrEngine>> = std::sync::Mutex::new(None);
static REGION_PIXEL_CACHE: std::sync::Mutex<Option<std::collections::HashMap<String, (u64, String)>>> = std::sync::Mutex::new(None);

fn compute_fast_pixel_hash(img: &image::DynamicImage) -> u64 {
    use std::hash::{Hash, Hasher};
    let raw = img.as_bytes();
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    for chunk in raw.chunks(8) {
        chunk.hash(&mut hasher);
    }
    hasher.finish()
}

fn run_ocr_pipeline_on_image(
    engine: &oneocr_rs::OcrEngine,
    img: &image::DynamicImage,
    temp_dir: &Path,
    idx: usize,
    region_name: &str,
) -> String {
    let temp_file = temp_dir.join(format!("vn_ocr_crop_{}_{}.png", idx, std::process::id()));
    if let Err(e) = img.save_with_format(&temp_file, image::ImageFormat::Png) {
        eprintln!("Warning: Failed to write temporary crop image: {}", e);
        return String::new();
    }

    let ocr_res_opt = match engine.run(temp_file.as_path().into()) {
        Ok(res) => Some(res),
        Err(e) => {
            eprintln!("Warning: OneOCR pipeline failed on region {}: {:?}", region_name, e);
            None
        }
    };

    let _ = fs::remove_file(&temp_file);

    if let Some(ocr_res) = ocr_res_opt {
        let mut lines = Vec::new();
        for line in &ocr_res.lines {
            let t = line.text.trim();
            if !t.is_empty() {
                lines.push(t.to_string());
            }
        }
        lines.join("")
    } else {
        String::new()
    }
}

/// Auto-detect Windows 11 Snipping Tool OneOCR path or validate custom path
pub fn find_oneocr_installation(custom_path: Option<String>) -> Result<(PathBuf, PathBuf, PathBuf), String> {
    // 1. Check custom path if provided
    if let Some(ref path_str) = custom_path {
        let p = Path::new(path_str);
        if p.exists() {
            let (dll, model, onnx) = resolve_oneocr_files_in_dir(p)?;
            return Ok((dll, model, onnx));
        }
    }

    // 2. Search WindowsApps for Microsoft.ScreenSketch
    let win_apps = Path::new("C:\\Program Files\\WindowsApps");
    if win_apps.exists() {
        if let Ok(entries) = fs::read_dir(win_apps) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with("Microsoft.ScreenSketch_") && name.contains("x64") {
                    let candidate = entry.path().join("SnippingTool");
                    if candidate.exists() {
                        if let Ok(resolved) = resolve_oneocr_files_in_dir(&candidate) {
                            return Ok(resolved);
                        }
                    }
                    let candidate_sandbox = entry.path().join("SnippingToolSandbox");
                    if candidate_sandbox.exists() {
                        if let Ok(resolved) = resolve_oneocr_files_in_dir(&candidate_sandbox) {
                            return Ok(resolved);
                        }
                    }
                }
            }
        }
    }

    // 3. Fallback checks in common locations
    let user_profile = std::env::var("USERPROFILE").unwrap_or_default();
    if !user_profile.is_empty() {
        let config_dir = Path::new(&user_profile).join(".config").join("oneocr");
        if config_dir.exists() {
            if let Ok(resolved) = resolve_oneocr_files_in_dir(&config_dir) {
                return Ok(resolved);
            }
        }
    }

    Err("OneOCR files (oneocr.dll, oneocr.onemodel, onnxruntime.dll) not found in Snipping Tool or custom path".to_string())
}

fn resolve_oneocr_files_in_dir(dir: &Path) -> Result<(PathBuf, PathBuf, PathBuf), String> {
    let dll = dir.join("oneocr.dll");
    let model = dir.join("oneocr.onemodel");
    let onnx = dir.join("onnxruntime.dll");

    if !dll.exists() {
        return Err(format!("Missing oneocr.dll in {}", dir.display()));
    }
    if !model.exists() {
        return Err(format!("Missing oneocr.onemodel in {}", dir.display()));
    }
    if !onnx.exists() {
        return Err(format!("Missing onnxruntime.dll in {}", dir.display()));
    }

    Ok((dll, model, onnx))
}

/// Perform OCR on captured regions using OneOCR with persistent engine reuse
pub fn scan_screen_regions(
    regions: Vec<CaptureRegion>,
    scale_percent: u32,
    custom_path: Option<String>,
) -> Result<OcrScanResult, String> {
    if regions.is_empty() {
        return Err("No screen capture regions specified".to_string());
    }

    let start_instant = std::time::Instant::now();

    // 1. Locate OneOCR directory
    let (dll_path, _model_path, _onnx_path) = find_oneocr_installation(custom_path)?;
    let base_dir = dll_path.parent().unwrap_or_else(|| Path::new("."));

    // Set DLL search directory so onnxruntime.dll and oneocr.dll resolve cleanly
    #[cfg(target_os = "windows")]
    unsafe {
        use std::os::windows::ffi::OsStrExt;
        let wide_path: Vec<u16> = base_dir.as_os_str().encode_wide().chain(Some(0)).collect();
        windows_sys::Win32::System::LibraryLoader::SetDllDirectoryW(wide_path.as_ptr());
    }

    // 2. Lock persistent engine instance
    let mut engine_guard = OCR_ENGINE_INSTANCE.lock().map_err(|e| e.to_string())?;
    if engine_guard.is_none() {
        let engine = oneocr_rs::OcrEngine::new()
            .map_err(|e| format!("Failed to initialize OneOCR engine from {}: {:?}", base_dir.display(), e))?;
        *engine_guard = Some(SendOcrEngine(engine));
    }

    let engine = &engine_guard.as_ref().unwrap().0;

    let mut regions_text = Vec::new();
    let mut speaker_text = String::new();
    let mut dialogue_text = String::new();
    let mut raw_all_text = Vec::new();

    let temp_dir = std::env::temp_dir();

    for (idx, region) in regions.iter().enumerate() {
        let x = region.physical_x.unwrap_or(region.x);
        let y = region.physical_y.unwrap_or(region.y);
        let w = region.physical_width.unwrap_or(region.width);
        let h = region.physical_height.unwrap_or(region.height);

        if w <= 0 || h <= 0 {
            continue;
        }

        // Capture screen rectangle
        let captured = match capture_screen_rect(x, y, w, h) {
            Ok(cap) => cap,
            Err(e) => {
                eprintln!("Warning: Screen capture failed for region {}: {}", region.name, e);
                continue;
            }
        };

        // Apply resolution scaling if configured
        let scaled_img = resize_image(&captured.dynamic_image, scale_percent);

        // Prepare image for OneOCR (ensure RGB8 and minimum dimensions to avoid CNN underflow)
        let prepared_img = prepare_image_for_oneocr(&scaled_img);

        // Compute fast pixel hash to check if screen content changed
        let pixel_hash = compute_fast_pixel_hash(&prepared_img);

        let mut cache_guard = REGION_PIXEL_CACHE.lock().unwrap_or_else(|e| e.into_inner());
        let cache_map = cache_guard.get_or_insert_with(std::collections::HashMap::new);

        let joined_text = if let Some((old_hash, old_text)) = cache_map.get(&region.id) {
            if *old_hash == pixel_hash {
                // Pixel buffer is completely identical -> reuse cached text in 0.05ms (0% CPU)
                old_text.clone()
            } else {
                // Pixels changed -> execute OneOCR pipeline
                let text = run_ocr_pipeline_on_image(engine, &prepared_img, temp_dir.as_path(), idx, &region.name);
                cache_map.insert(region.id.clone(), (pixel_hash, text.clone()));
                text
            }
        } else {
            let text = run_ocr_pipeline_on_image(engine, &prepared_img, temp_dir.as_path(), idx, &region.name);
            cache_map.insert(region.id.clone(), (pixel_hash, text.clone()));
            text
        };

        if region.role == "speaker" {
            if speaker_text.is_empty() {
                speaker_text = joined_text.clone();
            } else if !joined_text.is_empty() {
                speaker_text = format!("{} {}", speaker_text, joined_text);
            }
        } else {
            if dialogue_text.is_empty() {
                dialogue_text = joined_text.clone();
            } else if !joined_text.is_empty() {
                dialogue_text = format!("{} {}", dialogue_text, joined_text);
            }
        }

        if !joined_text.is_empty() {
            raw_all_text.push(joined_text.clone());
        }

        regions_text.push(RegionRecognizedText {
            region_id: region.id.clone(),
            role: region.role.clone(),
            text: joined_text,
        });
    }

    let latency_ms = start_instant.elapsed().as_millis() as u64;
    let timestamp = chrono_lite_timestamp();

    Ok(OcrScanResult {
        speaker: speaker_text,
        message: dialogue_text,
        raw_text: raw_all_text.join("\n"),
        regions_text,
        timestamp,
        latency_ms,
    })
}

fn chrono_lite_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let dur = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    format!("{}.{:03}", dur.as_secs(), dur.subsec_millis())
}

/// Ensure image is RGB8 and meets minimum dimension requirement (min 64x64) to prevent OneOCR CNN underflow
fn prepare_image_for_oneocr(img: &image::DynamicImage) -> image::DynamicImage {
    let rgb_img = img.to_rgb8();
    let (w, h) = (rgb_img.width(), rgb_img.height());

    let min_dim = 64u32;
    if w < min_dim || h < min_dim {
        let new_w = w.max(min_dim);
        let new_h = h.max(min_dim);

        let mut canvas = image::ImageBuffer::from_pixel(new_w, new_h, image::Rgb([0u8, 0u8, 0u8]));
        let offset_x = (new_w - w) / 2;
        let offset_y = (new_h - h) / 2;

        image::imageops::overlay(&mut canvas, &rgb_img, offset_x as i64, offset_y as i64);
        image::DynamicImage::ImageRgb8(canvas)
    } else {
        image::DynamicImage::ImageRgb8(rgb_img)
    }
}

