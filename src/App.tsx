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
  const { user, isAdmin, loadingAuth } = useAuth();
  const [activeTab, setActiveTab] = useState<AppNavTab>("POS");

  // Reset to POS tab when a non-admin logs in
  useEffect(() => {
    if (user && !isAdmin && activeTab !== "POS" && activeTab !== "SETTINGS") {
      setActiveTab("POS");
    }
  }, [user, isAdmin, activeTab]);

  if (loadingTerminal || loadingAuth) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-950 text-zinc-100 select-none">
        <div className="w-9 h-9 border-3 border-teal-500 border-t-transparent rounded-full animate-spin mb-3" />
        <div className="text-sm font-semibold tracking-wide text-zinc-300">
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
        {activeTab === "POS" && <PosRegisterPage />}
        {activeTab === "PRODUCTS" && isAdmin && <ProductsPage />}
        {activeTab === "STOCK" && isAdmin && <StockAdjustmentPage />}
        {activeTab === "REPORTS" && isAdmin && <ReportsPage />}
        {activeTab === "USERS" && isAdmin && <UsersPage />}
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
