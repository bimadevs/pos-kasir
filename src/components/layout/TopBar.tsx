import React, { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  ChevronDown,
  ClipboardList,
  LayoutGrid,
  LogOut,
  Monitor,
  Package,
  Settings,
  ShoppingCart,
  Users,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useTerminal } from "../../context/TerminalContext";
import type { AppNavTab } from "../../types/domain";
import { APP_VERSION_LABEL } from "../../version";

interface TopBarProps {
  activeTab: AppNavTab;
  onSelectTab: (tab: AppNavTab) => void;
}

interface NavItem {
  id: AppNavTab;
  label: string;
  icon: React.ReactNode;
  adminOnly: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({ activeTab, onSelectTab }) => {
  const { user, isAdmin, logout } = useAuth();
  const { terminalStatus, activeShift } = useTerminal();
  const [clock, setClock] = useState<string>("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateClock = () => {
      setClock(
        new Date().toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
    };
    updateClock();
    const id = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(id);
  }, []);

  // Tutup dropdown saat klik di luar atau menekan tombol Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDropdownOpen(false);
      }
    };

    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [dropdownOpen]);

  const cfg = terminalStatus?.config;
  const isServer = cfg?.terminal_mode === "SERVER";
  const lanConnected = terminalStatus?.lan_connected ?? false;

  // Format pintar info terminal untuk menghindari kata dobel seperti "(Server Utama) (Server)"
  const formatTerminalName = (name?: string, isServerMode?: boolean) => {
    if (!name) return isServerMode ? "Server Utama" : "Client";
    const cleaned = name.replace(/\s*\((?:Server|Client).*?\)/gi, "").trim();
    const modeBadge = isServerMode ? "Server" : "Client";
    return `${cleaned || "Kasir"} • ${modeBadge}`;
  };

  const navItems: NavItem[] = [
    {
      id: "POS",
      label: "Kasir (POS)",
      icon: <ShoppingCart className="w-4 h-4 shrink-0" />,
      adminOnly: false,
    },
    {
      id: "PRODUCTS",
      label: "Katalog Produk",
      icon: <Package className="w-4 h-4 shrink-0" />,
      adminOnly: true,
    },
    {
      id: "STOCK",
      label: "Stok / Koreksi",
      icon: <ClipboardList className="w-4 h-4 shrink-0" />,
      adminOnly: true,
    },
    {
      id: "REPORTS",
      label: "Laporan & Laba",
      icon: <BarChart3 className="w-4 h-4 shrink-0" />,
      adminOnly: true,
    },
    {
      id: "USERS",
      label: "Pengguna",
      icon: <Users className="w-4 h-4 shrink-0" />,
      adminOnly: true,
    },
    {
      id: "SETTINGS",
      label: isAdmin ? "Pengaturan" : "Printer Lokal",
      icon: <Settings className="w-4 h-4 shrink-0" />,
      adminOnly: false,
    },
  ];

  // Tab yang diizinkan untuk peran saat ini
  const visibleTabs = navItems.filter((item) => !item.adminOnly || isAdmin);
  const secondaryAdminTabs = visibleTabs.filter((item) => item.id !== "POS");
  const activeSecondaryTab = secondaryAdminTabs.find((item) => item.id === activeTab);

  return (
    <header className="h-14 bg-emerald-700 text-white border-b border-emerald-800/80 px-4 flex items-center justify-between shrink-0 select-none z-30 relative shadow-sm">
      {/* Kiri: Identitas Mudita Mart, Logo Resmi, & Smart Terminal Chip */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src="/logo-emblem.png"
            alt="Logo Mudita Mart"
            className="w-8 h-8 rounded-lg object-contain bg-white/10 border border-white/20 p-0.5 shadow-xs shrink-0"
          />
          <div className="leading-tight min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-extrabold text-sm tracking-tight truncate max-w-[150px] sm:max-w-[200px]">
                <span className="text-white">Mudita </span>
                <span className="text-amber-300">Mart</span>
                <span className="text-emerald-100 font-medium text-xs ml-1.5 hidden sm:inline">
                  {terminalStatus?.store_name ? `• ${terminalStatus.store_name}` : ""}
                </span>
              </span>
              <span
                className="px-1.5 py-0.5 rounded bg-emerald-800/80 border border-emerald-600/60 text-[10px] font-mono font-medium text-emerald-100 shrink-0 cursor-help"
                title="Mudita Mart — Dikembangkan oleh BimaDev"
              >
                {APP_VERSION_LABEL}
              </span>
            </div>
            <div className="text-[11px] text-emerald-100 flex items-center gap-1 font-medium truncate max-w-[190px]">
              <Monitor className="w-3 h-3 text-emerald-200 shrink-0" />
              <span className="truncate">
                {formatTerminalName(cfg?.terminal_name, isServer)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tengah: Navigasi Segmented Control (macOS / App Bar Style) */}
      <nav
        aria-label="Navigasi Utama"
        className="flex items-center bg-emerald-800/90 p-1 rounded-xl border border-emerald-600/40 shadow-inner"
      >
        {/* Tab Kasir (POS) - Selalu Tampil & Prioritas Utama */}
        <button
          type="button"
          onClick={() => onSelectTab("POS")}
          className={`whitespace-nowrap px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === "POS"
              ? "bg-white text-emerald-900 shadow-xs border border-white/80 font-bold"
              : "text-emerald-100 hover:text-white hover:bg-emerald-700/60"
          }`}
        >
          <ShoppingCart className="w-4 h-4 shrink-0" />
          <span>Kasir (POS)</span>
        </button>

        {/* Kasir Biasa (Bukan Admin): Hanya Tambahkan Tab Printer Lokal */}
        {!isAdmin && (
          <button
            type="button"
            onClick={() => onSelectTab("SETTINGS")}
            className={`whitespace-nowrap px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === "SETTINGS"
                ? "bg-white text-emerald-900 shadow-xs border border-white/80 font-bold"
                : "text-emerald-100 hover:text-white hover:bg-emerald-700/60"
            }`}
          >
            <Settings className="w-4 h-4 shrink-0" />
            <span>Printer Lokal</span>
          </button>
        )}

        {/* Admin Tabs - Tampilan Penuh di Layar Lebar (>= 1280px / xl) */}
        {isAdmin && (
          <div className="hidden xl:flex items-center gap-1">
            {secondaryAdminTabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onSelectTab(tab.id)}
                  className={`whitespace-nowrap px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                    active
                      ? "bg-white text-emerald-900 shadow-xs border border-white/80 font-bold"
                      : "text-emerald-100 hover:text-white hover:bg-emerald-700/60"
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Admin Tabs - Dropdown "Manajemen ▾" di Layar Sedang/Kecil (< 1280px) */}
        {isAdmin && (
          <div className="relative xl:hidden" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setDropdownOpen((prev) => !prev)}
              aria-haspopup="true"
              aria-expanded={dropdownOpen}
              className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeSecondaryTab
                  ? "bg-white text-emerald-900 shadow-xs border border-white/80 font-bold"
                  : "text-emerald-100 hover:text-white hover:bg-emerald-700/60"
              }`}
            >
              {activeSecondaryTab ? (
                <>
                  {activeSecondaryTab.icon}
                  <span>{activeSecondaryTab.label}</span>
                </>
              ) : (
                <>
                  <LayoutGrid className="w-4 h-4 shrink-0" />
                  <span>Manajemen</span>
                </>
              )}
              <ChevronDown
                className={`w-3.5 h-3.5 text-emerald-200 transition-transform duration-200 ${
                  dropdownOpen ? "rotate-180 text-white" : ""
                }`}
              />
            </button>

            {/* Panel Dropdown Menu */}
            {dropdownOpen && (
              <div className="absolute top-full mt-2 left-0 w-52 bg-emerald-900 border border-emerald-700 rounded-xl shadow-2xl p-1.5 z-50 flex flex-col gap-0.5 animate-in fade-in duration-150">
                <div className="px-2.5 py-1 text-[10px] font-semibold tracking-wider text-emerald-200 uppercase">
                  Menu Manajemen
                </div>
                {secondaryAdminTabs.map((tab) => {
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        onSelectTab(tab.id);
                        setDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2.5 transition-colors cursor-pointer ${
                        active
                          ? "bg-white text-emerald-900 font-bold shadow-xs"
                          : "text-emerald-100 hover:bg-emerald-800/80 hover:text-white"
                      }`}
                    >
                      <span className={active ? "text-emerald-900" : "text-emerald-200"}>
                        {tab.icon}
                      </span>
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </nav>

      {/* Kanan: Kapsul Status Terpadu (Shift, LAN & Jam) & Pill Pengguna */}
      <div className="flex items-center gap-2.5">
        {/* Chip Status Shift Kasir Aktif */}
        {activeShift ? (
          <div
            title={`Shift Aktif: Dibuka ${new Date(activeShift.opened_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })} oleh ${activeShift.cashier_name_snapshot}`}
            className="hidden sm:flex items-center gap-1.5 bg-amber-400/20 border border-amber-300/40 rounded-xl px-2.5 py-1 text-xs font-semibold text-amber-200 shadow-inner"
          >
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
            <span className="whitespace-nowrap">Shift Aktif</span>
          </div>
        ) : (
          <div
            title="Belum ada sesi shift kasir aktif di terminal ini"
            className="hidden sm:flex items-center gap-1.5 bg-emerald-950/40 border border-emerald-600/30 rounded-xl px-2.5 py-1 text-xs font-medium text-emerald-300/70 shadow-inner"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/40 shrink-0" />
            <span className="whitespace-nowrap">Shift Tutup</span>
          </div>
        )}

        {/* Kapsul Status: Indikator LAN & Jam Monospace Tabular-Nums */}
        <div className="flex items-center gap-2.5 bg-emerald-800/90 border border-emerald-600/40 rounded-xl px-3 py-1.5 shadow-inner">
          {lanConnected ? (
            <div
              title={
                isServer
                  ? `Server LAN berjalan di port ${cfg?.server_bind_port}`
                  : `Terhubung ke Server ${cfg?.client_target_ip}:${cfg?.client_target_port}`
              }
              className="flex items-center gap-2 cursor-default group"
            >
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-300" />
              </span>
              <span className="text-xs font-medium text-emerald-100 whitespace-nowrap hidden lg:inline">
                {isServer ? "LAN Server" : "LAN Terhubung"}
              </span>
            </div>
          ) : (
            <div
              title={terminalStatus?.server_error || "Koneksi ke Server terputus"}
              className="flex items-center gap-1.5 cursor-default"
            >
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
              </span>
              <span className="text-xs font-bold text-rose-300 whitespace-nowrap animate-pulse">
                OFFLINE
              </span>
            </div>
          )}

          <div className="w-px h-3.5 bg-emerald-600/50 shrink-0" />

          <div className="text-xs font-mono tabular-nums text-white font-semibold whitespace-nowrap">
            {clock}
          </div>
        </div>

        {/* Pill Profil Pengguna & Logout Terintegrasi */}
        <div className="flex items-center gap-2 bg-emerald-800/90 border border-emerald-600/40 rounded-xl px-2.5 py-1.5 shadow-inner">
          <div className="text-left leading-tight">
            <div className="text-xs font-bold text-white truncate max-w-[120px]">
              {user?.full_name || user?.username}
            </div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
              {user?.role}
            </div>
          </div>

          <div className="w-px h-4 bg-emerald-600/50 shrink-0" />

          <button
            type="button"
            onClick={() => void logout()}
            title="Keluar Sesi Kasir"
            aria-label="Keluar Sesi Kasir"
            className="p-1 rounded-lg text-emerald-100 hover:text-white hover:bg-rose-600/80 transition-colors cursor-pointer shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
