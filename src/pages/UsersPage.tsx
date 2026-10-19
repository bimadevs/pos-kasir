import React, { useCallback, useEffect, useState } from "react";
import { Edit3, KeyRound, ShieldCheck, UserPlus, Users, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { ipc } from "../services/ipc";
import type { UpsertUserRequest, User, UserRole } from "../types/domain";
import { formatDateTimeId } from "../utils/posCalculator";

export const UsersPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [username, setUsername] = useState<string>("");
  const [fullName, setFullName] = useState<string>("");
  const [role, setRole] = useState<UserRole>("CASHIER");
  const [password, setPassword] = useState<string>("");
  const [pin, setPin] = useState<string>("");
  const [isActive, setIsActive] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

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

  const openCreateModal = () => {
    setEditingUser(null);
    setUsername("");
    setFullName("");
    setRole("CASHIER");
    setPassword("");
    setPin("");
    setIsActive(true);
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
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    setSaving(true);
    setFeedback(null);
    try {
      const payload: UpsertUserRequest = {
        id: editingUser?.id ?? null,
        username: username.trim(),
        full_name: fullName.trim(),
        role,
        password: password ? password : null,
        pin: role === "ADMIN" && pin.trim() ? pin.trim() : null,
        is_active: isActive,
      };
      await ipc.upsertUser(payload);
      setModalOpen(false);
      await loadUsers();
      setFeedback({
        type: "success",
        message: editingUser
          ? `Akun pengguna "${payload.full_name}" berhasil diperbarui.`
          : `Akun pengguna "${payload.full_name}" berhasil ditambahkan.`,
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-zinc-100/70 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-zinc-900 tracking-tight">
            Manajemen Akun Kasir &amp; Admin
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Kelola hak akses peran (Admin vs Cashier), reset kata sandi, dan atur PIN Otorisasi Void (4–6 digit).
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          + Tambah Pengguna
        </button>
      </div>

      {feedback && (
        <div
          className={`px-4 py-3 rounded-xl border text-xs font-semibold ${
            feedback.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          {feedback.message}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-2xs overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="bg-zinc-50 border-b border-zinc-200 text-[11px] font-bold uppercase tracking-wider text-zinc-600">
            <tr>
              <th className="py-3.5 px-5">Nama Lengkap</th>
              <th className="py-3.5 px-5">Username</th>
              <th className="py-3.5 px-5">Peran (Role)</th>
              <th className="py-3.5 px-5">PIN Otorisasi Void</th>
              <th className="py-3.5 px-5">Status</th>
              <th className="py-3.5 px-5">Dibuat Pada</th>
              <th className="py-3.5 px-5 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200">
            {loading ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-zinc-500">
                  Memuat daftar pengguna...
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr
                  key={u.id}
                  className={`hover:bg-zinc-50/80 transition-colors ${
                    !u.is_active ? "opacity-55 bg-zinc-50" : ""
                  }`}
                >
                  <td className="py-3.5 px-5 font-bold text-zinc-900 text-sm">
                    {u.full_name}
                    {currentUser?.id === u.id && (
                      <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold">
                        Anda
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-5 font-mono font-semibold text-zinc-700">
                    {u.username}
                  </td>
                  <td className="py-3.5 px-5">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        u.role === "ADMIN"
                          ? "bg-indigo-50 text-indigo-700 border border-indigo-200/60"
                          : "bg-zinc-100 text-zinc-700 border border-zinc-200"
                      }`}
                    >
                      {u.role === "ADMIN" ? (
                        <ShieldCheck className="w-3.5 h-3.5" />
                      ) : (
                        <Users className="w-3.5 h-3.5" />
                      )}
                      {u.role}
                    </span>
                  </td>
                  <td className="py-3.5 px-5">
                    {u.role === "ADMIN" ? (
                      u.has_pin ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                          <KeyRound className="w-3.5 h-3.5" />
                          PIN Aktif (Terenkripsi Argon2id)
                        </span>
                      ) : (
                        <span className="text-amber-700 font-semibold">
                          Belum Diatur
                        </span>
                      )
                    ) : (
                      <span className="text-zinc-400">Tidak Berlaku</span>
                    )}
                  </td>
                  <td className="py-3.5 px-5">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                        u.is_active
                          ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                          : "bg-zinc-100 border border-zinc-200 text-zinc-600"
                      }`}
                    >
                      {u.is_active ? "AKTIF" : "NONAKTIF"}
                    </span>
                  </td>
                  <td className="py-3.5 px-5 font-mono text-zinc-500">
                    {formatDateTimeId(u.created_at)}
                  </td>
                  <td className="py-3.5 px-5 text-center">
                    <button
                      type="button"
                      onClick={() => openEditModal(u)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-50 hover:border-zinc-300 text-zinc-700 hover:text-indigo-700 font-semibold transition-colors cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit / Reset Sandi
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Add / Edit User */}
      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-zinc-950/70 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-zinc-200 w-full max-w-md overflow-hidden">
            <div className="bg-zinc-950 text-white px-6 py-4 flex items-center justify-between border-b border-zinc-800">
              <h3 className="font-bold text-base tracking-tight">
                {editingUser ? "Edit Akun Pengguna" : "Tambah Pengguna Baru"}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-zinc-400 hover:text-white p-1 rounded-lg cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => void handleSave(e)}
              className="p-6 space-y-4 text-xs"
            >
              <div>
                <label className="block font-bold uppercase tracking-wider text-zinc-600 mb-1">
                  Nama Lengkap *
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Contoh: Budi Santoso"
                  className="w-full px-3.5 py-2 border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all placeholder:text-zinc-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold uppercase tracking-wider text-zinc-600 mb-1">
                    Username Login *
                  </label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="kasir2"
                    className="w-full px-3.5 py-2 font-mono border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all placeholder:text-zinc-400"
                  />
                </div>
                <div>
                  <label className="block font-bold uppercase tracking-wider text-zinc-600 mb-1">
                    Peran (Role) *
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all"
                  >
                    <option value="CASHIER">CASHIER (Kasir)</option>
                    <option value="ADMIN">ADMIN (Pemilik / Manajer)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold uppercase tracking-wider text-zinc-600 mb-1">
                  {editingUser
                    ? "Password Baru (Kosongkan jika tidak diubah)"
                    : "Password Login (Min. 4 Karakter) *"}
                </label>
                <input
                  type="password"
                  required={!editingUser}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2 border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all placeholder:text-zinc-400"
                />
              </div>

              {role === "ADMIN" && (
                <div>
                  <label className="block font-bold uppercase tracking-wider text-zinc-600 mb-1">
                    {editingUser
                      ? "PIN Otorisasi Void Baru (4–6 Digit, Opsional)"
                      : "PIN Otorisasi Void (4–6 Digit Angka) *"}
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    required={!editingUser}
                    value={pin}
                    onChange={(e) =>
                      setPin(e.target.value.replace(/[^0-9]/g, ""))
                    }
                    placeholder="123456"
                    className="w-full px-3.5 py-2 font-mono tracking-widest border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all placeholder:text-zinc-400"
                  />
                </div>
              )}

              {editingUser && (
                <label className="flex items-center gap-2 font-bold text-zinc-800 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isActive}
                    disabled={currentUser?.id === editingUser.id}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Akun Pengguna Aktif
                </label>
              )}

              <div className="flex justify-end gap-2.5 pt-3 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-zinc-300 font-bold text-zinc-700 hover:bg-zinc-50 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-colors cursor-pointer shadow-xs disabled:bg-zinc-300"
                >
                  {saving ? "Menyimpan..." : "Simpan Pengguna"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
