use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};
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

pub struct TextractorState {
    pub child: Arc<Mutex<Option<Child>>>,
    pub stdin: Arc<Mutex<Option<ChildStdin>>>,
    pub active_pid: Arc<Mutex<Option<u32>>>,
}

impl TextractorState {
    pub fn new() -> Self {
        Self {
            child: Arc::new(Mutex::new(None)),
            stdin: Arc::new(Mutex::new(None)),
            active_pid: Arc::new(Mutex::new(None)),
        }
    }
}

#[cfg(target_os = "windows")]
mod win32 {
    use super::ProcessInfo;
    use std::collections::HashSet;
    use std::ffi::c_void;

    type HWND = *mut c_void;
    type BOOL = i32;
    type LPARAM = isize;
    type DWORD = u32;
    type HANDLE = *mut c_void;
    type WNDENUMPROC = unsafe extern "system" fn(HWND, LPARAM) -> BOOL;

    const PROCESS_QUERY_LIMITED_INFORMATION: DWORD = 0x1000;

    extern "system" {
        fn EnumWindows(lpEnumFunc: WNDENUMPROC, lParam: LPARAM) -> BOOL;
        fn IsWindowVisible(hWnd: HWND) -> BOOL;
        fn GetWindowTextLengthW(hWnd: HWND) -> i32;
        fn GetWindowTextW(hWnd: HWND, lpString: *mut u16, nMaxCount: i32) -> i32;
        fn GetWindowThreadProcessId(hWnd: HWND, lpdwProcessId: *mut DWORD) -> DWORD;
        fn OpenProcess(dwDesiredAccess: DWORD, bInheritHandle: BOOL, dwProcessId: DWORD) -> HANDLE;
        fn CloseHandle(hObject: HANDLE) -> BOOL;
        fn QueryFullProcessImageNameW(
            hProcess: HANDLE,
            dwFlags: DWORD,
            lpExeName: *mut u16,
            lpdwSize: *mut DWORD,
        ) -> BOOL;
    }

    struct EnumContext {
        processes: Vec<ProcessInfo>,
        seen_pids: HashSet<u32>,
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

        let mut title_buf = vec![0u16; (len + 1) as usize];
        let read_len = GetWindowTextW(hwnd, title_buf.as_mut_ptr(), len + 1);
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

        let mut pid: DWORD = 0;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid == 0 || ctx.seen_pids.contains(&pid) {
            return 1;
        }

        // Get Process Image Name
        let mut exe_name = String::new();
        let h_proc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if !h_proc.is_null() {
            let mut name_buf = vec![0u16; 1024];
            let mut size: DWORD = name_buf.len() as DWORD;
            if QueryFullProcessImageNameW(h_proc, 0, name_buf.as_mut_ptr(), &mut size) != 0 {
                let full_path = String::from_utf16_lossy(&name_buf[..size as usize]);
                if let Some(filename) = std::path::Path::new(&full_path).file_name() {
                    exe_name = filename.to_string_lossy().to_string();
                }
            }
            CloseHandle(h_proc);
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
        let mut ctx = EnumContext {
            processes: Vec::new(),
            seen_pids: HashSet::new(),
        };

        unsafe {
            EnumWindows(
                enum_windows_callback,
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

        let exe_path_obj = Path::new(&exe_path);
        let mut cmd = Command::new(&exe_path);

        // Crucial: set working directory to Textractor folder so it finds texthook.dll
        if let Some(parent) = exe_path_obj.parent() {
            cmd.current_dir(parent);
        }

        // Attach CLI argument
        cmd.args(["attach", &format!("-P{}", target_pid)])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .creation_flags(CREATE_NO_WINDOW);

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn Textractor at '{}': {}", exe_path, e))?;

        let mut stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Failed to capture Textractor stdin".to_string())?;

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Failed to capture Textractor stdout".to_string())?;

        let stderr = child.stderr.take();

        // Send initial attach command to stdin as well
        let attach_cmd = format!("attach -P{}\r\n", target_pid);
        let _ = stdin.write_all(attach_cmd.as_bytes());
        let _ = stdin.flush();

        // Store child & stdin safely (recovering from poisoned mutex if previous thread panicked)
        {
            let mut c = state.child.lock().unwrap_or_else(|e| e.into_inner());
            *c = Some(child);
        }
        {
            let mut s = state.stdin.lock().unwrap_or_else(|e| e.into_inner());
            *s = Some(stdin);
        }
        {
            let mut p = state.active_pid.lock().unwrap_or_else(|e| e.into_inner());
            *p = Some(target_pid);
        }

        // Spawn async reader thread for stderr
        if let Some(err_stream) = stderr {
            std::thread::spawn(move || {
                let mut reader = BufReader::new(err_stream);
                let mut line = String::new();
                while let Ok(n) = reader.read_line(&mut line) {
                    if n == 0 {
                        break;
                    }
                    eprintln!("[Textractor stderr] {}", line.trim());
                    line.clear();
                }
            });
        }

        // Spawn async reader thread for stdout (decoding UTF-16LE wide-character stream from Textractor)
        let app_clone = app.clone();
        std::thread::spawn(move || {
            use std::io::Read;
            let mut reader = BufReader::new(stdout);
            let mut u16_buf: Vec<u16> = Vec::new();
            let mut pair = [0u8; 2];
            const MAX_U16_BUFFER_SIZE: usize = 32_768; // 64KB max line safety bound

            while let Ok(()) = reader.read_exact(&mut pair) {
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

/// Send custom command to Textractor stdin (e.g. hookcode -P1234, detach -P1234)
#[tauri::command]
pub fn send_textractor_command(
    state: tauri::State<'_, TextractorState>,
    command: String,
) -> Result<(), String> {
    if let Ok(mut stdin_opt) = state.stdin.lock() {
        if let Some(ref mut stdin) = *stdin_opt {
            let formatted = format!("{}\r\n", command.trim());
            stdin
                .write_all(formatted.as_bytes())
                .map_err(|e| format!("Failed to write to Textractor stdin: {}", e))?;
            stdin
                .flush()
                .map_err(|e| format!("Failed to flush Textractor stdin: {}", e))?;
            return Ok(());
        }
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
    // 1. Send graceful detach command to target process if active
    let active_pid = {
        let mut p = state.active_pid.lock().unwrap_or_else(|e| e.into_inner());
        p.take()
    };

    if let Some(pid) = active_pid {
        if let Ok(mut s) = state.stdin.lock() {
            if let Some(ref mut stdin) = *s {
                let detach_cmd = format!("detach -P{}\r\n", pid);
                let _ = stdin.write_all(detach_cmd.as_bytes());
                let _ = stdin.flush();
                // Grace period to allow texthook.dll to unload cleanly from target process
                std::thread::sleep(std::time::Duration::from_millis(200));
            }
        }
    }

    // 2. Close stdin handle
    {
        let mut s = state.stdin.lock().unwrap_or_else(|e| e.into_inner());
        *s = None;
    }

    // 3. Terminate child process
    {
        let mut c = state.child.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(mut child) = c.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
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
    let text = line[end_bracket + 1..].trim().to_string();

    let parts: Vec<&str> = header.split(':').collect();
    if parts.is_empty() {
        return None;
    }

    let handle = parts[0].trim().parse::<u32>().unwrap_or(0);
    let mut pid = fallback_pid;
    let mut address = String::new();
    let mut context = String::new();
    let mut context2 = String::new();
    let mut name = format!("Thread #{}", handle);
    let mut hook_code = String::new();

    if parts.len() >= 6 {
        pid = parts[1].trim().parse::<u32>().unwrap_or(fallback_pid);
        address = parts[2].trim().to_string();
        context = parts[3].trim().to_string();
        context2 = parts[4].trim().to_string();
        name = parts[5].trim().to_string();
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

fn chrono_local_time() -> String {
    chrono::Local::now().format("%H:%M:%S").to_string()
}
