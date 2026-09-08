use std::collections::HashMap;
use std::io::Cursor;
use image::{imageops::FilterType, DynamicImage, ImageBuffer, Rgba};
use windows_sys::Win32::{
    Foundation::HWND,
    Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC,
        GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
        HBITMAP, HDC, SRCCOPY,
    },
};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureRegion {
    pub id: String,
    pub name: String,
    pub role: String, // "dialogue" or "speaker"
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub physical_x: Option<i32>,
    pub physical_y: Option<i32>,
    pub physical_width: Option<i32>,
    pub physical_height: Option<i32>,
}

pub struct CapturedImage {
    pub dynamic_image: DynamicImage,
}

struct GdiCaptureGuard {
    h_wnd: HWND,
    h_dc_screen: HDC,
    h_dc_mem: HDC,
    h_bitmap: HBITMAP,
    h_old_bitmap: HBITMAP,
}

impl Drop for GdiCaptureGuard {
    fn drop(&mut self) {
        unsafe {
            if self.h_dc_mem != 0 as HDC {
                if self.h_old_bitmap != 0 as HBITMAP {
                    SelectObject(self.h_dc_mem, self.h_old_bitmap);
                }
                if self.h_bitmap != 0 as HBITMAP {
                    DeleteObject(self.h_bitmap);
                }
                DeleteDC(self.h_dc_mem);
            }
            if self.h_dc_screen != 0 as HDC {
                ReleaseDC(self.h_wnd, self.h_dc_screen);
            }
        }
    }
}

/// Capture a screen region via modern DirectX/Desktop Duplication (xcap)
#[allow(dead_code)]
fn capture_screen_rect_xcap(x: i32, y: i32, width: i32, height: i32) -> Result<CapturedImage, String> {
    let monitors = xcap::Monitor::all().map_err(|e| format!("Failed to list monitors: {}", e))?;
    if monitors.is_empty() {
        return Err("No active display monitors found".to_string());
    }

    // Find the monitor that contains the top-left coordinate (x, y)
    let target_monitor = monitors
        .into_iter()
        .find(|m| {
            let mx = m.x().unwrap_or(0);
            let my = m.y().unwrap_or(0);
            let mw = m.width().unwrap_or(0) as i32;
            let mh = m.height().unwrap_or(0) as i32;
            x >= mx && x < mx + mw && y >= my && y < my + mh
        })
        .or_else(|| xcap::Monitor::all().ok()?.into_iter().next())
        .ok_or_else(|| "Failed to locate target monitor for coordinates".to_string())?;

    let full_image = target_monitor
        .capture_image()
        .map_err(|e| format!("xcap monitor capture failed: {}", e))?;

    let mon_x = target_monitor.x().unwrap_or(0);
    let mon_y = target_monitor.y().unwrap_or(0);
    let rel_x = (x - mon_x).max(0) as u32;
    let rel_y = (y - mon_y).max(0) as u32;

    let crop_w = (width as u32).min(full_image.width().saturating_sub(rel_x));
    let crop_h = (height as u32).min(full_image.height().saturating_sub(rel_y));

    if crop_w == 0 || crop_h == 0 {
        return Err(format!(
            "Target capture region is outside monitor boundaries (rel: ({}, {}), size: {}x{}, monitor: {}x{})",
            rel_x, rel_y, width, height, full_image.width(), full_image.height()
        ));
    }

    let cropped = image::imageops::crop_imm(&full_image, rel_x, rel_y, crop_w, crop_h).to_image();

    Ok(CapturedImage {
        dynamic_image: DynamicImage::ImageRgba8(cropped),
    })
}

/// Fallback capture via Win32 GDI BitBlt
fn capture_screen_rect_gdi(x: i32, y: i32, width: i32, height: i32) -> Result<CapturedImage, String> {
    unsafe {
        let h_wnd: HWND = 0 as HWND;
        let h_dc_screen: HDC = GetDC(h_wnd);
        if h_dc_screen == 0 as HDC {
            return Err("Failed to obtain screen DC".to_string());
        }

        let mut guard = GdiCaptureGuard {
            h_wnd,
            h_dc_screen,
            h_dc_mem: 0 as HDC,
            h_bitmap: 0 as HBITMAP,
            h_old_bitmap: 0 as HBITMAP,
        };

        let h_dc_mem: HDC = CreateCompatibleDC(h_dc_screen);
        if h_dc_mem == 0 as HDC {
            return Err("Failed to create compatible memory DC".to_string());
        }
        guard.h_dc_mem = h_dc_mem;

        let h_bitmap: HBITMAP = CreateCompatibleBitmap(h_dc_screen, width, height);
        if h_bitmap == 0 as HBITMAP {
            return Err("Failed to create compatible bitmap".to_string());
        }
        guard.h_bitmap = h_bitmap;

        let h_old_bitmap = SelectObject(h_dc_mem, h_bitmap);
        if h_old_bitmap == 0 as _ {
            return Err("Failed to select compatible bitmap into memory DC".to_string());
        }
        guard.h_old_bitmap = h_old_bitmap as HBITMAP;

        // BitBlt screenshot from screen DC into memory DC
        let bitblt_ok = BitBlt(h_dc_mem, 0, 0, width, height, h_dc_screen, x, y, SRCCOPY);
        if bitblt_ok == 0 {
            return Err("BitBlt screen capture failed".to_string());
        }

        // Setup BITMAPINFO structure for 32-bit BGRA
        let mut bmi: BITMAPINFO = std::mem::zeroed();
        bmi.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        bmi.bmiHeader.biWidth = width;
        bmi.bmiHeader.biHeight = -height; // Top-down DIB
        bmi.bmiHeader.biPlanes = 1;
        bmi.bmiHeader.biBitCount = 32;
        bmi.bmiHeader.biCompression = BI_RGB;

        let buffer_size = (width.max(0) as usize) * (height.max(0) as usize) * 4;
        let mut raw_pixels = vec![0u8; buffer_size];

        let get_bits_ok = GetDIBits(
            h_dc_mem,
            h_bitmap,
            0,
            height as u32,
            raw_pixels.as_mut_ptr() as *mut _,
            &mut bmi,
            DIB_RGB_COLORS,
        );

        if get_bits_ok == 0 {
            return Err("GetDIBits failed to extract pixel buffer".to_string());
        }

        // Convert raw BGRA to RGBA in-place to eliminate double heap allocation and reduce cache misses
        raw_pixels.chunks_exact_mut(4).for_each(|chunk| {
            chunk.swap(0, 2); // Swap B and R: [B, G, R, A] -> [R, G, B, A]
            chunk[3] = 255;   // Ensure full opacity
        });

        let img_buffer: ImageBuffer<Rgba<u8>, Vec<u8>> =
            ImageBuffer::from_raw(width as u32, height as u32, raw_pixels)
                .ok_or_else(|| "Failed to construct ImageBuffer from raw pixels".to_string())?;

        let dynamic_image = DynamicImage::ImageRgba8(img_buffer);

        Ok(CapturedImage {
            dynamic_image,
        })
    }
}

/// Capture a screen region with primary hardware acceleration (xcap) and GDI fallback
#[allow(dead_code)]
pub fn capture_screen_rect(x: i32, y: i32, width: i32, height: i32) -> Result<CapturedImage, String> {
    if width <= 0 || height <= 0 || width > 16_384 || height > 16_384 {
        return Err(format!("Invalid capture rectangle dimensions ({}x{})", width, height));
    }

    match capture_screen_rect_xcap(x, y, width, height) {
        Ok(captured) => Ok(captured),
        Err(e) => {
            tracing::warn!("[ScreenCapture] xcap capture failed ({}), falling back to Win32 GDI BitBlt", e);
            capture_screen_rect_gdi(x, y, width, height)
        }
    }
}

/// Single-frame batch screen capture for multiple regions on a strictly single monitor.
/// Captures the full monitor once via xcap and performs in-memory crops for all regions.
pub fn capture_monitor_regions(regions: &[CaptureRegion]) -> Result<HashMap<String, CapturedImage>, String> {
    let mut results = HashMap::new();
    let valid_regions: Vec<&CaptureRegion> = regions
        .iter()
        .filter(|r| {
            let w = r.physical_width.unwrap_or(r.width);
            let h = r.physical_height.unwrap_or(r.height);
            w > 0 && h > 0 && w <= 16_384 && h <= 16_384
        })
        .collect();

    if valid_regions.is_empty() {
        return Ok(results);
    }

    // Identify target monitor using the first valid region's coordinates
    let first_r = valid_regions[0];
    let first_x = first_r.physical_x.unwrap_or(first_r.x);
    let first_y = first_r.physical_y.unwrap_or(first_r.y);

    let monitors = xcap::Monitor::all().map_err(|e| format!("Failed to list monitors: {}", e))?;
    let target_monitor = monitors
        .into_iter()
        .find(|m| {
            let mx = m.x().unwrap_or(0);
            let my = m.y().unwrap_or(0);
            let mw = m.width().unwrap_or(0) as i32;
            let mh = m.height().unwrap_or(0) as i32;
            first_x >= mx && first_x < mx + mw && first_y >= my && first_y < my + mh
        })
        .or_else(|| xcap::Monitor::all().ok()?.into_iter().next());

    if let Some(monitor) = target_monitor {
        if let Ok(full_image) = monitor.capture_image() {
            let mon_x = monitor.x().unwrap_or(0);
            let mon_y = monitor.y().unwrap_or(0);

            for r in &valid_regions {
                let rx = r.physical_x.unwrap_or(r.x);
                let ry = r.physical_y.unwrap_or(r.y);
                let rw = r.physical_width.unwrap_or(r.width);
                let rh = r.physical_height.unwrap_or(r.height);

                let rel_x = (rx - mon_x).max(0) as u32;
                let rel_y = (ry - mon_y).max(0) as u32;
                let crop_w = (rw as u32).min(full_image.width().saturating_sub(rel_x));
                let crop_h = (rh as u32).min(full_image.height().saturating_sub(rel_y));

                if crop_w > 0 && crop_h > 0 {
                    let cropped = image::imageops::crop_imm(&full_image, rel_x, rel_y, crop_w, crop_h).to_image();
                    results.insert(
                        r.id.clone(),
                        CapturedImage {
                            dynamic_image: DynamicImage::ImageRgba8(cropped),
                        },
                    );
                }
            }

            return Ok(results);
        }
    }

    // Fallback: GDI BitBlt per region if xcap failed
    tracing::warn!("[ScreenCapture] Batch xcap monitor capture failed, falling back to individual GDI BitBlt");
    for r in regions {
        let rx = r.physical_x.unwrap_or(r.x);
        let ry = r.physical_y.unwrap_or(r.y);
        let rw = r.physical_width.unwrap_or(r.width);
        let rh = r.physical_height.unwrap_or(r.height);

        if rw > 0 && rh > 0 {
            if let Ok(cap) = capture_screen_rect_gdi(rx, ry, rw, rh) {
                results.insert(r.id.clone(), cap);
            }
        }
    }

    Ok(results)
}

/// Convert a DynamicImage to a base64 PNG data URL
pub fn image_to_base64_data_url(img: &DynamicImage) -> Result<String, String> {
    use base64::engine::general_purpose::STANDARD;
    use base64::Engine;

    let mut buffer = Cursor::new(Vec::new());
    img.write_to(&mut buffer, image::ImageFormat::Png)
        .map_err(|e| format!("Failed to encode image to PNG: {}", e))?;

    let base64_str = STANDARD.encode(buffer.into_inner());
    Ok(format!("data:image/png;base64,{}", base64_str))
}

/// Resize DynamicImage according to scale percent (e.g. 50, 75, 100, 150, 200)
/// Uses FilterType::Triangle (Bilinear) for fast CPU throughput during frequent OCR loops.
pub fn resize_image(img: &DynamicImage, scale_percent: u32) -> DynamicImage {
    if scale_percent == 100 || scale_percent == 0 {
        return img.clone();
    }

    let scale = scale_percent as f32 / 100.0;
    let new_width = ((img.width() as f32) * scale).round().max(1.0) as u32;
    let new_height = ((img.height() as f32) * scale).round().max(1.0) as u32;

    img.resize_exact(new_width, new_height, FilterType::Triangle)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_capture_screen_rect_invalid_dimensions() {
        assert!(capture_screen_rect(0, 0, 0, 100).is_err());
        assert!(capture_screen_rect(0, 0, 100, -5).is_err());
        assert!(capture_screen_rect(0, 0, 20_000, 100).is_err());
    }

    #[test]
    fn test_resize_image_dimensions() {
        let dummy = DynamicImage::new_rgba8(100, 50);
        let same = resize_image(&dummy, 100);
        assert_eq!(same.width(), 100);
        assert_eq!(same.height(), 50);

        let doubled = resize_image(&dummy, 200);
        assert_eq!(doubled.width(), 200);
        assert_eq!(doubled.height(), 100);

        let halved = resize_image(&dummy, 50);
        assert_eq!(halved.width(), 50);
        assert_eq!(halved.height(), 25);
    }
}

