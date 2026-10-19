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
    <header className="h-13 bg-zinc-950 text-zinc-100 border-b border-zinc-800/80 px-4 flex items-center justify-between shrink-0 select-none">
      {/* Kiri: Identitas Toko & Navigasi Peran */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5 pr-3 border-r border-zinc-800">
          <div className="w-7 h-7 rounded-md bg-indigo-600 flex items-center justify-center shadow-xs">
            <Store className="w-4 h-4 text-white" />
          </div>
          <div className="leading-tight">
            <div className="font-bold text-sm text-white tracking-tight flex items-center gap-1.5">
              <span>{terminalStatus?.store_name || "POS-KASIR"}</span>
              <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-300">
                {APP_VERSION_LABEL}
              </span>
            </div>
            <div className="text-[10px] text-zinc-400 flex items-center gap-1">
              <Monitor className="w-3 h-3 text-zinc-400" />
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
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
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
            className="px-2.5 py-1 rounded-full bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 text-xs font-medium flex items-center gap-1.5"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
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
            className="px-3 py-1 rounded-full bg-rose-950/60 border border-rose-500/50 text-rose-300 text-xs font-bold flex items-center gap-1.5 animate-pulse"
          >
            <WifiOff className="w-3.5 h-3.5 text-rose-400" />
            <span>TERPUTUS DARI SERVER</span>
          </div>
        )}

        <div className="text-xs font-mono tabular-nums text-zinc-300 bg-zinc-900 border border-zinc-800 px-2.5 py-1 rounded-md">
          {clock}
        </div>

        <div className="flex items-center gap-2 pl-2 border-l border-zinc-800">
          <div className="text-right leading-tight">
            <div className="text-xs font-semibold text-white">
              {user?.full_name}
            </div>
            <div className="text-[10px]">
              <span
                className={`px-1.5 py-0.5 rounded font-bold uppercase ${
                  isAdmin
                    ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
                    : "bg-zinc-800 text-zinc-300 border border-zinc-700"
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
            className="p-1.5 rounded-lg bg-zinc-900 hover:bg-rose-950/60 text-zinc-400 hover:text-rose-300 border border-zinc-800 hover:border-rose-800/60 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
