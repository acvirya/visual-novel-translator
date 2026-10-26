use crate::screen_capture::{resize_image, CaptureRegion};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;

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
pub struct DetectedTextLine {
    pub text: String,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrScanResult {
    pub speaker: String,
    pub message: String,
    pub raw_text: String,
    pub regions_text: Vec<RegionRecognizedText>,
    pub detected_lines: Vec<DetectedTextLine>,
    pub timestamp: String,
    pub latency_ms: u64,
    pub is_settled: bool,
}

/// Wrapper around `oneocr_rs::OcrEngine` to allow storage in a static `Mutex`.
/// Safety: Access is strictly synchronized via `OCR_ENGINE_INSTANCE` Mutex guard,
/// ensuring exclusive single-threaded execution during OCR calls.
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
// Delay-loaded imports retain function pointers for the process lifetime.
// Keep the loaded module alive, even when the OCR engine itself is reset.
static OCR_LIBRARY_HANDLE: std::sync::OnceLock<usize> = std::sync::OnceLock::new();
static REGION_MOTION_STATES: Mutex<Option<HashMap<String, MotionState>>> = Mutex::new(None);

/// Deterministic 64-bit FNV-1a Hasher
struct Fnv1a64(u64);
impl Fnv1a64 {
    #[inline]
    fn new() -> Self {
        Self(0xcbf29ce484222325)
    }
    #[inline]
    fn write_bytes(&mut self, bytes: &[u8]) {
        for &b in bytes {
            self.0 ^= b as u64;
            self.0 = self.0.wrapping_mul(0x100000001b3);
        }
    }
    #[inline]
    fn write_u32(&mut self, val: u32) {
        self.write_bytes(&val.to_le_bytes());
    }
    #[inline]
    fn finish(self) -> u64 {
        self.0
    }
}

/// Computes a high-frequency stroke/edge hash of text, ignoring smooth background animations
fn compute_stroke_edge_hash(img: &image::DynamicImage, sensitivity: u8) -> u64 {
    let gray = img.to_luma8();
    let (w, h) = (gray.width(), gray.height());
    if w < 2 || h < 2 {
        return 0;
    }

    // Sensitivity threshold: 1 (lenient) to 10 (strict)
    let threshold = (11 - sensitivity.clamp(1, 10) as i32) * 5;

    let mut hasher = Fnv1a64::new();
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
                hasher.write_u32((x << 16) | y);
            }
        }
    }

    hasher.finish()
}

fn compute_fast_pixel_hash(img: &image::DynamicImage) -> u64 {
    let raw = img.as_bytes();
    let mut hasher = Fnv1a64::new();
    hasher.write_bytes(raw);
    hasher.finish()
}

pub fn cleanup_ocr_slots() {
    let temp_dir = std::env::temp_dir();
    let prefix = format!("vn_ocr_slot_{}_", std::process::id());
    if let Ok(entries) = std::fs::read_dir(&temp_dir) {
        for entry in entries.flatten() {
            let fname = entry.file_name().to_string_lossy().to_string();
            if fname.starts_with(&prefix) && fname.ends_with(".png") {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }
}

fn run_ocr_pipeline_on_image(
    engine: &oneocr_rs::OcrEngine,
    img: &image::DynamicImage,
    offset_x: f32,
    offset_y: f32,
    region_name: &str,
) -> Result<(String, Vec<DetectedTextLine>), String> {
    // OneOCR supports memory buffers directly; avoid encoding and persisting private screenshots.
    let ocr_res = engine
        .run(img.to_rgba8().into())
        .map_err(|e| format!("OneOCR failed on region {region_name}: {e:?}"))?;
    let mut lines = Vec::new();
    let mut detected_lines = Vec::new();
    for line in &ocr_res.lines {
        let t = line.text.trim();
        if !t.is_empty() {
            lines.push(t.to_string());
            let min_x = (line
                .bounding_box
                .top_left
                .x
                .min(line.bounding_box.bottom_left.x)
                - offset_x)
                .max(0.0);
            let min_y = (line
                .bounding_box
                .top_left
                .y
                .min(line.bounding_box.top_right.y)
                - offset_y)
                .max(0.0);
            let max_x = (line
                .bounding_box
                .top_right
                .x
                .max(line.bounding_box.bottom_right.x)
                - offset_x)
                .max(min_x + 1.0);
            let max_y = (line
                .bounding_box
                .bottom_left
                .y
                .max(line.bounding_box.bottom_right.y)
                - offset_y)
                .max(min_y + 1.0);
            let w = max_x - min_x;
            let h = max_y - min_y;

            detected_lines.push(DetectedTextLine {
                text: t.to_string(),
                x: min_x,
                y: min_y,
                width: w,
                height: h,
            });
        }
    }
    Ok((lines.join(""), detected_lines))
}

pub fn find_oneocr_installation(
    custom_path: Option<String>,
) -> Result<(PathBuf, PathBuf, PathBuf), String> {
    // 1. Check custom path if provided
    if let Some(ref path_str) = custom_path {
        let p = Path::new(path_str);
        if p.exists() {
            if let Ok(res) = resolve_oneocr_files_in_dir(p) {
                return Ok(res);
            }
        }
    }

    // 2. Check current executable directory
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(parent) = exe_path.parent() {
            if let Ok(resolved) = resolve_oneocr_files_in_dir(parent) {
                return Ok(resolved);
            }
        }
    }

    // 3. Search WindowsApps via PowerShell AppxPackage (bypasses ACL restrictions)
    use std::os::windows::process::CommandExt;
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
                let candidate_sub = pkg_dir.join("SnippingTool");
                if let Ok(resolved) = resolve_oneocr_files_in_dir(&candidate_sub) {
                    return Ok(resolved);
                }
                let candidate_sandbox = pkg_dir.join("SnippingToolSandbox");
                if let Ok(resolved) = resolve_oneocr_files_in_dir(&candidate_sandbox) {
                    return Ok(resolved);
                }
                if let Ok(resolved) = resolve_oneocr_files_in_dir(&pkg_dir) {
                    return Ok(resolved);
                }
            }
        }
    }

    // 4. Search WindowsApps for Microsoft.ScreenSketch (Snipping Tool)
    let program_files = std::env::var("ProgramW6432")
        .or_else(|_| std::env::var("ProgramFiles"))
        .unwrap_or_else(|_| "C:\\Program Files".to_string());
    let win_apps = Path::new(&program_files).join("WindowsApps");
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
    resolve_oneocr_files_at_depth(dir, 0)
}

fn resolve_oneocr_files_at_depth(
    dir: &Path,
    depth: usize,
) -> Result<(PathBuf, PathBuf, PathBuf), String> {
    if depth > 5 {
        return Err("OneOCR directory search depth exceeded".into());
    }
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
                if entry
                    .file_type()
                    .is_ok_and(|t| t.is_dir() && !t.is_symlink())
                {
                    if let Ok(found) = resolve_oneocr_files_at_depth(&entry.path(), depth + 1) {
                        return Ok(found);
                    }
                }
            }
        }
        Err(format!(
            "Required OneOCR files not found in {}",
            dir.display()
        ))
    }
}

fn get_or_init_ocr_engine(custom_path: Option<String>) -> Result<(), String> {
    let mut engine_guard = OCR_ENGINE_INSTANCE.lock();
    if engine_guard.is_none() {
        let (dll_path, model_path, onnx_path) = find_oneocr_installation(custom_path)?;
        let base_dir = dll_path.parent().unwrap_or_else(|| Path::new("."));

        #[cfg(target_os = "windows")]
        unsafe {
            use std::os::windows::ffi::OsStrExt;
            if OCR_LIBRARY_HANDLE.get().is_none() {
                use windows_sys::Win32::System::LibraryLoader::{
                    LoadLibraryExW, LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR, LOAD_LIBRARY_SEARCH_SYSTEM32,
                };
                let mut absolute_dll = std::fs::canonicalize(&dll_path)
                    .map_err(|e| format!("Invalid OneOCR DLL path: {e}"))?;
                let wide_path: Vec<u16> = absolute_dll
                    .as_os_str()
                    .encode_wide()
                    .chain(Some(0))
                    .collect();
                let mut module = LoadLibraryExW(
                    wide_path.as_ptr(),
                    std::ptr::null_mut(),
                    LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_SYSTEM32,
                );
                // WindowsApps allows reading package assets but can deny loading
                // their DLLs into an unpackaged app. Cache only runtime DLLs in
                // the current user's application data; keep the model in place.
                if module.is_null() && std::io::Error::last_os_error().raw_os_error() == Some(5) {
                    absolute_dll = cache_oneocr_runtime(&dll_path, &onnx_path)?;
                    let cached_path: Vec<u16> = absolute_dll
                        .as_os_str()
                        .encode_wide()
                        .chain(Some(0))
                        .collect();
                    module = LoadLibraryExW(
                        cached_path.as_ptr(),
                        std::ptr::null_mut(),
                        LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_SYSTEM32,
                    );
                }
                if module.is_null() {
                    return Err(format!(
                        "Failed to load OneOCR or its dependencies: {}",
                        std::io::Error::last_os_error()
                    ));
                }
                let _ = OCR_LIBRARY_HANDLE.set(module as usize);
            }
        }

        let engine = oneocr_rs::OcrEngine::new_with_model_path(
            oneocr_rs::OcrOptions::default(),
            &model_path,
        )
        .map_err(|e| {
            format!(
                "Failed to initialize OneOCR engine from {}: {:?}",
                base_dir.display(),
                e
            )
        })?;

        *engine_guard = Some(SendOcrEngine(engine));
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn cache_oneocr_runtime(dll: &Path, onnx: &Path) -> Result<PathBuf, String> {
    use std::hash::{Hash, Hasher};
    let mut version = std::collections::hash_map::DefaultHasher::new();
    for path in [dll, onnx] {
        path.hash(&mut version);
        let metadata =
            fs::metadata(path).map_err(|e| format!("Cannot read OCR runtime metadata: {e}"))?;
        metadata.len().hash(&mut version);
        metadata.modified().ok().hash(&mut version);
    }
    let root =
        std::env::var_os("LOCALAPPDATA").ok_or("Cannot resolve the OCR runtime cache directory")?;
    let cache = PathBuf::from(root)
        .join("visual-novel-translator")
        .join("oneocr-cache")
        .join(format!("{:016x}", version.finish()));
    fs::create_dir_all(&cache).map_err(|e| format!("Cannot create the OCR runtime cache: {e}"))?;
    for source in [dll, onnx] {
        let name = source.file_name().ok_or("Invalid OCR runtime file name")?;
        let target = cache.join(name);
        if target.exists() {
            continue;
        }
        let temp = cache.join(format!(
            "{}.{}.tmp",
            name.to_string_lossy(),
            std::process::id()
        ));
        fs::copy(source, &temp).map_err(|e| format!("Cannot cache the OCR runtime: {e}"))?;
        if let Err(error) = fs::rename(&temp, &target) {
            let _ = fs::remove_file(&temp);
            if !target.exists() {
                return Err(format!("Cannot commit the OCR runtime cache: {error}"));
            }
        }
    }
    fs::canonicalize(cache.join("oneocr.dll"))
        .map_err(|e| format!("Cannot resolve cached OCR runtime: {e}"))
}

pub fn scan_screen_regions(
    regions: Vec<CaptureRegion>,
    scale_percent: u32,
    custom_path: Option<String>,
    stability_config: Option<OcrStabilityConfig>,
) -> Result<OcrScanResult, String> {
    let start_instant = Instant::now();
    if !(25..=400).contains(&scale_percent) {
        return Err("OCR scale must be between 25 and 400 percent".into());
    }

    // 1. Ensure OCR engine is loaded without holding long lock during screen capture
    get_or_init_ocr_engine(custom_path)?;

    let mut speaker_text = String::new();
    let mut dialogue_text = String::new();
    let mut raw_all_text = Vec::new();
    let mut regions_text = Vec::new();
    let mut all_regions_settled = true;

    let stab_opt = stability_config.as_ref();

    // 1. Capture screen once for all regions via single-frame monitor capture (strictly confined to selected monitor)
    let mut captured_map = crate::screen_capture::capture_monitor_regions(&regions)?;

    struct PreparedRegion {
        id: String,
        name: String,
        role: String,
        prepared_img: image::DynamicImage,
        offset_x: f32,
        offset_y: f32,
        edge_hash: u64,
        pixel_hash: u64,
    }

    let mut prepared_list = Vec::new();
    for region in &regions {
        let captured = match captured_map.remove(&region.id) {
            Some(cap) => cap,
            None => continue,
        };

        let scaled_pixels = u64::from(captured.dynamic_image.width())
            * u64::from(captured.dynamic_image.height())
            * u64::from(scale_percent)
            * u64::from(scale_percent)
            / 10_000;
        if scaled_pixels > 64 * 1024 * 1024 {
            return Err("Scaled OCR region exceeds the 64 megapixel limit".into());
        }
        let scaled_img = resize_image(&captured.dynamic_image, scale_percent);
        let (prepared_img, offset_x, offset_y) = prepare_image_for_oneocr(&scaled_img);
        let edge_hash = if let Some(stab) = stab_opt {
            if stab.enable_motion_detection {
                compute_stroke_edge_hash(&prepared_img, stab.motion_sensitivity)
            } else {
                0
            }
        } else {
            0
        };
        let pixel_hash = if let Some(stab) = stab_opt {
            if !stab.enable_motion_detection {
                compute_fast_pixel_hash(&prepared_img)
            } else {
                0
            }
        } else {
            0
        };

        prepared_list.push(PreparedRegion {
            id: region.id.clone(),
            name: region.name.clone(),
            role: region.role.clone(),
            prepared_img,
            offset_x,
            offset_y,
            edge_hash,
            pixel_hash,
        });
    }

    let now = Instant::now();
    enum ScanAction {
        ReturnCached(String),
        RunOcr,
    }

    // 2. Determine OCR actions
    let mut actions: Vec<(PreparedRegion, ScanAction)> = Vec::new();
    if let Some(stab) = stab_opt {
        let mut state_guard = REGION_MOTION_STATES.lock();
        let state_map = state_guard.get_or_insert_with(HashMap::new);

        // Evict motion states for regions that no longer exist (prevent static memory leak)
        let active_ids: std::collections::HashSet<&String> =
            regions.iter().map(|r| &r.id).collect();
        state_map.retain(|id, _| active_ids.contains(id));

        for prep in prepared_list {
            if stab.enable_motion_detection {
                let is_new = !state_map.contains_key(&prep.id);
                let motion = state_map
                    .entry(prep.id.clone())
                    .or_insert_with(|| MotionState {
                        last_edge_hash: prep.edge_hash,
                        last_change_time: now,
                        history_hashes: VecDeque::from([prep.edge_hash]),
                        cached_text: String::new(),
                        is_settled: false,
                    });

                if is_new || motion.cached_text.is_empty() {
                    // Initial scan: run OCR immediately so text appears right away
                    actions.push((prep, ScanAction::RunOcr));
                } else {
                    let is_cyclic = stab.ignore_blinking_prompt
                        && motion.history_hashes.contains(&prep.edge_hash);
                    let edge_changed = !is_cyclic && prep.edge_hash != motion.last_edge_hash;

                    if edge_changed {
                        motion.last_edge_hash = prep.edge_hash;
                        motion.last_change_time = now;
                        motion.is_settled = false;
                        all_regions_settled = false;

                        if motion.history_hashes.len() >= 4 {
                            motion.history_hashes.pop_front();
                        }
                        motion.history_hashes.push_back(prep.edge_hash);

                        actions.push((prep, ScanAction::ReturnCached(motion.cached_text.clone())));
                    } else {
                        let duration_still_ms =
                            now.duration_since(motion.last_change_time).as_millis() as u64;
                        if duration_still_ms >= stab.settle_time_ms {
                            if !motion.is_settled {
                                actions.push((prep, ScanAction::RunOcr));
                            } else {
                                actions.push((
                                    prep,
                                    ScanAction::ReturnCached(motion.cached_text.clone()),
                                ));
                            }
                        } else {
                            all_regions_settled = false;
                            actions
                                .push((prep, ScanAction::ReturnCached(motion.cached_text.clone())));
                        }
                    }
                }
            } else {
                let motion = state_map
                    .entry(prep.id.clone())
                    .or_insert_with(|| MotionState {
                        last_edge_hash: prep.pixel_hash,
                        last_change_time: now,
                        history_hashes: VecDeque::new(),
                        cached_text: String::new(),
                        is_settled: true,
                    });

                if motion.last_edge_hash != prep.pixel_hash || motion.cached_text.is_empty() {
                    actions.push((prep, ScanAction::RunOcr));
                } else {
                    actions.push((prep, ScanAction::ReturnCached(motion.cached_text.clone())));
                }
            }
        }
    } else {
        // One-shot standalone scan (e.g. Snipping tool or manual trigger): always run fresh OCR
        for prep in prepared_list {
            actions.push((prep, ScanAction::RunOcr));
        }
    }

    // 3. Run OCR inference on required regions (without holding motion state lock)
    let mut results_to_update: Vec<(String, u64, String, String, bool)> = Vec::new();
    let mut all_detected_lines: Vec<DetectedTextLine> = Vec::new();
    for (prep, action) in actions {
        match action {
            ScanAction::ReturnCached(cached) => {
                results_to_update.push((prep.id, prep.edge_hash, cached, prep.role, false));
            }
            ScanAction::RunOcr => {
                let (text, mut lines) = {
                    let engine_guard = OCR_ENGINE_INSTANCE.lock();
                    let engine = &engine_guard.as_ref().unwrap().0;
                    run_ocr_pipeline_on_image(
                        engine,
                        &prep.prepared_img,
                        prep.offset_x,
                        prep.offset_y,
                        &prep.name,
                    )?
                };
                all_detected_lines.append(&mut lines);
                let hash = if let Some(stab) = stab_opt {
                    if stab.enable_motion_detection {
                        prep.edge_hash
                    } else {
                        prep.pixel_hash
                    }
                } else {
                    0
                };
                results_to_update.push((prep.id, hash, text, prep.role, true));
            }
        }
    }

    // 4. Update motion state cache ONLY for regions where OCR inference actually executed
    {
        let mut state_guard = REGION_MOTION_STATES.lock();
        if let Some(ref mut state_map) = *state_guard {
            for (id, hash, text, _, was_ocr_run) in &results_to_update {
                if *was_ocr_run {
                    if let Some(motion) = state_map.get_mut(id) {
                        motion.last_edge_hash = *hash;
                        motion.cached_text = text.clone();
                        motion.is_settled = true;
                    }
                }
            }
        }
    }

    for (id, _, text, role, _) in results_to_update {
        if role == "speaker" {
            if speaker_text.is_empty() {
                speaker_text = text.clone();
            } else if !text.is_empty() {
                speaker_text = format!("{} {}", speaker_text, text);
            }
        } else {
            if dialogue_text.is_empty() {
                dialogue_text = text.clone();
            } else if !text.is_empty() {
                dialogue_text = format!("{} {}", dialogue_text, text);
            }
        }

        if !text.is_empty() {
            raw_all_text.push(text.clone());
        }

        regions_text.push(RegionRecognizedText {
            region_id: id,
            role,
            text,
        });
    }

    let latency_ms = start_instant.elapsed().as_millis() as u64;
    let timestamp = chrono_lite_timestamp();

    Ok(OcrScanResult {
        speaker: speaker_text,
        message: dialogue_text,
        raw_text: raw_all_text.join("\n"),
        regions_text,
        detected_lines: all_detected_lines,
        timestamp,
        latency_ms,
        is_settled: all_regions_settled,
    })
}

fn chrono_lite_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let dur = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}.{:03}", dur.as_secs(), dur.subsec_millis())
}

fn prepare_image_for_oneocr(img: &image::DynamicImage) -> (image::DynamicImage, f32, f32) {
    let rgb_img = img.to_rgb8();
    let (w, h) = (rgb_img.width(), rgb_img.height());

    let min_dim = 64u32;
    if w < min_dim || h < min_dim {
        let new_w = w.max(min_dim);
        let new_h = h.max(min_dim);

        let mut canvas = image::ImageBuffer::from_pixel(new_w, new_h, image::Rgb([0u8, 0u8, 0u8]));
        let offset_x = ((new_w - w) / 2) as f32;
        let offset_y = ((new_h - h) / 2) as f32;

        image::imageops::overlay(&mut canvas, &rgb_img, offset_x as i64, offset_y as i64);
        (image::DynamicImage::ImageRgb8(canvas), offset_x, offset_y)
    } else {
        (image::DynamicImage::ImageRgb8(rgb_img), 0.0, 0.0)
    }
}

#[cfg(test)]
mod integration_tests {
    use super::*;

    #[test]
    #[ignore = "Requires an installed Microsoft OneOCR runtime and model"]
    fn installed_oneocr_processes_in_memory_image() {
        get_or_init_ocr_engine(None).expect("OneOCR initialization with detected model path");
        let image = image::DynamicImage::ImageRgba8(image::RgbaImage::from_pixel(
            320,
            120,
            image::Rgba([255, 255, 255, 255]),
        ));
        let guard = OCR_ENGINE_INSTANCE.lock();
        let engine = &guard.as_ref().expect("initialized engine").0;
        let (text, lines) = run_ocr_pipeline_on_image(engine, &image, 0.0, 0.0, "synthetic-test")
            .expect("in-memory OCR succeeds");
        assert!(
            text.trim().is_empty(),
            "Blank image should contain no dialogue"
        );
        assert!(lines.is_empty());
    }
}
