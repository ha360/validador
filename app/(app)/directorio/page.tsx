"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

type Contacto = {
  id: number;
  nombre: string;
  cargo: string | null;
  email: string | null;
  telefono: string | null;
  departamento: string | null;
  zona: string | null;
  tipo: string | null;
};

export default function DirectorioPage() {
  const supabase = createClient();
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [loading, setLoading] = useState(true);
  const [esAdmin, setEsAdmin] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtroZona, setFiltroZona] = useState("");
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setEsAdmin(user.user_metadata?.rol === "admin");
      const { data } = await supabase.from("directorio").select("*").order("nombre");
      setContactos(data ?? []);
      setLoading(false);
    })();
  }, []);

  const zonas = useMemo(() => [...new Set(contactos.map(c => c.zona).filter(Boolean) as string[])].sort(), [contactos]);

  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase();
    return contactos.filter(c => {
      if (q && ![c.nombre, c.cargo, c.email, c.departamento, c.zona].some(f => f?.toLowerCase().includes(q))) return false;
      if (filtroZona && c.zona !== filtroZona) return false;
      return true;
    });
  }, [contactos, busqueda, filtroZona]);

  const importar = async (file: File) => {
    setImporting(true); setMsg(null);
    const fd = new FormData(); fd.append("file", file);
    const res = await fetch("/api/admin/import-directorio", { method: "POST", body: fd });
    const data = await res.json();
    setImporting(false);
    if (!res.ok || data.errors > 0) {
      setMsg({ type: "err", text: data.error ?? `${data.errors} errores al importar` });
    } else {
      setMsg({ type: "ok", text: `Importados ${data.inserted} contactos` });
      setTimeout(() => window.location.reload(), 1500);
    }
  };

  const inicial = (nombre: string) =>
    nombre.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Directorio</h1>
          <p className="text-gray-500 text-sm">Contactos y enlaces por dirección territorial</p>
        </div>
        {esAdmin && (
          <>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) importar(f); e.target.value = ""; }} />
            <button onClick={() => fileRef.current?.click()} disabled={importing}
              className="bg-[#005A9C] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50 flex items-center gap-2">
              {importing ? <><span className="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" />Importando...</> : "Importar Excel (hoja DISTRIBUCIÓN ENLACES)"}
            </button>
          </>
        )}
      </div>

      {msg && <div className={`p-3 rounded-lg text-sm border ${msg.type === "ok" ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>{msg.text}</div>}

      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-wrap gap-3">
        <input type="text" placeholder="Buscar nombre, cargo, email, departamento..." value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="flex-1 min-w-[220px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005A9C]" />
        <select value={filtroZona} onChange={e => setFiltroZona(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005A9C]">
          <option value="">Todas las zonas</option>
          {zonas.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
        {(busqueda || filtroZona) && (
          <button onClick={() => { setBusqueda(""); setFiltroZona(""); }}
            className="text-sm text-gray-500 hover:text-gray-700 underline">Limpiar</button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando directorio...</div>
      ) : contactos.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-sm">
          <div className="text-4xl mb-3">📞</div>
          <h2 className="text-lg font-semibold text-gray-700 mb-1">No hay contactos cargados</h2>
          <p className="text-gray-500 text-sm">{esAdmin ? 'Importa el Excel usando la hoja "DISTRIBUCIÓN ENLACES".' : "El administrador debe importar el directorio."}</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-400">{filtrados.length} contacto{filtrados.length !== 1 ? "s" : ""}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtrados.slice(0, 150).map(c => (
              <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#005A9C] flex items-center justify-center text-white text-sm font-bold shrink-0">
                    {inicial(c.nombre)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-800 text-sm leading-tight truncate">{c.nombre}</p>
                    {c.cargo && <p className="text-gray-500 text-xs mt-0.5 truncate">{c.cargo}</p>}
                    {c.zona && (
                      <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{c.zona}</span>
                    )}
                  </div>
                </div>
                <div className="mt-3 space-y-1.5 border-t border-gray-100 pt-3">
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="flex items-center gap-2 text-xs text-gray-600 hover:text-[#005A9C] truncate">
                      <span className="text-gray-400">✉</span>{c.email}
                    </a>
                  )}
                  {c.telefono && (
                    <a href={`tel:${c.telefono}`} className="flex items-center gap-2 text-xs text-gray-600 hover:text-[#005A9C]">
                      <span className="text-gray-400">📱</span>{c.telefono}
                    </a>
                  )}
                  {c.departamento && (
                    <p className="flex items-center gap-2 text-xs text-gray-500">
                      <span className="text-gray-400">📍</span>{c.departamento}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
          {filtrados.length > 150 && (
            <p className="text-xs text-gray-400 text-center">Mostrando 150 de {filtrados.length}. Usa el buscador para acotar.</p>
          )}
        </>
      )}
    </div>
  );
}
