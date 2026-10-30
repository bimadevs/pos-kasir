import React, { useEffect, useState } from "react";
import "./App.css";
import { TopBar } from "./components/layout/TopBar";
import { ReceiptPreviewModal } from "./components/receipt/ReceiptPreviewModal";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { TerminalProvider, useTerminal } from "./context/TerminalContext";
import { LoginPage } from "./pages/LoginPage";
import { PosRegisterPage } from "./pages/PosRegisterPage";
import { ProductsPage } from "./pages/ProductsPage";
import { ReportsPage } from "./pages/ReportsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SetupWizardPage } from "./pages/SetupWizardPage";
import { StockAdjustmentPage } from "./pages/StockAdjustmentPage";
import { UsersPage } from "./pages/UsersPage";
import type { AppNavTab } from "./types/domain";

const AppShell: React.FC = () => {
  const { terminalStatus, loadingTerminal } = useTerminal();
  const {
    user,
    canAccessPos,
    canManageProducts,
    canAdjustStock,
    canViewReports,
    canManageUsers,
    loadingAuth,
  } = useAuth();
  const [activeTab, setActiveTab] = useState<AppNavTab>("POS");

  // Alihkan ke tab awal yang sesuai saat pengguna login atau peran berubah
  const userRole = user?.role;
  useEffect(() => {
    if (!userRole) return;
    if (userRole === "STOCK") {
      setActiveTab((prev) =>
        prev === "PRODUCTS" ||
        prev === "STOCK" ||
        prev === "REPORTS" ||
        prev === "SETTINGS"
          ? prev
          : "PRODUCTS"
      );
    } else if (userRole === "REPORTER") {
      setActiveTab((prev) =>
        prev === "REPORTS" || prev === "SETTINGS" ? prev : "REPORTS"
      );
    } else if (userRole === "CASHIER") {
      setActiveTab((prev) =>
        prev === "POS" || prev === "SETTINGS" ? prev : "POS"
      );
    }
  }, [userRole]);

  if (loadingTerminal || loadingAuth) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#f4f6f5] text-zinc-800 select-none">
        <img
          src="/logo-emblem.png"
          alt="Logo Mudita Mart"
          className="w-16 h-16 object-contain mb-4 animate-pulse"
        />
        <div className="w-9 h-9 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mb-3" />
        <div className="text-sm font-bold tracking-wide text-emerald-950">
          Memuat Sistem Mudita Mart...
        </div>
      </div>
    );
  }

  const mode = terminalStatus?.config.terminal_mode ?? "UNCONFIGURED";
  if (mode === "UNCONFIGURED") {
    return <SetupWizardPage />;
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-zinc-100/80 text-zinc-900">
      <TopBar activeTab={activeTab} onSelectTab={setActiveTab} />

      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {activeTab === "POS" && canAccessPos && <PosRegisterPage />}
        {activeTab === "PRODUCTS" && canManageProducts && <ProductsPage />}
        {activeTab === "STOCK" && canAdjustStock && <StockAdjustmentPage />}
        {activeTab === "REPORTS" && canViewReports && <ReportsPage />}
        {activeTab === "USERS" && canManageUsers && <UsersPage />}
        {activeTab === "SETTINGS" && <SettingsPage />}
      </main>

      <ReceiptPreviewModal />
    </div>
  );
};

export function App() {
  return (
    <TerminalProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </TerminalProvider>
  );
}

export default App;
