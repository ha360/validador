"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

type Tarifa = {
  id: number;
  item: string;
  sub_item: string | null;
  rango: string | null;
  departamento: string;
  zona: string | null;
  valor_unitario: number | null;
};

const ZONAS = ["URBANO <50K HAB", "VEREDA / INSPECCIÓN", "CIUDAD CAPITAL"];

export default function TarifarioPage() {
  const supabase = createClient();
  const [tarifas, setTarifas] = useState<Tarifa[]>([]);
  const [loading, setLoading] = useState(true);
  const [esAdmin, setEsAdmin] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtroItem, setFiltroItem] = useState("");
  const [filtroDpto, setFiltroDpto] = useState("");
  const [filtroZona, setFiltroZona] = useState("");
  const [cantPersonas, setCantPersonas] = useState("");
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setEsAdmin(user.user_metadata?.rol === "admin");
      const { data } = await supabase.from("tarifario").select("*").order("item").order("sub_item").order("departamento");
      setTarifas(data ?? []);
      setLoading(false);
    })();
  }, []);

  const items = useMemo(() => [...new Set(tarifas.map(t => t.item).filter(Boolean))].sort(), [tarifas]);
  const deptos = useMemo(() => [...new Set(tarifas.map(t => t.departamento).filter(Boolean))].sort(), [tarifas]);

  const filtradas = useMemo(() => {
    const q = busqueda.toLowerCase();
    return tarifas.filter(t => {
      if (q && ![t.item, t.sub_item, t.departamento].some(f => f?.toLowerCase().includes(q))) return false;
      if (filtroItem && t.item !== filtroItem) return false;
      if (filtroDpto && t.departamento !== filtroDpto) return false;
      if (filtroZona && t.zona !== filtroZona) return false;
      if (cantPersonas) {
        const n = Number(cantPersonas);
        if (t.rango) {
          const match = t.rango.match(/(\d+)-(\d+)/);
          if (match) {
            const [, min, max] = match;
            if (n < Number(min) || n > Number(max)) return false;
          } else if (t.rango.includes("100+") && n < 100) return false;
        }
      }
      return true;
    });
  }, [tarifas, busqueda, filtroItem, filtroDpto, filtroZona, cantPersonas]);

  const importar = async (file: File) => {
    setImporting(true); setMsg(null);
    const fd = new FormData(); fd.append("file", file);
    const res = await fetch("/api/admin/import-tarifario", { method: "POST", body: fd });
    const data = await res.json();
    setImporting(false);
    if (!res.ok || data.errors > 0) {
      setMsg({ type: "err", text: data.error ?? `${data.errors} errores al importar` });
    } else {
      setMsg({ type: "ok", text: `Importadas ${data.inserted} tarifas` });
      setTimeout(() => window.location.reload(), 1500);
    }
  };

  const fmtCOP = (v: number | null) => v ? `$${Number(v).toLocaleString("es-CO")}` : "—";

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Tarifario</h1>
          <p className="text-gray-500 text-sm">Precios por departamento, zona y cantidad de participantes</p>
        </div>
        {esAdmin && (
          <>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) importar(f); e.target.value = ""; }} />
            <button onClick={() => fileRef.current?.click()} disabled={importing}
              className="bg-[#005A9C] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50 flex items-center gap-2">
              {importing ? <><span className="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" />Importando...</> : "Importar Excel (hoja TARIFARIO)"}
            </button>
          </>
        )}
      </div>

      {msg && <div className={`p-3 rounded-lg text-sm border ${msg.type === "ok" ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>{msg.text}</div>}

      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-wrap gap-3">
        <input type="text" placeholder="Buscar servicio, departamento..." value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="flex-1 min-w-[180px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005A9C]" />
        <select value={filtroItem} onChange={e => setFiltroItem(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005A9C]">
          <option value="">Todos los servicios</option>
          {items.map(i => <option key={i} value={i}>{i}</option>)}
        </select>
        <select value={filtroDpto} onChange={e => setFiltroDpto(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005A9C]">
          <option value="">Todos los departamentos</option>
          {deptos.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={filtroZona} onChange={e => setFiltroZona(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005A9C]">
          <option value="">Todas las zonas</option>
          {ZONAS.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
        <input type="number" placeholder="# personas" value={cantPersonas}
          onChange={e => setCantPersonas(e.target.value)} min={1}
          className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005A9C]" />
        {(busqueda || filtroItem || filtroDpto || filtroZona || cantPersonas) && (
          <button onClick={() => { setBusqueda(""); setFiltroItem(""); setFiltroDpto(""); setFiltroZona(""); setCantPersonas(""); }}
            className="text-sm text-gray-500 hover:text-gray-700 underline">Limpiar</button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando tarifas...</div>
      ) : tarifas.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-sm">
          <div className="text-4xl mb-3">💰</div>
          <h2 className="text-lg font-semibold text-gray-700 mb-1">No hay tarifas cargadas</h2>
          <p className="text-gray-500 text-sm">{esAdmin ? 'Importa el Excel usando la hoja "TARIFARIO".' : "El administrador debe importar el tarifario."}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
            {filtradas.length} tarifas{cantPersonas ? ` para ${cantPersonas} personas` : ""}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase">
                  {["Servicio", "Ítem", "Rango personas", "Departamento", "Zona", "Valor unitario + IVA"].map(h => (
                    <th key={h} className="text-left px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtradas.slice(0, 200).map(t => (
                  <tr key={t.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-800 text-xs">{t.item}</td>
                    <td className="px-4 py-2.5 text-gray-600 text-xs">{t.sub_item ?? "—"}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{t.rango ?? "—"}</td>
                    <td className="px-4 py-2.5 text-gray-600 text-xs">{t.departamento}</td>
                    <td className="px-4 py-2.5 text-xs">
                      <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs">{t.zona ?? "—"}</span>
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-emerald-700 whitespace-nowrap">{fmtCOP(t.valor_unitario)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtradas.length > 200 && (
            <div className="px-4 py-2 text-xs text-gray-400 bg-gray-50 border-t">Mostrando 200 de {filtradas.length}. Usa los filtros para acotar.</div>
          )}
        </div>
      )}
    </div>
  );
}
