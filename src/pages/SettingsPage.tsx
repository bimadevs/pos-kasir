import React, { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Database,
  HardDriveDownload,
  HardDriveUpload,
  Network,
  Power,
  Printer,
  RefreshCw,
  Save,
  Store,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useTerminal } from "../context/TerminalContext";
import { ipc } from "../services/ipc";
import type { PrinterConfig } from "../types/domain";

export const SettingsPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const { terminalStatus, refreshTerminalStatus, openReceiptPreview } =
    useTerminal();

  const cfg = terminalStatus?.config;
  const isServer = cfg?.terminal_mode === "SERVER";

  // Printer state (Local Terminal)
  const [printers, setPrinters] = useState<string[]>([]);
  const [printerName, setPrinterName] = useState<string>(
    cfg?.printer.printer_name || "POS-Kasir Virtual Thermal Printer (Simulasi)"
  );
  const [paperWidth, setPaperWidth] = useState<number>(
    cfg?.printer.paper_width || 58
  );
  const [autoOpenDrawer, setAutoOpenDrawer] = useState<boolean>(
    cfg?.printer.auto_open_drawer ?? true
  );
  const [previewOnScreen, setPreviewOnScreen] = useState<boolean>(
    cfg?.printer.preview_on_screen ?? true
  );

  // Store & LAN state (Admin only)
  const [storeName, setStoreName] = useState<string>("");
  const [storeAddress, setStoreAddress] = useState<string>("");
  const [storePhone, setStorePhone] = useState<string>("");
  const [receiptFooter, setReceiptFooter] = useState<string>("");
  const [pairingCode, setPairingCode] = useState<string>("");

  // Database Backup & Restore state (Admin on Server)
  const [backupPath, setBackupPath] = useState<string>(
    `pos-kasir-backup-${new Date().toISOString().slice(0, 10)}.db`
  );
  const [restorePath, setRestorePath] = useState<string>("");

  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const sysPrinters = await ipc.listLocalPrinters();
      setPrinters(sysPrinters);

      const settings = await ipc.getStoreSettings();
      setStoreName(settings.store_name);
      setStoreAddress(settings.store_address);
      setStorePhone(settings.store_phone);
      setReceiptFooter(settings.receipt_footer);
      setPairingCode(settings.pairing_code);
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const handleSavePrinter = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const newPrinter: PrinterConfig = {
        printer_name: printerName,
        paper_width: paperWidth,
        auto_open_drawer: autoOpenDrawer,
        preview_on_screen: previewOnScreen,
      };
      await ipc.updatePrinterConfig(newPrinter);
      await refreshTerminalStatus();
      setFeedback({
        type: "success",
        message: "Konfigurasi printer lokal berhasil disimpan.",
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleTestPrint = async () => {
    try {
      const currentPrinter: PrinterConfig = {
        printer_name: printerName,
        paper_width: paperWidth,
        auto_open_drawer: autoOpenDrawer,
        preview_on_screen: previewOnScreen,
      };
      const outcome = await ipc.testPrinterAndDrawer(
        currentPrinter,
        autoOpenDrawer
      );
      openReceiptPreview(
        {
          store_name: storeName || "Minimarket POS-Kasir",
          store_address: storeAddress || "Jl. Contoh No. 1",
          store_phone: storePhone || "0812-0000-0000",
          receipt_footer: receiptFooter || "Terima kasih!",
          is_reprint: false,
          sale: {
            id: "test",
            receipt_number: "TEST-PRINT-0001",
            cashier_id: "test",
            cashier_name_snapshot: "Test Printer",
            terminal_name: cfg?.terminal_name || "Terminal",
            subtotal: 15000,
            discount_total: 0,
            total_amount: 15000,
            cash_received: 20000,
            change_amount: 5000,
            status: "COMPLETED",
            voided_by_user_id: null,
            voided_by_name_snapshot: null,
            void_reason: null,
            voided_at: null,
            transaction_date: new Date().toISOString().slice(0, 10),
            created_at: new Date().toISOString(),
          },
          items: [],
        },
        outcome
      );
      setFeedback({
        type: "success",
        message: `Test print berhasil dikirim ke "${outcome.printer_name}".`,
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message: `Gagal test print: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
    }
  };

  const handleOpenCashDrawer = async () => {
    try {
      const outcome = await ipc.kickCashDrawer();
      setFeedback({
        type: "success",
        message: `Sinyal buka laci kasir (RJ11 0x1B 0x70) berhasil dikirim ke "${outcome.printer_name}".`,
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message: `Gagal membuka laci kasir: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
    }
  };

  const handleSaveStore = async (
    e: React.FormEvent,
    regenerateCode: boolean = false
  ) => {
    e.preventDefault();
    if (!isAdmin) return;
    try {
      const updated = await ipc.updateStoreSettings({
        store_name: storeName.trim(),
        store_address: storeAddress.trim(),
        store_phone: storePhone.trim(),
        receipt_footer: receiptFooter.trim(),
        regenerate_pairing_code: regenerateCode,
      });
      setStoreName(updated.store_name);
      setStoreAddress(updated.store_address);
      setStorePhone(updated.store_phone);
      setReceiptFooter(updated.receipt_footer);
      setPairingCode(updated.pairing_code);
      await refreshTerminalStatus();
      setFeedback({
        type: "success",
        message: regenerateCode
          ? `Pairing Code LAN baru berhasil dibuat: ${updated.pairing_code}`
          : "Profil toko & teks struk berhasil diperbarui.",
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleBackupDatabase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!backupPath.trim()) return;
    try {
      const savedPath = await ipc.backupDatabase(backupPath.trim());
      setFeedback({
        type: "success",
        message: `Backup database SQLite berhasil disimpan di: ${savedPath}`,
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message: `Gagal backup: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
    }
  };

  const handleRestoreDatabase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restorePath.trim()) return;
    try {
      await ipc.restoreDatabase(restorePath.trim());
      setFeedback({
        type: "success",
        message:
          "Database berhasil dipulihkan (Restore) dari file cadangan dan telah diverifikasi.",
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message: `Gagal restore: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
    }
  };

  const lanIps = terminalStatus?.local_lan_ips || [];

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-100 space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
          Pengaturan Perangkat, Toko &amp; Pemeliharaan Sistem
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Konfigurasi printer thermal ESC/POS lokal, laci uang RJ11, jaringan LAN, serta Backup/Restore SQLite.
        </p>
      </div>

      {feedback && (
        <div
          className={`px-4 py-3 rounded-xl border flex items-center justify-between text-xs font-semibold ${
            feedback.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {feedback.message}
          </span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="underline ml-4 cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      <div className="grid grid-cols-12 gap-5">
        {/* Card 1: Local Printer & Cash Drawer Configuration (6 cols) */}
        <div className="col-span-6 bg-white rounded-2xl border border-slate-200 shadow-2xs p-5 space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-200">
            <Printer className="w-5 h-5 text-blue-600" />
            <div>
              <h2 className="font-bold text-sm text-slate-900">
                Printer Struk Thermal &amp; Laci Kasir (Terminal Lokal)
              </h2>
              <p className="text-[11px] text-slate-500">
                Berlaku khusus pada PC terminal ini ({cfg?.terminal_name}).
              </p>
            </div>
          </div>

          <form
            onSubmit={(e) => void handleSavePrinter(e)}
            className="space-y-4 text-xs"
          >
            <div>
              <label className="block font-bold uppercase tracking-wider text-slate-600 mb-1">
                Pilih Printer Thermal (Win32 Spooler / Simulasi)
              </label>
              <select
                value={printerName}
                onChange={(e) => setPrinterName(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-900 font-medium"
              >
                {printers.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold uppercase tracking-wider text-slate-600 mb-1">
                Ukuran Lebar Kertas Thermal
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPaperWidth(58)}
                  className={`py-2.5 px-3 rounded-xl border font-bold text-xs cursor-pointer ${
                    paperWidth === 58
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-slate-50 text-slate-700 border-slate-200"
                  }`}
                >
                  58mm (32 Karakter / Baris)
                </button>
                <button
                  type="button"
                  onClick={() => setPaperWidth(80)}
                  className={`py-2.5 px-3 rounded-xl border font-bold text-xs cursor-pointer ${
                    paperWidth === 80
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-slate-50 text-slate-700 border-slate-200"
                  }`}
                >
                  80mm (48 Karakter / Baris)
                </button>
              </div>
            </div>

            <div className="space-y-2.5 pt-1">
              <label className="flex items-center gap-2.5 font-semibold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoOpenDrawer}
                  onChange={(e) => setAutoOpenDrawer(e.target.checked)}
                />
                Otomatis kirim sinyal buka laci kasir (RJ11 Pulse 0x1B 0x70) saat bayar
              </label>

              <label className="flex items-center gap-2.5 font-semibold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={previewOnScreen}
                  onChange={(e) => setPreviewOnScreen(e.target.checked)}
                />
                Tampilkan pratinjau struk di layar setelah transaksi selesai
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 pt-3 border-t border-slate-200">
              <button
                type="submit"
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                Simpan Printer
              </button>
              <button
                type="button"
                onClick={() => void handleTestPrint()}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Test Print Struk
              </button>
              <button
                type="button"
                onClick={() => void handleOpenCashDrawer()}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold cursor-pointer"
              >
                Test Buka Laci (RJ11)
              </button>
            </div>
          </form>
        </div>

        {/* Card 2: Store Profile & LAN Pairing (6 cols) */}
        <div className="col-span-6 bg-white rounded-2xl border border-slate-200 shadow-2xs p-5 space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-200">
            <Store className="w-5 h-5 text-emerald-600" />
            <div>
              <h2 className="font-bold text-sm text-slate-900">
                Identitas Minimarket &amp; Konektivitas LAN
              </h2>
              <p className="text-[11px] text-slate-500">
                Header/footer struk dan kode penyandingan untuk Client Terminal.
              </p>
            </div>
          </div>

          <form
            onSubmit={(e) => void handleSaveStore(e, false)}
            className="space-y-3.5 text-xs"
          >
            <div>
              <label className="block font-bold uppercase tracking-wider text-slate-600 mb-1">
                Nama Minimarket / Toko
              </label>
              <input
                type="text"
                disabled={!isAdmin}
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-300 rounded-xl disabled:bg-slate-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Alamat Toko
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={storeAddress}
                  onChange={(e) => setStoreAddress(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl disabled:bg-slate-100"
                />
              </div>
              <div>
                <label className="block font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Nomor Telepon
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={storePhone}
                  onChange={(e) => setStorePhone(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl disabled:bg-slate-100"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold uppercase tracking-wider text-slate-600 mb-1">
                Pesan Kaki Struk (Footer)
              </label>
              <input
                type="text"
                disabled={!isAdmin}
                value={receiptFooter}
                onChange={(e) => setReceiptFooter(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-300 rounded-xl disabled:bg-slate-100"
              />
            </div>

            {isAdmin && (
              <div className="pt-1">
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  Simpan Identitas Toko
                </button>
              </div>
            )}
          </form>

          {/* LAN Info Box */}
          <div className="bg-slate-900 text-white rounded-xl p-4 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-bold text-slate-200">
                <Network className="w-4 h-4 text-emerald-400" />
                Mode Terminal: {cfg?.terminal_mode} ({cfg?.terminal_name})
              </span>
              <span className="font-mono text-slate-400">
                Port LAN: {cfg?.server_bind_port || 9876}
              </span>
            </div>

            <div className="text-slate-300">
              IP LAN Terdeteksi:{" "}
              <span className="font-mono font-bold text-white">
                {lanIps.join(", ") || "127.0.0.1"}
              </span>
            </div>

            {isAdmin && pairingCode && (
              <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                <div>
                  <span className="text-slate-400 block text-[11px]">
                    LAN Pairing Code (X-Setup-Pairing-Code):
                  </span>
                  <span className="font-mono font-extrabold text-lg tracking-widest text-amber-400">
                    {pairingCode}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={(e) => void handleSaveStore(e, true)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Acak Ulang Kode
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Card 3: SQLite Backup, Restore & Server Shutdown (12 cols, Admin on Server) */}
        {isAdmin && isServer && (
          <div className="col-span-12 bg-white rounded-2xl border border-slate-200 shadow-2xs p-5">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <Database className="w-5 h-5 text-purple-600" />
                <div>
                  <h2 className="font-bold text-sm text-slate-900">
                    Pemeliharaan Database SQLite (Backup &amp; Restore Online)
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Menggunakan <code>VACUUM INTO</code> agar aman dieksekusi meskipun Server sedang melayani transaksi LAN.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void ipc.quitApplication()}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-xs font-bold cursor-pointer"
                title="Matikan Server Terminal dan keluar dari proses latar belakang"
              >
                <Power className="w-4 h-4" />
                Matikan Server &amp; Keluar Aplikasi
              </button>
            </div>

            <div className="grid grid-cols-2 gap-6 text-xs">
              <form
                onSubmit={(e) => void handleBackupDatabase(e)}
                className="space-y-3"
              >
                <label className="block font-bold uppercase tracking-wider text-slate-600">
                  1. Buat Cadangan Database (Backup SQLite)
                </label>
                <p className="text-slate-500">
                  Masukkan nama file atau path tujuan untuk menyimpan salinan utuh database <code>pos_kasir.db</code>.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={backupPath}
                    onChange={(e) => setBackupPath(e.target.value)}
                    placeholder="pos-kasir-backup.db"
                    className="flex-1 px-3.5 py-2 font-mono border border-slate-300 rounded-xl"
                  />
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold shrink-0 cursor-pointer"
                  >
                    <HardDriveDownload className="w-4 h-4" />
                    Backup Sekarang
                  </button>
                </div>
              </form>

              <form
                onSubmit={(e) => void handleRestoreDatabase(e)}
                className="space-y-3"
              >
                <label className="block font-bold uppercase tracking-wider text-slate-600">
                  2. Pulihkan Database dari File Cadangan (Restore)
                </label>
                <p className="text-slate-500">
                  Masukkan path file cadangan <code>.db</code> yang valid. Sistem otomatis membuat salinan pengaman sebelum menimpa data.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={restorePath}
                    onChange={(e) => setRestorePath(e.target.value)}
                    placeholder="/path/ke/pos-kasir-backup.db"
                    className="flex-1 px-3.5 py-2 font-mono border border-slate-300 rounded-xl"
                  />
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold shrink-0 cursor-pointer"
                  >
                    <HardDriveUpload className="w-4 h-4" />
                    Restore Database
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
