use crate::error::AppResult;
use crate::lan::middleware::{
    authenticate_request, extract_header_str, verify_pairing_header, HEADER_SESSION_TOKEN,
};
use crate::models::{
    AuthSession, CancelOpnameSessionRequest, CashMovement, CashMovementRequest, CashierShift,
    CloseShiftRequest, CommitOpnameSessionRequest, CreateHeldBillRequest,
    CreateOpnameSessionRequest, CreateSaleRequest, CreateStockAdjustmentRequest, CsvImportResult,
    HealthCheckResponse, HeldBill, ImportProductsResult, LoginRequest, OpenShiftRequest,
    OpnameQuery, OpnameSessionDetail, Product, ProductFilter, ProductImportRow, ProductPriceTier,
    RecalledHeldBill, ReceiptData, RecordOpnameScanRequest, SaleWithItems, SalesReport,
    SalesReportFilter, SetPriceTiersRequest, ShiftReportData, ShiftsQuery, StockAdjustment,
    StockOpnameItem, StockOpnameSession, StoreSettings, UpdateOpnameItemQtyRequest,
    UpdateStoreSettingsRequest, UpsertProductRequest, UpsertUserRequest, User, VoidSaleRequest,
};
use crate::services::core_service::CoreService;
use axum::{
    extract::{Path, Query, State},
    http::HeaderMap,
    routing::{delete, get, post, put},
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

#[derive(Debug, Serialize, Deserialize)]
pub struct ImportProductsPayload {
    pub rows: Vec<ProductImportRow>,
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
        .route(
            "/api/v1/products/import",
            post(handle_import_products),
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
        .route("/api/v1/shifts/open", post(handle_open_shift))
        .route("/api/v1/shifts/active", get(handle_get_active_shift))
        .route("/api/v1/shifts/movement", post(handle_record_cash_movement))
        .route("/api/v1/shifts/{id}/x-report", get(handle_get_shift_x_report))
        .route("/api/v1/shifts/close", post(handle_close_shift))
        .route("/api/v1/shifts", get(handle_list_shifts))
        .route("/api/v1/shifts/history", get(handle_list_shifts))
        .route(
            "/api/v1/opname/sessions",
            get(handle_list_opname_sessions).post(handle_create_opname_session),
        )
        .route(
            "/api/v1/opname/sessions/{id}",
            get(handle_get_opname_session_detail),
        )
        .route("/api/v1/opname/scan", post(handle_record_opname_scan))
        .route("/api/v1/opname/items/{id}", put(handle_update_opname_item_qty))
        .route("/api/v1/opname/commit", post(handle_commit_opname_session))
        .route("/api/v1/opname/cancel", post(handle_cancel_opname_session))
        .route(
            "/api/v1/products/{id}/tiers",
            get(handle_get_product_price_tiers).put(handle_set_product_price_tiers),
        )
        .layer(axum::extract::DefaultBodyLimit::max(25 * 1024 * 1024))
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
        if let Err(e) = axum::serve(listener, router).await {
            eprintln!("Axum LAN Server terminated: {e}");
        }
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

async fn handle_import_products(
    State(state): State<LanServerState>,
    headers: HeaderMap,
    Json(payload): Json<ImportProductsPayload>,
) -> AppResult<Json<ImportProductsResult>> {
    let (user, terminal_name) = authenticate_request(&state.core, &headers)?;
    let res = state
        .core
        .import_products_rows(&user, &terminal_name, payload.rows)?;
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

async fn handle_open_shift(
    State(state): State<LanServerState>,
    headers: HeaderMap,
    Json(req): Json<OpenShiftRequest>,
) -> AppResult<Json<CashierShift>> {
    let (user, terminal_name) = authenticate_request(&state.core, &headers)?;
    let shift = state.core.open_shift(&user, &terminal_name, &req)?;
    Ok(Json(shift))
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct ActiveShiftQuery {
    pub terminal_name: Option<String>,
}

async fn handle_get_active_shift(
    State(state): State<LanServerState>,
    headers: HeaderMap,
    Query(query): Query<ActiveShiftQuery>,
) -> AppResult<Json<Option<CashierShift>>> {
    let (user, terminal_name) = authenticate_request(&state.core, &headers)?;
    let target_terminal = query
        .terminal_name
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or(&terminal_name);
    let shift = state
        .core
        .get_active_shift_by_terminal_or_cashier(Some(target_terminal), &user.id)?;
    Ok(Json(shift))
}

async fn handle_record_cash_movement(
    State(state): State<LanServerState>,
    headers: HeaderMap,
    Json(req): Json<CashMovementRequest>,
) -> AppResult<Json<CashMovement>> {
    let (user, _) = authenticate_request(&state.core, &headers)?;
    let mov = state.core.record_cash_movement(&user, &req)?;
    Ok(Json(mov))
}

async fn handle_get_shift_x_report(
    State(state): State<LanServerState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> AppResult<Json<ShiftReportData>> {
    let _ = authenticate_request(&state.core, &headers)?;
    let report = state.core.get_shift_x_report(&id)?;
    Ok(Json(report))
}

async fn handle_close_shift(
    State(state): State<LanServerState>,
    headers: HeaderMap,
    Json(req): Json<CloseShiftRequest>,
) -> AppResult<Json<CashierShift>> {
    let (user, _) = authenticate_request(&state.core, &headers)?;
    let shift = state.core.close_shift(&user, &req)?;
    Ok(Json(shift))
}

async fn handle_list_shifts(
    State(state): State<LanServerState>,
    headers: HeaderMap,
    Query(query): Query<ShiftsQuery>,
) -> AppResult<Json<Vec<CashierShift>>> {
    let _ = authenticate_request(&state.core, &headers)?;
    let shifts = state.core.list_shifts(query.start_date.as_deref(), query.end_date.as_deref())?;
    Ok(Json(shifts))
}

async fn handle_create_opname_session(
    State(state): State<LanServerState>,
    headers: HeaderMap,
    Json(req): Json<CreateOpnameSessionRequest>,
) -> AppResult<Json<StockOpnameSession>> {
    let (user, _) = authenticate_request(&state.core, &headers)?;
    let session = state.core.create_opname_session(&user, &req)?;
    Ok(Json(session))
}

async fn handle_list_opname_sessions(
    State(state): State<LanServerState>,
    headers: HeaderMap,
    Query(_query): Query<OpnameQuery>,
) -> AppResult<Json<Vec<StockOpnameSession>>> {
    let _ = authenticate_request(&state.core, &headers)?;
    let sessions = state.core.list_opname_sessions()?;
    Ok(Json(sessions))
}

async fn handle_get_opname_session_detail(
    State(state): State<LanServerState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> AppResult<Json<OpnameSessionDetail>> {
    let _ = authenticate_request(&state.core, &headers)?;
    let detail = state.core.get_opname_session_detail(&id)?;
    Ok(Json(detail))
}

async fn handle_record_opname_scan(
    State(state): State<LanServerState>,
    headers: HeaderMap,
    Json(req): Json<RecordOpnameScanRequest>,
) -> AppResult<Json<StockOpnameItem>> {
    let (user, _) = authenticate_request(&state.core, &headers)?;
    let item = state.core.record_opname_scan(&user, &req)?;
    Ok(Json(item))
}

async fn handle_update_opname_item_qty(
    State(state): State<LanServerState>,
    headers: HeaderMap,
    Path(_id): Path<String>,
    Json(req): Json<UpdateOpnameItemQtyRequest>,
) -> AppResult<Json<StockOpnameItem>> {
    let (user, _) = authenticate_request(&state.core, &headers)?;
    let item = state.core.update_opname_item_qty(&user, &req)?;
    Ok(Json(item))
}

async fn handle_commit_opname_session(
    State(state): State<LanServerState>,
    headers: HeaderMap,
    Json(req): Json<CommitOpnameSessionRequest>,
) -> AppResult<Json<StockOpnameSession>> {
    let (user, _) = authenticate_request(&state.core, &headers)?;
    let session = state.core.commit_opname_session(&user, &req)?;
    Ok(Json(session))
}

async fn handle_cancel_opname_session(
    State(state): State<LanServerState>,
    headers: HeaderMap,
    Json(req): Json<CancelOpnameSessionRequest>,
) -> AppResult<Json<StockOpnameSession>> {
    let (user, _) = authenticate_request(&state.core, &headers)?;
    let session = state
        .core
        .cancel_opname_session(&user, &req.session_id, &req.reason)?;
    Ok(Json(session))
}

async fn handle_get_product_price_tiers(
    State(state): State<LanServerState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> AppResult<Json<Vec<ProductPriceTier>>> {
    let _ = authenticate_request(&state.core, &headers)?;
    let tiers = state.core.get_product_price_tiers(&id)?;
    Ok(Json(tiers))
}

async fn handle_set_product_price_tiers(
    State(state): State<LanServerState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<SetPriceTiersRequest>,
) -> AppResult<Json<Vec<ProductPriceTier>>> {
    let (user, _) = authenticate_request(&state.core, &headers)?;
    let mut payload = req;
    payload.product_id = id;
    let tiers = state.core.set_product_price_tiers(&user, &payload)?;
    Ok(Json(tiers))
}
