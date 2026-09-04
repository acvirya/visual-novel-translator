use std::collections::HashMap;
use crate::oneocr::{find_oneocr_installation, scan_screen_regions, OcrEngineStatus, OcrScanResult, OcrStabilityConfig};
use crate::screen_capture::{capture_screen_rect, image_to_base64_data_url, CaptureRegion};

#[tauri::command]
pub fn detect_oneocr_path(custom_path: Option<String>) -> Result<OcrEngineStatus, String> {
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
}

#[tauri::command]
pub async fn capture_regions_preview(regions: Vec<CaptureRegion>) -> Result<HashMap<String, String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut map = HashMap::new();
        for r in regions {
            let x = r.physical_x.unwrap_or(r.x);
            let y = r.physical_y.unwrap_or(r.y);
            let w = r.physical_width.unwrap_or(r.width);
            let h = r.physical_height.unwrap_or(r.height);

            if w > 0 && h > 0 {
                if let Ok(cap) = capture_screen_rect(x, y, w, h) {
                    if let Ok(b64) = image_to_base64_data_url(&cap.dynamic_image) {
                        map.insert(r.id, b64);
                    }
                }
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
