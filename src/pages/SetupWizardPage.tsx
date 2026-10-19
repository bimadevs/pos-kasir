import React, { useState } from "react";
import {
  CheckCircle2,
  Database,
  Monitor,
  Network,
  Server,
  ShieldCheck,
  Store,
  Wifi,
  AlertTriangle,
  ArrowLeft,
} from "lucide-react";
import { ipc } from "../services/ipc";
import { useTerminal } from "../context/TerminalContext";
import type { HealthCheckResponse } from "../types/domain";
import { APP_VERSION_LABEL } from "../version";

export const SetupWizardPage: React.FC = () => {
  const { refreshTerminalStatus } = useTerminal();
  const [selectedMode, setSelectedMode] = useState<"SERVER" | "CLIENT" | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // State Form Server Terminal
  const [storeName, setStoreName] = useState("Minimarket Maju Jaya");
  const [storeAddress, setStoreAddress] = useState(
    "Jl. Raya Niaga No. 18, Jakarta",
  );
  const [storePhone, setStorePhone] = useState("0812-3456-7890");
  const [serverTerminalName, setServerTerminalName] = useState(
    "Kasir 1 (Server Utama)",
  );
  const [adminUsername, setAdminUsername] = useState("admin");
  const [adminFullName, setAdminFullName] = useState("Budi Santoso (Owner)");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminPin, setAdminPin] = useState("");
  const [seedSampleData, setSeedSampleData] = useState(true);

  // State Form Client Terminal
  const [serverIp, setServerIp] = useState("192.168.1.10");
  const [serverPort, setServerPort] = useState(3847);
  const [pairingCode, setPairingCode] = useState("");
  const [clientTerminalName, setClientTerminalName] = useState("Kasir 2");
  const [testingConn, setTestingConn] = useState(false);
  const [connResult, setConnResult] = useState<HealthCheckResponse | null>(
    null,
  );

  const handleServerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await ipc.setupServerTerminal({
        store_name: storeName,
        store_address: storeAddress,
        store_phone: storePhone,
        terminal_name: serverTerminalName,
        admin_username: adminUsername,
        admin_full_name: adminFullName,
        admin_password: adminPassword,
        admin_pin: adminPin,
        seed_sample_data: seedSampleData,
      });
      await refreshTerminalStatus();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleTestClientConnection = async () => {
    setErrorMsg(null);
    setConnResult(null);
    setTestingConn(true);
    try {
      const res = await ipc.testClientConnection({
        server_ip: serverIp.trim(),
        server_port: Number(serverPort) || 3847,
        pairing_code: pairingCode.trim().toUpperCase(),
        terminal_name: clientTerminalName.trim() || "Kasir 2",
      });
      setConnResult(res);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setTestingConn(false);
    }
  };

  const handleClientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await ipc.setupClientTerminal({
        server_ip: serverIp.trim(),
        server_port: Number(serverPort) || 3847,
        pairing_code: pairingCode.trim().toUpperCase(),
        terminal_name: clientTerminalName.trim() || "Kasir 2",
      });
      await refreshTerminalStatus();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between p-6">
      {/* Header Identitas Setup */}
      <header className="max-w-5xl w-full mx-auto flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-600 flex items-center justify-center shadow-sm">
            <Store className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              <span>POS-KASIR — Konfigurasi Awal Terminal</span>
              <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-xs font-mono text-emerald-400">
                {APP_VERSION_LABEL}
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Arsitektur Dual-Mode LAN Minimarket (1 Server Terminal + hingga 5
              Client Terminal)
            </p>
          </div>
        </div>
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
          STATUS: BELUM DIKONFIGURASI
        </span>
      </header>

      {/* Konten Utama */}
      <main className="max-w-5xl w-full mx-auto my-auto py-6">
        {errorMsg && (
          <div className="mb-6 p-4 rounded-lg bg-red-950/90 border border-red-500/60 text-red-100 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold">Konfigurasi Gagal</p>
              <p className="text-red-200 mt-0.5">{errorMsg}</p>
            </div>
          </div>
        )}

        {selectedMode === null ? (
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white">
                Pilih Peran Komputer Kasir Ini
              </h2>
              <p className="text-sm text-slate-300 mt-1">
                File aplikasi ini dapat berjalan sebagai pusat database toko
                maupun sebagai meja kasir pendamping di jaringan LAN.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Kartu Pilihan 1: Server Terminal */}
              <button
                type="button"
                onClick={() => {
                  setErrorMsg(null);
                  setSelectedMode("SERVER");
                }}
                className="text-left group rounded-xl bg-slate-800/90 hover:bg-slate-800 border-2 border-slate-700 hover:border-emerald-500 p-6 transition-colors cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                      <Server className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-mono uppercase px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-700/50">
                      1 PC Utama per Toko
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-white group-hover:text-emerald-400 transition-colors">
                    Jadikan Komputer Server Utama (Server Terminal)
                  </h3>
                  <p className="text-sm text-slate-300 mt-2 leading-relaxed">
                    Pilih ini untuk <strong>1 komputer utama toko</strong> yang
                    menyimpan database SQLite terpusat, membuka layanan LAN
                    otomatis, sekaligus dipakai melayani transaksi kasir.
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-700/80 flex items-center justify-between text-xs text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Database className="w-4 h-4 text-emerald-400" /> Database
                    SQLite WAL Lokal
                  </span>
                  <span className="font-semibold text-emerald-400">
                    Pilih Mode Server →
                  </span>
                </div>
              </button>

              {/* Kartu Pilihan 2: Client Terminal */}
              <button
                type="button"
                onClick={() => {
                  setErrorMsg(null);
                  setSelectedMode("CLIENT");
                }}
                className="text-left group rounded-xl bg-slate-800/90 hover:bg-slate-800 border-2 border-slate-700 hover:border-sky-500 p-6 transition-colors cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
                      <Monitor className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-mono uppercase px-2.5 py-1 rounded bg-sky-950 text-sky-300 border border-sky-700/50">
                      Hingga 5 PC Pendamping
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-white group-hover:text-sky-400 transition-colors">
                    Hubungkan sebagai Kasir Pendamping (Client Terminal)
                  </h3>
                  <p className="text-sm text-slate-300 mt-2 leading-relaxed">
                    Pilih ini untuk{" "}
                    <strong>komputer meja kasir ke-2 s.d. ke-5</strong> yang
                    terhubung ke Komputer Server melalui kabel LAN atau Wi-Fi
                    lokal toko.
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-700/80 flex items-center justify-between text-xs text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Network className="w-4 h-4 text-sky-400" /> Sinkron Real-Time
                    via LAN
                  </span>
                  <span className="font-semibold text-sky-400">
                    Pilih Mode Client →
                  </span>
                </div>
              </button>
            </div>
          </div>
        ) : selectedMode === "SERVER" ? (
          <form
            onSubmit={handleServerSubmit}
            className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-xl"
          >
            <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-700">
              <div className="flex items-center gap-3">
                <Server className="w-6 h-6 text-emerald-400" />
                <div>
                  <h2 className="text-lg font-bold text-white">
                    Inisialisasi Server Terminal & Akun Admin Pertama
                  </h2>
                  <p className="text-xs text-slate-300">
                    Membuat database toko, Pairing Code LAN, dan kredensial
                    Admin utama.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMode(null)}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white px-3 py-1.5 rounded-lg bg-slate-700/70 hover:bg-slate-700 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" /> Ganti Mode
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Kolom Kiri: Identitas Toko */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  1. Identitas Toko & Terminal
                </h3>
                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1">
                    Nama Toko / Minimarket *
                  </label>
                  <input
                    type="text"
                    required
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white text-sm focus:outline-none focus:border-emerald-500"
                    placeholder="Contoh: Toko Maju Jaya"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1">
                    Alamat Toko (Tercetak di Struk)
                  </label>
                  <input
                    type="text"
                    value={storeAddress}
                    onChange={(e) => setStoreAddress(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white text-sm focus:outline-none focus:border-emerald-500"
                    placeholder="Jl. Merdeka No. 10"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-200 mb-1">
                      Nomor Telepon Toko
                    </label>
                    <input
                      type="text"
                      value={storePhone}
                      onChange={(e) => setStorePhone(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white text-sm focus:outline-none focus:border-emerald-500"
                      placeholder="0812..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-200 mb-1">
                      Nama Meja Kasir Ini *
                    </label>
                    <input
                      type="text"
                      required
                      value={serverTerminalName}
                      onChange={(e) => setServerTerminalName(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white text-sm focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <label className="flex items-start gap-3 p-3 rounded-lg bg-emerald-950/40 border border-emerald-700/50 cursor-pointer mt-2">
                  <input
                    type="checkbox"
                    checked={seedSampleData}
                    onChange={(e) => setSeedSampleData(e.target.checked)}
                    className="mt-1 w-4 h-4 accent-emerald-500"
                  />
                  <div className="text-xs">
                    <span className="font-semibold text-emerald-300 block">
                      Muat data contoh minimarket (Direkomendasikan untuk uji
                      coba)
                    </span>
                    <span className="text-slate-300">
                      Menambahkan 15 produk populer (termasuk contoh diskon,
                      stok menipis, & stok 0) serta akun Kasir sampel (
                      <code>kasir1</code> / <code>kasir123</code>).
                    </span>
                  </div>
                </label>
              </div>

              {/* Kolom Kanan: Akun Admin Pertama */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" /> 2. Akun Admin Pertama &
                  PIN Otorisasi Void
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-200 mb-1">
                      Username Login *
                    </label>
                    <input
                      type="text"
                      required
                      minLength={3}
                      value={adminUsername}
                      onChange={(e) => setAdminUsername(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white text-sm focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-200 mb-1">
                      Nama Lengkap Admin *
                    </label>
                    <input
                      type="text"
                      required
                      value={adminFullName}
                      onChange={(e) => setAdminFullName(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white text-sm focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1">
                    Password Admin (Min. 6 Karakter) *
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="Minimal 6 karakter"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1">
                    PIN Otorisasi Admin (4–6 Digit Angka untuk Void Struk) *
                  </label>
                  <input
                    type="password"
                    required
                    pattern="[0-9]{4,6}"
                    maxLength={6}
                    value={adminPin}
                    onChange={(e) =>
                      setAdminPin(e.target.value.replace(/\D/g, ""))
                    }
                    placeholder="Contoh: 123456"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white text-sm font-mono tracking-widest focus:outline-none focus:border-emerald-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    PIN ini digunakan saat mengotorisasi pembatalan transaksi
                    (Void) di meja kasir.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-700 flex items-center justify-end gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm shadow cursor-pointer transition-colors"
              >
                {submitting
                  ? "Menginisialisasi Database & Server LAN..."
                  : "Simpan & Aktifkan Server Terminal"}
              </button>
            </div>
          </form>
        ) : (
          <form
            onSubmit={handleClientSubmit}
            className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-xl max-w-2xl mx-auto"
          >
            <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-700">
              <div className="flex items-center gap-3">
                <Monitor className="w-6 h-6 text-sky-400" />
                <div>
                  <h2 className="text-lg font-bold text-white">
                    Hubungkan Client Terminal ke Server LAN
                  </h2>
                  <p className="text-xs text-slate-300">
                    Masukkan alamat IP dan Pairing Code yang tertera pada menu
                    Pengaturan di Server Terminal.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMode(null)}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white px-3 py-1.5 rounded-lg bg-slate-700/70 hover:bg-slate-700 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" /> Ganti Mode
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-200 mb-1">
                    Alamat IPv4 Server Terminal *
                  </label>
                  <input
                    type="text"
                    required
                    value={serverIp}
                    onChange={(e) => {
                      setServerIp(e.target.value);
                      setConnResult(null);
                    }}
                    placeholder="Contoh: 192.168.1.10"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white text-sm font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1">
                    Port LAN *
                  </label>
                  <input
                    type="number"
                    required
                    value={serverPort}
                    onChange={(e) => {
                      setServerPort(Number(e.target.value));
                      setConnResult(null);
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white text-sm font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1">
                    Pairing Code Toko (6 Karakter) *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={8}
                    value={pairingCode}
                    onChange={(e) => {
                      setPairingCode(e.target.value.toUpperCase());
                      setConnResult(null);
                    }}
                    placeholder="Contoh: A9K2M7"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white text-sm font-mono uppercase tracking-widest focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1">
                    Nama Terminal Kasir Ini *
                  </label>
                  <input
                    type="text"
                    required
                    value={clientTerminalName}
                    onChange={(e) => setClientTerminalName(e.target.value)}
                    placeholder="Contoh: Kasir 2"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white text-sm focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              {connResult && (
                <div className="p-3.5 rounded-lg bg-emerald-950/80 border border-emerald-500/50 text-emerald-200 flex items-center gap-3 text-xs">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <p className="font-bold text-white">
                      Terhubung ke "{connResult.store_name}"
                    </p>
                    <p className="text-emerald-300">
                      Host Server: {connResult.server_terminal_name} — Pairing
                      Code Terverifikasi
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-700 flex items-center justify-between gap-3">
              <button
                type="button"
                disabled={testingConn}
                onClick={handleTestClientConnection}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-semibold text-sm cursor-pointer transition-colors"
              >
                <Wifi className="w-4 h-4 text-sky-400" />
                {testingConn ? "Menguji Koneksi..." : "Uji Koneksi LAN"}
              </button>

              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold text-sm shadow cursor-pointer transition-colors"
              >
                {submitting
                  ? "Menyimpan Konfigurasi..."
                  : "Simpan & Masuk ke Kasir"}
              </button>
            </div>
          </form>
        )}
      </main>

      <footer className="max-w-5xl w-full mx-auto text-center text-xs text-slate-400 border-t border-slate-800 pt-4">
        POS-Kasir Desktop {APP_VERSION_LABEL} • Penyimpanan Lokal{" "}
        <code>%APPDATA%\com.bimadev.pos-kasir</code>
      </footer>
    </div>
  );
};
