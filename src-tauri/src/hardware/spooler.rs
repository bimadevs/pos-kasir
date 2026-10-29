use crate::config::{PrinterConfig, VIRTUAL_PRINTER_NAME};
#[cfg(target_os = "windows")]
use crate::error::AppError;
use crate::error::AppResult;
use crate::hardware::escpos::{
    build_drawer_kick_only_bytes, build_escpos_bytes, build_shift_report_escpos_bytes,
    render_receipt_text, render_shift_report_text,
};
use crate::models::{LocalPrinterInfo, PrintOutcome, ReceiptData, ShiftReportData};
use std::fs;
use std::path::Path;

/// Mengembalikan daftar informasi detail printer lokal beserta status Online/Offline, Port, dan Default Windows.
pub fn list_local_printer_details() -> Vec<LocalPrinterInfo> {
    #[allow(unused_mut)]
    let mut printers = vec![LocalPrinterInfo {
        name: VIRTUAL_PRINTER_NAME.to_string(),
        port_name: Some("SIMULASI".to_string()),
        driver_name: Some("Mudita Mart ESC/POS Simulator".to_string()),
        is_online: true,
        is_default: false,
        is_virtual: true,
        status_label: "Siap (Simulasi Layar)".to_string(),
    }];

    #[cfg(target_os = "windows")]
    {
        for info in enumerate_windows_printer_details() {
            if !printers
                .iter()
                .any(|p| p.name.eq_ignore_ascii_case(&info.name))
            {
                printers.push(info);
            }
        }
    }

    printers
}

/// Mengembalikan daftar nama printer lokal yang tersedia di komputer ini (selalu menyertakan Virtual Thermal Printer).
pub fn list_local_printers() -> Vec<String> {
    list_local_printer_details()
        .into_iter()
        .map(|p| p.name)
        .collect()
}

/// Mencetak struk (`ReceiptData`) ke printer lokal atau Virtual Thermal Printer.
pub fn print_receipt_local(
    app_data_dir: &Path,
    printer_cfg: &PrinterConfig,
    receipt: &ReceiptData,
) -> AppResult<PrintOutcome> {
    let paper_width = if printer_cfg.paper_width == 58 { 58 } else { 80 };
    let left_margin_chars = printer_cfg.left_margin_chars;
    let open_drawer = printer_cfg.auto_open_drawer && !receipt.is_reprint;
    let rendered_text = render_receipt_text(receipt, paper_width, left_margin_chars);
    let raw_bytes = build_escpos_bytes(receipt, paper_width, open_drawer, left_margin_chars);

    // Simpan salinan byte ESC/POS dan teks struk terakhir ke app_data_dir untuk audit/diagnostik
    let _ = fs::create_dir_all(app_data_dir);
    let _ = fs::write(app_data_dir.join("last_receipt.bin"), &raw_bytes);
    let _ = fs::write(app_data_dir.join("last_receipt.txt"), &rendered_text);

    let printer_name = printer_cfg.printer_name.trim();
    let is_virtual = printer_name.is_empty() || printer_name == VIRTUAL_PRINTER_NAME;

    let simulated = if is_virtual {
        true
    } else {
        send_raw_bytes_os(printer_name, &raw_bytes)?
    };

    Ok(PrintOutcome {
        printer_name: if printer_name.is_empty() {
            VIRTUAL_PRINTER_NAME.to_string()
        } else {
            printer_name.to_string()
        },
        paper_width,
        left_margin_chars,
        simulated,
        drawer_kicked: open_drawer,
        bytes_written: raw_bytes.len(),
        rendered_text,
        show_preview_modal: printer_cfg.preview_on_screen || simulated,
    })
}

/// Mencetak laporan shift kasir (X-Report atau Z-Report) ke printer lokal atau Virtual Thermal Printer.
pub fn print_shift_report_local(
    app_data_dir: &Path,
    printer_cfg: &PrinterConfig,
    report: &ShiftReportData,
) -> AppResult<PrintOutcome> {
    let paper_width = if printer_cfg.paper_width == 58 { 58 } else { 80 };
    let left_margin_chars = printer_cfg.left_margin_chars;
    let rendered_text = render_shift_report_text(report, paper_width, left_margin_chars);
    let raw_bytes = build_shift_report_escpos_bytes(report, paper_width, left_margin_chars);
    let is_z = report.shift.status == "CLOSED";

    // Simpan salinan byte ESC/POS dan teks laporan shift terakhir untuk audit/diagnostik
    let _ = fs::create_dir_all(app_data_dir);
    let _ = fs::write(app_data_dir.join("last_shift_report.bin"), &raw_bytes);
    let _ = fs::write(app_data_dir.join("last_shift_report.txt"), &rendered_text);

    let printer_name = printer_cfg.printer_name.trim();
    let is_virtual = printer_name.is_empty() || printer_name == VIRTUAL_PRINTER_NAME;

    let simulated = if is_virtual {
        true
    } else {
        send_raw_bytes_os(printer_name, &raw_bytes)?
    };

    Ok(PrintOutcome {
        printer_name: if printer_name.is_empty() {
            VIRTUAL_PRINTER_NAME.to_string()
        } else {
            printer_name.to_string()
        },
        paper_width,
        left_margin_chars,
        simulated,
        drawer_kicked: is_z,
        bytes_written: raw_bytes.len(),
        rendered_text,
        show_preview_modal: printer_cfg.preview_on_screen || simulated,
    })
}

/// Memantik pembukaan Cash Drawer RJ11 secara langsung melalui printer lokal.
pub fn kick_drawer_local(app_data_dir: &Path, printer_cfg: &PrinterConfig) -> AppResult<PrintOutcome> {
    let raw_bytes = build_drawer_kick_only_bytes();
    let _ = fs::create_dir_all(app_data_dir);
    let _ = fs::write(app_data_dir.join("last_drawer_kick.bin"), &raw_bytes);

    let printer_name = printer_cfg.printer_name.trim();
    let is_virtual = printer_name.is_empty() || printer_name == VIRTUAL_PRINTER_NAME;

    let simulated = if is_virtual {
        true
    } else {
        send_raw_bytes_os(printer_name, &raw_bytes)?
    };

    Ok(PrintOutcome {
        printer_name: if printer_name.is_empty() {
            VIRTUAL_PRINTER_NAME.to_string()
        } else {
            printer_name.to_string()
        },
        paper_width: printer_cfg.paper_width,
        left_margin_chars: printer_cfg.left_margin_chars,
        simulated,
        drawer_kicked: true,
        bytes_written: raw_bytes.len(),
        rendered_text: "[SINYAL RJ11 DIKIRIM: CASH DRAWER TERBUKA (1B 70 00 19 FA)]".to_string(),
        show_preview_modal: false,
    })
}

#[cfg(not(target_os = "windows"))]
fn send_raw_bytes_os(_printer_name: &str, _raw_bytes: &[u8]) -> AppResult<bool> {
    // Pada lingkungan pengembangan non-Windows (Linux/macOS), gunakan mode simulasi
    Ok(true)
}

#[cfg(target_os = "windows")]
unsafe fn read_pwstr(ptr: *const u16) -> Option<String> {
    if ptr.is_null() {
        return None;
    }
    let mut len = 0usize;
    while unsafe { *ptr.add(len) } != 0 {
        len += 1;
    }
    let wide = unsafe { std::slice::from_raw_parts(ptr, len) };
    String::from_utf16(wide)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

#[cfg(target_os = "windows")]
fn get_default_windows_printer() -> Option<String> {
    use std::ptr::null_mut;
    use windows_sys::Win32::Graphics::Printing::GetDefaultPrinterW;

    unsafe {
        let mut cch: u32 = 0;
        let _ = GetDefaultPrinterW(null_mut(), &mut cch);
        if cch == 0 {
            return None;
        }
        let mut buf: Vec<u16> = vec![0u16; cch as usize];
        let ok = GetDefaultPrinterW(buf.as_mut_ptr(), &mut cch);
        if ok == 0 {
            return None;
        }
        read_pwstr(buf.as_ptr())
    }
}

#[cfg(target_os = "windows")]
fn is_builtin_virtual_doc_printer(name: &str, port: Option<&str>) -> bool {
    let lower_name = name.to_ascii_lowercase();
    if lower_name.contains("print to pdf")
        || lower_name.contains("xps document writer")
        || lower_name.contains("onenote")
        || lower_name == "fax"
    {
        return true;
    }
    if let Some(p) = port {
        let lower_port = p.to_ascii_lowercase();
        if lower_port.starts_with("portprompt")
            || lower_port.starts_with("shrfax")
            || lower_port.starts_with("nul:")
        {
            return true;
        }
    }
    false
}

#[cfg(target_os = "windows")]
fn enumerate_windows_printer_details() -> Vec<LocalPrinterInfo> {
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::Graphics::Printing::{
        EnumPrintersW, PRINTER_ATTRIBUTE_DEFAULT, PRINTER_ATTRIBUTE_WORK_OFFLINE,
        PRINTER_ENUM_CONNECTIONS, PRINTER_ENUM_LOCAL, PRINTER_INFO_2W, PRINTER_INFO_4W,
        PRINTER_STATUS_DOOR_OPEN, PRINTER_STATUS_ERROR, PRINTER_STATUS_NOT_AVAILABLE,
        PRINTER_STATUS_OFFLINE, PRINTER_STATUS_PAPER_JAM, PRINTER_STATUS_PAPER_OUT,
        PRINTER_STATUS_PAUSED, PRINTER_STATUS_PENDING_DELETION, PRINTER_STATUS_SERVER_OFFLINE,
    };

    let default_printer = get_default_windows_printer();
    let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
    let mut bytes_needed: u32 = 0;
    let mut count_returned: u32 = 0;

    // 1. Utamakan EnumPrintersW Level 2 (PRINTER_INFO_2W) untuk mendapatkan Port, Driver, Attributes, dan Status
    unsafe {
        let _ = EnumPrintersW(
            flags,
            null(),
            2,
            null_mut(),
            0,
            &mut bytes_needed,
            &mut count_returned,
        );
        if bytes_needed > 0 {
            let mut buffer: Vec<u8> = vec![0u8; bytes_needed as usize];
            let ok = EnumPrintersW(
                flags,
                null(),
                2,
                buffer.as_mut_ptr(),
                bytes_needed,
                &mut bytes_needed,
                &mut count_returned,
            );
            if ok != 0 && count_returned > 0 {
                let info_slice = std::slice::from_raw_parts(
                    buffer.as_ptr() as *const PRINTER_INFO_2W,
                    count_returned as usize,
                );
                let mut list = Vec::with_capacity(count_returned as usize);
                for info in info_slice {
                    let Some(name) = read_pwstr(info.pPrinterName) else {
                        continue;
                    };
                    let port_name = read_pwstr(info.pPortName);
                    let driver_name = read_pwstr(info.pDriverName);
                    let is_default = (info.Attributes & PRINTER_ATTRIBUTE_DEFAULT) != 0
                        || default_printer
                            .as_deref()
                            .map(|d| d.eq_ignore_ascii_case(&name))
                            .unwrap_or(false);
                    let is_virtual = is_builtin_virtual_doc_printer(&name, port_name.as_deref());

                    let work_offline = (info.Attributes & PRINTER_ATTRIBUTE_WORK_OFFLINE) != 0;
                    let status_offline = (info.Status
                        & (PRINTER_STATUS_OFFLINE
                            | PRINTER_STATUS_NOT_AVAILABLE
                            | PRINTER_STATUS_SERVER_OFFLINE
                            | PRINTER_STATUS_PENDING_DELETION))
                        != 0;

                    let (is_online, status_label) = if work_offline || status_offline {
                        (false, "Offline / Mati".to_string())
                    } else if (info.Status & PRINTER_STATUS_PAPER_OUT) != 0 {
                        (false, "Kertas Habis".to_string())
                    } else if (info.Status & PRINTER_STATUS_PAPER_JAM) != 0 {
                        (false, "Kertas Macet".to_string())
                    } else if (info.Status & PRINTER_STATUS_DOOR_OPEN) != 0 {
                        (false, "Penutup Terbuka".to_string())
                    } else if (info.Status & PRINTER_STATUS_ERROR) != 0 {
                        (false, "Error Printer".to_string())
                    } else if (info.Status & PRINTER_STATUS_PAUSED) != 0 {
                        (true, "Antrean Dijeda".to_string())
                    } else if is_virtual {
                        (true, "Virtual Dokumen Windows".to_string())
                    } else {
                        (true, "Siap / Online".to_string())
                    };

                    list.push(LocalPrinterInfo {
                        name,
                        port_name,
                        driver_name,
                        is_online,
                        is_default,
                        is_virtual,
                        status_label,
                    });
                }

                // Urutkan agar printer hardware yang Online berada di urutan atas sebelum printer Offline / Virtual Dokumen
                list.sort_by_key(|p| {
                    (
                        if p.is_online && !p.is_virtual {
                            0
                        } else if p.is_online {
                            1
                        } else {
                            2
                        },
                        if p.is_default { 0 } else { 1 },
                        p.name.to_ascii_lowercase(),
                    )
                });
                return list;
            }
        }

        // 2. Fallback ke Level 4 (PRINTER_INFO_4W) apabila Level 2 gagal
        bytes_needed = 0;
        count_returned = 0;
        let _ = EnumPrintersW(
            flags,
            null(),
            4,
            null_mut(),
            0,
            &mut bytes_needed,
            &mut count_returned,
        );
        if bytes_needed == 0 {
            return Vec::new();
        }

        let mut buffer: Vec<u8> = vec![0u8; bytes_needed as usize];
        let ok = EnumPrintersW(
            flags,
            null(),
            4,
            buffer.as_mut_ptr(),
            bytes_needed,
            &mut bytes_needed,
            &mut count_returned,
        );
        if ok == 0 || count_returned == 0 {
            return Vec::new();
        }

        let info_slice = std::slice::from_raw_parts(
            buffer.as_ptr() as *const PRINTER_INFO_4W,
            count_returned as usize,
        );
        let mut list = Vec::with_capacity(count_returned as usize);
        for info in info_slice {
            if let Some(name) = read_pwstr(info.pPrinterName) {
                let work_offline = (info.Attributes & PRINTER_ATTRIBUTE_WORK_OFFLINE) != 0;
                let is_default = (info.Attributes & PRINTER_ATTRIBUTE_DEFAULT) != 0
                    || default_printer
                        .as_deref()
                        .map(|d| d.eq_ignore_ascii_case(&name))
                        .unwrap_or(false);
                let is_virtual = is_builtin_virtual_doc_printer(&name, None);
                list.push(LocalPrinterInfo {
                    name,
                    port_name: None,
                    driver_name: None,
                    is_online: !work_offline,
                    is_default,
                    is_virtual,
                    status_label: if work_offline {
                        "Offline / Mati".to_string()
                    } else if is_virtual {
                        "Virtual Dokumen Windows".to_string()
                    } else {
                        "Siap / Online".to_string()
                    },
                });
            }
        }
        list
    }
}

#[cfg(target_os = "windows")]
fn to_wide_null(s: &str) -> Vec<u16> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
}

#[cfg(target_os = "windows")]
fn send_raw_bytes_os(printer_name: &str, raw_bytes: &[u8]) -> AppResult<bool> {
    use std::ffi::c_void;
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::Graphics::Printing::{
        ClosePrinter, EndDocPrinter, EndPagePrinter, OpenPrinterW, StartDocPrinterW,
        StartPagePrinter, WritePrinter, DOC_INFO_1W,
    };

    let mut printer_wide = to_wide_null(printer_name);
    let mut doc_name_wide = to_wide_null("Mudita Mart Raw ESC/POS Receipt");
    let mut data_type_wide = to_wide_null("RAW");

    unsafe {
        let mut h_printer: *mut c_void = null_mut();
        let opened = OpenPrinterW(printer_wide.as_mut_ptr(), &mut h_printer, null());
        if opened == 0 || h_printer.is_null() {
            return Err(AppError::Hardware(format!(
                "Gagal membuka printer Windows '{printer_name}'. Pastikan printer menyala dan terhubung."
            )));
        }

        let doc_info = DOC_INFO_1W {
            pDocName: doc_name_wide.as_mut_ptr(),
            pOutputFile: null_mut(),
            pDatatype: data_type_wide.as_mut_ptr(),
        };

        let job_id = StartDocPrinterW(h_printer, 1, &doc_info);
        if job_id == 0 {
            let _ = ClosePrinter(h_printer);
            return Err(AppError::Hardware(format!(
                "Gagal memulai dokumen RAW pada printer '{printer_name}'."
            )));
        }

        if StartPagePrinter(h_printer) == 0 {
            let _ = EndDocPrinter(h_printer);
            let _ = ClosePrinter(h_printer);
            return Err(AppError::Hardware(format!(
                "Gagal memulai halaman cetak pada printer '{printer_name}'."
            )));
        }

        let mut bytes_written: u32 = 0;
        let write_ok = WritePrinter(
            h_printer,
            raw_bytes.as_ptr() as *const c_void,
            raw_bytes.len() as u32,
            &mut bytes_written,
        );

        let _ = EndPagePrinter(h_printer);
        let _ = EndDocPrinter(h_printer);
        let _ = ClosePrinter(h_printer);

        if write_ok == 0 || (bytes_written as usize) != raw_bytes.len() {
            return Err(AppError::Hardware(format!(
                "Gagal mengirim seluruh byte ESC/POS ke printer '{printer_name}' (terkirim: {bytes_written}/{} byte).",
                raw_bytes.len()
            )));
        }
    }

    Ok(false)
}
