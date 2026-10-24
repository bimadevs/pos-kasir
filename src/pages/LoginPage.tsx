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
    <div className="min-h-screen bg-slate-950 text-zinc-100 flex flex-col justify-between p-6">
      {/* Top Status Strip */}
      <div className="max-w-5xl w-full mx-auto flex items-center justify-between border-b border-slate-800/80 pb-4">
        <div className="flex items-center gap-2.5">
          <img
            src="/logo-dark.png"
            alt="Logo Mudita Mart"
            className="h-8 object-contain"
          />
          <span className="font-bold text-sm tracking-wide text-white">
            {terminalStatus?.store_name || "MUDITA MART"}
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <span className="px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-zinc-200 flex items-center gap-1.5 font-medium">
            <Server className="w-3.5 h-3.5 text-zinc-400" />
            {cfg?.terminal_name} ({cfg?.terminal_mode})
          </span>

          {lanConnected ? (
            <span className="px-2.5 py-1 rounded-full bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 flex items-center gap-1.5 font-medium">
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              {isServer
                ? `Server LAN Aktif (Port ${cfg?.server_bind_port})`
                : `Terhubung ke ${cfg?.client_target_ip}:${cfg?.client_target_port}`}
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-full bg-rose-950/60 border border-rose-500/50 text-rose-300 flex items-center gap-1.5 font-semibold animate-pulse">
              <WifiOff className="w-3.5 h-3.5 text-rose-400" />
              Terputus dari Server ({cfg?.client_target_ip})
            </span>
          )}
        </div>
      </div>

      {/* Kartu Login */}
      <div className="max-w-md w-full mx-auto my-auto">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-7 shadow-2xl">
          <div className="mb-6 flex items-center gap-3.5">
            <img
              src="/logo-emblem-dark.png"
              alt="Logo Mudita Mart"
              className="w-12 h-12 rounded-xl object-contain bg-slate-950 border border-slate-800 p-1.5 shadow-md"
            />
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-1.5">
                <span>Masuk <span className="text-white">Mudita</span> <span className="text-amber-400">Mart</span></span>
              </h1>
              <p className="text-xs text-zinc-400 mt-0.5">
                Gunakan akun <strong>Cashier</strong> atau <strong>Admin</strong>{" "}
                untuk membuka meja kasir.
              </p>
            </div>
          </div>

          {error && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-950/60 border border-rose-500/50 text-rose-200 flex items-start gap-2.5 text-xs shadow-xs">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span className="font-medium leading-relaxed">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1.5">
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
                  className="w-full h-10 pl-10 pr-3.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-500/20 transition-all placeholder:text-zinc-500 shadow-2xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1.5">
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
                  className="w-full h-10 pl-10 pr-3.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-500/20 transition-all placeholder:text-zinc-500 shadow-2xs"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || !lanConnected}
              className="w-full mt-2 h-11 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 active:bg-teal-700 active:scale-[0.98] disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-all disabled:cursor-not-allowed disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/30"
            >
              <LogIn className="w-4 h-4" />
              {submitting ? "Memverifikasi Kredensial..." : "Buka Meja Kasir"}
            </button>
          </form>

          {isServer && (
            <div className="mt-6 pt-4 border-t border-slate-800 text-xs text-zinc-400 flex items-center justify-between">
              <span>Pairing Code LAN Toko:</span>
              <code className="px-2.5 py-1 rounded-md bg-slate-950 border border-slate-800 text-teal-300 font-mono font-bold tracking-widest shadow-2xs">
                {cfg?.pairing_code || "-"}
              </code>
            </div>
          )}
        </div>
      </div>

      <footer className="max-w-5xl w-full mx-auto flex items-center justify-between text-xs text-zinc-500 border-t border-zinc-800/80 pt-4">
        <span>Mudita Mart {APP_VERSION_LABEL} • Sistem Kasir Ritel SMK Mudita</span>
        <span>
          IP Lokal Mesin:{" "}
          {terminalStatus?.local_lan_ips?.join(", ") || "127.0.0.1"}
        </span>
      </footer>
    </div>
  );
};
