// Prevent the additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    jayson_editor_lib::run();
}
