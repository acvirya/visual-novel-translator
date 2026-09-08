use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::process::{Child, ChildStdin, Command, Stdio};
use parking_lot::Mutex;
use std::sync::Arc;
use tokio_util::sync::CancellationToken;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub window_title: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TextractorMessage {
    pub handle: u32,
    pub pid: u32,
    pub address: String,
    pub context: String,
    pub context2: String,
    pub name: String,
    pub hook_code: String,
    pub text: String,
    pub timestamp: String,
}

pub struct TextractorSession {
    pub child: Child,
    pub stdin: ChildStdin,
    pub active_pid: Option<u32>,
    pub cancel_token: CancellationToken,
}

pub struct TextractorState {
    pub session: Arc<Mutex<Option<TextractorSession>>>,
}

impl TextractorState {
    pub fn new() -> Self {
        Self {
            session: Arc::new(Mutex::new(None)),
        }
    }
}

#[cfg(target_os = "windows")]
mod win32 {
    use super::ProcessInfo;
    use std::collections::HashSet;
    use sysinfo::{Pid, System};
    use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible,
    };

    struct EnumContext {
        processes: Vec<ProcessInfo>,
        seen_pids: HashSet<u32>,
        sys: System,
    }

    unsafe extern "system" fn enum_windows_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let ctx = &mut *(lparam as *mut EnumContext);

        if IsWindowVisible(hwnd) == 0 {
            return 1; // Continue enumeration
        }

        let len = GetWindowTextLengthW(hwnd);
        if len <= 0 {
            return 1;
        }

        let mut title_buf = [0u16; 256];
        let max_read = (len.min(255) + 1) as i32;
        let read_len = GetWindowTextW(hwnd, title_buf.as_mut_ptr(), max_read);
        if read_len <= 0 {
            return 1;
        }

        let window_title = String::from_utf16_lossy(&title_buf[..read_len as usize]);
        let trimmed_title = window_title.trim();
        if trimmed_title.is_empty()
            || trimmed_title == "Program Manager"
            || trimmed_title == "Settings"
            || trimmed_title == "Windows Input Experience"
        {
            return 1;
        }

        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid == 0 || ctx.seen_pids.contains(&pid) {
            return 1;
        }

        // Get Process Image Name via sysinfo
        let mut exe_name = String::new();
        if let Some(proc) = ctx.sys.process(Pid::from_u32(pid)) {
            exe_name = proc.name().to_string_lossy().to_string();
        }

        if exe_name.is_empty() {
            exe_name = format!("Process_{}", pid);
        }

        // Skip system background processes
        if exe_name.eq_ignore_ascii_case("explorer.exe")
            || exe_name.eq_ignore_ascii_case("TextInputHost.exe")
            || exe_name.eq_ignore_ascii_case("ApplicationFrameHost.exe")
            || exe_name.eq_ignore_ascii_case("SystemSettings.exe")
        {
            return 1;
        }

        ctx.seen_pids.insert(pid);
        ctx.processes.push(ProcessInfo {
            pid,
            name: exe_name,
            window_title: trimmed_title.to_string(),
        });

        1 // Continue enumeration
    }

    pub fn enumerate_windows() -> Vec<ProcessInfo> {
        let mut sys = System::new_all();
        sys.refresh_all();

        let mut ctx = EnumContext {
            processes: Vec::new(),
            seen_pids: HashSet::new(),
            sys,
        };

        unsafe {
            EnumWindows(
                Some(enum_windows_callback),
                &mut ctx as *mut EnumContext as LPARAM,
            );
        }

        ctx.processes.sort_by_key(|a| a.window_title.to_lowercase());
        ctx.processes
    }
}

/// Enumerate active GUI processes with window titles (Instant Native Win32 <1ms)
#[tauri::command]
pub fn list_target_processes() -> Result<Vec<ProcessInfo>, String> {
    #[cfg(target_os = "windows")]
    {
        Ok(win32::enumerate_windows())
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(vec![])
    }
}

/// Generates candidate filesystem paths for TextractorCLI across environment variables and dynamic Windows drives (M18, L8)
fn get_textractor_candidate_paths(arch_filter: Option<&str>) -> Vec<std::path::PathBuf> {
    let mut candidates: Vec<std::path::PathBuf> = Vec::new();
    let arches: Vec<&str> = match arch_filter {
        Some("x64") => vec!["x64"],
        Some("x86") => vec!["x86"],
        _ => vec!["x64", "x86"],
    };

    let mut base_dirs: Vec<String> = Vec::new();

    if let Ok(pf) = std::env::var("ProgramFiles") {
        base_dirs.push(format!("{}\\Textractor", pf));
    }
    if let Ok(pfx86) = std::env::var("ProgramFiles(x86)") {
        base_dirs.push(format!("{}\\Textractor", pfx86));
    }
    if let Ok(local_app) = std::env::var("LOCALAPPDATA") {
        base_dirs.push(format!("{}\\Programs\\Textractor", local_app));
        base_dirs.push(format!("{}\\Textractor", local_app));
    }

    // Inspect logical drive letters dynamically on Windows without hardcoded drive assumptions
    #[cfg(target_os = "windows")]
    {
        for drive_byte in b'C'..=b'Z' {
            let drive_char = drive_byte as char;
            let root = format!("{}:\\", drive_char);
            if Path::new(&root).exists() {
                base_dirs.push(format!("{}Program Files\\Textractor", root));
                base_dirs.push(format!("{}Program Files (x86)\\Textractor", root));
                base_dirs.push(format!("{}Textractor", root));
            }
        }
    }

    for base in base_dirs {
        for arch in &arches {
            candidates.push(std::path::PathBuf::from(format!("{}\\{}\\TextractorCLI.exe", base, arch)));
        }
    }

    candidates
}

fn resolve_textractor_exe(requested: &str) -> std::path::PathBuf {
    let req_path = Path::new(requested);
    if req_path.exists() && req_path.is_file() {
        return req_path.to_path_buf();
    }

    let is_x64 = requested.to_lowercase().contains("x64");
    let arch_dir = if is_x64 { "x64" } else { "x86" };

    for candidate in get_textractor_candidate_paths(Some(arch_dir)) {
        if candidate.exists() && candidate.is_file() {
            return candidate;
        }
    }

    req_path.to_path_buf()
}

fn str_to_utf16_bytes(s: &str) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(s.len() * 2);
    for u in s.encode_utf16() {
        bytes.extend_from_slice(&u.to_le_bytes());
    }
    bytes
}

/// Start Textractor sidecar and attach to target PID
#[tauri::command]
pub fn start_textractor(
    app: AppHandle,
    state: tauri::State<'_, TextractorState>,
    exe_path: String,
    target_pid: u32,
) -> Result<(), String> {
    // Kill existing process if running
    stop_textractor_internal(&state);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        // ARCH-05: Strict backend sanitization of inputs from frontend IPC
        if target_pid == 0 {
            return Err("Invalid target process PID (0). Please select a valid active game process.".to_string());
        }

        let resolved_exe = resolve_textractor_exe(&exe_path);
        if !resolved_exe.exists() || !resolved_exe.is_file() {
            return Err(format!(
                "TextractorCLI executable not found at '{:?}'. Please install Textractor or set custom path in settings.",
                resolved_exe
            ));
        }

        eprintln!("[Textractor::Start] Target PID: {}, Executable: {:?}", target_pid, resolved_exe);

        let mut cmd = Command::new(&resolved_exe);

        // Crucial: set working directory to Textractor folder so it finds texthook.dll
        if let Some(parent) = resolved_exe.parent() {
            cmd.current_dir(parent);
        }

        cmd.stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .creation_flags(CREATE_NO_WINDOW);

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn Textractor at '{:?}': {}", resolved_exe, e))?;

        let mut stdin = match child.stdin.take() {
            Some(s) => s,
            None => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("Failed to capture Textractor stdin".to_string());
            }
        };

        let stdout = match child.stdout.take() {
            Some(o) => o,
            None => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("Failed to capture Textractor stdout".to_string());
            }
        };

        let stderr = child.stderr.take();

        // Send initial attach command to stdin (UTF-16LE encoded for Textractor std::wcin)
        let attach_cmd = format!("attach -P{}\r\n", target_pid);
        if let Err(e) = stdin.write_all(&str_to_utf16_bytes(&attach_cmd)) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!("Failed to send attach command to Textractor stdin: {}", e));
        }
        if let Err(e) = stdin.flush() {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!("Failed to flush Textractor stdin: {}", e));
        }

        let cancel_token = CancellationToken::new();

        // Store entire unified session atomically under single mutex (Eliminates TOCTOU race conditions)
        *state.session.lock() = Some(TextractorSession {
            child,
            stdin,
            active_pid: Some(target_pid),
            cancel_token: cancel_token.clone(),
        });

        // Spawn async reader thread for stderr
        if let Some(err_stream) = stderr {
            std::thread::spawn(move || {
                let mut reader = BufReader::new(err_stream);
                let mut line = String::new();
                while let Ok(n) = reader.read_line(&mut line) {
                    if n == 0 {
                        break;
                    }
                    tracing::warn!("[Textractor::Stderr] {}", line.trim());
                    line.clear();
                }
            });
        }

        // Spawn async reader thread for stdout with cooperative cancellation token
        let app_clone = app.clone();
        let cancel_clone = cancel_token.clone();
        std::thread::spawn(move || {
            use std::io::Read;
            let mut reader = BufReader::new(stdout);
            let mut u16_buf: Vec<u16> = Vec::new();
            let mut pair = [0u8; 2];
            const MAX_U16_BUFFER_SIZE: usize = 32_768; // 64KB max line safety bound

            while !cancel_clone.is_cancelled() && reader.read_exact(&mut pair).is_ok() {
                let code_unit = u16::from_le_bytes(pair);

                // Skip Byte Order Mark (BOM)
                if code_unit == 0xFEFF {
                    continue;
                }

                // Check for newline (0x000A in UTF-16LE)
                if code_unit == 0x000A {
                    let line_str = String::from_utf16_lossy(&u16_buf);
                    let trimmed = line_str.trim().trim_matches('\r').trim();
                    if !trimmed.is_empty() {
                        tracing::info!("[Textractor::Stdout] {}", trimmed);
                        if let Some(msg) = parse_textractor_line(trimmed, target_pid) {
                            let _ = app_clone.emit("textractor-text-event", &msg);
                        }
                    }
                    u16_buf.clear();
                } else if code_unit != 0x000D {
                    if u16_buf.len() < MAX_U16_BUFFER_SIZE {
                        u16_buf.push(code_unit);
                    } else {
                        // Flush safety threshold reached without newline
                        u16_buf.clear();
                    }
                }
            }

            let _ = app_clone.emit("textractor-process-terminated", serde_json::json!({ "pid": target_pid }));
        });

        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("Textractor is only supported on Windows".to_string())
    }
}

/// Format command to Textractor CLI specifications:
/// `swscanf(input, L"%500s -P%d", command, &processId) != 2 -> ExitProcess(0)`
/// Ensures that `-P<pid>` is always attached to prevent TextractorCLI from terminating.
pub fn format_textractor_command(command: &str, active_pid: Option<u32>) -> Result<String, String> {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return Err("Command or hook code cannot be empty".to_string());
    }

    // Check if command already contains a valid -P<digits> or -p<digits> flag
    let has_pid_flag = trimmed
        .split_whitespace()
        .any(|part| (part.starts_with("-P") || part.starts_with("-p")) && part[2..].parse::<u32>().is_ok());

    if has_pid_flag {
        Ok(trimmed.to_string())
    } else if let Some(pid) = active_pid {
        Ok(format!("{} -P{}", trimmed, pid))
    } else {
        Err("No active game process attached (attach to a game process first or provide -P<pid>)".to_string())
    }
}

/// Send custom command to Textractor stdin (e.g. hookcode -P1234, detach -P1234)
#[tauri::command]
pub fn send_textractor_command(
    state: tauri::State<'_, TextractorState>,
    command: String,
) -> Result<(), String> {
    let mut session_guard = state.session.lock();
    if let Some(ref mut session) = *session_guard {
        let final_cmd = format_textractor_command(&command, session.active_pid)?;
        tracing::info!("[Textractor::SendCommand] Sending stdin command: {}", final_cmd);

        let formatted = format!("{}\r\n", final_cmd);
        let utf16_bytes = str_to_utf16_bytes(&formatted);
        session.stdin
            .write_all(&utf16_bytes)
            .map_err(|e| format!("Failed to write to Textractor stdin: {}", e))?;
        session.stdin
            .flush()
            .map_err(|e| format!("Failed to flush Textractor stdin: {}", e))?;
        return Ok(());
    }
    Err("Textractor is not running or stdin is unavailable".to_string())
}

/// Stop Textractor sidecar
#[tauri::command]
pub fn stop_textractor(state: tauri::State<'_, TextractorState>) -> Result<(), String> {
    stop_textractor_internal(&state);
    Ok(())
}

pub fn stop_textractor_internal(state: &TextractorState) {
    let session_opt = state.session.lock().take();
    if let Some(mut session) = session_opt {
        // 1. Signal cancellation to background reader thread
        session.cancel_token.cancel();

        // 2. Send graceful detach command to target process if active
        if let Some(pid) = session.active_pid.take() {
            let detach_cmd = format!("detach -P{}\r\n", pid);
            let _ = session.stdin.write_all(&str_to_utf16_bytes(&detach_cmd));
            let _ = session.stdin.flush();
        }

        // 3. Drop stdin handle to signal EOF, then terminate child process
        drop(session.stdin);
        let _ = session.child.kill();
        let _ = session.child.wait();
        tracing::info!("[Textractor] Terminated Textractor session cleanly.");
    }
}

/// Flexible Parser for Textractor stdout format:
/// `[handle:pid:addr:ctx:ctx2:name:code] text` or `[handle:name] text` or `[handle] text`
fn parse_textractor_line(line: &str, fallback_pid: u32) -> Option<TextractorMessage> {
    if !line.starts_with('[') {
        return None;
    }

    let end_bracket = line.find(']')?;
    let header = &line[1..end_bracket];
    let text = if line.len() > end_bracket + 1 {
        line[end_bracket + 1..].trim().to_string()
    } else {
        String::new()
    };

    let parts: Vec<&str> = header.split(':').collect();
    if parts.is_empty() {
        return None;
    }

    // Support both hexadecimal and decimal thread handles
    let clean_h = parts[0].trim().trim_start_matches("0x").trim_start_matches("0X");
    let handle = u32::from_str_radix(clean_h, 16).unwrap_or_else(|_| clean_h.parse::<u32>().unwrap_or(0));

    let mut pid = fallback_pid;
    let mut address = String::new();
    let mut context = String::new();
    let mut context2 = String::new();
    let mut name = format!("Thread #{}", handle);
    let mut hook_code = String::new();

    if parts.len() >= 6 {
        let raw_pid = parts[1].trim();
        if raw_pid.starts_with("0x") || raw_pid.starts_with("0X") {
            let clean_pid = raw_pid.trim_start_matches("0x").trim_start_matches("0X");
            pid = u32::from_str_radix(clean_pid, 16).unwrap_or_else(|_| clean_pid.parse::<u32>().unwrap_or(fallback_pid));
        } else {
            pid = raw_pid.parse::<u32>().unwrap_or_else(|_| u32::from_str_radix(raw_pid, 16).unwrap_or(fallback_pid));
        }
        address = parts[2].trim().to_string();
        context = parts[3].trim().to_string();
        context2 = parts[4].trim().to_string();
        name = parts[5].trim().to_string();
        if name.is_empty() {
            name = format!("Thread #{}", handle);
        }
        if parts.len() > 6 {
            hook_code = parts[6..].join(":").trim().to_string();
        }
    } else if parts.len() == 3 {
        pid = parts[1].trim().parse::<u32>().unwrap_or(fallback_pid);
        name = parts[2].trim().to_string();
    } else if parts.len() == 2 {
        name = parts[1].trim().to_string();
    }

    let timestamp = chrono_local_time();

    Some(TextractorMessage {
        handle,
        pid,
        address,
        context,
        context2,
        name,
        hook_code,
        text,
        timestamp,
    })
}

#[tauri::command]
pub fn find_textractor_installation() -> Option<String> {
    for path in get_textractor_candidate_paths(None) {
        if path.exists() && path.is_file() {
            return Some(path.to_string_lossy().to_string());
        }
    }
    None
}

fn chrono_local_time() -> String {
    chrono::Local::now().format("%H:%M:%S").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_textractor_command_auto_appends_pid() {
        let res = format_textractor_command("/HN-4*0@SiglusEngine.exe", Some(12345));
        assert_eq!(res.unwrap(), "/HN-4*0@SiglusEngine.exe -P12345");

        let res2 = format_textractor_command("HS-8*0@43F9B0", Some(8888));
        assert_eq!(res2.unwrap(), "HS-8*0@43F9B0 -P8888");
    }

    #[test]
    fn test_format_textractor_command_preserves_existing_pid() {
        let res = format_textractor_command("/HS-8*0@cs2.exe -P9999", Some(12345));
        assert_eq!(res.unwrap(), "/HS-8*0@cs2.exe -P9999");

        let res2 = format_textractor_command("attach -p777", Some(12345));
        assert_eq!(res2.unwrap(), "attach -p777");
    }

    #[test]
    fn test_format_textractor_command_error_when_no_pid() {
        let res = format_textractor_command("/HN-4*0@SiglusEngine.exe", None);
        assert!(res.is_err());
    }

    #[test]
    fn test_format_textractor_command_empty_error() {
        let res = format_textractor_command("   ", Some(12345));
        assert!(res.is_err());
    }
}

