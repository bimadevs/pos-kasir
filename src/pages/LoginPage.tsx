import React, { useState } from "react";
import {
  AlertCircle,
  KeyRound,
  LogIn,
  Server,
  Store,
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
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between p-6">
      {/* Top Status Strip */}
      <div className="max-w-5xl w-full mx-auto flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center">
            <Store className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-sm tracking-wide text-white">
            {terminalStatus?.store_name || "POS-KASIR MINIMARKET"}
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <span className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-slate-200 flex items-center gap-1.5 font-medium">
            <Server className="w-3.5 h-3.5 text-emerald-400" />
            {cfg?.terminal_name} ({cfg?.terminal_mode})
          </span>

          {lanConnected ? (
            <span className="px-2.5 py-1 rounded bg-emerald-950/90 border border-emerald-600/50 text-emerald-300 flex items-center gap-1.5 font-medium">
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              {isServer
                ? `Server LAN Aktif (Port ${cfg?.server_bind_port})`
                : `Terhubung ke ${cfg?.client_target_ip}:${cfg?.client_target_port}`}
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded bg-red-950 border border-red-500 text-red-200 flex items-center gap-1.5 font-semibold animate-pulse">
              <WifiOff className="w-3.5 h-3.5 text-red-400" />
              Terputus dari Server ({cfg?.client_target_ip})
            </span>
          )}
        </div>
      </div>

      {/* Kartu Login */}
      <div className="max-w-md w-full mx-auto my-auto">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-7 shadow-2xl">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-white">
              Masuk Operator Kasir
            </h1>
            <p className="text-xs text-slate-300 mt-1">
              Gunakan akun <strong>Cashier</strong> atau <strong>Admin</strong>{" "}
              untuk membuka meja kasir.
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3.5 rounded-lg bg-red-950/90 border border-red-500/60 text-red-200 flex items-start gap-2.5 text-xs">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                Username
              </label>
              <div className="relative">
                <UserCheck className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
                <input
                  type="text"
                  required
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Ketik username (misal: admin atau kasir1)"
                  className="w-full pl-10 pr-3.5 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                Password
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-3.5 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || !lanConnected}
              className="w-full mt-2 py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow cursor-pointer transition-colors"
            >
              <LogIn className="w-4 h-4" />
              {submitting ? "Memverifikasi Kredensial..." : "Buka Meja Kasir"}
            </button>
          </form>

          {isServer && (
            <div className="mt-6 pt-4 border-t border-slate-700/80 text-xs text-slate-300 flex items-center justify-between">
              <span>Pairing Code LAN Toko:</span>
              <code className="px-2 py-0.5 rounded bg-slate-900 border border-slate-600 text-emerald-300 font-mono font-bold tracking-widest">
                {cfg?.pairing_code || "-"}
              </code>
            </div>
          )}
        </div>
      </div>

      <footer className="max-w-5xl w-full mx-auto flex items-center justify-between text-xs text-slate-400 border-t border-slate-800 pt-4">
        <span>POS-Kasir {APP_VERSION_LABEL} • Keyboard-First Retail System</span>
        <span>
          IP Lokal Mesin:{" "}
          {terminalStatus?.local_lan_ips?.join(", ") || "127.0.0.1"}
        </span>
      </footer>
    </div>
  );
};
