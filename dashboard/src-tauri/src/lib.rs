use std::sync::{Arc, Mutex};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

// Holds the PID of the spawned Node backend so we can kill it on exit
type BackendChild = Arc<Mutex<Option<std::process::Child>>>;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let backend_child: BackendChild = Arc::new(Mutex::new(None));
    let backend_child_clone = backend_child.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .setup(move |app| {
            // ── Spawn Node backend ────────────────────────────────────
            // Resolve backend entry dynamically.
            let resource_dir = app.path().resource_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
            let exe_dir = std::env::current_exe()
                .map(|p| p.parent().unwrap_or(std::path::Path::new(".")).to_path_buf())
                .unwrap_or_else(|_| std::path::PathBuf::from("."));

            let candidates = vec![
                // 1. Production bundle (bundled via tauri.conf.json resources array)
                resource_dir.join("backend/dist/index.js"),
                // 2. Local dev mode (relative to cargo target dir)
                exe_dir.join("../../../../backend/dist/index.js"),
            ];

            let backend_path = candidates.into_iter().find(|p| p.exists());

            if let Some(path) = backend_path {
                let backend_cwd = path.parent().unwrap().parent().unwrap();
                log::info!("Starting ArcRift backend from: {:?} with CWD: {:?}", path, backend_cwd);
                
                let mut cmd = std::process::Command::new("node");
                cmd.arg(&path);
                cmd.current_dir(backend_cwd);

                // Secure AppData storage for the SQLite database
                if let Ok(app_data_dir) = app.path().app_data_dir() {
                    let db_path = app_data_dir.join("ArcRift.db");
                    log::info!("Setting SQLITE_DB_PATH to: {:?}", db_path);
                    cmd.env("SQLITE_DB_PATH", db_path.to_str().unwrap());
                }

                // Suppress console window on Windows release builds
                #[cfg(target_os = "windows")]
                cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

                match cmd.spawn() {
                    Ok(child) => {
                        log::info!("Backend started with PID: {}", child.id());
                        *backend_child_clone.lock().unwrap() = Some(child);
                    }
                    Err(e) => {
                        log::error!("Failed to start Node backend: {}. Is Node.js installed?", e);
                    }
                }
            } else {
                log::warn!("Backend not found — run 'npm run build' in /backend first.");
            }

            // ── System Tray ──────────────────────────────────────────
            let show_item = MenuItem::with_id(app, "show", "Show Dashboard", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit ArcRift", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("ArcRift — AI Memory Layer")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        // Minimize to tray on window close instead of quitting
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                window.hide().unwrap();
                api.prevent_close();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(move |_app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                if let Ok(mut guard) = backend_child.lock() {
                    if let Some(mut child) = guard.take() {
                        log::info!("Shutting down ArcRift backend (PID: {})", child.id());
                        let _ = child.kill();
                    }
                }
            }
        });
}
