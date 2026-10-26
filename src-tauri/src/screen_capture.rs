use image::{imageops::FilterType, DynamicImage, ImageBuffer, Rgba};
use std::collections::HashMap;
use std::io::Cursor;
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

const MAX_CAPTURE_PIXELS: u64 = 64 * 1024 * 1024;

fn validate_dimensions(width: i32, height: i32) -> Result<u64, String> {
    if width <= 0 || height <= 0 || width > 16_384 || height > 16_384 {
        return Err(format!(
            "Invalid capture rectangle dimensions ({width}x{height})"
        ));
    }
    let pixels = width as u64 * height as u64;
    if pixels > MAX_CAPTURE_PIXELS {
        return Err("Capture exceeds the 64 megapixel limit".into());
    }
    Ok(pixels)
}

fn contained_crop(
    (x, y, width, height): (i32, i32, i32, i32),
    (mx, my, mw, mh): (i32, i32, u32, u32),
) -> Option<(u32, u32)> {
    let dx = i64::from(x) - i64::from(mx);
    let dy = i64::from(y) - i64::from(my);
    (dx >= 0
        && dy >= 0
        && dx + i64::from(width) <= i64::from(mw)
        && dy + i64::from(height) <= i64::from(mh))
    .then_some((dx as u32, dy as u32))
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
fn capture_screen_rect_xcap(
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) -> Result<CapturedImage, String> {
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
            contained_crop((x, y, width, height), (mx, my, mw as u32, mh as u32)).is_some()
        })
        .ok_or_else(|| "Failed to locate target monitor for coordinates".to_string())?;

    let full_image = target_monitor
        .capture_image()
        .map_err(|e| format!("xcap monitor capture failed: {}", e))?;

    let mon_x = target_monitor.x().unwrap_or(0);
    let mon_y = target_monitor.y().unwrap_or(0);
    let (rel_x, rel_y) = contained_crop(
        (x, y, width, height),
        (mon_x, mon_y, full_image.width(), full_image.height()),
    )
    .ok_or("Capture region extends beyond the monitor")?;

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
fn capture_screen_rect_gdi(
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) -> Result<CapturedImage, String> {
    let pixels = validate_dimensions(width, height)?;
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

        // GetDIBits requires the bitmap to be deselected from every DC.
        SelectObject(h_dc_mem, h_old_bitmap);
        guard.h_old_bitmap = std::ptr::null_mut();
        let buffer_size = pixels as usize * 4;
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

        if get_bits_ok != height {
            return Err("GetDIBits failed to extract pixel buffer".to_string());
        }

        // Convert raw BGRA to RGBA in-place to eliminate double heap allocation and reduce cache misses
        raw_pixels.chunks_exact_mut(4).for_each(|chunk| {
            chunk.swap(0, 2); // Swap B and R: [B, G, R, A] -> [R, G, B, A]
            chunk[3] = 255; // Ensure full opacity
        });

        let img_buffer: ImageBuffer<Rgba<u8>, Vec<u8>> =
            ImageBuffer::from_raw(width as u32, height as u32, raw_pixels)
                .ok_or_else(|| "Failed to construct ImageBuffer from raw pixels".to_string())?;

        let dynamic_image = DynamicImage::ImageRgba8(img_buffer);

        Ok(CapturedImage { dynamic_image })
    }
}

/// Capture a screen region with primary hardware acceleration (xcap) and GDI fallback
#[allow(dead_code)]
pub fn capture_screen_rect(
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) -> Result<CapturedImage, String> {
    validate_dimensions(width, height)?;

    match capture_screen_rect_xcap(x, y, width, height) {
        Ok(captured) => Ok(captured),
        Err(e) => {
            tracing::warn!(
                "[ScreenCapture] xcap capture failed ({}), falling back to Win32 GDI BitBlt",
                e
            );
            capture_screen_rect_gdi(x, y, width, height)
        }
    }
}

/// Capture each required monitor once, retaining physical coordinates across displays.
pub fn capture_monitor_regions(
    regions: &[CaptureRegion],
) -> Result<HashMap<String, CapturedImage>, String> {
    let mut results = HashMap::new();
    if regions.len() > 64 {
        return Err("At most 64 capture regions are supported".into());
    }
    let mut total_pixels = 0;
    let mut ids = std::collections::HashSet::new();
    for r in regions {
        total_pixels += validate_dimensions(
            r.physical_width.unwrap_or(r.width),
            r.physical_height.unwrap_or(r.height),
        )?;
        if total_pixels > MAX_CAPTURE_PIXELS {
            return Err("Combined capture regions exceed the 64 megapixel limit".into());
        }
        if r.id.is_empty() || !ids.insert(&r.id) {
            return Err("Capture region IDs must be unique and nonempty".into());
        }
    }
    if regions.is_empty() {
        return Ok(results);
    }
    let monitors = xcap::Monitor::all().unwrap_or_default();
    let mut frames: HashMap<usize, Option<image::RgbaImage>> = HashMap::new();
    for r in regions {
        let rx = r.physical_x.unwrap_or(r.x);
        let ry = r.physical_y.unwrap_or(r.y);
        let rw = r.physical_width.unwrap_or(r.width);
        let rh = r.physical_height.unwrap_or(r.height);
        let mut captured = None;
        for (index, monitor) in monitors.iter().enumerate() {
            let (Ok(mx), Ok(my), Ok(mw), Ok(mh)) =
                (monitor.x(), monitor.y(), monitor.width(), monitor.height())
            else {
                continue;
            };
            if let Some((cx, cy)) = contained_crop((rx, ry, rw, rh), (mx, my, mw, mh)) {
                if let Some(frame) = frames
                    .entry(index)
                    .or_insert_with(|| monitor.capture_image().ok())
                {
                    if cx as u64 + rw as u64 <= frame.width() as u64
                        && cy as u64 + rh as u64 <= frame.height() as u64
                    {
                        captured = Some(CapturedImage {
                            dynamic_image: DynamicImage::ImageRgba8(
                                image::imageops::crop_imm(frame, cx, cy, rw as u32, rh as u32)
                                    .to_image(),
                            ),
                        });
                    }
                }
                break;
            }
        }
        // Cross-monitor rectangles and failed xcap frames use the same validated GDI path.
        let captured = match captured {
            Some(c) => c,
            None => capture_screen_rect_gdi(rx, ry, rw, rh)?,
        };
        results.insert(r.id.clone(), captured);
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
        assert!(capture_screen_rect_gdi(0, 0, i32::MAX, i32::MAX).is_err());
        assert!(validate_dimensions(16_384, 16_384).is_err());
    }

    #[test]
    fn physical_crop_handles_negative_and_cross_monitor_coordinates() {
        assert_eq!(
            contained_crop((-1800, 100, 200, 100), (-1920, 0, 1920, 1080)),
            Some((120, 100))
        );
        assert_eq!(
            contained_crop((-100, 0, 200, 100), (0, 0, 1920, 1080)),
            None
        );
        assert_eq!(
            contained_crop((1800, 0, 200, 100), (0, 0, 1920, 1080)),
            None
        );
        assert_eq!(
            contained_crop((i32::MAX, 0, 100, 100), (i32::MIN, 0, 1920, 1080)),
            None
        );
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
