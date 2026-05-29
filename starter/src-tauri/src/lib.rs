//! Tauri application entry point.
//!
//! The full IPC command surface is registered here. Each command corresponds
//! to one entry in `docs/TAURI_IPC.md`. Keep this file thin; command logic
//! belongs in module files under `src-tauri/src/ipc/`.

use tauri::Manager;

mod ipc;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            env_logger::init();
            log::info!("Jayson Docs starting (Tauri {})", tauri::VERSION);

            let _config_dir = app
                .path()
                .app_config_dir()
                .expect("failed to resolve app config dir");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ipc::fs::read_yaml_file,
            ipc::fs::write_yaml_file,
            ipc::fs::list_directory,
            ipc::fs::file_exists,
            ipc::fs::ensure_directory,
            ipc::fs::move_file,
            ipc::keychain::get_secret,
            ipc::keychain::set_secret,
            ipc::keychain::delete_secret,
            ipc::config::read_app_config,
            ipc::config::write_app_config,
            ipc::config::get_config_dir,
            ipc::pdf::export_pdf,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
