"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

type Pago = {
  id: number;
  no_evento: string | null;
  no_solicitud: number | null;
  proveedor: string | null;
  concepto: string | null;
  no_factura: string | null;
  valor: number | null;
  fecha_pago: string | null;
  estado: string | null;
  observaciones: string | null;
};

const ESTADO_COLORS: Record<string, string> = {
  "pagado": "bg-green-100 text-green-700",
  "pendiente": "bg-yellow-100 text-yellow-700",
  "en proceso": "bg-blue-100 text-blue-700",
  "anulado": "bg-red-100 text-red-700",
  "cancelado": "bg-red-100 text-red-700",
};

export default function PresupuestoPage() {
  const supabase = createClient();
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [loading, setLoading] = useState(true);
  const [esAdmin, setEsAdmin] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setEsAdmin(user.user_metadata?.rol === "admin");
      const { data } = await supabase.from("pagos").select("*").order("fecha_pago", { ascending: false }).limit(1000);
      setPagos(data ?? []);
      setLoading(false);
    })();
  }, []);

  const estados = useMemo(() => [...new Set(pagos.map(p => p.estado).filter(Boolean) as string[])].sort(), [pagos]);

  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase();
    return pagos.filter(p => {
      if (q && ![p.proveedor, p.concepto, p.no_factura, p.no_evento].some(f => f?.toLowerCase().includes(q))) return false;
      if (filtroEstado && p.estado !== filtroEstado) return false;
      return true;
    });
  }, [pagos, busqueda, filtroEstado]);

  const totalFiltrado = useMemo(() => filtrados.reduce((s, p) => s + (p.valor ?? 0), 0), [filtrados]);
  const totalGeneral = useMemo(() => pagos.reduce((s, p) => s + (p.valor ?? 0), 0), [pagos]);

  const importar = async (file: File) => {
    setImporting(true); setMsg(null);
    const fd = new FormData(); fd.append("file", file);
    const res = await fetch("/api/admin/import-pagos", { method: "POST", body: fd });
    const data = await res.json();
    setImporting(false);
    if (!res.ok || data.errors > 0) {
      setMsg({ type: "err", text: data.error ?? `${data.errors} errores al importar` });
    } else {
      setMsg({ type: "ok", text: `Importados ${data.inserted} registros de pagos` });
      setTimeout(() => window.location.reload(), 1500);
    }
  };

  const fmtCOP = (v: number | null) => v ? `$${Number(v).toLocaleString("es-CO")}` : "—";
  const fmtDate = (d: string | null) => d ? new Date(d + "T12:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  const estadoClass = (e: string | null) => e ? (ESTADO_COLORS[e.toLowerCase()] ?? "bg-gray-100 text-gray-600") : "bg-gray-100 text-gray-600";

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Presupuesto y Pagos</h1>
          <p className="text-gray-500 text-sm">Registro de facturas y pagos de eventos</p>
        </div>
        {esAdmin && (
          <>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) importar(f); e.target.value = ""; }} />
            <button onClick={() => fileRef.current?.click()} disabled={importing}
              className="bg-[#005A9C] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50 flex items-center gap-2">
              {importing ? <><span className="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" />Importando...</> : "Importar Excel (hoja PAGOS)"}
            </button>
          </>
        )}
      </div>

      {msg && <div className={`p-3 rounded-lg text-sm border ${msg.type === "ok" ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>{msg.text}</div>}

      {pagos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total registros", value: pagos.length.toLocaleString("es-CO"), color: "text-gray-800" },
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
        <input type="text" placeholder="Buscar proveedor, concepto, factura, evento..." value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="flex-1 min-w-[220px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005A9C]" />
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005A9C]">
          <option value="">Todos los estados</option>
          {estados.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        {(busqueda || filtroEstado) && (
          <button onClick={() => { setBusqueda(""); setFiltroEstado(""); }}
            className="text-sm text-gray-500 hover:text-gray-700 underline">Limpiar</button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando pagos...</div>
      ) : pagos.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-sm">
          <div className="text-4xl mb-3">📊</div>
          <h2 className="text-lg font-semibold text-gray-700 mb-1">No hay registros de pagos</h2>
          <p className="text-gray-500 text-sm">{esAdmin ? 'Importa el Excel usando la hoja "PAGOS".' : "El administrador debe importar los pagos."}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
            {filtrados.length} registros
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase">
                  {["Evento", "Proveedor", "Concepto", "No. Factura", "Fecha pago", "Valor", "Estado"].map(h => (
                    <th key={h} className="text-left px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrados.slice(0, 300).map(p => (
                  <tr key={p.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-xs font-medium text-gray-700 whitespace-nowrap">{p.no_evento ?? "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-700 max-w-[180px] truncate">{p.proveedor ?? "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 max-w-[200px] truncate">{p.concepto ?? "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{p.no_factura ?? "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{fmtDate(p.fecha_pago)}</td>
                    <td className="px-4 py-2.5 text-xs font-semibold text-emerald-700 whitespace-nowrap">{fmtCOP(p.valor)}</td>
                    <td className="px-4 py-2.5">
                      {p.estado ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${estadoClass(p.estado)}`}>{p.estado}</span>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtrados.length > 300 && (
            <div className="px-4 py-2 text-xs text-gray-400 bg-gray-50 border-t">Mostrando 300 de {filtrados.length}. Usa los filtros para acotar.</div>
          )}
        </div>
      )}
    </div>
  );
}
