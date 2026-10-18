use crate::error::AppResult;
use crate::lan::middleware::{
    authenticate_request, extract_header_str, verify_pairing_header, HEADER_SESSION_TOKEN,
};
use crate::models::{
    AuthSession, CreateHeldBillRequest, CreateSaleRequest, CreateStockAdjustmentRequest,
    CsvImportResult, HealthCheckResponse, HeldBill, LoginRequest, Product, ProductFilter,
    RecalledHeldBill, ReceiptData, SaleWithItems, SalesReport, SalesReportFilter, StockAdjustment,
    StoreSettings, UpdateStoreSettingsRequest, UpsertProductRequest, UpsertUserRequest, User,
    VoidSaleRequest,
};
use crate::services::core_service::CoreService;
use axum::{
    extract::{Path, Query, State},
    http::HeaderMap,
    routing::{delete, get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::CorsLayer;

#[derive(Clone)]
pub struct LanServerState {
    pub core: Arc<CoreService>,
    pub server_terminal_name: String,
}

#[derive(Debug, Deserialize)]
pub struct LookupQuery {
    pub code: String,
}

#[derive(Debug, Deserialize)]
pub struct StockAdjustmentQuery {
    pub product_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ReceiptQuery {
    pub is_reprint: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CsvPayload {
    pub csv_content: String,
}

#[derive(Debug, Deserialize)]
pub struct VoidSaleBody {
    pub admin_pin: String,
    pub void_reason: String,
}

pub fn build_lan_router(state: LanServerState) -> Router {
    Router::new()
        .route("/api/v1/health", get(handle_health))
        .route("/api/v1/auth/login", post(handle_login))
        .route("/api/v1/auth/logout", post(handle_logout))
        .route("/api/v1/auth/me", get(handle_me))
        .route(
            "/api/v1/products",
            get(handle_list_products).post(handle_upsert_product),
        )
        .route("/api/v1/products/lookup", get(handle_lookup_product))
        .route(
            "/api/v1/products/csv",
            get(handle_export_products_csv).post(handle_import_products_csv),
        )
        .route("/api/v1/products/{id}", delete(handle_deactivate_product))
        .route(
            "/api/v1/stock-adjustments",
            get(handle_list_stock_adjustments).post(handle_create_stock_adjustment),
        )
        .route("/api/v1/sales", post(handle_create_sale))
        .route("/api/v1/sales/today", get(handle_list_today_sales))
        .route("/api/v1/sales/{id}/receipt", get(handle_get_sale_receipt))
        .route("/api/v1/sales/{id}/void", post(handle_void_sale))
        .route(
            "/api/v1/held-bills",
            get(handle_list_held_bills).post(handle_create_held_bill),
        )
        .route(
            "/api/v1/held-bills/{id}/consume",
            post(handle_consume_held_bill),
        )
        .route("/api/v1/held-bills/{id}", delete(handle_delete_held_bill))
        .route("/api/v1/reports/sales", get(handle_get_sales_report))
        .route(
            "/api/v1/reports/sales/csv",
            get(handle_export_sales_report_csv),
        )
        .route(
            "/api/v1/users",
            get(handle_list_users).post(handle_upsert_user),
        )
        .route(
            "/api/v1/store-settings",
            get(handle_get_store_settings).put(handle_update_store_settings),
        )
        .layer(CorsLayer::permissive())
        .with_state(state)
}

pub async fn spawn_lan_server(
    core: Arc<CoreService>,
    server_terminal_name: String,
    bind_addr: &str,
) -> AppResult<(SocketAddr, tokio::task::JoinHandle<()>)> {
    let listener = tokio::net::TcpListener::bind(bind_addr).await?;
    let local_addr = listener.local_addr()?;
    let router = build_lan_router(LanServerState {
        core,
        server_terminal_name,
    });
    let handle = tokio::spawn(async move {
        let _ = axum::serve(listener, router).await;
    });
    Ok((local_addr, handle))
}

async fn handle_health(
    State(state): State<LanServerState>,
    headers: HeaderMap,
) -> AppResult<Json<HealthCheckResponse>> {
    verify_pairing_header(&state.core, &headers)?;
    let resp = state.core.health_check(&state.server_terminal_name)?;
    Ok(Json(resp))
}

async fn handle_login(
    State(state): State<LanServerState>,
    headers: HeaderMap,
    Json(req): Json<LoginRequest>,
) -> AppResult<Json<AuthSession>> {
    verify_pairing_header(&state.core, &headers)?;
    let session = state.core.login(&req)?;
    Ok(Json(session))
}

async fn handle_logout(
    State(state): State<LanServerState>,
    headers: HeaderMap,
) -> AppResult<Json<serde_json::Value>> {
    verify_pairing_header(&state.core, &headers)?;
    if let Some(token) = extract_header_str(&headers, HEADER_SESSION_TOKEN) {
        state.core.logout(token)?;
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn handle_me(
    State(state): State<LanServerState>,
    headers: HeaderMap,
) -> AppResult<Json<User>> {
    let (user, _) = authenticate_request(&state.core, &headers)?;
    Ok(Json(user))
}

async fn handle_list_products(
    State(state): State<LanServerState>,
    headers: HeaderMap,
    Query(filter): Query<ProductFilter>,
) -> AppResult<Json<Vec<Product>>> {
    let (user, _) = authenticate_request(&state.core, &headers)?;
    let products = state.core.list_products(&user, &filter)?;
    Ok(Json(products))
}

async fn handle_lookup_product(
    State(state): State<LanServerState>,
    headers: HeaderMap,
    Query(query): Query<LookupQuery>,
) -> AppResult<Json<Product>> {
    let (user, _) = authenticate_request(&state.core, &headers)?;
    let product = state.core.find_product_by_code(&user, &query.code)?;
    Ok(Json(product))
}

async fn handle_upsert_product(
    State(state): State<LanServerState>,
    headers: HeaderMap,
    Json(req): Json<UpsertProductRequest>,
) -> AppResult<Json<Product>> {
    let (user, terminal_name) = authenticate_request(&state.core, &headers)?;
    let product = state.core.upsert_product(&user, &terminal_name, &req)?;
    Ok(Json(product))
}

async fn handle_deactivate_product(
    State(state): State<LanServerState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    let (user, _) = authenticate_request(&state.core, &headers)?;
    state.core.deactivate_product(&user, &id)?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn handle_export_products_csv(
    State(state): State<LanServerState>,
    headers: HeaderMap,
) -> AppResult<Json<CsvPayload>> {
    let (user, _) = authenticate_request(&state.core, &headers)?;
    let csv_content = state.core.export_products_csv(&user)?;
    Ok(Json(CsvPayload { csv_content }))
}

async fn handle_import_products_csv(
    State(state): State<LanServerState>,
    headers: HeaderMap,
    Json(payload): Json<CsvPayload>,
) -> AppResult<Json<CsvImportResult>> {
    let (user, terminal_name) = authenticate_request(&state.core, &headers)?;
    let res = state
        .core
        .import_products_csv(&user, &terminal_name, &payload.csv_content)?;
    Ok(Json(res))
}

async fn handle_create_stock_adjustment(
    State(state): State<LanServerState>,
    headers: HeaderMap,
    Json(req): Json<CreateStockAdjustmentRequest>,
) -> AppResult<Json<StockAdjustment>> {
    let (user, terminal_name) = authenticate_request(&state.core, &headers)?;
    let adj = state
        .core
        .create_stock_adjustment(&user, &terminal_name, &req)?;
    Ok(Json(adj))
}

async fn handle_list_stock_adjustments(
    State(state): State<LanServerState>,
    headers: HeaderMap,
    Query(query): Query<StockAdjustmentQuery>,
) -> AppResult<Json<Vec<StockAdjustment>>> {
    let (user, _) = authenticate_request(&state.core, &headers)?;
    let list = state
        .core
        .list_stock_adjustments(&user, query.product_id.as_deref())?;
    Ok(Json(list))
}

async fn handle_create_sale(
    State(state): State<LanServerState>,
    headers: HeaderMap,
    Json(req): Json<CreateSaleRequest>,
) -> AppResult<Json<ReceiptData>> {
    let (user, terminal_name) = authenticate_request(&state.core, &headers)?;
    let receipt = state.core.create_sale(&user, &terminal_name, &req)?;
    Ok(Json(receipt))
}

async fn handle_list_today_sales(
    State(state): State<LanServerState>,
    headers: HeaderMap,
) -> AppResult<Json<Vec<SaleWithItems>>> {
    let (user, _) = authenticate_request(&state.core, &headers)?;
    let list = state.core.list_today_sales(&user)?;
    Ok(Json(list))
}

async fn handle_get_sale_receipt(
    State(state): State<LanServerState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Query(query): Query<ReceiptQuery>,
) -> AppResult<Json<ReceiptData>> {
    let (user, _) = authenticate_request(&state.core, &headers)?;
    let receipt = state
        .core
        .get_sale_receipt(&user, &id, query.is_reprint.unwrap_or(true))?;
    Ok(Json(receipt))
}

async fn handle_void_sale(
    State(state): State<LanServerState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(body): Json<VoidSaleBody>,
) -> AppResult<Json<SaleWithItems>> {
    let (user, _) = authenticate_request(&state.core, &headers)?;
    let voided = state.core.void_sale(
        &user,
        &VoidSaleRequest {
            sale_id: id,
            admin_pin: body.admin_pin,
            void_reason: body.void_reason,
        },
    )?;
    Ok(Json(voided))
}

async fn handle_create_held_bill(
    State(state): State<LanServerState>,
    headers: HeaderMap,
    Json(req): Json<CreateHeldBillRequest>,
) -> AppResult<Json<HeldBill>> {
    let (user, terminal_name) = authenticate_request(&state.core, &headers)?;
    let held = state.core.create_held_bill(&user, &terminal_name, &req)?;
    Ok(Json(held))
}

async fn handle_list_held_bills(
    State(state): State<LanServerState>,
    headers: HeaderMap,
) -> AppResult<Json<Vec<HeldBill>>> {
    let _ = authenticate_request(&state.core, &headers)?;
    let list = state.core.list_held_bills()?;
    Ok(Json(list))
}

async fn handle_consume_held_bill(
    State(state): State<LanServerState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> AppResult<Json<RecalledHeldBill>> {
    let _ = authenticate_request(&state.core, &headers)?;
    let recalled = state.core.consume_held_bill(&id)?;
    Ok(Json(recalled))
}

async fn handle_delete_held_bill(
    State(state): State<LanServerState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    let _ = authenticate_request(&state.core, &headers)?;
    state.core.delete_held_bill(&id)?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn handle_get_sales_report(
    State(state): State<LanServerState>,
    headers: HeaderMap,
    Query(filter): Query<SalesReportFilter>,
) -> AppResult<Json<SalesReport>> {
    let (user, _) = authenticate_request(&state.core, &headers)?;
    let report = state.core.get_sales_report(&user, &filter)?;
    Ok(Json(report))
}

async fn handle_export_sales_report_csv(
    State(state): State<LanServerState>,
    headers: HeaderMap,
    Query(filter): Query<SalesReportFilter>,
) -> AppResult<Json<CsvPayload>> {
    let (user, _) = authenticate_request(&state.core, &headers)?;
    let csv_content = state.core.export_sales_report_csv(&user, &filter)?;
    Ok(Json(CsvPayload { csv_content }))
}

async fn handle_list_users(
    State(state): State<LanServerState>,
    headers: HeaderMap,
) -> AppResult<Json<Vec<User>>> {
    let (user, _) = authenticate_request(&state.core, &headers)?;
    let users = state.core.list_users(&user)?;
    Ok(Json(users))
}

async fn handle_upsert_user(
    State(state): State<LanServerState>,
    headers: HeaderMap,
    Json(req): Json<UpsertUserRequest>,
) -> AppResult<Json<User>> {
    let (user, _) = authenticate_request(&state.core, &headers)?;
    let updated = state.core.upsert_user(&user, &req)?;
    Ok(Json(updated))
}

async fn handle_get_store_settings(
    State(state): State<LanServerState>,
    headers: HeaderMap,
) -> AppResult<Json<StoreSettings>> {
    let _ = authenticate_request(&state.core, &headers)?;
    let settings = state.core.get_store_settings()?;
    Ok(Json(settings))
}

async fn handle_update_store_settings(
    State(state): State<LanServerState>,
    headers: HeaderMap,
    Json(req): Json<UpdateStoreSettingsRequest>,
) -> AppResult<Json<StoreSettings>> {
    let (user, _) = authenticate_request(&state.core, &headers)?;
    let settings = state.core.update_store_settings(&user, &req)?;
    Ok(Json(settings))
}
