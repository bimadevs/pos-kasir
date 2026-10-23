use crate::error::{AppError, AppResult};
use crate::lan::middleware::{HEADER_PAIRING_CODE, HEADER_SESSION_TOKEN, HEADER_TERMINAL_NAME};
use crate::lan::server::{CsvPayload, ImportProductsPayload};
use crate::models::{
    AuthSession, CreateHeldBillRequest, CreateSaleRequest, CreateStockAdjustmentRequest,
    CsvImportResult, HealthCheckResponse, HeldBill, ImportProductsResult, LoginRequest, Product,
    ProductFilter, ProductImportRow, RecalledHeldBill, ReceiptData, SaleWithItems, SalesReport,
    SalesReportFilter, StockAdjustment, StoreSettings, UpdateStoreSettingsRequest,
    UpsertProductRequest, UpsertUserRequest, User, VoidSaleRequest,
};
use reqwest::{Client, Method, RequestBuilder, Response};
use serde::de::DeserializeOwned;
use std::time::Duration;

#[derive(Clone)]
pub struct RemoteHttpClient {
    http: Client,
    health_http: Client,
    base_url: String,
    pairing_code: String,
    terminal_name: String,
}

impl RemoteHttpClient {
    pub fn new(
        server_ip: &str,
        server_port: u16,
        pairing_code: &str,
        terminal_name: &str,
    ) -> Self {
        let http = Client::builder()
            .timeout(Duration::from_secs(6))
            .build()
            .unwrap_or_default();
        let health_http = Client::builder()
            .timeout(Duration::from_millis(2500))
            .build()
            .unwrap_or_default();
        let base_url = format!("http://{}:{}", server_ip.trim(), server_port);

        Self {
            http,
            health_http,
            base_url,
            pairing_code: pairing_code.trim().to_string(),
            terminal_name: terminal_name.trim().to_string(),
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
            req = req.header(HEADER_SESSION_TOKEN, tok);
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
}
