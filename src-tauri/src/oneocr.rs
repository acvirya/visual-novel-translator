use std::path::{Path, PathBuf};
use std::fs;
use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;
use std::time::Instant;
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
pub struct OcrStabilityConfig {
    pub enable_motion_detection: bool,
    pub settle_time_ms: u64,
    pub motion_sensitivity: u8,
    pub ignore_blinking_prompt: bool,
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
    pub is_settled: bool,
}

struct SendOcrEngine(oneocr_rs::OcrEngine);
unsafe impl Send for SendOcrEngine {}

struct MotionState {
    last_edge_hash: u64,
    last_change_time: Instant,
    history_hashes: VecDeque<u64>,
    cached_text: String,
    is_settled: bool,
}

static OCR_ENGINE_INSTANCE: Mutex<Option<SendOcrEngine>> = Mutex::new(None);
static REGION_MOTION_STATES: Mutex<Option<HashMap<String, MotionState>>> = Mutex::new(None);

/// Computes a high-frequency stroke/edge hash of text, ignoring smooth background animations
fn compute_stroke_edge_hash(img: &image::DynamicImage, sensitivity: u8) -> u64 {
    use std::hash::{Hash, Hasher};
    let gray = img.to_luma8();
    let (w, h) = (gray.width(), gray.height());
    if w < 2 || h < 2 {
        return 0;
    }

    // Sensitivity threshold: 1 (lenient) to 10 (strict)
    let threshold = ((11 - sensitivity.clamp(1, 10) as i32) * 5) as i32;

    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    let raw = gray.as_raw();

    // Sample stroke transitions across grid
    for y in (0..h - 1).step_by(2) {
        for x in (0..w - 1).step_by(2) {
            let idx = (y * w + x) as usize;
            let current = raw[idx] as i32;
            let right = raw[idx + 1] as i32;
            let bottom = raw[((y + 1) * w + x) as usize] as i32;

            let grad = (current - right).abs() + (current - bottom).abs();
            if grad > threshold {
                (x, y).hash(&mut hasher);
            }
        }
    }

    hasher.finish()
}

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

pub fn find_oneocr_installation(custom_path: Option<String>) -> Result<(PathBuf, PathBuf, PathBuf), String> {
    // 1. Check custom path if provided
    if let Some(ref path_str) = custom_path {
        let p = Path::new(path_str);
        if p.exists() {
            if let Ok(res) = resolve_oneocr_files_in_dir(p) {
                return Ok(res);
            }
        }
    }

    // 2. Search WindowsApps for Microsoft.ScreenSketch (Snipping Tool)
    let win_apps = Path::new("C:\\Program Files\\WindowsApps");
    if win_apps.exists() {
        if let Ok(entries) = fs::read_dir(win_apps) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with("Microsoft.ScreenSketch_") && !name.contains("neutral") {
                    let candidate = entry.path();
                    if let Ok(resolved) = resolve_oneocr_files_in_dir(&candidate) {
                        return Ok(resolved);
                    }
                    let candidate_sub = candidate.join("SnippingTool");
                    if candidate_sub.exists() {
                        if let Ok(resolved) = resolve_oneocr_files_in_dir(&candidate_sub) {
                            return Ok(resolved);
                        }
                    }
                    let candidate_sandbox = candidate.join("SnippingToolSandbox");
                    if candidate_sandbox.exists() {
                        if let Ok(resolved) = resolve_oneocr_files_in_dir(&candidate_sandbox) {
                            return Ok(resolved);
                        }
                    }
                }
            }
        }
    }

    // 3. Search LocalAppData Packages for ScreenSketch
    if let Ok(local_appdata) = std::env::var("LOCALAPPDATA") {
        let packages_dir = Path::new(&local_appdata).join("Packages");
        if packages_dir.exists() {
            if let Ok(entries) = fs::read_dir(&packages_dir) {
                for entry in entries.flatten() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name.contains("ScreenSketch") {
                        if let Ok(resolved) = resolve_oneocr_files_in_dir(&entry.path()) {
                            return Ok(resolved);
                        }
                    }
                }
            }
        }
    }

    // 4. Check user home .config / oneocr
    let user_profile = std::env::var("USERPROFILE").unwrap_or_default();
    if !user_profile.is_empty() {
        let config_dir = Path::new(&user_profile).join(".config").join("oneocr");
        if config_dir.exists() {
            if let Ok(resolved) = resolve_oneocr_files_in_dir(&config_dir) {
                return Ok(resolved);
            }
        }
    }

    Err("Could not find Microsoft OneOCR installation. Please specify the folder containing oneocr.dll and oneocr.onemodel / oneocr.model".to_string())
}

fn resolve_oneocr_files_in_dir(dir: &Path) -> Result<(PathBuf, PathBuf, PathBuf), String> {
    let dll = dir.join("oneocr.dll");
    let model = if dir.join("oneocr.onemodel").exists() {
        dir.join("oneocr.onemodel")
    } else if dir.join("oneocr.model").exists() {
        dir.join("oneocr.model")
    } else {
        dir.join("oneocr.onemodel")
    };
    let onnx = dir.join("onnxruntime.dll");

    if dll.exists() && model.exists() {
        let onnx_path = if onnx.exists() { onnx } else { dll.clone() };
        Ok((dll, model, onnx_path))
    } else {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                if entry.path().is_dir() {
                    if let Ok(found) = resolve_oneocr_files_in_dir(&entry.path()) {
                        return Ok(found);
                    }
                }
            }
        }
        Err(format!("Required OneOCR files not found in {}", dir.display()))
    }
}

pub fn scan_screen_regions(
    regions: Vec<CaptureRegion>,
    scale_percent: u32,
    custom_path: Option<String>,
    stability_config: Option<OcrStabilityConfig>,
) -> Result<OcrScanResult, String> {
    let start_instant = Instant::now();

    let mut engine_guard = OCR_ENGINE_INSTANCE.lock().unwrap_or_else(|e| e.into_inner());
    if engine_guard.is_none() {
        let (dll_path, _model_path, _) = find_oneocr_installation(custom_path)?;
        let base_dir = dll_path.parent().unwrap_or_else(|| Path::new("."));

        #[cfg(target_os = "windows")]
        unsafe {
            use std::os::windows::ffi::OsStrExt;
            let wide_path: Vec<u16> = base_dir.as_os_str().encode_wide().chain(Some(0)).collect();
            windows_sys::Win32::System::LibraryLoader::SetDllDirectoryW(wide_path.as_ptr());
        }

        let engine = oneocr_rs::OcrEngine::new()
            .map_err(|e| format!("Failed to initialize OneOCR engine from {}: {:?}", base_dir.display(), e))?;

        *engine_guard = Some(SendOcrEngine(engine));
    }

    let engine = &engine_guard.as_ref().unwrap().0;
    let temp_dir = std::env::temp_dir();

    let mut speaker_text = String::new();
    let mut dialogue_text = String::new();
    let mut raw_all_text = Vec::new();
    let mut regions_text = Vec::new();
    let mut all_regions_settled = true;

    let stab = stability_config.unwrap_or(OcrStabilityConfig {
        enable_motion_detection: true,
        settle_time_ms: 250,
        motion_sensitivity: 3,
        ignore_blinking_prompt: true,
    });

    let mut state_guard = REGION_MOTION_STATES.lock().unwrap_or_else(|e| e.into_inner());
    let state_map = state_guard.get_or_insert_with(HashMap::new);

    for (idx, region) in regions.iter().enumerate() {
        let x = region.physical_x.unwrap_or(region.x);
        let y = region.physical_y.unwrap_or(region.y);
        let w = region.physical_width.unwrap_or(region.width);
        let h = region.physical_height.unwrap_or(region.height);

        if w <= 0 || h <= 0 {
            continue;
        }

        let captured = match capture_screen_rect(x, y, w, h) {
            Ok(cap) => cap,
            Err(e) => {
                eprintln!("Warning: Screen capture failed for region {}: {}", region.name, e);
                continue;
            }
        };

        let scaled_img = resize_image(&captured.dynamic_image, scale_percent);
        let prepared_img = prepare_image_for_oneocr(&scaled_img);
        let now = Instant::now();

        let joined_text = if stab.enable_motion_detection {
            let edge_hash = compute_stroke_edge_hash(&prepared_img, stab.motion_sensitivity);

            let motion = state_map.entry(region.id.clone()).or_insert_with(|| MotionState {
                last_edge_hash: edge_hash,
                last_change_time: now,
                history_hashes: VecDeque::from([edge_hash]),
                cached_text: String::new(),
                is_settled: false,
            });

            let is_cyclic = stab.ignore_blinking_prompt && motion.history_hashes.contains(&edge_hash);
            let edge_changed = !is_cyclic && edge_hash != motion.last_edge_hash;

            if edge_changed {
                motion.last_edge_hash = edge_hash;
                motion.last_change_time = now;
                motion.is_settled = false;
                all_regions_settled = false;

                if motion.history_hashes.len() >= 4 {
                    motion.history_hashes.pop_front();
                }
                motion.history_hashes.push_back(edge_hash);

                motion.cached_text.clone()
            } else {
                let duration_still_ms = now.duration_since(motion.last_change_time).as_millis() as u64;

                if duration_still_ms >= stab.settle_time_ms {
                    if !motion.is_settled {
                        let text = run_ocr_pipeline_on_image(engine, &prepared_img, temp_dir.as_path(), idx, &region.name);
                        motion.cached_text = text.clone();
                        motion.is_settled = true;
                        text
                    } else {
                        motion.cached_text.clone()
                    }
                } else {
                    all_regions_settled = false;
                    motion.cached_text.clone()
                }
            }
        } else {
            let pixel_hash = compute_fast_pixel_hash(&prepared_img);
            let motion = state_map.entry(region.id.clone()).or_insert_with(|| MotionState {
                last_edge_hash: pixel_hash,
                last_change_time: now,
                history_hashes: VecDeque::new(),
                cached_text: String::new(),
                is_settled: true,
            });

            if motion.last_edge_hash != pixel_hash || motion.cached_text.is_empty() {
                let text = run_ocr_pipeline_on_image(engine, &prepared_img, temp_dir.as_path(), idx, &region.name);
                motion.last_edge_hash = pixel_hash;
                motion.cached_text = text.clone();
                motion.is_settled = true;
                text
            } else {
                motion.cached_text.clone()
            }
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
        is_settled: all_regions_settled,
    })
}

fn chrono_lite_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let dur = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    format!("{}.{:03}", dur.as_secs(), dur.subsec_millis())
}

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
