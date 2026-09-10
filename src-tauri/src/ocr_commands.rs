use std::collections::HashMap;
use crate::oneocr::{find_oneocr_installation, scan_screen_regions, OcrEngineStatus, OcrScanResult, OcrStabilityConfig};
use crate::screen_capture::{image_to_base64_data_url, CaptureRegion};

#[tauri::command]
pub async fn detect_oneocr_path(custom_path: Option<String>) -> Result<OcrEngineStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        match find_oneocr_installation(custom_path) {
            Ok((dll, model, _onnx)) => Ok(OcrEngineStatus {
                is_available: true,
                dll_path: dll.to_string_lossy().to_string(),
                model_path: model.to_string_lossy().to_string(),
                error: None,
            }),
            Err(e) => Ok(OcrEngineStatus {
                is_available: false,
                dll_path: String::new(),
                model_path: String::new(),
                error: Some(e),
            }),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn capture_regions_preview(regions: Vec<CaptureRegion>) -> Result<HashMap<String, String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let captured_map = crate::screen_capture::capture_monitor_regions(&regions)?;
        let mut map = HashMap::new();
        for (id, cap) in captured_map {
            if let Ok(b64) = image_to_base64_data_url(&cap.dynamic_image) {
                map.insert(id, b64);
            }
        }
        Ok(map)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn run_oneocr_scan(
    regions: Vec<CaptureRegion>,
    scale_percent: u32,
    custom_path: Option<String>,
    stability_config: Option<OcrStabilityConfig>,
) -> Result<OcrScanResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        scan_screen_regions(regions, scale_percent, custom_path, stability_config)
    })
    .await
    .map_err(|e| e.to_string())?
}
