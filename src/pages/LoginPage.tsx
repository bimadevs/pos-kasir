import React, { useState } from "react";
import {
  AlertCircle,
  KeyRound,
  LogIn,
  Server,
  UserCheck,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useTerminal } from "../context/TerminalContext";
import { APP_VERSION_LABEL } from "../version";

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const { terminalStatus } = useTerminal();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cfg = terminalStatus?.config;
  const isServer = cfg?.terminal_mode === "SERVER";
  const lanConnected = terminalStatus?.lan_connected ?? false;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login({ username: username.trim(), password });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f6f5] text-zinc-800 flex flex-col justify-between p-6 select-none">
      {/* Top Status Strip */}
      <div className="max-w-5xl w-full mx-auto flex items-center justify-between border-b border-zinc-200 pb-4">
        <div className="flex items-center gap-2.5">
          <img
            src="/logo.png"
            alt="Logo Mudita Mart"
            className="h-8 object-contain"
          />
          <span className="font-extrabold text-sm tracking-wide text-emerald-950">
            {terminalStatus?.store_name || "MUDITA MART"}
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <span className="px-2.5 py-1 rounded-lg bg-white border border-zinc-200 text-zinc-700 flex items-center gap-1.5 font-medium shadow-2xs">
            <Server className="w-3.5 h-3.5 text-zinc-500" />
            {cfg?.terminal_name} ({cfg?.terminal_mode})
          </span>

          {lanConnected ? (
            <span className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-800 flex items-center gap-1.5 font-semibold shadow-2xs">
              <Wifi className="w-3.5 h-3.5 text-emerald-600" />
              {isServer
                ? `Server LAN Aktif (Port ${cfg?.server_bind_port})`
                : `Terhubung ke ${cfg?.client_target_ip}:${cfg?.client_target_port}`}
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-full bg-rose-50 border border-rose-300 text-rose-700 flex items-center gap-1.5 font-semibold animate-pulse shadow-2xs">
              <WifiOff className="w-3.5 h-3.5 text-rose-600" />
              Terputus dari Server ({cfg?.client_target_ip})
            </span>
          )}
        </div>
      </div>

      {/* Kartu Login */}
      <div className="max-w-md w-full mx-auto my-auto">
        <div className="bg-white border border-zinc-200/90 rounded-2xl p-7 shadow-xl shadow-emerald-950/5">
          <div className="mb-6 flex items-center gap-3.5">
            <img
              src="/logo-emblem.png"
              alt="Logo Mudita Mart"
              className="w-12 h-12 rounded-xl object-contain bg-emerald-50/60 border border-emerald-200 p-1.5 shadow-xs"
            />
            <div>
              <h1 className="text-xl font-bold text-zinc-900 tracking-tight flex items-center gap-1.5">
                <span>Masuk <span className="text-zinc-900">Mudita</span> <span className="text-amber-500 font-extrabold">Mart</span></span>
              </h1>
              <p className="text-xs text-zinc-500 mt-0.5">
                Gunakan akun <strong>Cashier</strong> atau <strong>Admin</strong>{" "}
                untuk membuka meja kasir.
              </p>
            </div>
          </div>

          {error && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-2.5 text-xs shadow-2xs">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span className="font-semibold leading-relaxed">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1.5">
                Username
              </label>
              <div className="relative">
                <UserCheck className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  required
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Ketik username (misal: admin atau kasir1)"
                  className="w-full h-10 pl-10 pr-3.5 rounded-xl bg-zinc-50 border border-zinc-300 text-zinc-900 text-sm focus:bg-white focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 transition-all placeholder:text-zinc-400 shadow-2xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-10 pl-10 pr-3.5 rounded-xl bg-zinc-50 border border-zinc-300 text-zinc-900 text-sm focus:bg-white focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 transition-all placeholder:text-zinc-400 shadow-2xs"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || !lanConnected}
              className="w-full mt-2 h-11 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 active:scale-[0.98] disabled:opacity-50 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm cursor-pointer transition-all disabled:cursor-not-allowed disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
            >
              <LogIn className="w-4 h-4" />
              {submitting ? "Memverifikasi Kredensial..." : "Buka Meja Kasir"}
            </button>
          </form>

          {isServer && (
            <div className="mt-6 pt-4 border-t border-zinc-100 text-xs text-zinc-500 flex items-center justify-between">
              <span>Pairing Code LAN Toko:</span>
              <code className="px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-900 font-mono font-bold tracking-widest shadow-2xs">
                {cfg?.pairing_code || "-"}
              </code>
            </div>
          )}
        </div>
      </div>

      <footer className="max-w-5xl w-full mx-auto flex items-center justify-between text-xs text-zinc-400 border-t border-zinc-200 pt-4">
        <span>Mudita Mart {APP_VERSION_LABEL} • Sistem Kasir Ritel SMK Mudita</span>
        <span>
          IP Lokal Mesin:{" "}
          {terminalStatus?.local_lan_ips?.join(", ") || "127.0.0.1"}
        </span>
      </footer>
    </div>
  );
};
