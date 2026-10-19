import React, { useEffect, useState } from "react";
import {
  BarChart3,
  ClipboardList,
  LogOut,
  Monitor,
  Package,
  Settings,
  ShoppingCart,
  Store,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useTerminal } from "../../context/TerminalContext";
import type { AppNavTab } from "../../types/domain";
import { APP_VERSION_LABEL } from "../../version";

interface TopBarProps {
  activeTab: AppNavTab;
  onSelectTab: (tab: AppNavTab) => void;
}

export const TopBar: React.FC<TopBarProps> = ({ activeTab, onSelectTab }) => {
  const { user, isAdmin, logout } = useAuth();
  const { terminalStatus } = useTerminal();
  const [clock, setClock] = useState<string>("");

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

  const cfg = terminalStatus?.config;
  const isServer = cfg?.terminal_mode === "SERVER";
  const lanConnected = terminalStatus?.lan_connected ?? false;

  const navItems: {
    id: AppNavTab;
    label: string;
    icon: React.ReactNode;
    adminOnly: boolean;
  }[] = [
    {
      id: "POS",
      label: "Kasir (POS)",
      icon: <ShoppingCart className="w-4 h-4" />,
      adminOnly: false,
    },
    {
      id: "PRODUCTS",
      label: "Produk & CSV",
      icon: <Package className="w-4 h-4" />,
      adminOnly: true,
    },
    {
      id: "STOCK",
      label: "Stok / Koreksi",
      icon: <ClipboardList className="w-4 h-4" />,
      adminOnly: true,
    },
    {
      id: "REPORTS",
      label: "Laporan & Laba",
      icon: <BarChart3 className="w-4 h-4" />,
      adminOnly: true,
    },
    {
      id: "USERS",
      label: "Pengguna",
      icon: <Users className="w-4 h-4" />,
      adminOnly: true,
    },
    {
      id: "SETTINGS",
      label: isAdmin ? "Pengaturan" : "Printer Lokal",
      icon: <Settings className="w-4 h-4" />,
      adminOnly: false,
    },
  ];

  const visibleTabs = navItems.filter((item) => !item.adminOnly || isAdmin);

  return (
    <header className="h-13 bg-slate-900 text-slate-100 border-b border-slate-800 px-4 flex items-center justify-between shrink-0 select-none">
      {/* Kiri: Identitas Toko & Navigasi Peran */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5 pr-3 border-r border-slate-700">
          <div className="w-7 h-7 rounded bg-emerald-600 flex items-center justify-center">
            <Store className="w-4 h-4 text-white" />
          </div>
          <div className="leading-tight">
            <div className="font-bold text-sm text-white tracking-tight flex items-center gap-1.5">
              <span>{terminalStatus?.store_name || "POS-KASIR"}</span>
              <span className="px-1.5 py-0.2 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono text-emerald-400">
                {APP_VERSION_LABEL}
              </span>
            </div>
            <div className="text-[10px] text-slate-400 flex items-center gap-1">
              <Monitor className="w-3 h-3 text-slate-400" />
              <span>
                {cfg?.terminal_name} ({isServer ? "Server" : "Client"})
              </span>
            </div>
          </div>
        </div>

        {/* Navigasi Tab */}
        <nav className="flex items-center gap-1">
          {visibleTabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  active
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Kanan: Indikator LAN Real-Time, Jam, User Badge, & Logout */}
      <div className="flex items-center gap-3">
        {lanConnected ? (
          <div
            title={
              isServer
                ? `Server LAN berjalan di port ${cfg?.server_bind_port}`
                : `Terhubung ke Server ${cfg?.client_target_ip}:${cfg?.client_target_port}`
            }
            className="px-2.5 py-1 rounded-full bg-emerald-950/90 border border-emerald-600/50 text-emerald-300 text-xs font-medium flex items-center gap-1.5"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              {isServer
                ? `LAN Server Aktif`
                : `Server ${cfg?.client_target_ip}`}
            </span>
          </div>
        ) : (
          <div
            title={terminalStatus?.server_error || "Koneksi ke Server terputus"}
            className="px-3 py-1 rounded-full bg-red-950 border border-red-500 text-red-200 text-xs font-bold flex items-center gap-1.5 animate-pulse"
          >
            <WifiOff className="w-3.5 h-3.5 text-red-400" />
            <span>TERPUTUS DARI SERVER</span>
          </div>
        )}

        <div className="text-xs font-mono tabular-nums text-slate-300 bg-slate-800/90 border border-slate-700 px-2.5 py-1 rounded">
          {clock}
        </div>

        <div className="flex items-center gap-2 pl-2 border-l border-slate-700">
          <div className="text-right leading-tight">
            <div className="text-xs font-semibold text-white">
              {user?.full_name}
            </div>
            <div className="text-[10px]">
              <span
                className={`px-1.5 py-0.2 rounded font-bold uppercase ${
                  isAdmin
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    : "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                }`}
              >
                {user?.role}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void logout()}
            title="Keluar Sesi Kasir"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-900/70 text-slate-300 hover:text-red-200 border border-slate-700 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
