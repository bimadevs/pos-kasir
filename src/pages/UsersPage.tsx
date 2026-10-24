import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Edit3,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  User as UserIcon,
  UserCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { ipc } from "../services/ipc";
import type { UpsertUserRequest, User, UserRole } from "../types/domain";
import { formatDateTimeId } from "../utils/posCalculator";

function getAvatarColor(role: UserRole): string {
  if (role === "ADMIN") {
    return "bg-emerald-700 text-white border border-emerald-600";
  }
  return "bg-amber-600 text-white border border-amber-500";
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatUserErrorMessage(err: unknown, username: string): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  if (
    lower.includes("unique constraint failed: users.username") ||
    lower.includes("already exists") ||
    lower.includes("sudah digunakan")
  ) {
    return `Username "${username}" sudah digunakan oleh akun lain. Silakan pilih username yang berbeda.`;
  }
  if (lower.includes("password pengguna baru minimal 6") || lower.includes("password baru minimal 6")) {
    return "Kata sandi login minimal 6 karakter demi keamanan akun kasir/admin.";
  }
  if (lower.includes("wajib memiliki pin") || lower.includes("pin harus berupa 4")) {
    return "Pengguna dengan peran ADMIN wajib memiliki PIN Otorisasi Void (4–6 digit angka).";
  }
  if (lower.includes("tidak dapat menonaktifkan")) {
    return "Anda tidak dapat menonaktifkan akun Admin yang sedang aktif digunakan login saat ini.";
  }
  return raw;
}

export const UsersPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Global Page feedback (only for page-level actions or after modal closes)
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | "ADMIN" | "CASHIER">("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");

  // Modal State
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [username, setUsername] = useState<string>("");
  const [fullName, setFullName] = useState<string>("");
  const [role, setRole] = useState<UserRole>("CASHIER");
  const [password, setPassword] = useState<string>("");
  const [pin, setPin] = useState<string>("");
  const [isActive, setIsActive] = useState<boolean>(true);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showPin, setShowPin] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  // Focus ref
  const fullNameInputRef = useRef<HTMLInputElement | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const list = await ipc.listUsers();
      setUsers(list);
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  // Handle ESC key to dismiss modal cleanly
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && modalOpen && !saving) {
        setModalOpen(false);
        setModalError(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [modalOpen, saving]);

  // Focus first input when modal opens
  useEffect(() => {
    if (modalOpen) {
      const timer = setTimeout(() => {
        fullNameInputRef.current?.focus();
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [modalOpen]);

  // Auto-dismiss success feedback after 6 seconds
  useEffect(() => {
    if (feedback && feedback.type === "success") {
      const timer = setTimeout(() => {
        setFeedback(null);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  const openCreateModal = () => {
    setEditingUser(null);
    setUsername("");
    setFullName("");
    setRole("CASHIER");
    setPassword("");
    setPin("");
    setIsActive(true);
    setShowPassword(false);
    setShowPin(false);
    setModalError(null);
    setModalOpen(true);
  };

  const openEditModal = (u: User) => {
    setEditingUser(u);
    setUsername(u.username);
    setFullName(u.full_name);
    setRole(u.role);
    setPassword("");
    setPin("");
    setIsActive(u.is_active);
    setShowPassword(false);
    setShowPin(false);
    setModalError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedFullName = fullName.trim();
    const trimmedUsername = username.trim().toLowerCase();
    const trimmedPassword = password.trim();
    const trimmedPin = pin.trim();

    // 1. Client-side Validation: Nama Lengkap
    if (!trimmedFullName) {
      setModalError("Nama lengkap pengguna wajib diisi.");
      fullNameInputRef.current?.focus();
      return;
    }

    // 2. Client-side Validation: Username
    if (!trimmedUsername) {
      setModalError("Username login wajib diisi.");
      return;
    }
    if (trimmedUsername.length < 3) {
      setModalError("Username login minimal 3 karakter alfanumerik.");
      return;
    }
    if (/\s/.test(trimmedUsername)) {
      setModalError("Username login tidak boleh mengandung spasi.");
      return;
    }

    // 3. Client-side Validation: Password (Backend requires min 6 chars)
    if (!editingUser) {
      if (!trimmedPassword) {
        setModalError("Kata sandi awal wajib diisi (minimal 6 karakter).");
        return;
      }
      if (trimmedPassword.length < 6) {
        setModalError("Kata sandi awal minimal 6 karakter demi keamanan akun.");
        return;
      }
    } else {
      if (trimmedPassword && trimmedPassword.length < 6) {
        setModalError("Kata sandi baru minimal 6 karakter (atau kosongkan jika tidak ingin diubah).");
        return;
      }
    }

    // 4. Client-side Validation: PIN Otorisasi Void untuk Admin
    if (role === "ADMIN") {
      if (!editingUser) {
        if (!trimmedPin) {
          setModalError("Pengguna dengan peran ADMIN wajib memiliki PIN Otorisasi Void (4–6 digit angka).");
          return;
        }
        if (trimmedPin.length < 4 || trimmedPin.length > 6 || !/^\d+$/.test(trimmedPin)) {
          setModalError("PIN Otorisasi Void harus terdiri dari 4 hingga 6 digit angka.");
          return;
        }
      } else {
        if (trimmedPin && (trimmedPin.length < 4 || trimmedPin.length > 6 || !/^\d+$/.test(trimmedPin))) {
          setModalError("PIN Otorisasi Void harus terdiri dari 4 hingga 6 digit angka.");
          return;
        }
      }
    }

    // 5. Client-side Validation: Self-deactivation protection
    if (editingUser && editingUser.id === currentUser?.id && !isActive) {
      setModalError("Anda tidak dapat menonaktifkan akun Admin yang sedang Anda gunakan saat ini.");
      return;
    }

    setSaving(true);
    setModalError(null);

    try {
      const payload: UpsertUserRequest = {
        id: editingUser?.id ?? null,
        username: trimmedUsername,
        full_name: trimmedFullName,
        role,
        password: trimmedPassword ? trimmedPassword : null,
        pin: role === "ADMIN" && trimmedPin ? trimmedPin : null,
        is_active: isActive,
      };

      await ipc.upsertUser(payload);
      setModalOpen(false);
      setModalError(null);
      await loadUsers();

      setFeedback({
        type: "success",
        message: editingUser
          ? `Akun pengguna "${payload.full_name}" (@${payload.username}) berhasil diperbarui.`
          : `Akun pengguna "${payload.full_name}" (@${payload.username}) berhasil ditambahkan ke sistem.`,
      });
    } catch (err) {
      const readableError = formatUserErrorMessage(err, trimmedUsername);
      setModalError(readableError);
    } finally {
      setSaving(false);
    }
  };

  // Filtered users calculation
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        u.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.username.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesRole =
        roleFilter === "ALL" || u.role === roleFilter;

      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" && u.is_active) ||
        (statusFilter === "INACTIVE" && !u.is_active);

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, searchQuery, roleFilter, statusFilter]);

  // Summary Metrics
  const totalCount = users.length;
  const cashierCount = users.filter((u) => u.role === "CASHIER").length;
  const adminCount = users.filter((u) => u.role === "ADMIN").length;
  const adminWithPinCount = users.filter((u) => u.role === "ADMIN" && u.has_pin).length;

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-zinc-100/70 space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-teal-600 text-white shadow-xs">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-zinc-900 tracking-tight">
                Manajemen Akun Kasir &amp; Admin
              </h1>
              <p className="text-xs text-zinc-500 mt-0.5">
                Kelola hak akses peran (Admin vs Cashier), reset kata sandi, dan atur PIN Otorisasi Void (4–6 digit).
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => void loadUsers()}
            title="Muat ulang daftar pengguna"
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 active:bg-zinc-100 active:scale-[0.98] text-xs font-bold text-zinc-700 shadow-2xs transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Segarkan
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 active:bg-teal-700 active:scale-[0.98] text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            Tambah Pengguna Baru
          </button>
        </div>
      </div>

      {/* Global Feedback Banner (Success only) */}
      {feedback && (
        <div
          role="status"
          aria-live="polite"
          className={`flex items-start justify-between gap-3 px-4 py-3 rounded-xl border text-xs font-semibold shadow-2xs animate-in fade-in duration-200 ${
            feedback.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-rose-50 border-rose-200 text-rose-900"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-zinc-400 hover:text-zinc-700 p-0.5 rounded cursor-pointer transition-colors"
            aria-label="Tutup notifikasi"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Quick Stats Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="bg-white rounded-2xl border border-zinc-200/80 p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
              Total Pengguna
            </span>
            <div className="p-1.5 rounded-lg bg-zinc-100 text-zinc-600">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-zinc-900 tracking-tight">
            {totalCount}
          </div>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            Akun terdaftar di database
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-zinc-200/80 p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
              Kasir Operasional
            </span>
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100">
              <UserIcon className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-zinc-900 tracking-tight">
            {cashierCount}
          </div>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Hak akses terminal kasir POS
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-zinc-200/80 p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-teal-700">
              Admin &amp; Manajer
            </span>
            <div className="p-1.5 rounded-lg bg-teal-50 text-teal-600 border border-teal-100">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-zinc-900 tracking-tight">
            {adminCount}
          </div>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Hak akses manajemen &amp; laporan
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-zinc-200/80 p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
              PIN Void Terkonfigurasi
            </span>
            <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600 border border-amber-100">
              <KeyRound className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-zinc-900 tracking-tight">
            {adminWithPinCount} <span className="text-xs font-semibold text-zinc-400">/ {adminCount}</span>
          </div>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Admin dengan otorisasi void aktif
          </p>
        </div>
      </div>

      {/* Main Content Card: Filters & Table */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-2xs overflow-hidden">
        {/* Table Filter Toolbar */}
        <div className="p-4 border-b border-zinc-200/80 bg-zinc-50/50 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama lengkap atau username..."
              className="w-full pl-9 pr-8 py-2 text-xs border border-zinc-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 text-zinc-900 placeholder:text-zinc-400 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 p-0.5 rounded cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
            {/* Filter Peran */}
            <div className="flex items-center bg-zinc-200/70 p-0.5 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setRoleFilter("ALL")}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  roleFilter === "ALL"
                    ? "bg-white text-zinc-900 shadow-2xs font-bold"
                    : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                Semua Peran
              </button>
              <button
                type="button"
                onClick={() => setRoleFilter("ADMIN")}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  roleFilter === "ADMIN"
                    ? "bg-white text-teal-700 shadow-2xs font-bold"
                    : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                Admin
              </button>
              <button
                type="button"
                onClick={() => setRoleFilter("CASHIER")}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  roleFilter === "CASHIER"
                    ? "bg-white text-emerald-700 shadow-2xs font-bold"
                    : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                Kasir
              </button>
            </div>

            {/* Filter Status */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "ALL" | "ACTIVE" | "INACTIVE")}
              className="px-3 py-1.5 text-xs font-semibold border border-zinc-300 rounded-xl bg-white text-zinc-700 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 cursor-pointer"
            >
              <option value="ALL">Semua Status</option>
              <option value="ACTIVE">Hanya Aktif</option>
              <option value="INACTIVE">Hanya Nonaktif</option>
            </select>
          </div>
        </div>

        {/* Users Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-[11px] font-bold uppercase tracking-wider text-zinc-600">
              <tr>
                <th className="py-3.5 px-5">Nama Pengguna</th>
                <th className="py-3.5 px-5">Username</th>
                <th className="py-3.5 px-5">Peran (Role)</th>
                <th className="py-3.5 px-5">PIN Otorisasi Void</th>
                <th className="py-3.5 px-5">Status Akun</th>
                <th className="py-3.5 px-5">Dibuat Pada</th>
                <th className="py-3.5 px-5 text-center">Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-zinc-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
                      <span className="font-medium">Memuat data akun kasir &amp; admin...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-zinc-500">
                    <div className="max-w-sm mx-auto flex flex-col items-center gap-2">
                      <div className="p-3 rounded-full bg-zinc-100 text-zinc-400">
                        <Users className="w-6 h-6" />
                      </div>
                      <p className="font-bold text-zinc-700 text-sm">
                        {users.length === 0 ? "Belum ada akun pengguna" : "Tidak ada akun yang sesuai"}
                      </p>
                      <p className="text-xs text-zinc-400">
                        {users.length === 0
                          ? "Silakan klik tombol '+ Tambah Pengguna Baru' untuk membuat kasir pertama Anda."
                          : "Coba ubah kata kunci pencarian atau sesuaikan filter peran/status di atas."}
                      </p>
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => {
                            setSearchQuery("");
                            setRoleFilter("ALL");
                            setStatusFilter("ALL");
                          }}
                          className="mt-2 text-xs font-bold text-teal-600 hover:text-teal-800 cursor-pointer"
                        >
                          Reset Pencarian &amp; Filter
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isCurrent = currentUser?.id === u.id;
                  const avatarColor = getAvatarColor(u.role);
                  const initials = getInitials(u.full_name || u.username);

                  return (
                    <tr
                      key={u.id}
                      className={`hover:bg-zinc-50/80 transition-colors ${
                        !u.is_active ? "opacity-60 bg-zinc-50/50" : ""
                      }`}
                    >
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center font-bold font-mono text-xs shrink-0 shadow-2xs ${avatarColor}`}
                          >
                            {initials}
                          </div>
                          <div>
                            <div className="font-bold text-zinc-900 text-sm flex items-center gap-1.5">
                              {u.full_name}
                              {isCurrent && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-50 border border-teal-200 text-teal-700 font-bold">
                                  Anda
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-zinc-400 md:hidden font-mono mt-0.5">
                              @{u.username}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-5 font-mono font-semibold text-zinc-700">
                        @{u.username}
                      </td>

                      <td className="py-3.5 px-5">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                            u.role === "ADMIN"
                              ? "bg-teal-50 text-teal-700 border-teal-200/80"
                              : "bg-zinc-100 text-zinc-700 border-zinc-200/80"
                          }`}
                        >
                          {u.role === "ADMIN" ? (
                            <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
                          ) : (
                            <UserIcon className="w-3.5 h-3.5 text-zinc-600" />
                          )}
                          {u.role === "ADMIN" ? "ADMIN" : "KASIR"}
                        </span>
                      </td>

                      <td className="py-3.5 px-5">
                        {u.role === "ADMIN" ? (
                          u.has_pin ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200/70">
                              <KeyRound className="w-3.5 h-3.5 text-emerald-600" />
                              PIN Aktif (Argon2id)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200/70">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                              Belum Diatur (Wajib)
                            </span>
                          )
                        ) : (
                          <span className="text-zinc-400 text-xs font-medium">
                            Tidak Diperlukan
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-5">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            u.is_active
                              ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                              : "bg-zinc-100 border border-zinc-200 text-zinc-600"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              u.is_active ? "bg-emerald-500" : "bg-zinc-400"
                            }`}
                          />
                          {u.is_active ? "AKTIF" : "NONAKTIF"}
                        </span>
                      </td>

                      <td className="py-3.5 px-5 font-mono text-zinc-500 text-[11px]">
                        {formatDateTimeId(u.created_at)}
                      </td>

                      <td className="py-3.5 px-5 text-center">
                        <button
                          type="button"
                          onClick={() => openEditModal(u)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-50 active:bg-zinc-100 active:scale-[0.98] hover:border-teal-300 text-zinc-700 hover:text-teal-700 font-semibold transition-all cursor-pointer text-xs shadow-2xs"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Edit Akun
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Add / Edit User */}
      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="user-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-emerald-950/40 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget && !saving) {
              setModalOpen(false);
              setModalError(null);
            }
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-zinc-200/80 w-full max-w-lg overflow-hidden my-auto transform transition-all"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-emerald-700 text-white px-6 py-4 flex items-center justify-between border-b border-emerald-800/80 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-800/80 text-amber-300 border border-emerald-600/60">
                  {editingUser ? (
                    <Edit3 className="w-5 h-5" />
                  ) : (
                    <UserPlus className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3
                    id="user-modal-title"
                    className="font-bold text-base tracking-tight text-white"
                  >
                    {editingUser ? "Edit Akun Pengguna" : "Tambah Pengguna Baru"}
                  </h3>
                  <p className="text-xs text-emerald-100 mt-0.5">
                    {editingUser
                      ? "Perbarui informasi akun, hak akses peran, atau reset kata sandi & PIN otorisasi."
                      : "Lengkapi formulir di bawah ini untuk membuat akun kasir atau administrator baru."}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!saving) {
                    setModalOpen(false);
                    setModalError(null);
                  }
                }}
                disabled={saving}
                title="Tutup (Esc)"
                className="text-emerald-100 hover:text-white p-1 rounded-lg cursor-pointer transition-colors disabled:opacity-40 hover:bg-emerald-800/80"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form
              onSubmit={(e) => void handleSave(e)}
              className="p-6 space-y-4 text-xs"
            >
              {/* Prominent In-Modal Error Alert Banner */}
              {modalError && (
                <div
                  role="alert"
                  aria-live="assertive"
                  className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-3 shadow-xs animate-in fade-in slide-in-from-top-2 duration-200"
                >
                  <div className="p-1 rounded-lg bg-rose-100 text-rose-600 shrink-0 mt-0.5">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-xs text-rose-950 uppercase tracking-wider">
                        Gagal Menyimpan Akun
                      </h4>
                      <button
                        type="button"
                        onClick={() => setModalError(null)}
                        className="text-rose-400 hover:text-rose-700 p-0.5 rounded transition-colors cursor-pointer"
                        aria-label="Tutup pesan error"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-xs text-rose-800 mt-1 font-semibold leading-relaxed">
                      {modalError}
                    </p>
                    <p className="text-[11px] text-rose-600 mt-1">
                      Silakan periksa kembali data isian di bawah ini dan coba lagi.
                    </p>
                  </div>
                </div>
              )}

              {/* Input: Nama Lengkap */}
              <div>
                <label className="block font-bold uppercase tracking-wider text-zinc-600 mb-1">
                  Nama Lengkap Pengguna <span className="text-rose-500">*</span>
                </label>
                <input
                  ref={fullNameInputRef}
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    if (modalError) setModalError(null);
                  }}
                  placeholder="Contoh: Budi Santoso / Siti Rahmawati"
                  className="w-full px-3.5 py-2.5 text-xs border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 text-zinc-900 transition-all placeholder:text-zinc-400"
                />
              </div>

              {/* Grid: Username & Peran Selection */}
              <div>
                <label className="block font-bold uppercase tracking-wider text-zinc-600 mb-1">
                  Username Login <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-zinc-400 font-bold">
                    @
                  </span>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => {
                      // Normalize username: lowercase, no whitespace
                      setUsername(e.target.value.toLowerCase().replace(/\s+/g, ""));
                      if (modalError) setModalError(null);
                    }}
                    placeholder="kasir1"
                    className="w-full pl-8 pr-3.5 py-2.5 font-mono text-xs border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 text-zinc-900 transition-all placeholder:text-zinc-400"
                  />
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">
                  Digunakan untuk otentikasi login kasir (minimal 3 karakter alfanumerik tanpa spasi).
                </p>
              </div>

              {/* Role Selection Cards */}
              <div>
                <label className="block font-bold uppercase tracking-wider text-zinc-600 mb-1.5">
                  Hak Akses Peran (Role) <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setRole("CASHIER");
                      if (modalError) setModalError(null);
                    }}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      role === "CASHIER"
                        ? "bg-emerald-50/60 border-emerald-500 ring-2 ring-emerald-500/20"
                        : "bg-zinc-50 border-zinc-200 hover:bg-zinc-100/70"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-extrabold text-xs text-zinc-900 flex items-center gap-1.5">
                        <UserIcon className="w-4 h-4 text-emerald-600" />
                        CASHIER
                      </span>
                      <span
                        className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                          role === "CASHIER"
                            ? "border-emerald-600 bg-emerald-600"
                            : "border-zinc-300 bg-white"
                        }`}
                      >
                        {role === "CASHIER" && (
                          <span className="w-1.5 h-1.5 rounded-full bg-white" />
                        )}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 leading-tight">
                      Akses operasional POS kasir harian, transaksi penjualan, dan cetak struk nota.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setRole("ADMIN");
                      if (modalError) setModalError(null);
                    }}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      role === "ADMIN"
                        ? "bg-teal-50/60 border-teal-500 ring-2 ring-teal-500/20"
                        : "bg-zinc-50 border-zinc-200 hover:bg-zinc-100/70"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-extrabold text-xs text-zinc-900 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-teal-600" />
                        ADMIN
                      </span>
                      <span
                        className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                          role === "ADMIN"
                            ? "border-teal-600 bg-teal-600"
                            : "border-zinc-300 bg-white"
                        }`}
                      >
                        {role === "ADMIN" && (
                          <span className="w-1.5 h-1.5 rounded-full bg-white" />
                        )}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 leading-tight">
                      Akses penuh manajemen katalog, stok opname, laporan laba, &amp; otorisasi void via PIN.
                    </p>
                  </button>
                </div>
              </div>

              {/* Password Input with Visibility Toggle */}
              <div>
                <label className="block font-bold uppercase tracking-wider text-zinc-600 mb-1">
                  {editingUser ? (
                    "Kata Sandi Baru (Kosongkan jika tidak diubah)"
                  ) : (
                    <span>
                      Kata Sandi Login (Min. 6 Karakter) <span className="text-rose-500">*</span>
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required={!editingUser}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (modalError) setModalError(null);
                    }}
                    placeholder={editingUser ? "•••••••• (Tetap menggunakan sandi lama)" : "Minimal 6 karakter"}
                    className="w-full pl-3.5 pr-10 py-2.5 text-xs border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 text-zinc-900 transition-all placeholder:text-zinc-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer p-1"
                    aria-label={showPassword ? "Sembunyikan kata sandi" : "Lihat kata sandi"}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">
                  {editingUser
                    ? "Isi kolom ini hanya jika Anda ingin mengubah kata sandi akun pengguna."
                    : "Kata sandi dienkripsi menggunakan Argon2id demi keamanan database."}
                </p>
              </div>

              {/* Conditional PIN Section for ADMIN role */}
              {role === "ADMIN" && (
                <div className="bg-amber-50/70 border border-amber-200/90 rounded-xl p-4 space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-amber-600" />
                    <label className="font-bold uppercase tracking-wider text-amber-950 text-xs">
                      {editingUser ? (
                        "PIN Otorisasi Void Baru (4–6 Digit, Opsional)"
                      ) : (
                        <span>
                          PIN Otorisasi Void (4–6 Digit Angka) <span className="text-rose-500">*</span>
                        </span>
                      )}
                    </label>
                  </div>
                  <div className="relative">
                    <input
                      type={showPin ? "text" : "password"}
                      inputMode="numeric"
                      maxLength={6}
                      required={!editingUser}
                      value={pin}
                      onChange={(e) => {
                        setPin(e.target.value.replace(/[^0-9]/g, ""));
                        if (modalError) setModalError(null);
                      }}
                      placeholder="123456"
                      className="w-full pl-3.5 pr-10 py-2 font-mono tracking-widest text-center text-sm font-bold border border-amber-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600 text-zinc-900 bg-white transition-all placeholder:text-zinc-300"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      tabIndex={-1}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-600 hover:text-amber-800 cursor-pointer p-1"
                      aria-label={showPin ? "Sembunyikan PIN" : "Lihat PIN"}
                    >
                      {showPin ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    <strong>Penting:</strong> PIN ini rahasia dan akan diminta di meja kasir ketika kasir ingin melakukan pembatalan transaksi (Void).
                  </p>
                </div>
              )}

              {/* Status Switch (Edit Mode Only) */}
              {editingUser && (
                <div className="pt-1">
                  <label className="flex items-start gap-3 p-3 rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-zinc-100/60 transition-colors cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isActive}
                      disabled={currentUser?.id === editingUser.id}
                      onChange={(e) => {
                        setIsActive(e.target.checked);
                        if (modalError) setModalError(null);
                      }}
                      className="mt-0.5 rounded border-zinc-300 text-teal-600 focus:ring-teal-500 w-4 h-4 cursor-pointer disabled:opacity-50"
                    />
                    <div>
                      <span className="font-bold text-zinc-900 text-xs block">
                        Status Akun Pengguna Aktif
                      </span>
                      <span className="text-[11px] text-zinc-500 block mt-0.5">
                        {currentUser?.id === editingUser.id
                          ? "Anda tidak dapat menonaktifkan akun sendiri demi mencegah terputusnya akses."
                          : "Jika dinonaktifkan, akun ini tidak akan dapat login ke terminal kasir maupun web."}
                      </span>
                    </div>
                  </label>
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => {
                    setModalOpen(false);
                    setModalError(null);
                  }}
                  disabled={saving}
                  className="px-4 py-2.5 rounded-xl border border-zinc-300 font-bold text-zinc-700 hover:bg-zinc-50 active:bg-zinc-100 active:scale-[0.98] transition-all cursor-pointer text-xs shadow-2xs disabled:opacity-50"
                >
                  Batal (Esc)
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 active:bg-teal-700 active:scale-[0.98] text-white font-bold transition-all cursor-pointer shadow-xs disabled:bg-zinc-300 disabled:cursor-not-allowed text-xs"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Menyimpan...
                    </>
                  ) : (
                    <>
                      <UserCheck className="w-4 h-4" />
                      {editingUser ? "Perbarui Akun" : "Simpan Pengguna"}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
