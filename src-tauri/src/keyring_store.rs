use keyring::Entry;

const SERVICE_NAME: &str = "visual-novel-translator";

fn provider_entry(provider_id: &str) -> Result<Entry, String> {
    if provider_id.is_empty()
        || provider_id.len() > 128
        || !provider_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b':'))
    {
        return Err("Invalid credential provider ID".into());
    }
    Entry::new(SERVICE_NAME, provider_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_secure_key(provider_id: String) -> Result<Option<String>, String> {
    let entry = provider_entry(&provider_id)?;
    match entry.get_password() {
        Ok(pass) => Ok(Some(pass)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn set_secure_key(provider_id: String, key_val: String) -> Result<(), String> {
    let entry = provider_entry(&provider_id)?;
    if key_val.is_empty() {
        match entry.delete_credential() {
            Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    } else {
        entry.set_password(&key_val).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn delete_secure_key(provider_id: String) -> Result<(), String> {
    let entry = provider_entry(&provider_id)?;
    match entry.delete_credential() {
        Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
