use crate::error::{AppError, AppResult};
use crate::lan::middleware::{HEADER_PAIRING_CODE, HEADER_SESSION_TOKEN, HEADER_TERMINAL_NAME};
use crate::lan::server::{CsvPayload, ImportProductsPayload};
use crate::models::{
    AuthSession, CancelOpnameSessionRequest, CashMovement, CashMovementRequest, CashierShift,
    CloseShiftRequest, CommitOpnameSessionRequest, CreateHeldBillRequest,
    CreateOpnameSessionRequest, CreateSaleRequest, CreateStockAdjustmentRequest, CsvImportResult,
    HealthCheckResponse, HeldBill, ImportProductsResult, LoginRequest, OpenShiftRequest,
    OpnameSessionDetail, Product, ProductFilter, ProductImportRow, ProductPriceTier,
    RecalledHeldBill, ReceiptData, RecordOpnameScanRequest, SaleWithItems, SalesReport,
    SalesReportFilter, SetPriceTiersRequest, ShiftReportData, StockAdjustment, StockOpnameItem,
    StockOpnameSession, StoreSettings, UpdateOpnameItemQtyRequest, UpdateStoreSettingsRequest,
    UpsertProductRequest, UpsertUserRequest, User, VoidSaleRequest,
};
use reqwest::{Client, Method, RequestBuilder, Response};
use serde::de::DeserializeOwned;
use std::time::Duration;

/// Membersihkan alamat IP server dari prefiks `http://` / `https://`, trailing slash,
/// dan mengekstrak port jika pengguna tidak sengaja memasukkan `IP:PORT` ke dalam kolom input IP.
pub fn sanitize_server_ip_and_port(ip: &str, port: u16) -> (String, u16) {
    let mut s = ip.trim().to_string();
    if s.to_ascii_lowercase().starts_with("http://") {
        s = s[7..].to_string();
    } else if s.to_ascii_lowercase().starts_with("https://") {
        s = s[8..].to_string();
    }
    if let Some(idx) = s.find('/') {
        s = s[..idx].to_string();
    }
    let mut effective_port = port;
    if let Some((host, p)) = s.split_once(':') {
        if let Ok(parsed_port) = p.parse::<u16>() {
            effective_port = parsed_port;
        }
        s = host.to_string();
    }
    (s.trim().to_string(), effective_port)
}

/// Memastikan nilai header hanya berisi karakter ASCII yang diizinkan (RFC 7230/9110),
/// menggantikan karakter non-ASCII (seperti em-dash, kurung kurawal, atau aksen) agar
/// pembentukan HTTP HeaderValue pada reqwest tidak pernah gagal (builder error).
pub fn safe_header_value(val: &str) -> String {
    val.chars()
        .map(|c| if c.is_ascii() && !c.is_ascii_control() { c } else { '_' })
        .collect()
}

#[derive(Clone)]
pub struct RemoteHttpClient {
    http: Client,
    health_http: Client,
    pub base_url: String,
    pub pairing_code: String,
    pub terminal_name: String,
}

impl RemoteHttpClient {
    pub fn new(
        server_ip: &str,
        server_port: u16,
        pairing_code: &str,
        terminal_name: &str,
    ) -> Self {
        let (clean_ip, clean_port) = sanitize_server_ip_and_port(server_ip, server_port);

        // Client HTTP utama untuk seluruh transaksi domain LAN:
        // 1. .no_proxy() wajib: jangan pernah merutekan trafik lokal LAN melalui proxy sistem Windows / sekolah.
        // 2. .timeout(30s) + .connect_timeout(10s): hindari false-positive timeout pada PC sekolah berkecepatan rendah.
        // 3. .tcp_keepalive(30s) + .pool_idle_timeout(15s): pertahankan koneksi soket TCP agar tidak diputus diam-diam oleh router/switch.
        // 4. .tcp_nodelay(true): pengiriman paket instan tanpa penundaan algoritma Nagle.
        // 5. .http1_only(): Axum LAN berjalan pada HTTP/1.1 murni tanpa overhead negosiasi ALPN/HTTP2.
        let http = Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(10))
            .tcp_keepalive(Duration::from_secs(30))
            .pool_idle_timeout(Duration::from_secs(15))
            .pool_max_idle_per_host(10)
            .tcp_nodelay(true)
            .http1_only()
            .build()
            .unwrap_or_default();

        let health_http = Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(5))
            .connect_timeout(Duration::from_secs(3))
            .tcp_nodelay(true)
            .http1_only()
            .build()
            .unwrap_or_default();

        let base_url = format!("http://{}:{}", clean_ip, clean_port);

        Self {
            http,
            health_http,
            base_url,
            pairing_code: safe_header_value(pairing_code.trim()),
            terminal_name: safe_header_value(terminal_name.trim()),
        }
    }

    fn request(&self, method: Method, path: &str, session_token: Option<&str>) -> RequestBuilder {
        let url = format!("{}{}", self.base_url, path);
        let mut req = self
            .http
            .request(method, url)
            .header(HEADER_PAIRING_CODE, &self.pairing_code)
            .header(HEADER_TERMINAL_NAME, &self.terminal_name);
        if let Some(tok) = session_token {
            req = req.header(HEADER_SESSION_TOKEN, safe_header_value(tok.trim()));
        }
        req
    }

    async fn parse_response<T: DeserializeOwned>(resp: Response) -> AppResult<T> {
        let status = resp.status();
        let bytes = resp.bytes().await?;
        if status.is_success() {
            serde_json::from_slice::<T>(&bytes).map_err(Into::into)
        } else if let Ok(app_err) = serde_json::from_slice::<AppError>(&bytes) {
            Err(app_err)
        } else {
            let text = String::from_utf8_lossy(&bytes).to_string();
            Err(AppError::Network(format!(
                "Server mengembalikan HTTP {}: {}",
                status.as_u16(),
                text
            )))
        }
    }

    pub async fn health_check(&self) -> AppResult<HealthCheckResponse> {
        let url = format!("{}/api/v1/health", self.base_url);
        let resp = self
            .health_http
            .get(url)
            .header(HEADER_PAIRING_CODE, &self.pairing_code)
            .header(HEADER_TERMINAL_NAME, &self.terminal_name)
            .send()
            .await?;
        Self::parse_response(resp).await
    }

    pub async fn login(&self, req: &LoginRequest) -> AppResult<AuthSession> {
        let resp = self
            .request(Method::POST, "/api/v1/auth/login", None)
            .json(req)
            .send()
            .await?;
        Self::parse_response(resp).await
    }

    pub async fn logout(&self, token: &str) -> AppResult<()> {
        let resp = self
            .request(Method::POST, "/api/v1/auth/logout", Some(token))
            .send()
            .await?;
        let _: serde_json::Value = Self::parse_response(resp).await?;
        Ok(())
    }

    pub async fn get_me(&self, token: &str) -> AppResult<User> {
        let resp = self
            .request(Method::GET, "/api/v1/auth/me", Some(token))
            .send()
            .await?;
        Self::parse_response(resp).await
    }

    pub async fn list_products(
        &self,
        token: &str,
        filter: &ProductFilter,
    ) -> AppResult<Vec<Product>> {
        let resp = self
            .request(Method::GET, "/api/v1/products", Some(token))
            .query(filter)
            .send()
            .await?;
        Self::parse_response(resp).await
    }

    pub async fn find_product_by_code(&self, token: &str, code: &str) -> AppResult<Product> {
        let resp = self
            .request(Method::GET, "/api/v1/products/lookup", Some(token))
            .query(&[("code", code)])
            .send()
            .await?;
        Self::parse_response(resp).await
    }

    pub async fn upsert_product(
        &self,
        token: &str,
        req: &UpsertProductRequest,
    ) -> AppResult<Product> {
        let resp = self
            .request(Method::POST, "/api/v1/products", Some(token))
            .json(req)
            .send()
            .await?;
        Self::parse_response(resp).await
    }

    pub async fn deactivate_product(&self, token: &str, product_id: &str) -> AppResult<()> {
        let path = format!("/api/v1/products/{product_id}");
        let resp = self.request(Method::DELETE, &path, Some(token)).send().await?;
        let _: serde_json::Value = Self::parse_response(resp).await?;
        Ok(())
    }

    pub async fn export_products_csv(&self, token: &str) -> AppResult<String> {
        let resp = self
            .request(Method::GET, "/api/v1/products/csv", Some(token))
            .send()
            .await?;
        let payload: CsvPayload = Self::parse_response(resp).await?;
        Ok(payload.csv_content)
    }

    pub async fn import_products_csv(
        &self,
        token: &str,
        csv_content: &str,
    ) -> AppResult<CsvImportResult> {
        let resp = self
            .request(Method::POST, "/api/v1/products/csv", Some(token))
            .json(&CsvPayload {
                csv_content: csv_content.to_string(),
            })
            .send()
            .await?;
        Self::parse_response(resp).await
    }

    pub async fn import_products(
        &self,
        token: &str,
        rows: &[ProductImportRow],
    ) -> AppResult<ImportProductsResult> {
        let resp = self
            .request(Method::POST, "/api/v1/products/import", Some(token))
            .json(&ImportProductsPayload {
                rows: rows.to_vec(),
            })
            .send()
            .await?;
        Self::parse_response(resp).await
    }

    pub async fn create_stock_adjustment(
        &self,
        token: &str,
        req: &CreateStockAdjustmentRequest,
    ) -> AppResult<StockAdjustment> {
        let resp = self
            .request(Method::POST, "/api/v1/stock-adjustments", Some(token))
            .json(req)
            .send()
            .await?;
        Self::parse_response(resp).await
    }

    pub async fn list_stock_adjustments(
        &self,
        token: &str,
        product_id: Option<&str>,
    ) -> AppResult<Vec<StockAdjustment>> {
        let mut req = self.request(Method::GET, "/api/v1/stock-adjustments", Some(token));
        if let Some(pid) = product_id {
            req = req.query(&[("product_id", pid)]);
        }
        let resp = req.send().await?;
        Self::parse_response(resp).await
    }

    pub async fn create_sale(
        &self,
        token: &str,
        req: &CreateSaleRequest,
    ) -> AppResult<ReceiptData> {
        let resp = self
            .request(Method::POST, "/api/v1/sales", Some(token))
            .json(req)
            .send()
            .await?;
        Self::parse_response(resp).await
    }

    pub async fn list_today_sales(&self, token: &str) -> AppResult<Vec<SaleWithItems>> {
        let resp = self
            .request(Method::GET, "/api/v1/sales/today", Some(token))
            .send()
            .await?;
        Self::parse_response(resp).await
    }

    pub async fn get_sale_receipt(
        &self,
        token: &str,
        sale_id: &str,
        is_reprint: bool,
    ) -> AppResult<ReceiptData> {
        let path = format!("/api/v1/sales/{sale_id}/receipt");
        let resp = self
            .request(Method::GET, &path, Some(token))
            .query(&[("is_reprint", is_reprint)])
            .send()
            .await?;
        Self::parse_response(resp).await
    }

    pub async fn void_sale(
        &self,
        token: &str,
        req: &VoidSaleRequest,
    ) -> AppResult<SaleWithItems> {
        let path = format!("/api/v1/sales/{}/void", req.sale_id);
        let resp = self
            .request(Method::POST, &path, Some(token))
            .json(&serde_json::json!({
                "admin_pin": req.admin_pin,
                "void_reason": req.void_reason,
            }))
            .send()
            .await?;
        Self::parse_response(resp).await
    }

    pub async fn create_held_bill(
        &self,
        token: &str,
        req: &CreateHeldBillRequest,
    ) -> AppResult<HeldBill> {
        let resp = self
            .request(Method::POST, "/api/v1/held-bills", Some(token))
            .json(req)
            .send()
            .await?;
        Self::parse_response(resp).await
    }

    pub async fn list_held_bills(&self, token: &str) -> AppResult<Vec<HeldBill>> {
        let resp = self
            .request(Method::GET, "/api/v1/held-bills", Some(token))
            .send()
            .await?;
        Self::parse_response(resp).await
    }

    pub async fn consume_held_bill(
        &self,
        token: &str,
        held_bill_id: &str,
    ) -> AppResult<RecalledHeldBill> {
        let path = format!("/api/v1/held-bills/{held_bill_id}/consume");
        let resp = self.request(Method::POST, &path, Some(token)).send().await?;
        Self::parse_response(resp).await
    }

    pub async fn delete_held_bill(&self, token: &str, held_bill_id: &str) -> AppResult<()> {
        let path = format!("/api/v1/held-bills/{held_bill_id}");
        let resp = self
            .request(Method::DELETE, &path, Some(token))
            .send()
            .await?;
        let _: serde_json::Value = Self::parse_response(resp).await?;
        Ok(())
    }

    pub async fn get_sales_report(
        &self,
        token: &str,
        filter: &SalesReportFilter,
    ) -> AppResult<SalesReport> {
        let resp = self
            .request(Method::GET, "/api/v1/reports/sales", Some(token))
            .query(filter)
            .send()
            .await?;
        Self::parse_response(resp).await
    }

    pub async fn export_sales_report_csv(
        &self,
        token: &str,
        filter: &SalesReportFilter,
    ) -> AppResult<String> {
        let resp = self
            .request(Method::GET, "/api/v1/reports/sales/csv", Some(token))
            .query(filter)
            .send()
            .await?;
        let payload: CsvPayload = Self::parse_response(resp).await?;
        Ok(payload.csv_content)
    }

    pub async fn list_users(&self, token: &str) -> AppResult<Vec<User>> {
        let resp = self
            .request(Method::GET, "/api/v1/users", Some(token))
            .send()
            .await?;
        Self::parse_response(resp).await
    }

    pub async fn upsert_user(&self, token: &str, req: &UpsertUserRequest) -> AppResult<User> {
        let resp = self
            .request(Method::POST, "/api/v1/users", Some(token))
            .json(req)
            .send()
            .await?;
        Self::parse_response(resp).await
    }

    pub async fn get_store_settings(&self, token: &str) -> AppResult<StoreSettings> {
        let resp = self
            .request(Method::GET, "/api/v1/store-settings", Some(token))
            .send()
            .await?;
        Self::parse_response(resp).await
    }

    pub async fn update_store_settings(
        &self,
        token: &str,
        req: &UpdateStoreSettingsRequest,
    ) -> AppResult<StoreSettings> {
        let resp = self
            .request(Method::PUT, "/api/v1/store-settings", Some(token))
            .json(req)
            .send()
            .await?;
        Self::parse_response(resp).await
    }

    // --- Shift Kasir & Rekap Kas Laci ---
    pub async fn open_shift(&self, token: &str, req: &OpenShiftRequest) -> AppResult<CashierShift> {
        let resp = self
            .request(Method::POST, "/api/v1/shifts/open", Some(token))
            .json(req)
            .send()
            .await?;
        Self::parse_response(resp).await
    }

    pub async fn get_active_shift(&self, token: &str) -> AppResult<Option<CashierShift>> {
        let path = format!("/api/v1/shifts/active?terminal_name={}", self.terminal_name);
        let resp = self
            .request(Method::GET, &path, Some(token))
            .send()
            .await?;
        Self::parse_response(resp).await
    }

    pub async fn record_cash_movement(
        &self,
        token: &str,
        req: &CashMovementRequest,
    ) -> AppResult<CashMovement> {
        let resp = self
            .request(Method::POST, "/api/v1/shifts/movement", Some(token))
            .json(req)
            .send()
            .await?;
        Self::parse_response(resp).await
    }

    pub async fn get_shift_x_report(
        &self,
        token: &str,
        shift_id: &str,
    ) -> AppResult<ShiftReportData> {
        let path = format!("/api/v1/shifts/{shift_id}/x-report");
        let resp = self.request(Method::GET, &path, Some(token)).send().await?;
        Self::parse_response(resp).await
    }

    pub async fn close_shift(&self, token: &str, req: &CloseShiftRequest) -> AppResult<CashierShift> {
        let resp = self
            .request(Method::POST, "/api/v1/shifts/close", Some(token))
            .json(req)
            .send()
            .await?;
        Self::parse_response(resp).await
    }

    pub async fn list_shifts(
        &self,
        token: &str,
        start_date: Option<&str>,
        end_date: Option<&str>,
    ) -> AppResult<Vec<CashierShift>> {
        let mut req = self.request(Method::GET, "/api/v1/shifts", Some(token));
        if let Some(s) = start_date {
            req = req.query(&[("start_date", s)]);
        }
        if let Some(e) = end_date {
            req = req.query(&[("end_date", e)]);
        }
        let resp = req.send().await?;
        Self::parse_response(resp).await
    }

    // --- Alur Stok Opname Fisik Massal ---
    pub async fn create_opname_session(
        &self,
        token: &str,
        req: &CreateOpnameSessionRequest,
    ) -> AppResult<StockOpnameSession> {
        let resp = self
            .request(Method::POST, "/api/v1/opname/sessions", Some(token))
            .json(req)
            .send()
            .await?;
        Self::parse_response(resp).await
    }

    pub async fn list_opname_sessions(
        &self,
        token: &str,
        status: Option<&str>,
    ) -> AppResult<Vec<StockOpnameSession>> {
        let mut req = self.request(Method::GET, "/api/v1/opname/sessions", Some(token));
        if let Some(st) = status {
            req = req.query(&[("status", st)]);
        }
        let resp = req.send().await?;
        Self::parse_response(resp).await
    }

    pub async fn get_opname_session_detail(
        &self,
        token: &str,
        session_id: &str,
    ) -> AppResult<OpnameSessionDetail> {
        let path = format!("/api/v1/opname/sessions/{session_id}");
        let resp = self.request(Method::GET, &path, Some(token)).send().await?;
        Self::parse_response(resp).await
    }

    pub async fn record_opname_scan(
        &self,
        token: &str,
        req: &RecordOpnameScanRequest,
    ) -> AppResult<StockOpnameItem> {
        let resp = self
            .request(Method::POST, "/api/v1/opname/scan", Some(token))
            .json(req)
            .send()
            .await?;
        Self::parse_response(resp).await
    }

    pub async fn update_opname_item_qty(
        &self,
        token: &str,
        item_id: &str,
        physical_count: i64,
    ) -> AppResult<StockOpnameItem> {
        let path = format!("/api/v1/opname/items/{item_id}");
        let req = UpdateOpnameItemQtyRequest {
            item_id: item_id.to_string(),
            physical_count,
        };
        let resp = self
            .request(Method::PUT, &path, Some(token))
            .json(&req)
            .send()
            .await?;
        Self::parse_response(resp).await
    }

    pub async fn commit_opname_session(
        &self,
        token: &str,
        req: &CommitOpnameSessionRequest,
    ) -> AppResult<StockOpnameSession> {
        let resp = self
            .request(Method::POST, "/api/v1/opname/commit", Some(token))
            .json(req)
            .send()
            .await?;
        Self::parse_response(resp).await
    }

    pub async fn cancel_opname_session(
        &self,
        token: &str,
        session_id: &str,
        reason: &str,
    ) -> AppResult<StockOpnameSession> {
        let req = CancelOpnameSessionRequest {
            session_id: session_id.to_string(),
            reason: reason.to_string(),
        };
        let resp = self
            .request(Method::POST, "/api/v1/opname/cancel", Some(token))
            .json(&req)
            .send()
            .await?;
        Self::parse_response(resp).await
    }

    // --- Harga Bertingkat / Tiered Pricing ---
    pub async fn get_product_price_tiers(
        &self,
        token: &str,
        product_id: &str,
    ) -> AppResult<Vec<ProductPriceTier>> {
        let path = format!("/api/v1/products/{product_id}/tiers");
        let resp = self.request(Method::GET, &path, Some(token)).send().await?;
        Self::parse_response(resp).await
    }

    pub async fn set_product_price_tiers(
        &self,
        token: &str,
        req: &SetPriceTiersRequest,
    ) -> AppResult<Vec<ProductPriceTier>> {
        let path = format!("/api/v1/products/{}/tiers", req.product_id);
        let resp = self
            .request(Method::PUT, &path, Some(token))
            .json(req)
            .send()
            .await?;
        Self::parse_response(resp).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_server_ip_and_port() {
        assert_eq!(
            sanitize_server_ip_and_port("192.168.1.10", 3847),
            ("192.168.1.10".to_string(), 3847)
        );
        assert_eq!(
            sanitize_server_ip_and_port("  http://192.168.1.10  ", 3847),
            ("192.168.1.10".to_string(), 3847)
        );
        assert_eq!(
            sanitize_server_ip_and_port("https://192.168.1.10/", 3847),
            ("192.168.1.10".to_string(), 3847)
        );
        assert_eq!(
            sanitize_server_ip_and_port("192.168.1.10:44321", 3847),
            ("192.168.1.10".to_string(), 44321)
        );
        assert_eq!(
            sanitize_server_ip_and_port("http://192.168.1.10:44321/api", 3847),
            ("192.168.1.10".to_string(), 44321)
        );
    }

    #[test]
    fn test_safe_header_value() {
        assert_eq!(safe_header_value("Kasir 2"), "Kasir 2");
        assert_eq!(safe_header_value("Kasir 2 (Client)"), "Kasir 2 (Client)");
        // Karakter non-ASCII (en-dash, aksen, smart quotes) diganti dengan safe ASCII '_'
        assert_eq!(safe_header_value("Kasir – 2"), "Kasir _ 2");
        assert_eq!(safe_header_value("Café POS"), "Caf_ POS");
    }
}
