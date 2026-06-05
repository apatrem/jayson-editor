//! Tauri application entry point.
//!
//! The full IPC command surface is registered here. Each command corresponds
//! to one entry in `docs/TAURI_IPC.md`. Keep this file thin; command logic
//! belongs in module files under `src-tauri/src/ipc/`.

use tauri::Manager;

#[cfg(target_os = "macos")]
use tauri::menu::MenuItemKind;

mod ipc;
mod lint;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            env_logger::init();
            log::info!("Jayson Editor starting (Tauri {})", tauri::VERSION);

            #[cfg(target_os = "macos")]
            if let (Some(menu), Some(display_name)) = (app.menu(), app.config().product_name.clone())
            {
                if let Ok(items) = menu.items() {
                    if let Some(MenuItemKind::Submenu(app_submenu)) = items.first() {
                        let _ = app_submenu.set_text(&display_name);
                        if let Ok(sub_items) = app_submenu.items() {
                            if let Some(MenuItemKind::Predefined(about)) = sub_items.first() {
                                let _ = about.set_text(format!("About {display_name}"));
                            }
                        }
                    }
                }
            }

            if let Err(error) = ipc::pdf::cleanup_export_temp_dir() {
                log::warn!("failed to clean export temp dir: {error}");
            }

            let _config_dir = app
                .path()
                .app_config_dir()
                .expect("failed to resolve app config dir");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ipc::fs::read_yaml_file,
            ipc::fs::write_yaml_file,
            ipc::fs::read_authored_block_file,
            ipc::fs::write_authored_block_file,
            ipc::fs::read_binary_file,
            ipc::fs::list_directory,
            ipc::fs::file_exists,
            ipc::fs::ensure_directory,
            ipc::fs::move_file,
            ipc::fs::delete_file,
            ipc::keychain::get_secret,
            ipc::keychain::set_secret,
            ipc::keychain::delete_secret,
            ipc::config::read_app_config,
            ipc::config::write_app_config,
            ipc::config::get_config_dir,
            ipc::pdf::export_pdf,
            ipc::authored_block::lint_authored_block,
            ipc::fs::archive_authored_block,
            ipc::fs::restore_authored_block,
            ipc::fs::permanently_delete_authored_block,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
