use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::net::UdpSocket;
use std::path::{Path, PathBuf};

pub const DEFAULT_LAN_PORT: u16 = 3847;
pub const VIRTUAL_PRINTER_NAME: &str = "POS-Kasir Virtual Thermal Printer (Simulasi)";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TerminalMode {
    UNCONFIGURED,
    SERVER,
    CLIENT,
}

impl Default for TerminalMode {
    fn default() -> Self {
        Self::UNCONFIGURED
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PrinterConfig {
    pub printer_name: String,
    pub paper_width: u16,
    pub auto_open_drawer: bool,
    pub preview_on_screen: bool,
}

impl Default for PrinterConfig {
    fn default() -> Self {
        Self {
            printer_name: VIRTUAL_PRINTER_NAME.to_string(),
            paper_width: 80,
            auto_open_drawer: true,
            preview_on_screen: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LocalConfig {
    pub terminal_mode: TerminalMode,
    pub terminal_name: String,
    pub server_bind_port: u16,
    pub client_target_ip: String,
    pub client_target_port: u16,
    pub pairing_code: String,
    pub printer: PrinterConfig,
}

impl Default for LocalConfig {
    fn default() -> Self {
        Self {
            terminal_mode: TerminalMode::UNCONFIGURED,
            terminal_name: "Kasir 1".to_string(),
            server_bind_port: DEFAULT_LAN_PORT,
            client_target_ip: "127.0.0.1".to_string(),
            client_target_port: DEFAULT_LAN_PORT,
            pairing_code: String::new(),
            printer: PrinterConfig::default(),
        }
    }
}

impl LocalConfig {
    pub fn config_file_path(app_data_dir: &Path) -> PathBuf {
        app_data_dir.join("local_config.json")
    }

    pub fn load_or_default(app_data_dir: &Path) -> AppResult<Self> {
        let path = Self::config_file_path(app_data_dir);
        if !path.exists() {
            return Ok(Self::default());
        }
        let raw = fs::read_to_string(&path)?;
        let mut cfg: LocalConfig = serde_json::from_str(&raw)?;
        if cfg.printer.paper_width != 58 && cfg.printer.paper_width != 80 {
            cfg.printer.paper_width = 80;
        }
        if cfg.server_bind_port == 0 {
            cfg.server_bind_port = DEFAULT_LAN_PORT;
        }
        if cfg.client_target_port == 0 {
            cfg.client_target_port = DEFAULT_LAN_PORT;
        }
        Ok(cfg)
    }

    pub fn save(&self, app_data_dir: &Path) -> AppResult<()> {
        if self.printer.paper_width != 58 && self.printer.paper_width != 80 {
            return Err(AppError::Validation(
                "Lebar kertas printer harus 58mm atau 80mm.".to_string(),
            ));
        }
        fs::create_dir_all(app_data_dir)?;
        let path = Self::config_file_path(app_data_dir);
        let serialized = serde_json::to_string_pretty(self)?;
        fs::write(path, serialized)?;
        Ok(())
    }
}

/// Mendeteksi alamat IPv4 LAN lokal pada mesin ini untuk memudahkan pairing Client Terminal.
pub fn detect_local_lan_ips() -> Vec<String> {
    let mut ips = Vec::new();
    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(local_addr) = socket.local_addr() {
                let ip = local_addr.ip().to_string();
                if !ip.is_empty() && ip != "127.0.0.1" {
                    ips.push(ip);
                }
            }
        }
    }
    if !ips.contains(&"127.0.0.1".to_string()) {
        ips.push("127.0.0.1".to_string());
    }
    ips
}
