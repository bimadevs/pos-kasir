use crate::models::{ReceiptData, SaleLineItem, SaleStatus};

pub const ESC_INIT: [u8; 2] = [0x1B, 0x40];
pub const ESC_ALIGN_LEFT: [u8; 3] = [0x1B, 0x61, 0x00];
pub const ESC_ALIGN_CENTER: [u8; 3] = [0x1B, 0x61, 0x01];
pub const ESC_BOLD_ON: [u8; 3] = [0x1B, 0x45, 0x01];
pub const ESC_BOLD_OFF: [u8; 3] = [0x1B, 0x45, 0x00];
pub const GS_PARTIAL_CUT: [u8; 4] = [0x1D, 0x56, 0x42, 0x00];
/// Urutan byte standar ESC/POS untuk memantik Cash Drawer RJ11 (Pin 2, 50ms on, 500ms off).
pub const ESC_KICK_DRAWER: [u8; 5] = [0x1B, 0x70, 0x00, 0x19, 0xFA];

/// Mengonversi lebar kertas (`58` atau `80` mm) ke jumlah kolom karakter Font A standar.
pub fn columns_for_paper_width(paper_width: u16) -> usize {
    if paper_width == 58 {
        32
    } else {
        48
    }
}

/// Memformat bilangan bulat Rupiah dengan pemisah ribuan titik (contoh: `19000` -> `"19.000"`).
pub fn format_rupiah_plain(amount: i64) -> String {
    let is_neg = amount < 0;
    let digits = amount.unsigned_abs().to_string();
    let mut out = String::with_capacity(digits.len() + digits.len() / 3 + 1);
    if is_neg {
        out.push('-');
    }
    for (idx, ch) in digits.chars().enumerate() {
        if idx > 0 && (digits.len() - idx) % 3 == 0 {
            out.push('.');
        }
        out.push(ch);
    }
    out
}

/// Menyusun satu baris dengan teks rata kiri dan rata kanan sesuai lebar kolom kertas (`cols`).
pub fn format_two_column_line(left: &str, right: &str, cols: usize) -> String {
    let left_chars: Vec<char> = left.chars().collect();
    let right_chars: Vec<char> = right.chars().collect();
    if right_chars.len() >= cols {
        return right_chars.into_iter().take(cols).collect();
    }
    let max_left = cols.saturating_sub(right_chars.len() + 1);
    let truncated_left: String = left_chars.into_iter().take(max_left).collect();
    let left_len = truncated_left.chars().count();
    let spaces = cols.saturating_sub(left_len + right_chars.len());
    format!("{}{}{}", truncated_left, " ".repeat(spaces), right)
}

/// Meratakan teks di tengah baris sepanjang `cols` karakter.
pub fn center_line(text: &str, cols: usize) -> String {
    let mut results = Vec::new();
    for line in wrap_text(text, cols) {
        let len = line.chars().count();
        if len >= cols {
            results.push(line);
        } else {
            let left_pad = (cols - len) / 2;
            results.push(format!("{}{}", " ".repeat(left_pad), line));
        }
    }
    results.join("\n")
}

/// Membungkus teks panjang menjadi beberapa baris agar tidak melampaui `cols` karakter.
pub fn wrap_text(text: &str, cols: usize) -> Vec<String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    let mut lines = Vec::new();
    let mut current = String::new();

    for word in trimmed.split_whitespace() {
        let word_len = word.chars().count();
        let curr_len = current.chars().count();
        if curr_len == 0 {
            if word_len <= cols {
                current.push_str(word);
            } else {
                let chars: Vec<char> = word.chars().collect();
                for chunk in chars.chunks(cols) {
                    lines.push(chunk.iter().collect());
                }
            }
        } else if curr_len + 1 + word_len <= cols {
            current.push(' ');
            current.push_str(word);
        } else {
            lines.push(current);
            current = word.chars().take(cols).collect();
        }
    }
    if !current.is_empty() {
        lines.push(current);
    }
    lines
}

fn format_timestamp_short(iso_or_str: &str) -> String {
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(iso_or_str) {
        return dt.format("%d/%m/%Y %H:%M").to_string();
    }
    iso_or_str.chars().take(16).collect()
}

/// Merender representasi teks murni struk thermal (58mm = 32 kolom, 80mm = 48 kolom) untuk pratinjau layar.
pub fn render_receipt_text(receipt: &ReceiptData, paper_width: u16, left_margin_chars: u8) -> String {
    let total_cols = columns_for_paper_width(paper_width);
    let margin_count = (left_margin_chars as usize).min(total_cols.saturating_sub(16));
    let cols = total_cols.saturating_sub(margin_count);
    let margin = " ".repeat(margin_count);
    let divider = "-".repeat(cols);
    let mut lines: Vec<String> = Vec::new();

    // Header Toko (Presisi di tengah)
    for line in wrap_text(&receipt.store_name.to_uppercase(), cols) {
        lines.push(format!("{}{}", margin, center_line(&line, cols)));
    }
    if !receipt.store_address.trim().is_empty() {
        for line in wrap_text(&receipt.store_address, cols) {
            lines.push(format!("{}{}", margin, center_line(&line, cols)));
        }
    }
    if !receipt.store_phone.trim().is_empty() {
        let phone = format!("Telp: {}", receipt.store_phone.trim());
        for line in wrap_text(&phone, cols) {
            lines.push(format!("{}{}", margin, center_line(&line, cols)));
        }
    }
    lines.push(format!("{}{}", margin, divider));

    // Metadata Transaksi (dengan pembungkusan rapi jika teks kasir/no panjang)
    let no_line = format!("No   : {}", receipt.sale.receipt_number);
    for line in wrap_text(&no_line, cols) {
        lines.push(format!("{}{}", margin, line));
    }
    let tgl_line = format!(
        "Tgl  : {}",
        format_timestamp_short(&receipt.sale.created_at)
    );
    for line in wrap_text(&tgl_line, cols) {
        lines.push(format!("{}{}", margin, line));
    }
    let cashier_raw = format!(
        "Kasir: {} ({})",
        receipt.sale.cashier_name_snapshot, receipt.sale.terminal_name
    );
    for line in wrap_text(&cashier_raw, cols) {
        lines.push(format!("{}{}", margin, line));
    }
    lines.push(format!("{}{}", margin, divider));

    // Penanda Cetakan Ulang atau Void
    if receipt.is_reprint {
        lines.push(format!(
            "{}{}",
            margin,
            center_line("*** CETAKAN ULANG ***", cols)
        ));
    }
    if receipt.sale.status == SaleStatus::VOIDED {
        lines.push(format!(
            "{}{}",
            margin,
            center_line("*** TRANSAKSI DIBATALKAN (VOID) ***", cols)
        ));
    }

    // Daftar Line Item
    for item in &receipt.items {
        append_line_item_text(&mut lines, item, cols, &margin);
    }
    lines.push(format!("{}{}", margin, divider));

    // Ringkasan Pembayaran
    lines.push(format!(
        "{}{}",
        margin,
        format_two_column_line(
            "Subtotal",
            &format_rupiah_plain(receipt.sale.subtotal),
            cols,
        )
    ));
    if receipt.sale.discount_total > 0 {
        lines.push(format!(
            "{}{}",
            margin,
            format_two_column_line(
                "Total Diskon",
                &format!("({})", format_rupiah_plain(receipt.sale.discount_total)),
                cols,
            )
        ));
    }
    lines.push(format!(
        "{}{}",
        margin,
        format_two_column_line(
            "TOTAL",
            &format_rupiah_plain(receipt.sale.total_amount),
            cols,
        )
    ));
    lines.push(format!(
        "{}{}",
        margin,
        format_two_column_line(
            "Tunai",
            &format_rupiah_plain(receipt.sale.cash_received),
            cols,
        )
    ));
    lines.push(format!(
        "{}{}",
        margin,
        format_two_column_line(
            "Kembalian",
            &format_rupiah_plain(receipt.sale.change_amount),
            cols,
        )
    ));
    lines.push(format!("{}{}", margin, divider));

    if !receipt.receipt_footer.trim().is_empty() {
        for line in wrap_text(&receipt.receipt_footer, cols) {
            lines.push(format!("{}{}", margin, center_line(&line, cols)));
        }
    }

    lines.join("\n")
}

fn append_line_item_text(
    lines: &mut Vec<String>,
    item: &SaleLineItem,
    cols: usize,
    margin: &str,
) {
    for wrapped in wrap_text(&item.product_name_snapshot, cols) {
        lines.push(format!("{}{}", margin, wrapped));
    }
    let gross_line = item.selling_price_snapshot * item.quantity;
    let qty_price_left = format!(
        "{} {} x {}",
        item.quantity,
        item.unit_snapshot,
        format_rupiah_plain(item.selling_price_snapshot)
    );
    lines.push(format!(
        "{}{}",
        margin,
        format_two_column_line(
            &qty_price_left,
            &format_rupiah_plain(gross_line),
            cols,
        )
    ));

    if item.unit_discount_amount > 0 {
        let total_item_disc = item.unit_discount_amount * item.quantity;
        lines.push(format!(
            "{}{}",
            margin,
            format_two_column_line(
                "  Diskon Produk",
                &format!("({})", format_rupiah_plain(total_item_disc)),
                cols,
            )
        ));
    }
}

/// Merakit barisan byte Raw ESC/POS (`Vec<u8>`) lengkap untuk printer thermal 58mm/80mm & Cash Drawer.
pub fn build_escpos_bytes(
    receipt: &ReceiptData,
    paper_width: u16,
    open_drawer: bool,
    left_margin_chars: u8,
) -> Vec<u8> {
    let total_cols = columns_for_paper_width(paper_width);
    let margin_count = (left_margin_chars as usize).min(total_cols.saturating_sub(16));
    let cols = total_cols.saturating_sub(margin_count);
    let margin = " ".repeat(margin_count);
    let divider = "-".repeat(cols);
    let mut buf: Vec<u8> = Vec::with_capacity(1024);

    // 1. Initialize Printer (ESC @)
    buf.extend_from_slice(&ESC_INIT);

    // 2. Kick Cash Drawer hanya jika diminta dan BUKAN cetakan ulang (FR-VOID-01 & Bagian 6 SYSTEM-DESIGN)
    if open_drawer && !receipt.is_reprint {
        buf.extend_from_slice(&ESC_KICK_DRAWER);
    }

    // 3. Header Identitas Toko
    // Jika margin_count == 0, gunakan ESC_ALIGN_CENTER hardware printer; jika ada margin offset, gunakan teks terpusat rata kiri dengan margin
    if margin_count == 0 {
        buf.extend_from_slice(&ESC_ALIGN_CENTER);
        buf.extend_from_slice(&ESC_BOLD_ON);
        for line in wrap_text(&receipt.store_name.to_uppercase(), cols) {
            buf.extend_from_slice(line.as_bytes());
            buf.push(b'\n');
        }
        buf.extend_from_slice(&ESC_BOLD_OFF);

        if !receipt.store_address.trim().is_empty() {
            for line in wrap_text(&receipt.store_address, cols) {
                buf.extend_from_slice(line.as_bytes());
                buf.push(b'\n');
            }
        }
        if !receipt.store_phone.trim().is_empty() {
            let phone_line = format!("Telp: {}", receipt.store_phone.trim());
            for line in wrap_text(&phone_line, cols) {
                buf.extend_from_slice(line.as_bytes());
                buf.push(b'\n');
            }
        }
        buf.extend_from_slice(&ESC_ALIGN_LEFT);
    } else {
        buf.extend_from_slice(&ESC_ALIGN_LEFT);
        buf.extend_from_slice(&ESC_BOLD_ON);
        for line in wrap_text(&receipt.store_name.to_uppercase(), cols) {
            let centered = format!("{}{}\n", margin, center_line(&line, cols));
            buf.extend_from_slice(centered.as_bytes());
        }
        buf.extend_from_slice(&ESC_BOLD_OFF);

        if !receipt.store_address.trim().is_empty() {
            for line in wrap_text(&receipt.store_address, cols) {
                let centered = format!("{}{}\n", margin, center_line(&line, cols));
                buf.extend_from_slice(centered.as_bytes());
            }
        }
        if !receipt.store_phone.trim().is_empty() {
            let phone_line = format!("Telp: {}", receipt.store_phone.trim());
            for line in wrap_text(&phone_line, cols) {
                let centered = format!("{}{}\n", margin, center_line(&line, cols));
                buf.extend_from_slice(centered.as_bytes());
            }
        }
    }

    // 4. Metadata Struk
    buf.extend_from_slice(format!("{}{}\n", margin, divider).as_bytes());
    let no_line = format!("No   : {}", receipt.sale.receipt_number);
    for line in wrap_text(&no_line, cols) {
        buf.extend_from_slice(format!("{}{}\n", margin, line).as_bytes());
    }
    let tgl_line = format!(
        "Tgl  : {}",
        format_timestamp_short(&receipt.sale.created_at)
    );
    for line in wrap_text(&tgl_line, cols) {
        buf.extend_from_slice(format!("{}{}\n", margin, line).as_bytes());
    }
    let cashier_raw = format!(
        "Kasir: {} ({})",
        receipt.sale.cashier_name_snapshot, receipt.sale.terminal_name
    );
    for line in wrap_text(&cashier_raw, cols) {
        buf.extend_from_slice(format!("{}{}\n", margin, line).as_bytes());
    }
    buf.extend_from_slice(format!("{}{}\n", margin, divider).as_bytes());

    // 5. Penanda Cetakan Ulang atau Void
    if receipt.is_reprint {
        if margin_count == 0 {
            buf.extend_from_slice(&ESC_ALIGN_CENTER);
            buf.extend_from_slice(&ESC_BOLD_ON);
            buf.extend_from_slice(b"*** CETAKAN ULANG ***\n");
            buf.extend_from_slice(&ESC_BOLD_OFF);
            buf.extend_from_slice(&ESC_ALIGN_LEFT);
        } else {
            buf.extend_from_slice(&ESC_BOLD_ON);
            let banner = format!(
                "{}{}\n",
                margin,
                center_line("*** CETAKAN ULANG ***", cols)
            );
            buf.extend_from_slice(banner.as_bytes());
            buf.extend_from_slice(&ESC_BOLD_OFF);
        }
    }
    if receipt.sale.status == SaleStatus::VOIDED {
        if margin_count == 0 {
            buf.extend_from_slice(&ESC_ALIGN_CENTER);
            buf.extend_from_slice(&ESC_BOLD_ON);
            buf.extend_from_slice(b"*** TRANSAKSI DIBATALKAN (VOID) ***\n");
            buf.extend_from_slice(&ESC_BOLD_OFF);
            buf.extend_from_slice(&ESC_ALIGN_LEFT);
        } else {
            buf.extend_from_slice(&ESC_BOLD_ON);
            let banner = format!(
                "{}{}\n",
                margin,
                center_line("*** TRANSAKSI DIBATALKAN (VOID) ***", cols)
            );
            buf.extend_from_slice(banner.as_bytes());
            buf.extend_from_slice(&ESC_BOLD_OFF);
        }
    }

    // 6. Rincian Line Item
    let mut item_lines = Vec::new();
    for item in &receipt.items {
        append_line_item_text(&mut item_lines, item, cols, &margin);
    }
    for line in item_lines {
        buf.extend_from_slice(line.as_bytes());
        buf.push(b'\n');
    }

    buf.extend_from_slice(format!("{}{}\n", margin, divider).as_bytes());

    // 7. Ringkasan Pembayaran
    let subtotal_line = format!(
        "{}{}\n",
        margin,
        format_two_column_line(
            "Subtotal",
            &format_rupiah_plain(receipt.sale.subtotal),
            cols,
        )
    );
    buf.extend_from_slice(subtotal_line.as_bytes());

    if receipt.sale.discount_total > 0 {
        let disc_line = format!(
            "{}{}\n",
            margin,
            format_two_column_line(
                "Total Diskon",
                &format!("({})", format_rupiah_plain(receipt.sale.discount_total)),
                cols,
            )
        );
        buf.extend_from_slice(disc_line.as_bytes());
    }

    buf.extend_from_slice(&ESC_BOLD_ON);
    let total_line = format!(
        "{}{}\n",
        margin,
        format_two_column_line(
            "TOTAL",
            &format_rupiah_plain(receipt.sale.total_amount),
            cols,
        )
    );
    buf.extend_from_slice(total_line.as_bytes());
    buf.extend_from_slice(&ESC_BOLD_OFF);

    let cash_line = format!(
        "{}{}\n",
        margin,
        format_two_column_line(
            "Tunai",
            &format_rupiah_plain(receipt.sale.cash_received),
            cols,
        )
    );
    buf.extend_from_slice(cash_line.as_bytes());

    let change_line = format!(
        "{}{}\n",
        margin,
        format_two_column_line(
            "Kembalian",
            &format_rupiah_plain(receipt.sale.change_amount),
            cols,
        )
    );
    buf.extend_from_slice(change_line.as_bytes());

    buf.extend_from_slice(format!("{}{}\n", margin, divider).as_bytes());

    // 8. Footer Struk
    if !receipt.receipt_footer.trim().is_empty() {
        if margin_count == 0 {
            buf.extend_from_slice(&ESC_ALIGN_CENTER);
            for line in wrap_text(&receipt.receipt_footer, cols) {
                buf.extend_from_slice(line.as_bytes());
                buf.push(b'\n');
            }
            buf.extend_from_slice(&ESC_ALIGN_LEFT);
        } else {
            for line in wrap_text(&receipt.receipt_footer, cols) {
                let centered = format!("{}{}\n", margin, center_line(&line, cols));
                buf.extend_from_slice(centered.as_bytes());
            }
        }
    }

    // 9. Feed 4 baris & Partial Cut (1D 56 42 00)
    buf.extend_from_slice(b"\n\n\n\n");
    buf.extend_from_slice(&GS_PARTIAL_CUT);

    buf
}

/// Menghasilkan urutan byte khusus untuk memantik buka laci uang (Cash Drawer RJ11) tanpa mencetak struk.
pub fn build_drawer_kick_only_bytes() -> Vec<u8> {
    let mut buf = Vec::with_capacity(7);
    buf.extend_from_slice(&ESC_INIT);
    buf.extend_from_slice(&ESC_KICK_DRAWER);
    buf
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{DiscountType, Sale, SaleLineItem, SaleStatus};

    fn sample_receipt(is_reprint: bool) -> ReceiptData {
        ReceiptData {
            store_name: "Toko Maju Jaya".to_string(),
            store_address: "Jl. Merdeka No. 10, Kota".to_string(),
            store_phone: "08123456789".to_string(),
            receipt_footer: "Terima kasih atas kunjungan Anda.".to_string(),
            sale: Sale {
                id: "sale-1".to_string(),
                receipt_number: "INV-20261018-0012".to_string(),
                cashier_id: "usr-1".to_string(),
                cashier_name_snapshot: "Budi".to_string(),
                terminal_name: "Kasir 2".to_string(),
                subtotal: 19_000,
                discount_total: 1_500,
                total_amount: 17_500,
                cash_received: 20_000,
                change_amount: 2_500,
                status: SaleStatus::COMPLETED,
                voided_by_user_id: None,
                voided_by_name_snapshot: None,
                void_reason: None,
                voided_at: None,
                transaction_date: "2026-10-18".to_string(),
                created_at: "2026-10-18T16:05:00+07:00".to_string(),
            },
            items: vec![
                SaleLineItem {
                    id: "li-1".to_string(),
                    sale_id: "sale-1".to_string(),
                    product_id: "p-1".to_string(),
                    sku_snapshot: "SKU-001".to_string(),
                    barcode_snapshot: Some("89910021".to_string()),
                    product_name_snapshot: "Indomie Goreng 85g".to_string(),
                    unit_snapshot: "pcs".to_string(),
                    quantity: 2,
                    cost_price_snapshot: 2_500,
                    selling_price_snapshot: 3_500,
                    discount_type_snapshot: DiscountType::NONE,
                    discount_value_snapshot: 0,
                    unit_discount_amount: 0,
                    subtotal: 7_000,
                },
                SaleLineItem {
                    id: "li-2".to_string(),
                    sale_id: "sale-1".to_string(),
                    product_id: "p-2".to_string(),
                    sku_snapshot: "SKU-002".to_string(),
                    barcode_snapshot: Some("89920044".to_string()),
                    product_name_snapshot: "Aqua Botol 600ml".to_string(),
                    unit_snapshot: "botol".to_string(),
                    quantity: 3,
                    cost_price_snapshot: 2_400,
                    selling_price_snapshot: 4_000,
                    discount_type_snapshot: DiscountType::NOMINAL,
                    discount_value_snapshot: 500,
                    unit_discount_amount: 500,
                    subtotal: 10_500,
                },
            ],
            is_reprint,
        }
    }

    #[test]
    fn test_escpos_58mm_and_80mm_column_formatting() {
        let receipt = sample_receipt(false);
        let text_58 = render_receipt_text(&receipt, 58, 0);
        for line in text_58.lines() {
            assert!(
                line.chars().count() <= 32,
                "Baris 58mm melebihi 32 karakter: '{line}'"
            );
        }
        assert!(text_58.contains("2 pcs x 3.500              7.000"));
        assert!(text_58.contains("  Diskon Produk          (1.500)"));
        assert!(text_58.contains("TOTAL                     17.500"));
        assert!(!text_58.contains("*** CETAKAN ULANG ***"));

        let text_80 = render_receipt_text(&receipt, 80, 0);
        for line in text_80.lines() {
            assert!(
                line.chars().count() <= 48,
                "Baris 80mm melebihi 48 karakter: '{line}'"
            );
        }
        assert!(text_80.contains("------------------------------------------------"));
    }

    #[test]
    fn test_escpos_drawer_kick_and_reprint_behavior() {
        // 1. Transaksi normal dengan open_drawer = true -> wajib memuat byte ESC_KICK_DRAWER (1B 70 00 19 FA)
        let normal = sample_receipt(false);
        let bytes_normal = build_escpos_bytes(&normal, 58, true, 0);
        assert!(bytes_normal
            .windows(ESC_KICK_DRAWER.len())
            .any(|w| w == ESC_KICK_DRAWER));

        // 2. Cetakan ulang (is_reprint = true) meskipun open_drawer = true -> TIDAK BOLEH membuka Cash Drawer
        //    dan WAJIB memuat "*** CETAKAN ULANG ***"
        let reprint = sample_receipt(true);
        let bytes_reprint = build_escpos_bytes(&reprint, 58, true, 0);
        assert!(!bytes_reprint
            .windows(ESC_KICK_DRAWER.len())
            .any(|w| w == ESC_KICK_DRAWER));
        let reprint_str = String::from_utf8_lossy(&bytes_reprint);
        assert!(reprint_str.contains("*** CETAKAN ULANG ***"));
    }

    #[test]
    fn test_escpos_left_margin_and_long_text_wrapping() {
        let mut receipt = sample_receipt(false);
        receipt.store_name = "Supermarket Berkah Abadi Sejahtera Indonesia".to_string();
        receipt.store_address = "Jl. Boulevard Raya Barat Blok AB No. 88, Kelapa Gading".to_string();
        receipt.sale.cashier_name_snapshot = "Ahmad Saifullah Hidayat".to_string();
        receipt.sale.terminal_name = "Terminal Kasir 01".to_string();
        receipt.items.push(SaleLineItem {
            id: "li-3".to_string(),
            sale_id: "sale-1".to_string(),
            product_id: "p-3".to_string(),
            sku_snapshot: "SKU-003".to_string(),
            barcode_snapshot: Some("89930055".to_string()),
            product_name_snapshot: "Minyak Goreng Sawit Bimoli Spesial Pouch 2000ml Kemasan Refill".to_string(),
            unit_snapshot: "pouch".to_string(),
            quantity: 1,
            cost_price_snapshot: 32_000,
            selling_price_snapshot: 38_500,
            discount_type_snapshot: DiscountType::NONE,
            discount_value_snapshot: 0,
            unit_discount_amount: 0,
            subtotal: 38_500,
        });

        // Uji dengan offset margin 2 karakter spasi pada kertas 58mm
        let text_58_margin = render_receipt_text(&receipt, 58, 2);
        for line in text_58_margin.lines() {
            assert!(
                line.chars().count() <= 32,
                "Baris 58mm dengan margin melebihi 32 karakter: '{line}' (len: {})",
                line.chars().count()
            );
            assert!(
                line.starts_with("  "),
                "Baris harus memiliki offset margin 2 spasi: '{line}'"
            );
        }

        // Pastikan nama produk panjang terbungkus rapi tanpa terpotong
        assert!(text_58_margin.contains("Minyak"));
        assert!(text_58_margin.contains("Goreng"));
        assert!(text_58_margin.contains("Bimoli"));

        // Uji byte ESC/POS dengan margin offset
        let escpos_bytes = build_escpos_bytes(&receipt, 58, false, 2);
        assert!(!escpos_bytes.is_empty());
        let escpos_text = String::from_utf8_lossy(&escpos_bytes);
        assert!(escpos_text.contains("Ahmad"));
    }
}
