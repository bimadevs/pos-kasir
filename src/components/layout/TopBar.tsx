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
  const { terminalStatus } = useTerminal();
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

  // Inisial avatar pengguna
  const userInitials = (user?.full_name || user?.username || "U")
    .trim()
    .split(/\s+/)
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // Tab yang diizinkan untuk peran saat ini
  const visibleTabs = navItems.filter((item) => !item.adminOnly || isAdmin);
  const secondaryAdminTabs = visibleTabs.filter((item) => item.id !== "POS");
  const activeSecondaryTab = secondaryAdminTabs.find((item) => item.id === activeTab);

  return (
    <header className="h-14 bg-slate-950 text-zinc-100 border-b border-slate-800/80 px-4 flex items-center justify-between shrink-0 select-none z-30 relative">
      {/* Kiri: Identitas Kassio, Logo Resmi, & Smart Terminal Chip */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src="/logo-emblem.png"
            alt="Logo Kassio"
            className="w-8 h-8 rounded-lg object-contain bg-slate-900 border border-slate-800 p-0.5 shadow-xs shrink-0"
          />
          <div className="leading-tight min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-extrabold text-sm tracking-tight truncate max-w-[130px] sm:max-w-[180px]">
                <span className="text-white">Kas</span>
                <span className="text-teal-400">sio</span>
                <span className="text-zinc-400 font-medium text-xs ml-1.5 hidden sm:inline">
                  {terminalStatus?.store_name ? `• ${terminalStatus.store_name}` : ""}
                </span>
              </span>
              <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] font-mono font-medium text-teal-400 shrink-0">
                {APP_VERSION_LABEL}
              </span>
            </div>
            <div className="text-[11px] text-zinc-400 flex items-center gap-1 font-medium truncate max-w-[190px]">
              <Monitor className="w-3 h-3 text-zinc-500 shrink-0" />
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
        className="flex items-center bg-slate-900/90 p-1 rounded-xl border border-slate-800/80 shadow-inner"
      >
        {/* Tab Kasir (POS) - Selalu Tampil & Prioritas Utama */}
        <button
          type="button"
          onClick={() => onSelectTab("POS")}
          className={`whitespace-nowrap px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === "POS"
              ? "bg-slate-800 text-white shadow-xs border border-slate-700/60"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-slate-800/40"
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
                ? "bg-slate-800 text-white shadow-xs border border-slate-700/60"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-slate-800/40"
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
                      ? "bg-slate-800 text-white shadow-xs border border-slate-700/60"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-slate-800/40"
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
                  ? "bg-slate-800 text-white shadow-xs border border-slate-700/60"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-slate-800/40"
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
                className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${
                  dropdownOpen ? "rotate-180 text-zinc-200" : ""
                }`}
              />
            </button>

            {/* Panel Dropdown Menu */}
            {dropdownOpen && (
              <div className="absolute top-full mt-2 left-0 w-52 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-1.5 z-50 flex flex-col gap-0.5 animate-in fade-in duration-150">
                <div className="px-2.5 py-1 text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">
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
                          ? "bg-slate-800 text-white font-semibold"
                          : "text-zinc-300 hover:bg-slate-800/60 hover:text-white"
                      }`}
                    >
                      <span className={active ? "text-white" : "text-zinc-400"}>
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

      {/* Kanan: Kapsul Status Terpadu (LAN & Jam) & Pill Pengguna */}
      <div className="flex items-center gap-2.5">
        {/* Kapsul Status: Indikator LAN & Jam Monospace Tabular-Nums */}
        <div className="flex items-center gap-2.5 bg-slate-900/90 border border-slate-800/80 rounded-xl px-3 py-1.5 shadow-inner">
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
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-xs font-medium text-emerald-400 whitespace-nowrap hidden lg:inline">
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
              <span className="text-xs font-bold text-rose-400 whitespace-nowrap animate-pulse">
                OFFLINE
              </span>
            </div>
          )}

          <div className="w-px h-3.5 bg-slate-800 shrink-0" />

          <div className="text-xs font-mono tabular-nums text-zinc-300 font-medium whitespace-nowrap">
            {clock}
          </div>
        </div>

        {/* Pill Profil Pengguna & Logout Terintegrasi */}
        <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-800/80 rounded-xl p-1 shadow-inner">
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold font-mono shrink-0 select-none ${
              isAdmin
                ? "bg-teal-600 text-white border border-teal-500"
                : "bg-slate-800 text-zinc-200 border border-slate-700/60"
            }`}
          >
            {userInitials}
          </div>

          <div className="text-left pl-1 pr-1.5 hidden md:block leading-tight">
            <div className="text-xs font-semibold text-zinc-200 truncate max-w-[110px]">
              {user?.full_name || user?.username}
            </div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-teal-400">
              {user?.role}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void logout()}
            title="Keluar Sesi Kasir"
            aria-label="Keluar Sesi Kasir"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-300 hover:bg-rose-950/60 border border-transparent hover:border-rose-900/40 transition-colors cursor-pointer shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
