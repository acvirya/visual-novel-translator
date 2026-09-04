mod file_dialogs;
mod free_mt;
mod http;
mod llm;
mod ocr_commands;
mod oneocr;
mod screen_capture;
mod textractor;
mod window_manager;

use textractor::TextractorState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(TextractorState::new())
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { .. } => {
                    if window.label() == "main" {
                        window.app_handle().exit(0);
                    } else if window.label() == "overlay" || window.label() == "region-selector" {
                        if let Some(main) = window.app_handle().get_webview_window("main") {
                            let _ = main.show();
                            let _ = main.set_focus();
                        }
                    }
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            window_manager::get_monitors,
            window_manager::get_window_monitor,
            window_manager::show_overlay,
            window_manager::hide_overlay,
            window_manager::update_overlay_bounds,
            window_manager::set_overlay_click_through,
            window_manager::set_overlay_edit_mode,
            window_manager::open_region_selector_overlay,
            window_manager::close_region_selector_overlay,
            textractor::list_target_processes,
            textractor::start_textractor,
            textractor::send_textractor_command,
            textractor::stop_textractor,
            textractor::find_textractor_installation,
            ocr_commands::detect_oneocr_path,
            ocr_commands::capture_regions_preview,
            ocr_commands::run_oneocr_scan,
            free_mt::translate_free_mt,
            file_dialogs::show_save_script_dialog,
            file_dialogs::show_open_script_dialog,
            file_dialogs::save_script_file,
            file_dialogs::read_script_file_by_path,
            file_dialogs::show_pick_files_dialog,
            file_dialogs::show_pick_directory_dialog,
            file_dialogs::append_debug_log,
            file_dialogs::open_file_in_default_app,
            llm::openrouter_chat_completion,
            llm::openrouter_stream_chat_completion,
            llm::llm_chat_completion,
            llm::llm_stream_chat_completion,
            llm::test_llm_connection,
            llm::cancel_all_llm_streams,
            llm::cancel_llm_stream,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                let state = app_handle.state::<TextractorState>();
                textractor::stop_textractor_internal(&state);
            }
        });
}
