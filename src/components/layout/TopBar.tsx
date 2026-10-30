import React, { useEffect, useState } from "react";
import {
  BarChart3,
  ClipboardList,
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
  visible: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({ activeTab, onSelectTab }) => {
  const {
    user,
    isAdmin,
    isStock,
    canAccessPos,
    canManageProducts,
    canAdjustStock,
    canViewReports,
    canManageUsers,
    logout,
  } = useAuth();
  const { terminalStatus, activeShift } = useTerminal();
  const [clock, setClock] = useState<string>("");

  useEffect(() => {
    const updateClock = () => {
      setClock(
        new Date().toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    };
    updateClock();
    const id = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(id);
  }, []);

  const cfg = terminalStatus?.config;
  const isServer = cfg?.terminal_mode === "SERVER";
  const lanConnected = terminalStatus?.lan_connected ?? false;

  // Format pintar info terminal untuk menghindari kata dobel seperti "(Server Utama) (Server)"
  const formatTerminalName = (name?: string, isServerMode?: boolean) => {
    if (!name) return isServerMode ? "Server Utama" : "Client Terminal";
    const cleaned = name.replace(/\s*\((?:Server|Client).*?\)/gi, "").trim();
    const modeBadge = isServerMode ? "Server" : "Client";
    return `${cleaned || "Kasir"} • ${modeBadge}`;
  };

  const navItems: NavItem[] = [
    {
      id: "POS",
      label: "Kasir",
      icon: <ShoppingCart className="w-4 h-4 shrink-0" />,
      visible: canAccessPos,
    },
    {
      id: "PRODUCTS",
      label: "Katalog Produk",
      icon: <Package className="w-4 h-4 shrink-0" />,
      visible: canManageProducts,
    },
    {
      id: "STOCK",
      label: "Penyesuaian Stok",
      icon: <ClipboardList className="w-4 h-4 shrink-0" />,
      visible: canAdjustStock,
    },
    {
      id: "REPORTS",
      label: isStock ? "Laporan Stok" : "Laporan",
      icon: <BarChart3 className="w-4 h-4 shrink-0" />,
      visible: canViewReports,
    },
    {
      id: "USERS",
      label: "Pengguna",
      icon: <Users className="w-4 h-4 shrink-0" />,
      visible: canManageUsers,
    },
    {
      id: "SETTINGS",
      label: isAdmin ? "Pengaturan" : "Printer",
      icon: <Settings className="w-4 h-4 shrink-0" />,
      visible: true,
    },
  ];

  // Tab yang diizinkan untuk peran saat ini - tampilkan seluruh tab secara langsung dan konsisten
  const visibleTabs = navItems.filter((item) => item.visible);

  return (
    <header className="h-14 bg-emerald-800 text-white border-b border-emerald-900/60 px-4 flex items-center justify-between gap-3 shrink-0 select-none z-30 relative shadow-sm">
      {/* Kiri: Identitas Mudita Mart & Nama Toko (Tanpa max-w sempit) */}
      <div className="flex items-center gap-2.5 shrink-0 min-w-0">
        <img
          src="/logo-emblem.png"
          alt="Logo Mudita Mart"
          className="w-8 h-8 rounded-lg object-contain bg-white/10 border border-white/20 p-0.5 shadow-xs shrink-0"
        />
        <div className="flex flex-col justify-center leading-tight min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-extrabold text-sm tracking-tight whitespace-nowrap">
              <span className="text-white">Mudita </span>
              <span className="text-amber-300">Mart</span>
              {terminalStatus?.store_name && (
                <span className="text-emerald-100 font-medium text-xs ml-1.5">
                  • {terminalStatus.store_name}
                </span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-200 font-medium whitespace-nowrap">
            <Monitor className="w-3 h-3 text-emerald-300 shrink-0" />
            <span>
              {formatTerminalName(cfg?.terminal_name, isServer)}
            </span>
            <span
              className="px-1.5 py-0.2 rounded bg-emerald-900/80 border border-emerald-700/60 text-[9.5px] font-mono text-emerald-200 cursor-help"
              title="Mudita Mart — Dikembangkan oleh BimaDev"
            >
              {APP_VERSION_LABEL}
            </span>
          </div>
        </div>
      </div>

      {/* Tengah: Navigasi Segmented Control Sesuai Role Pengguna (Semua Tab Langsung Terlihat & Mudah Diklik) */}
      <nav
        aria-label="Navigasi Utama"
        className="flex items-center bg-emerald-900/60 p-1 rounded-xl border border-emerald-700/40 shadow-inner max-w-full overflow-x-auto scrollbar-none"
      >
        <div className="flex items-center gap-0.5">
          {visibleTabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectTab(tab.id)}
                className={`whitespace-nowrap px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  active
                    ? "bg-white text-emerald-950 shadow-xs border border-white/80 font-bold"
                    : "text-emerald-100 hover:text-white hover:bg-emerald-800/60"
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Kanan: Status Shift Kasir / Back-Office, Jam, & Profil Pengguna */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Status Shift Kasir Aktif / Tutup (Hanya relevan untuk pengguna dengan wewenang Kasir) */}
        {canAccessPos ? (
          activeShift ? (
            <div
              title={`Shift Aktif: Dibuka ${new Date(activeShift.opened_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })} oleh ${activeShift.cashier_name_snapshot}`}
              className="hidden sm:flex items-center gap-1.5 bg-emerald-700/60 border border-emerald-600/60 rounded-xl px-2.5 py-1 text-xs font-semibold text-emerald-100 shadow-xs"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              <span className="whitespace-nowrap">Shift Aktif</span>
            </div>
          ) : (
            <div
              title="Belum ada sesi shift kasir aktif di terminal ini"
              className="hidden sm:flex items-center gap-1.5 bg-emerald-950/40 border border-emerald-700/40 rounded-xl px-2.5 py-1 text-xs font-medium text-emerald-300/70 shadow-xs"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/40 shrink-0" />
              <span className="whitespace-nowrap">Shift Tutup</span>
            </div>
          )
        ) : (
          <div
            title={`Mode Back-Office: ${user?.role === "STOCK" ? "Pengelolaan Stok & Produk" : "Pelaporan & Analisis Laba"}`}
            className="hidden sm:flex items-center gap-1.5 bg-emerald-700/60 border border-emerald-600/60 rounded-xl px-2.5 py-1 text-xs font-semibold text-emerald-100 shadow-xs"
          >
            <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
            <span className="whitespace-nowrap">Back-Office</span>
          </div>
        )}

        {/* Kapsul Status Koneksi LAN & Jam Tenang HH:mm */}
        <div className="flex items-center gap-2 bg-emerald-900/60 border border-emerald-700/40 rounded-xl px-2.5 py-1 shadow-inner">
          {lanConnected ? (
            <div
              title={
                isServer
                  ? `Server LAN aktif di port ${cfg?.server_bind_port}`
                  : `Terhubung ke Server ${cfg?.client_target_ip}:${cfg?.client_target_port}`
              }
              className="flex items-center gap-1.5 text-emerald-200 text-xs font-medium cursor-default"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              <span className="whitespace-nowrap hidden xl:inline">
                {isServer ? "Server" : "Online"}
              </span>
            </div>
          ) : (
            <div
              title={terminalStatus?.server_error || "Koneksi ke Server terputus"}
              className="flex items-center gap-1.5 text-xs font-bold text-rose-300 bg-rose-950/60 px-1.5 py-0.5 rounded border border-rose-700/60 cursor-default"
            >
              <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
              <span>OFFLINE</span>
            </div>
          )}

          <div className="w-px h-3.5 bg-emerald-700/50 shrink-0" />

          <div className="text-xs font-mono tabular-nums text-white font-semibold whitespace-nowrap">
            {clock}
          </div>
        </div>

        {/* Profil Pengguna Terintegrasi & Tombol Keluar */}
        <div className="flex items-center gap-2 bg-emerald-900/60 border border-emerald-700/40 rounded-xl px-2.5 py-1 shadow-inner">
          <div className="w-6 h-6 rounded-full bg-emerald-700 border border-emerald-500/40 flex items-center justify-center text-xs font-bold text-white shrink-0">
            {user?.full_name ? user.full_name.charAt(0).toUpperCase() : user?.username.charAt(0).toUpperCase()}
          </div>
          <div className="text-left leading-tight hidden md:block">
            <div className="text-xs font-bold text-white truncate max-w-[120px]">
              {user?.full_name || user?.username}
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-300">
              {user?.role === "ADMIN"
                ? "ADMIN"
                : user?.role === "STOCK"
                ? "PETUGAS STOK"
                : user?.role === "REPORTER"
                ? "PETUGAS LAPORAN"
                : "KASIR"}
            </div>
          </div>

          <div className="w-px h-3.5 bg-emerald-700/50 shrink-0 hidden md:block" />

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
