use crate::error::{AppError, AppResult};
use crate::models::User;
use crate::services::core_service::CoreService;
use axum::{
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};

pub const HEADER_PAIRING_CODE: &str = "x-pairing-code";
pub const HEADER_SESSION_TOKEN: &str = "x-session-token";
pub const HEADER_TERMINAL_NAME: &str = "x-terminal-name";

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let status = match &self {
            AppError::Validation(_) => StatusCode::BAD_REQUEST,
            AppError::Unauthorized(_) => StatusCode::UNAUTHORIZED,
            AppError::Forbidden(_) => StatusCode::FORBIDDEN,
            AppError::NotFound(_) => StatusCode::NOT_FOUND,
            AppError::Conflict(_) => StatusCode::CONFLICT,
            AppError::Database(_) | AppError::Io(_) | AppError::Hardware(_) => {
                StatusCode::INTERNAL_SERVER_ERROR
            }
            AppError::Network(_) => StatusCode::BAD_GATEWAY,
        };
        (status, Json(self)).into_response()
    }
}

pub fn extract_header_str<'a>(headers: &'a HeaderMap, key: &str) -> Option<&'a str> {
    headers
        .get(key)
        .and_then(|v| v.to_str().ok())
        .map(str::trim)
        .filter(|s| !s.is_empty())
}

pub fn extract_terminal_name(headers: &HeaderMap) -> String {
    extract_header_str(headers, HEADER_TERMINAL_NAME)
        .unwrap_or("Client Terminal")
        .to_string()
}

pub fn verify_pairing_header(core: &CoreService, headers: &HeaderMap) -> AppResult<()> {
    let code = extract_header_str(headers, HEADER_PAIRING_CODE).ok_or_else(|| {
        AppError::Unauthorized("Header X-Pairing-Code tidak ditemukan.".to_string())
    })?;
    core.verify_pairing_code(code)
}

pub fn authenticate_request(core: &CoreService, headers: &HeaderMap) -> AppResult<(User, String)> {
    verify_pairing_header(core, headers)?;
    let token = extract_header_str(headers, HEADER_SESSION_TOKEN).ok_or_else(|| {
        AppError::Unauthorized("Header X-Session-Token tidak ditemukan.".to_string())
    })?;
    let user = core.validate_session(token)?;
    let terminal_name = extract_terminal_name(headers);
    Ok((user, terminal_name))
}
