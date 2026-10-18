use crate::config::{PrinterConfig, VIRTUAL_PRINTER_NAME};
#[cfg(target_os = "windows")]
use crate::error::AppError;
use crate::error::AppResult;
use crate::hardware::escpos::{
    build_drawer_kick_only_bytes, build_escpos_bytes, render_receipt_text,
};
use crate::models::{PrintOutcome, ReceiptData};
use std::fs;
use std::path::Path;

/// Mengembalikan daftar printer lokal yang tersedia di komputer ini (selalu menyertakan Virtual Thermal Printer).
pub fn list_local_printers() -> Vec<String> {
    #[allow(unused_mut)]
    let mut printers = vec![VIRTUAL_PRINTER_NAME.to_string()];

    #[cfg(target_os = "windows")]
    {
        for name in enumerate_windows_printers() {
            if !printers.iter().any(|p| p.eq_ignore_ascii_case(&name)) {
                printers.push(name);
            }
        }
    }

    printers
}

/// Mencetak struk (`ReceiptData`) ke printer lokal atau Virtual Thermal Printer.
pub fn print_receipt_local(
    app_data_dir: &Path,
    printer_cfg: &PrinterConfig,
    receipt: &ReceiptData,
) -> AppResult<PrintOutcome> {
    let paper_width = if printer_cfg.paper_width == 58 { 58 } else { 80 };
    let open_drawer = printer_cfg.auto_open_drawer && !receipt.is_reprint;
    let rendered_text = render_receipt_text(receipt, paper_width);
    let raw_bytes = build_escpos_bytes(receipt, paper_width, open_drawer);

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
        simulated,
        drawer_kicked: open_drawer,
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
fn enumerate_windows_printers() -> Vec<String> {
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::Graphics::Printing::{
        EnumPrintersW, PRINTER_ENUM_CONNECTIONS, PRINTER_ENUM_LOCAL, PRINTER_INFO_4W,
    };

    let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
    let mut bytes_needed: u32 = 0;
    let mut count_returned: u32 = 0;

    unsafe {
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
        let mut names = Vec::with_capacity(count_returned as usize);
        for info in info_slice {
            if !info.pPrinterName.is_null() {
                let mut len = 0usize;
                while *info.pPrinterName.add(len) != 0 {
                    len += 1;
                }
                let wide = std::slice::from_raw_parts(info.pPrinterName, len);
                if let Ok(name) = String::from_utf16(wide) {
                    if !name.trim().is_empty() {
                        names.push(name);
                    }
                }
            }
        }
        names
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
    let mut doc_name_wide = to_wide_null("POS-Kasir Raw ESC/POS Receipt");
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
