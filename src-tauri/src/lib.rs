pub mod commands;
pub mod config;
pub mod db;
pub mod error;
pub mod hardware;
pub mod lan;
pub mod models;
pub mod services;

use crate::services::dispatcher::BackendDispatcher;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Manager;

#[cfg(desktop)]
fn setup_system_tray(app: &tauri::App) {
    use tauri::{
        menu::{Menu, MenuItem},
        tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    };

    let Ok(open_item) = MenuItem::with_id(app, "open", "Buka Mudita Mart", true, None::<&str>) else {
        return;
    };
    let Ok(quit_item) = MenuItem::with_id(
        app,
        "quit",
        "Matikan Server & Keluar",
        true,
        None::<&str>,
    ) else {
        return;
    };
    let Ok(menu) = Menu::with_items(app, &[&open_item, &quit_item]) else {
        return;
    };

    let mut builder = TrayIconBuilder::new()
        .tooltip("Mudita Mart — Server & Kasir Minimarket")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
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
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    let _ = builder.build(app);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| PathBuf::from("./muditamart_data"));

            let dispatcher = Arc::new(
                BackendDispatcher::new(app_data_dir)
                    .expect("Gagal menginisialisasi BackendDispatcher Mudita Mart"),
            );

            // Jika terminal sudah dikonfigurasi sebagai SERVER, nyalakan Axum LAN HTTP Server otomatis
            if dispatcher.is_server_mode() {
                let disp_clone = dispatcher.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = disp_clone.ensure_lan_server_running().await;
                });
            }

            app.manage(dispatcher);

            #[cfg(desktop)]
            setup_system_tray(app);

            Ok(())
        })
        .on_window_event(|window, event| {
            // Invarian #10 & FR-SETUP-04: Menekan tombol Close (X) pada Server Terminal
            // meminimalkan/menyembunyikan jendela ke Windows System Tray agar koneksi LAN Client tidak putus.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<Arc<BackendDispatcher>>();
                if state.is_server_mode() {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_terminal_status,
            commands::test_client_connection,
            commands::setup_server_terminal,
            commands::setup_client_terminal,
            commands::auth_login,
            commands::auth_logout,
            commands::get_active_session,
            commands::list_products,
            commands::find_product_by_code,
            commands::upsert_product,
            commands::deactivate_product,
            commands::export_products_csv,
            commands::import_products_csv,
            commands::import_products,
            commands::create_stock_adjustment,
            commands::list_stock_adjustments,
            commands::create_sale,
            commands::list_today_sales,
            commands::get_sale_receipt,
            commands::void_sale,
            commands::create_held_bill,
            commands::list_held_bills,
            commands::consume_held_bill,
            commands::delete_held_bill,
            commands::get_sales_report,
            commands::export_sales_report_csv,
            commands::list_users,
            commands::upsert_user,
            commands::get_store_settings,
            commands::update_store_settings,
            commands::list_local_printers,
            commands::update_printer_config,
            commands::print_receipt,
            commands::kick_cash_drawer,
            commands::test_printer_and_drawer,
            commands::backup_database,
            commands::restore_database,
            commands::quit_application,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
