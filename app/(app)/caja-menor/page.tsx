"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

type Gasto = {
  id: number;
  no_evento: string | null;
  no_solicitud: number | null;
  fecha: string | null;
  concepto: string | null;
  beneficiario: string | null;
  valor: number | null;
  tipo_gasto: string | null;
  no_soporte: string | null;
  observaciones: string | null;
};

export default function CajaMenorPage() {
  const supabase = createClient();
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [loading, setLoading] = useState(true);
  const [esAdmin, setEsAdmin] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroEvento, setFiltroEvento] = useState("");
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setEsAdmin(user.user_metadata?.rol === "admin");
      const { data } = await supabase.from("caja_menor").select("*").order("fecha", { ascending: false }).limit(1000);
      setGastos(data ?? []);
      setLoading(false);
    })();
  }, []);

  const tipos = useMemo(() => [...new Set(gastos.map(g => g.tipo_gasto).filter(Boolean) as string[])].sort(), [gastos]);
  const eventos = useMemo(() => [...new Set(gastos.map(g => g.no_evento).filter(Boolean) as string[])].sort(), [gastos]);

  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase();
    return gastos.filter(g => {
      if (q && ![g.concepto, g.beneficiario, g.no_soporte, g.no_evento].some(f => f?.toLowerCase().includes(q))) return false;
      if (filtroTipo && g.tipo_gasto !== filtroTipo) return false;
      if (filtroEvento && g.no_evento !== filtroEvento) return false;
      return true;
    });
  }, [gastos, busqueda, filtroTipo, filtroEvento]);

  const totalFiltrado = useMemo(() => filtrados.reduce((s, g) => s + (g.valor ?? 0), 0), [filtrados]);
  const totalGeneral = useMemo(() => gastos.reduce((s, g) => s + (g.valor ?? 0), 0), [gastos]);

  const importar = async (file: File) => {
    setImporting(true); setMsg(null);
    const fd = new FormData(); fd.append("file", file);
    const res = await fetch("/api/admin/import-caja", { method: "POST", body: fd });
    const data = await res.json();
    setImporting(false);
    if (!res.ok || data.errors > 0) {
      setMsg({ type: "err", text: data.error ?? `${data.errors} errores al importar` });
    } else {
      setMsg({ type: "ok", text: `Importados ${data.inserted} gastos de caja menor` });
      setTimeout(() => window.location.reload(), 1500);
    }
  };

  const fmtCOP = (v: number | null) => v ? `$${Number(v).toLocaleString("es-CO")}` : "—";
  const fmtDate = (d: string | null) => d ? new Date(d + "T12:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  const resumenPorTipo = useMemo(() => {
    const map: Record<string, number> = {};
    filtrados.forEach(g => {
      const t = g.tipo_gasto ?? "Sin categoría";
      map[t] = (map[t] ?? 0) + (g.valor ?? 0);
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [filtrados]);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Caja Menor</h1>
          <p className="text-gray-500 text-sm">Gastos de caja menor por evento</p>
        </div>
        {esAdmin && (
          <>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) importar(f); e.target.value = ""; }} />
            <button onClick={() => fileRef.current?.click()} disabled={importing}
              className="bg-[#005A9C] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50 flex items-center gap-2">
              {importing ? <><span className="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" />Importando...</> : "Importar Excel (hoja EVENTOS CAJA MENOR)"}
            </button>
          </>
        )}
      </div>

      {msg && <div className={`p-3 rounded-lg text-sm border ${msg.type === "ok" ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>{msg.text}</div>}

      {gastos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total registros", value: gastos.length.toLocaleString("es-CO"), color: "text-gray-800" },
            { label: "Total general", value: fmtCOP(totalGeneral), color: "text-[#005A9C]" },
            { label: "Filtrados", value: filtrados.length.toLocaleString("es-CO"), color: "text-gray-600" },
            { label: "Total filtrado", value: fmtCOP(totalFiltrado), color: "text-emerald-700" },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <p className="text-xs text-gray-400 mb-1">{s.label}</p>
              <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-wrap gap-3">
        <input type="text" placeholder="Buscar concepto, beneficiario, soporte..." value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="flex-1 min-w-[200px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005A9C]" />
        {eventos.length > 0 && (
          <select value={filtroEvento} onChange={e => setFiltroEvento(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005A9C]">
            <option value="">Todos los eventos</option>
            {eventos.map(ev => <option key={ev} value={ev}>{ev}</option>)}
          </select>
        )}
        {tipos.length > 0 && (
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005A9C]">
            <option value="">Todos los tipos</option>
            {tipos.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        {(busqueda || filtroTipo || filtroEvento) && (
          <button onClick={() => { setBusqueda(""); setFiltroTipo(""); setFiltroEvento(""); }}
            className="text-sm text-gray-500 hover:text-gray-700 underline">Limpiar</button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando gastos...</div>
      ) : gastos.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-sm">
          <div className="text-4xl mb-3">🧾</div>
          <h2 className="text-lg font-semibold text-gray-700 mb-1">No hay gastos de caja menor</h2>
          <p className="text-gray-500 text-sm">{esAdmin ? 'Importa el Excel usando la hoja "EVENTOS CAJA MENOR".' : "El administrador debe importar los gastos."}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Resumen por tipo */}
          {resumenPorTipo.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Por tipo de gasto</h3>
              <div className="space-y-2">
                {resumenPorTipo.map(([tipo, total]) => (
                  <div key={tipo}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-600 truncate max-w-[160px]">{tipo}</span>
                      <span className="font-semibold text-gray-800 whitespace-nowrap ml-2">{fmtCOP(total)}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#005A9C] rounded-full"
                        style={{ width: `${Math.min(100, (total / (totalFiltrado || 1)) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tabla de gastos */}
          <div className={`bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden ${resumenPorTipo.length > 0 ? "lg:col-span-2" : "lg:col-span-3"}`}>
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
              {filtrados.length} gastos
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase">
                    {["Evento", "Fecha", "Concepto", "Beneficiario", "Tipo", "Soporte", "Valor"].map(h => (
                      <th key={h} className="text-left px-4 py-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtrados.slice(0, 300).map(g => (
                    <tr key={g.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-xs font-medium text-gray-700 whitespace-nowrap">{g.no_evento ?? "—"}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{fmtDate(g.fecha)}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-600 max-w-[180px] truncate">{g.concepto ?? "—"}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-600 max-w-[150px] truncate">{g.beneficiario ?? "—"}</td>
                      <td className="px-4 py-2.5 text-xs">
                        {g.tipo_gasto ? (
                          <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded text-xs">{g.tipo_gasto}</span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">{g.no_soporte ?? "—"}</td>
                      <td className="px-4 py-2.5 text-xs font-semibold text-emerald-700 whitespace-nowrap">{fmtCOP(g.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtrados.length > 300 && (
              <div className="px-4 py-2 text-xs text-gray-400 bg-gray-50 border-t">Mostrando 300 de {filtrados.length}. Usa los filtros para acotar.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
