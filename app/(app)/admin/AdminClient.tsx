"use client";

import { useState } from "react";

const TODOS_MODULOS = ["dashboard", "validador", "matriz"];
const ROLES = ["analista", "visualizador", "admin"];
const MODULO_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  validador: "Validador",
  matriz: "Matriz",
};

type Usuario = {
  id: string;
  nombre: string;
  email: string;
  rol: string;
  activo: boolean;
  created_at: string;
};

export default function AdminClient({
  usuarios,
  modulosPorUsuario,
  usoCount,
}: {
  usuarios: Usuario[];
  modulosPorUsuario: Record<string, string[]>;
  usoCount: Record<string, number>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    nombre: "",
    email: "",
    password: "",
    rol: "analista",
    modulos: ["dashboard", "validador"],
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const toggleModulo = (m: string) => {
    setForm((f) => ({
      ...f,
      modulos: f.modulos.includes(m)
        ? f.modulos.filter((x) => x !== m)
        : [...f.modulos, m],
    }));
  };

  const crearUsuario = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);

    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();

    if (!res.ok) {
      setMsg({ type: "err", text: data.error ?? "Error al crear usuario" });
    } else {
      setMsg({ type: "ok", text: `Usuario ${form.email} creado correctamente` });
      setShowForm(false);
      setForm({ nombre: "", email: "", password: "", rol: "analista", modulos: ["dashboard", "validador"] });
      setTimeout(() => window.location.reload(), 1200);
    }
    setSaving(false);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Gestión de Usuarios</h1>
          <p className="text-gray-500 text-sm">Crea usuarios y controla su acceso a módulos</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-[#005A9C] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 transition-colors"
        >
          {showForm ? "Cancelar" : "+ Nuevo usuario"}
        </button>
      </div>

      {msg && (
        <div className={`mb-4 p-3 rounded-lg text-sm border ${msg.type === "ok" ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
          {msg.text}
        </div>
      )}

      {/* Formulario nuevo usuario */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Crear nuevo usuario</h2>
          <form onSubmit={crearUsuario} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo</label>
                <input
                  type="text" required value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005A9C]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Correo</label>
                <input
                  type="email" required value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005A9C]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña temporal</label>
                <input
                  type="password" required minLength={8} value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Mínimo 8 caracteres"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005A9C]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                <select
                  value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005A9C]"
                >
                  {ROLES.map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Módulos habilitados</label>
              <div className="flex gap-3 flex-wrap">
                {TODOS_MODULOS.map((m) => (
                  <label key={m} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox" checked={form.modulos.includes(m)}
                      onChange={() => toggleModulo(m)}
                      className="w-4 h-4 accent-[#005A9C]"
                    />
                    <span className="text-sm text-gray-700">{MODULO_LABELS[m]}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit" disabled={saving}
                className="bg-[#005A9C] text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50 transition-colors"
              >
                {saving ? "Creando..." : "Crear usuario"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tabla de usuarios */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Usuario</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Rol</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Módulos</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Validaciones</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Estado</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-800">{u.nombre}</p>
                  <p className="text-gray-400 text-xs">{u.email}</p>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${u.rol === "admin" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                    {u.rol}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {u.rol === "admin" ? (
                    <span className="text-xs text-gray-400">Todos</span>
                  ) : (
                    <div className="flex gap-1 flex-wrap">
                      {(modulosPorUsuario[u.id] ?? []).map((m) => (
                        <span key={m} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                          {MODULO_LABELS[m] ?? m}
                        </span>
                      ))}
                      {(modulosPorUsuario[u.id] ?? []).length === 0 && (
                        <span className="text-xs text-gray-400">Sin acceso</span>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600 font-semibold">
                  {usoCount[u.id] ?? 0}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${u.activo ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {u.activo ? "Activo" : "Inactivo"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
