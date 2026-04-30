"use client";

import { useState, useMemo, useRef, useEffect } from "react";

// ─── Constantes ───────────────────────────────────────────────────────────────

const ESTADOS = ["AUTORIZADO", "AUTORIZADO-SG", "POSFALLO", "MEDIDA CAUTELAR", "LEGALIZADO", "CANCELADO", "FACTURADO"];
const TIPOLOGIAS = ["OPERADOR", "OLLA COMUNITARIA", "MIXTO", "TRANSPORTE"];
const POBLACIONES = ["Campesino", "Indígena", "Afrodescendiente", "Rrom", "Mixto"];

const ESTADO_COLOR: Record<string, string> = {
  AUTORIZADO: "bg-emerald-100 text-emerald-700 border-emerald-200",
  "AUTORIZADO-SG": "bg-emerald-100 text-emerald-700 border-emerald-200",
  POSFALLO: "bg-blue-100 text-blue-700 border-blue-200",
  "MEDIDA CAUTELAR": "bg-amber-100 text-amber-700 border-amber-200",
  LEGALIZADO: "bg-purple-100 text-purple-700 border-purple-200",
  CANCELADO: "bg-red-100 text-red-700 border-red-200",
  FACTURADO: "bg-indigo-100 text-indigo-700 border-indigo-200",
};

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Evento = {
  id: number;
  no_solicitud: number | null;
  no_evento_operador: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  dias_evento: number | null;
  direccion_territorial: string | null;
  nombre_comunidad: string | null;
  objeto_evento: string | null;
  municipio: string | null;
  departamento: string | null;
  tipologia: string | null;
  num_asistentes: number | null;
  valor_aprobado: number | null;
  valor_ejecutado: number | null;
  estado: string | null;
  estado_tramite: string | null;
  legalizado: boolean;
  recibido_satisfaccion: boolean;
  observaciones: string | null;
};

type Cambio = {
  id: number;
  campo: string;
  valor_anterior: string;
  valor_nuevo: string;
  notas: string | null;
  fecha: string;
  profiles: { nombre: string } | null;
};

type Props = {
  eventos: Evento[];
  esAdmin: boolean;
  territoriales: string[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcDias(inicio: string, fin: string): number {
  const a = new Date(inicio), b = new Date(fin);
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000) + 1);
}

function fmtMoneda(v: number | null) {
  if (!v) return "—";
  return `$${Number(v).toLocaleString("es-CO")}`;
}

function fmtFecha(s: string | null) {
  if (!s) return "—";
  return new Date(s + "T12:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

function estadoEvento(e: Evento): "pasado" | "hoy" | "futuro" | "sin-fecha" {
  if (!e.fecha_inicio) return "sin-fecha";
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const ini = new Date(e.fecha_inicio + "T12:00:00");
  const fin = e.fecha_fin ? new Date(e.fecha_fin + "T12:00:00") : ini;
  if (fin < hoy) return "pasado";
  if (ini <= hoy && fin >= hoy) return "hoy";
  return "futuro";
}

// ─── Form vacío ───────────────────────────────────────────────────────────────

const FORM_VACIO = {
  no_solicitud: "", no_evento_operador: "", objeto_evento: "", tipologia: "",
  actividad_asociada: "", direccion_territorial: "", departamento: "", municipio: "",
  fecha_inicio: "", fecha_fin: "", dias_evento: "",
  nombre_responsable: "", telefono_responsable: "", email_responsable: "",
  num_asistentes: "", poblacion: "", nombre_comunidad: "",
  valor_aprobado: "", valor_ejecutado: "",
  estado: "", estado_tramite: "",
  legalizado: false, recibido_satisfaccion: false, observaciones: "",
};

// ─── Componente principal ─────────────────────────────────────────────────────

export default function MatrizClient({ eventos, esAdmin, territoriales }: Props) {
  // Filtros
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroTerritorial, setFiltroTerritorial] = useState("");
  const [filtroLegalizado, setFiltroLegalizado] = useState("");
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 50;

  // Modales
  const [modalNuevo, setModalNuevo] = useState(false);
  const [editando, setEditando] = useState<Evento | null>(null);
  const [historialEvento, setHistorialEvento] = useState<{ id: number; no: string | null } | null>(null);

  // Form nuevo evento
  const [form, setForm] = useState<typeof FORM_VACIO>({ ...FORM_VACIO });
  const [guardando, setGuardando] = useState(false);
  const [msgForm, setMsgForm] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Form edición estado
  const [formEdit, setFormEdit] = useState({ estado: "", estado_tramite: "", legalizado: false, recibido_satisfaccion: false, observaciones: "", notas: "" });
  const [guardandoEdit, setGuardandoEdit] = useState(false);
  const [msgEdit, setMsgEdit] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Historial
  const [cambios, setCambios] = useState<Cambio[]>([]);
  const [cargandoHist, setCargandoHist] = useState(false);

  // Import Excel
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Auto-calcular días al cambiar fechas
  useEffect(() => {
    if (form.fecha_inicio && form.fecha_fin) {
      const dias = calcDias(form.fecha_inicio, form.fecha_fin);
      setForm(f => ({ ...f, dias_evento: String(dias) }));
    }
  }, [form.fecha_inicio, form.fecha_fin]);

  // ── Filtrado y paginación ──
  const eventosFiltrados = useMemo(() => {
    const q = busqueda.toLowerCase();
    return eventos.filter(e => {
      if (q && ![e.no_evento_operador, e.nombre_comunidad, e.objeto_evento, e.municipio, e.direccion_territorial]
        .some(f => f?.toLowerCase().includes(q))) return false;
      if (filtroEstado && e.estado !== filtroEstado) return false;
      if (filtroTerritorial && e.direccion_territorial !== filtroTerritorial) return false;
      if (filtroLegalizado === "si" && !e.legalizado) return false;
      if (filtroLegalizado === "no" && e.legalizado) return false;
      return true;
    });
  }, [eventos, busqueda, filtroEstado, filtroTerritorial, filtroLegalizado]);

  const totalPaginas = Math.max(1, Math.ceil(eventosFiltrados.length / POR_PAGINA));
  const eventosPagina = eventosFiltrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  // ── Resumen stats ──
  const stats = useMemo(() => {
    const total = eventos.length;
    const legalizados = eventos.filter(e => e.legalizado).length;
    const porEstado = ESTADOS.reduce((acc, s) => {
      acc[s] = eventos.filter(e => e.estado === s).length;
      return acc;
    }, {} as Record<string, number>);
    const valorTotal = eventos.reduce((s, e) => s + (e.valor_aprobado ?? 0), 0);
    const valorEjecutado = eventos.reduce((s, e) => s + (e.valor_ejecutado ?? 0), 0);
    const pctLegal = total > 0 ? Math.round((legalizados / total) * 100) : 0;
    return { total, legalizados, pctLegal, porEstado, valorTotal, valorEjecutado };
  }, [eventos]);

  // ── Acciones ──
  const crearEvento = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true); setMsgForm(null);
    const payload = {
      ...form,
      no_solicitud: form.no_solicitud ? Number(form.no_solicitud) : null,
      num_asistentes: form.num_asistentes ? Number(form.num_asistentes) : null,
      valor_aprobado: form.valor_aprobado ? Number(form.valor_aprobado) : null,
      valor_ejecutado: form.valor_ejecutado ? Number(form.valor_ejecutado) : null,
      dias_evento: form.dias_evento ? Number(form.dias_evento) : null,
      fecha_inicio: form.fecha_inicio || null,
      fecha_fin: form.fecha_fin || null,
      estado: form.estado || null,
    };
    const res = await fetch("/api/eventos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setGuardando(false);
    if (!res.ok) {
      setMsgForm({ type: "err", text: data.error ?? "Error al crear" });
    } else {
      setMsgForm({ type: "ok", text: "Evento creado correctamente" });
      setTimeout(() => { setModalNuevo(false); window.location.reload(); }, 1200);
    }
  };

  const abrirEdicion = (ev: Evento) => {
    setEditando(ev);
    setFormEdit({ estado: ev.estado ?? "", estado_tramite: ev.estado_tramite ?? "", legalizado: ev.legalizado, recibido_satisfaccion: ev.recibido_satisfaccion, observaciones: ev.observaciones ?? "", notas: "" });
    setMsgEdit(null);
  };

  const guardarCambios = async () => {
    if (!editando) return;
    setGuardandoEdit(true); setMsgEdit(null);
    const res = await fetch(`/api/eventos/${editando.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cambios: { estado: formEdit.estado || null, estado_tramite: formEdit.estado_tramite || null, legalizado: formEdit.legalizado, recibido_satisfaccion: formEdit.recibido_satisfaccion, observaciones: formEdit.observaciones || null }, notas: formEdit.notas || null }),
    });
    const data = await res.json();
    setGuardandoEdit(false);
    if (!res.ok) { setMsgEdit({ type: "err", text: data.error ?? "Error al guardar" }); }
    else { setMsgEdit({ type: "ok", text: "Guardado" }); setTimeout(() => { setEditando(null); window.location.reload(); }, 900); }
  };

  const verHistorial = async (ev: Evento) => {
    setHistorialEvento({ id: ev.id, no: ev.no_evento_operador });
    setCambios([]); setCargandoHist(true);
    const res = await fetch(`/api/eventos/${ev.id}`);
    const data = await res.json();
    setCambios(data.cambios ?? []); setCargandoHist(false);
  };

  const importarExcel = async (file: File) => {
    setImporting(true); setImportMsg(null);
    const fd = new FormData(); fd.append("file", file);
    const res = await fetch("/api/admin/import-eventos", { method: "POST", body: fd });
    const data = await res.json();
    setImporting(false);
    if (!res.ok) { setImportMsg({ type: "err", text: data.error ?? "Error al importar" }); }
    else if (data.inserted === 0 && data.errors > 0) {
      setImportMsg({ type: "err", text: `Error al insertar: ${data.primerError ?? "RLS bloqueó el insert"}` });
    } else {
      setImportMsg({ type: "ok", text: `Importados ${data.inserted} de ${data.total} eventos (${data.hoja})` });
      setTimeout(() => window.location.reload(), 1800);
    }
  };

  const CAMPO_LABELS: Record<string, string> = { estado: "Estado", estado_tramite: "Estado trámite", legalizado: "Legalizado", recibido_satisfaccion: "Recibido satisfacción", observaciones: "Observaciones", valor_ejecutado: "Valor ejecutado" };

  // ── Render ──
  return (
    <div className="p-6 space-y-5">

      {/* ── Cabecera ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Matriz de Eventos</h1>
          <p className="text-gray-500 text-sm">Contrato 27-2026 · {eventos.length} eventos registrados</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {(esAdmin) && (
            <>
              <button onClick={() => { setForm({ ...FORM_VACIO }); setMsgForm(null); setModalNuevo(true); }}
                className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors">
                + Nuevo evento
              </button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) importarExcel(f); e.target.value = ""; }} />
              <button onClick={() => fileRef.current?.click()} disabled={importing}
                className="bg-[#005A9C] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50 transition-colors flex items-center gap-2">
                {importing ? <><span className="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" />Importando...</> : "Importar Excel"}
              </button>
            </>
          )}
        </div>
      </div>

      {importMsg && (
        <div className={`p-3 rounded-lg text-sm border ${importMsg.type === "ok" ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
          {importMsg.text}
        </div>
      )}

      {/* ── Cards resumen ── */}
      {eventos.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <p className="text-2xl font-bold text-gray-800">{stats.total}</p>
            <p className="text-xs text-gray-500 mt-0.5">Total eventos</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <p className="text-2xl font-bold text-purple-700">{stats.legalizados}</p>
            <p className="text-xs text-gray-500 mt-0.5">Legalizados ({stats.pctLegal}%)</p>
            <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-purple-500 rounded-full" style={{ width: `${stats.pctLegal}%` }} />
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <p className="text-lg font-bold text-blue-700">{fmtMoneda(stats.valorTotal)}</p>
            <p className="text-xs text-gray-500 mt-0.5">Valor total aprobado</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <p className="text-lg font-bold text-emerald-700">{fmtMoneda(stats.valorEjecutado)}</p>
            <p className="text-xs text-gray-500 mt-0.5">Valor ejecutado</p>
          </div>
        </div>
      )}

      {/* ── Chips de estado ── */}
      {eventos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {ESTADOS.filter(s => stats.porEstado[s] > 0).map(s => (
            <button key={s} onClick={() => { setFiltroEstado(filtroEstado === s ? "" : s); setPagina(1); }}
              className={`text-xs font-semibold px-3 py-1 rounded-full border transition-all ${filtroEstado === s ? ESTADO_COLOR[s] + " ring-2 ring-offset-1 ring-current" : "bg-gray-100 text-gray-600 border-gray-200 hover:border-gray-400"}`}>
              {s} <span className="opacity-70">({stats.porEstado[s]})</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Filtros ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-wrap gap-3">
        <input type="text" placeholder="Buscar evento, comunidad, municipio..." value={busqueda}
          onChange={e => { setBusqueda(e.target.value); setPagina(1); }}
          className="flex-1 min-w-[200px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005A9C]" />
        <select value={filtroTerritorial} onChange={e => { setFiltroTerritorial(e.target.value); setPagina(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005A9C]">
          <option value="">Todas las territoriales</option>
          {territoriales.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filtroLegalizado} onChange={e => { setFiltroLegalizado(e.target.value); setPagina(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005A9C]">
          <option value="">Todos</option>
          <option value="si">Legalizados</option>
          <option value="no">Pendientes</option>
        </select>
        {(busqueda || filtroEstado || filtroTerritorial || filtroLegalizado) && (
          <button onClick={() => { setBusqueda(""); setFiltroEstado(""); setFiltroTerritorial(""); setFiltroLegalizado(""); setPagina(1); }}
            className="text-sm text-gray-500 hover:text-gray-700 underline">Limpiar</button>
        )}
        <span className="text-sm text-gray-400 self-center ml-auto">{eventosFiltrados.length} resultado{eventosFiltrados.length !== 1 ? "s" : ""}</span>
      </div>

      {/* ── Tabla ── */}
      {eventos.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-sm">
          <div className="text-4xl mb-3">📋</div>
          <h2 className="text-lg font-semibold text-gray-700 mb-1">No hay eventos registrados</h2>
          <p className="text-gray-500 text-sm">{esAdmin ? 'Usa "+ Nuevo evento" o "Importar Excel".' : "El administrador debe cargar la Matriz de Eventos."}</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase">
                    {["#", "Evento / Objeto", "Territorial · Municipio", "Fechas · Días", "Asistentes", "Valor aprobado", "Ejecución", "Estado", "✓", ""].map(h => (
                      <th key={h} className="text-left px-3 py-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {eventosPagina.map(ev => {
                    const tiempo = estadoEvento(ev);
                    const pctEjec = ev.valor_aprobado && ev.valor_ejecutado ? Math.round((ev.valor_ejecutado / ev.valor_aprobado) * 100) : null;
                    return (
                      <tr key={ev.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-3 text-gray-400 text-xs">{ev.no_solicitud ?? "—"}</td>
                        <td className="px-3 py-3 max-w-[200px]">
                          <p className="font-medium text-gray-800 text-xs truncate" title={ev.no_evento_operador ?? ""}>{ev.no_evento_operador ?? "—"}</p>
                          {ev.objeto_evento && <p className="text-gray-400 text-xs truncate mt-0.5" title={ev.objeto_evento}>{ev.objeto_evento}</p>}
                          {ev.tipologia && <span className="text-xs text-blue-500">{ev.tipologia}</span>}
                        </td>
                        <td className="px-3 py-3 max-w-[160px]">
                          <p className="text-gray-600 text-xs truncate">{ev.direccion_territorial ?? "—"}</p>
                          <p className="text-gray-400 text-xs">{ev.municipio ?? ""}{ev.departamento ? `, ${ev.departamento}` : ""}</p>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <div className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${tiempo === "hoy" ? "bg-green-100 text-green-700" : tiempo === "futuro" ? "bg-blue-50 text-blue-600" : tiempo === "pasado" ? "bg-gray-100 text-gray-500" : "bg-gray-50 text-gray-400"}`}>
                            {tiempo === "hoy" ? "● EN CURSO" : tiempo === "futuro" ? "↑ PRÓXIMO" : tiempo === "pasado" ? "✓ PASADO" : "— Sin fecha"}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">{fmtFecha(ev.fecha_inicio)}{ev.fecha_fin && ev.fecha_fin !== ev.fecha_inicio ? ` → ${fmtFecha(ev.fecha_fin)}` : ""}</p>
                          {ev.dias_evento && <p className="text-xs text-gray-400">{ev.dias_evento} día{ev.dias_evento !== 1 ? "s" : ""}</p>}
                        </td>
                        <td className="px-3 py-3 text-center text-gray-600 font-medium">{ev.num_asistentes?.toLocaleString("es-CO") ?? "—"}</td>
                        <td className="px-3 py-3 text-xs whitespace-nowrap text-gray-700">{fmtMoneda(ev.valor_aprobado)}</td>
                        <td className="px-3 py-3">
                          {pctEjec !== null ? (
                            <div>
                              <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                                <span>{fmtMoneda(ev.valor_ejecutado)}</span>
                                <span>{pctEjec}%</span>
                              </div>
                              <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${pctEjec >= 100 ? "bg-purple-500" : pctEjec >= 50 ? "bg-emerald-500" : "bg-amber-400"}`} style={{ width: `${Math.min(100, pctEjec)}%` }} />
                              </div>
                            </div>
                          ) : <span className="text-gray-400 text-xs">—</span>}
                        </td>
                        <td className="px-3 py-3">
                          {ev.estado && (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${ESTADO_COLOR[ev.estado] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                              {ev.estado}
                            </span>
                          )}
                          {ev.estado_tramite && <p className="text-xs text-gray-400 mt-0.5">{ev.estado_tramite}</p>}
                        </td>
                        <td className="px-3 py-3 text-center">{ev.legalizado ? "✅" : "⏳"}</td>
                        <td className="px-3 py-3">
                          <div className="flex gap-1 justify-end">
                            <button onClick={() => verHistorial(ev)} className="text-xs text-gray-400 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100">Hist.</button>
                            {esAdmin && <button onClick={() => abrirEdicion(ev)} className="text-xs text-[#005A9C] font-semibold px-2 py-1 rounded hover:bg-blue-50">Editar</button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {totalPaginas > 1 && (
            <div className="flex items-center justify-between text-sm text-gray-600">
              <p>Página {pagina} de {totalPaginas}</p>
              <div className="flex gap-2">
                <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1} className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50">Anterior</button>
                <button onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={pagina === totalPaginas} className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50">Siguiente</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Modal nuevo evento ── */}
      {modalNuevo && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={() => setModalNuevo(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl my-8" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-800">Nuevo Evento</h2>
              <button onClick={() => setModalNuevo(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <form onSubmit={crearEvento} className="p-6 space-y-5">

              {/* Identificación */}
              <section>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Identificación</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Field label="No. Solicitud" type="number" value={form.no_solicitud} onChange={v => setForm(f => ({ ...f, no_solicitud: v }))} />
                  <Field label="No. Evento Operador" value={form.no_evento_operador} onChange={v => setForm(f => ({ ...f, no_evento_operador: v }))} className="md:col-span-2" />
                </div>
                <div className="mt-4">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Objeto del evento</label>
                  <textarea value={form.objeto_evento} onChange={e => setForm(f => ({ ...f, objeto_evento: e.target.value }))} rows={2}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005A9C] resize-none" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <SelectField label="Tipología" value={form.tipologia} onChange={v => setForm(f => ({ ...f, tipologia: v }))} options={TIPOLOGIAS} />
                  <Field label="Actividad asociada" value={form.actividad_asociada} onChange={v => setForm(f => ({ ...f, actividad_asociada: v }))} />
                </div>
              </section>

              {/* Ubicación */}
              <section>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Ubicación</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <SelectField label="Dirección Territorial" value={form.direccion_territorial} onChange={v => setForm(f => ({ ...f, direccion_territorial: v }))} options={territoriales} className="md:col-span-1" />
                  <Field label="Departamento" value={form.departamento} onChange={v => setForm(f => ({ ...f, departamento: v }))} />
                  <Field label="Municipio" value={form.municipio} onChange={v => setForm(f => ({ ...f, municipio: v }))} />
                </div>
              </section>

              {/* Fechas — con cálculo automático */}
              <section>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Fechas y duración</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Field label="Fecha inicio" type="date" value={form.fecha_inicio} onChange={v => setForm(f => ({ ...f, fecha_inicio: v }))} />
                  <Field label="Fecha fin" type="date" value={form.fecha_fin} onChange={v => setForm(f => ({ ...f, fecha_fin: v }))} />
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Días del evento</label>
                    <div className="relative">
                      <input type="number" value={form.dias_evento} onChange={e => setForm(f => ({ ...f, dias_evento: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005A9C] bg-blue-50" />
                      <span className="absolute right-3 top-2 text-xs text-blue-400">auto</span>
                    </div>
                    {form.fecha_inicio && form.fecha_fin && (
                      <p className="text-xs text-blue-600 mt-1">
                        {fmtFecha(form.fecha_inicio)} → {fmtFecha(form.fecha_fin)}
                      </p>
                    )}
                  </div>
                </div>
              </section>

              {/* Responsable y participantes */}
              <section>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Responsable y participantes</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Field label="Nombre responsable" value={form.nombre_responsable} onChange={v => setForm(f => ({ ...f, nombre_responsable: v }))} className="md:col-span-1" />
                  <Field label="Teléfono" value={form.telefono_responsable} onChange={v => setForm(f => ({ ...f, telefono_responsable: v }))} />
                  <Field label="Email" type="email" value={form.email_responsable} onChange={v => setForm(f => ({ ...f, email_responsable: v }))} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                  <Field label="# Asistentes" type="number" value={form.num_asistentes} onChange={v => setForm(f => ({ ...f, num_asistentes: v }))} />
                  <SelectField label="Población" value={form.poblacion} onChange={v => setForm(f => ({ ...f, poblacion: v }))} options={POBLACIONES} />
                  <Field label="Nombre comunidad" value={form.nombre_comunidad} onChange={v => setForm(f => ({ ...f, nombre_comunidad: v }))} />
                </div>
              </section>

              {/* Valores */}
              <section>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Valores (COP)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Valor aprobado" type="number" value={form.valor_aprobado} onChange={v => setForm(f => ({ ...f, valor_aprobado: v }))} />
                  <Field label="Valor ejecutado" type="number" value={form.valor_ejecutado} onChange={v => setForm(f => ({ ...f, valor_ejecutado: v }))} />
                </div>
                {form.valor_aprobado && form.valor_ejecutado && Number(form.valor_aprobado) > 0 && (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Ejecución presupuestal</span>
                      <span className="font-semibold">{Math.round((Number(form.valor_ejecutado) / Number(form.valor_aprobado)) * 100)}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${Math.min(100, Math.round((Number(form.valor_ejecutado) / Number(form.valor_aprobado)) * 100))}%` }} />
                    </div>
                  </div>
                )}
              </section>

              {/* Estado */}
              <section>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Estado</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <SelectField label="Estado" value={form.estado} onChange={v => setForm(f => ({ ...f, estado: v }))} options={ESTADOS} />
                  <Field label="Estado trámite" value={form.estado_tramite} onChange={v => setForm(f => ({ ...f, estado_tramite: v }))} placeholder="Ej: EN PROCESO, PAGADO..." />
                </div>
                <div className="flex gap-6 mt-4">
                  <CheckField label="Legalizado" checked={form.legalizado} onChange={v => setForm(f => ({ ...f, legalizado: v }))} />
                  <CheckField label="Recibido a satisfacción" checked={form.recibido_satisfaccion} onChange={v => setForm(f => ({ ...f, recibido_satisfaccion: v }))} />
                </div>
                <div className="mt-4">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Observaciones</label>
                  <textarea value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} rows={2}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005A9C] resize-none" />
                </div>
              </section>

              {msgForm && (
                <div className={`p-3 rounded-lg text-sm border ${msgForm.type === "ok" ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                  {msgForm.text}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setModalNuevo(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
                <button type="submit" disabled={guardando} className="bg-emerald-600 text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
                  {guardando ? "Guardando..." : "Crear evento"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal edición ── */}
      {editando && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setEditando(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <h2 className="font-bold text-gray-800 mb-1">Actualizar estado</h2>
            <p className="text-gray-500 text-xs mb-4">{editando.no_evento_operador ?? `ID ${editando.id}`}</p>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <SelectField label="Estado" value={formEdit.estado} onChange={v => setFormEdit(f => ({ ...f, estado: v }))} options={ESTADOS} />
                <Field label="Estado trámite" value={formEdit.estado_tramite} onChange={v => setFormEdit(f => ({ ...f, estado_tramite: v }))} />
              </div>
              <div className="flex gap-6">
                <CheckField label="Legalizado" checked={formEdit.legalizado} onChange={v => setFormEdit(f => ({ ...f, legalizado: v }))} />
                <CheckField label="Recibido satisfacción" checked={formEdit.recibido_satisfaccion} onChange={v => setFormEdit(f => ({ ...f, recibido_satisfaccion: v }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Observaciones</label>
                <textarea value={formEdit.observaciones} onChange={e => setFormEdit(f => ({ ...f, observaciones: e.target.value }))} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005A9C] resize-none" />
              </div>
              <Field label="Razón del cambio (opcional)" value={formEdit.notas} onChange={v => setFormEdit(f => ({ ...f, notas: v }))} placeholder="Ej: Aprobado en comité" />
            </div>
            {msgEdit && <div className={`mt-3 p-2.5 rounded-lg text-xs border ${msgEdit.type === "ok" ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>{msgEdit.text}</div>}
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setEditando(null)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={guardarCambios} disabled={guardandoEdit} className="bg-[#005A9C] text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">
                {guardandoEdit ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Panel historial ── */}
      {historialEvento && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-end p-4" onClick={() => setHistorialEvento(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm h-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-gray-800 text-sm">Historial de cambios</h2>
                <p className="text-xs text-gray-500 mt-0.5">{historialEvento.no ?? `ID ${historialEvento.id}`}</p>
              </div>
              <button onClick={() => setHistorialEvento(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {cargandoHist ? <p className="text-sm text-gray-500 text-center py-8">Cargando...</p>
                : cambios.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">Sin cambios registrados</p>
                : <div className="space-y-3">
                  {cambios.map(c => (
                    <div key={c.id} className="border border-gray-200 rounded-lg p-3 text-xs">
                      <div className="flex justify-between text-gray-500 mb-1">
                        <span className="font-semibold text-gray-700">{CAMPO_LABELS[c.campo] ?? c.campo}</span>
                        <span>{new Date(c.fecha).toLocaleDateString("es-CO")}</span>
                      </div>
                      <div className="flex gap-2 items-center">
                        <span className="text-red-500 line-through">{c.valor_anterior || "—"}</span>
                        <span className="text-gray-400">→</span>
                        <span className="text-green-700 font-medium">{c.valor_nuevo || "—"}</span>
                      </div>
                      {c.notas && <p className="text-gray-500 mt-1 italic">{c.notas}</p>}
                      {c.profiles?.nombre && <p className="text-gray-400 mt-1">Por: {c.profiles.nombre}</p>}
                    </div>
                  ))}
                </div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-componentes de formulario ────────────────────────────────────────────

function Field({ label, type = "text", value, onChange, placeholder, className }: {
  label: string; type?: string; value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005A9C]" />
    </div>
  );
}

function SelectField({ label, value, onChange, options, className }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005A9C]">
        <option value="">— Seleccionar —</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="w-4 h-4 accent-[#005A9C]" />
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  );
}
