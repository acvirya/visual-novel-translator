//! Windows DPAPI avoids Credential Manager's small per-entry size limit for JWTs.
use super::Vault;
use std::{
    fs::{File, OpenOptions},
    io::Write,
    path::PathBuf,
};
use tauri::{AppHandle, Manager};

pub(super) struct LoadedVault {
    pub data: Vault,
    path: PathBuf,
    // Held for the process lifetime: another app instance must not race token rotation.
    _lock: File,
}

impl LoadedVault {
    pub fn save(&mut self, next: Vault) -> Result<(), String> {
        let bytes = serde_json::to_vec(&next).map_err(|_| "Could not encode OpenAI credentials")?;
        let encrypted = protect(&bytes, false)?;
        let temporary = self.path.with_extension("tmp");
        let mut file =
            File::create(&temporary).map_err(|_| "Could not save protected OpenAI credentials")?;
        file.write_all(&encrypted)
            .and_then(|_| file.sync_all())
            .map_err(|_| "Could not save protected OpenAI credentials")?;
        drop(file);
        // Both the temporary and final files contain only DPAPI ciphertext.
        std::fs::rename(&temporary, &self.path)
            .map_err(|_| "Could not replace protected OpenAI credentials")?;
        self.data = next;
        Ok(())
    }
}

pub(super) fn load(app: &AppHandle) -> Result<LoadedVault, String> {
    let directory = app
        .path()
        .app_local_data_dir()
        .map_err(|_| "Could not locate application credentials directory")?;
    std::fs::create_dir_all(&directory)
        .map_err(|_| "Could not create application credentials directory")?;
    let lock = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(directory.join("openai-oauth.lock"))
        .map_err(|_| "Could not lock OpenAI credentials")?;
    fs2::FileExt::try_lock_exclusive(&lock).map_err(|_| {
        "Another Visual Novel Translator instance is using OpenAI OAuth. Close it and retry."
    })?;
    let path = directory.join("openai-oauth.dat");
    let data = match std::fs::read(&path) {
        Ok(bytes) => {
            if bytes.len() > 4 * 1024 * 1024 {
                return Err("Protected OpenAI credential file is too large".into());
            }
            serde_json::from_slice(&protect(&bytes, true)?)
                .map_err(|_| "Could not read protected OpenAI credentials")?
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Vault::default(),
        Err(_) => return Err("Could not read protected OpenAI credentials".into()),
    };
    let mut loaded = LoadedVault {
        data,
        path,
        _lock: lock,
    };
    if !loaded.path.exists() {
        loaded.save(loaded.data.clone())?;
    }
    Ok(loaded)
}

#[cfg(windows)]
fn protect(bytes: &[u8], decrypt: bool) -> Result<Vec<u8>, String> {
    use windows_sys::Win32::{
        Foundation::LocalFree,
        Security::Cryptography::{
            CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
        },
    };
    let input = CRYPT_INTEGER_BLOB {
        cbData: bytes
            .len()
            .try_into()
            .map_err(|_| "Credential data too large")?,
        pbData: bytes.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };
    // Current-user scope, no machine-wide flag and no native credential UI.
    let success = unsafe {
        if decrypt {
            CryptUnprotectData(
                &input,
                std::ptr::null_mut(),
                std::ptr::null(),
                std::ptr::null_mut(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        } else {
            CryptProtectData(
                &input,
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null_mut(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        }
    };
    if success == 0 {
        return Err("Windows could not protect or decrypt OpenAI credentials for this user".into());
    }
    let result =
        unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec() };
    unsafe {
        LocalFree(output.pbData as *mut std::ffi::c_void);
    }
    Ok(result)
}

#[cfg(not(windows))]
fn protect(_bytes: &[u8], _decrypt: bool) -> Result<Vec<u8>, String> {
    Err("Protected OAuth storage currently requires Windows".into())
}

#[cfg(all(test, windows))]
mod tests {
    #[test]
    fn dpapi_roundtrip_and_tamper_detection() {
        let plaintext = b"fake-access-and-refresh-token";
        let mut encrypted = super::protect(plaintext, false).unwrap();
        assert!(!encrypted.windows(plaintext.len()).any(|w| w == plaintext));
        assert_eq!(super::protect(&encrypted, true).unwrap(), plaintext);
        let last = encrypted.len() - 1;
        encrypted[last] ^= 1;
        assert!(super::protect(&encrypted, true).is_err());
    }
}
