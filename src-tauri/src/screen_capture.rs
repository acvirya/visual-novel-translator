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

/// Capture a screen region via Win32 GDI BitBlt
pub fn capture_screen_rect(x: i32, y: i32, width: i32, height: i32) -> Result<CapturedImage, String> {
    if width <= 0 || height <= 0 {
        return Err("Invalid capture rectangle dimensions".to_string());
    }

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

        let buffer_size = (width * height * 4) as usize;
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

        // Convert raw BGRA to RGBA DynamicImage
        let mut rgba_pixels = vec![0u8; buffer_size];
        for i in (0..buffer_size).step_by(4) {
            let b = raw_pixels[i];
            let g = raw_pixels[i + 1];
            let r = raw_pixels[i + 2];
            let a = 255u8;

            rgba_pixels[i] = r;
            rgba_pixels[i + 1] = g;
            rgba_pixels[i + 2] = b;
            rgba_pixels[i + 3] = a;
        }

        let img_buffer: ImageBuffer<Rgba<u8>, Vec<u8>> =
            ImageBuffer::from_raw(width as u32, height as u32, rgba_pixels)
                .ok_or_else(|| "Failed to construct ImageBuffer from raw pixels".to_string())?;

        let dynamic_image = DynamicImage::ImageRgba8(img_buffer);

        Ok(CapturedImage {
            dynamic_image,
        })
    }
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
pub fn resize_image(img: &DynamicImage, scale_percent: u32) -> DynamicImage {
    if scale_percent == 100 || scale_percent == 0 {
        return img.clone();
    }

    let scale = scale_percent as f32 / 100.0;
    let new_width = ((img.width() as f32) * scale).round().max(1.0) as u32;
    let new_height = ((img.height() as f32) * scale).round().max(1.0) as u32;

    img.resize_exact(new_width, new_height, FilterType::Lanczos3)
}
