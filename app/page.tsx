"use client";

import { useState, useCallback } from "react";

type DocResult = {
  nombre: string;
  tipo: string;
  presente: boolean;
  estado: "OK" | "OBSERVACION" | "FALTANTE";
  observacion: string;
};

type CrossValidation = {
  validacion: string;
  estado: "OK" | "FALLA";
  detalle: string;
};

type ValidationResult = {
  resumen: {
    resguardo: string;
    nit: string;
    gobernador: string;
    cedula_gobernador: string;
    banco: string;
    cuenta_bancaria: string;
    fecha_evento: string;
    nombre_evento: string;
    municipio: string;
    num_participantes: string;
  };
  documentos: DocResult[];
  validaciones_cruzadas: CrossValidation[];
  documentos_faltantes: string[];
  resultado_final: "APROBADO" | "APROBADO_CON_OBSERVACIONES" | "RECHAZADO";
  resumen_ejecutivo: string;
};

export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const addFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    const validFiles = Array.from(newFiles).filter(
      (f) =>
        f.type === "application/pdf" ||
        f.name.endsWith(".xlsx") ||
        f.name.endsWith(".xls") ||
        f.name.endsWith(".pdf")
    );
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      return [...prev, ...validFiles.filter((f) => !names.has(f.name))];
    });
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }, []);

  const removeFile = (name: string) =>
    setFiles((prev) => prev.filter((f) => f.name !== name));

  const validate = async () => {
    if (files.length === 0) return;
    setLoading(true);
    setResult(null);
    setError(null);

    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));

    try {
      const res = await fetch("/api/validate", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error desconocido");
      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al validar");
    } finally {
      setLoading(false);
    }
  };

  const statusColor = (estado: string) => {
    if (estado === "OK") return "text-green-700 bg-green-50 border-green-200";
    if (estado === "OBSERVACION")
      return "text-yellow-700 bg-yellow-50 border-yellow-200";
    return "text-red-700 bg-red-50 border-red-200";
  };

  const statusIcon = (estado: string) => {
    if (estado === "OK") return "✓";
    if (estado === "OBSERVACION") return "⚠";
    return "✗";
  };

  const resultadoConfig = {
    APROBADO: {
      bg: "bg-green-100 border-green-400",
      text: "text-green-800",
      label: "APROBADO",
    },
    APROBADO_CON_OBSERVACIONES: {
      bg: "bg-yellow-100 border-yellow-400",
      text: "text-yellow-800",
      label: "APROBADO CON OBSERVACIONES",
    },
    RECHAZADO: {
      bg: "bg-red-100 border-red-400",
      text: "text-red-800",
      label: "RECHAZADO",
    },
  };

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#005A9C] text-white shadow">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4">
          <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shrink-0">
            <span className="text-[#005A9C] font-bold text-xs text-center leading-tight">
              URT
            </span>
          </div>
          <div>
            <h1 className="text-xl font-bold leading-tight">
              Validador de Paquetes de Eventos
            </h1>
            <p className="text-blue-200 text-sm">
              Unidad de Restitución de Tierras — Revisión de documentos
            </p>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Upload area */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-1">
            Cargar documentos del paquete
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Sube todos los archivos del paquete (PDFs + Excel). El sistema
            validará su completitud y consistencia.
          </p>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
              dragging
                ? "border-blue-500 bg-blue-50"
                : "border-gray-300 hover:border-blue-400 hover:bg-gray-50"
            }`}
          >
            <div className="text-4xl mb-3">📁</div>
            <p className="text-gray-600 mb-2">
              Arrastra los archivos aquí o haz clic para seleccionarlos
            </p>
            <p className="text-gray-400 text-sm mb-4">
              Formatos: PDF, Excel (.xlsx, .xls)
            </p>
            <label className="cursor-pointer bg-[#005A9C] text-white px-5 py-2 rounded-lg hover:bg-blue-800 transition-colors text-sm font-medium">
              Seleccionar archivos
              <input
                type="file"
                multiple
                accept=".pdf,.xlsx,.xls"
                className="hidden"
                onChange={(e) => addFiles(e.target.files)}
              />
            </label>
          </div>

          {files.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium text-gray-700 mb-2">
                Archivos cargados ({files.length}):
              </p>
              <ul className="space-y-1 max-h-56 overflow-y-auto">
                {files.map((f) => (
                  <li
                    key={f.name}
                    className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2"
                  >
                    <span className="text-sm text-gray-700 flex items-center gap-2 truncate mr-2">
                      <span className="shrink-0">
                        {f.name.endsWith(".pdf") ? "📄" : "📊"}
                      </span>
                      <span className="truncate">{f.name}</span>
                    </span>
                    <button
                      onClick={() => removeFile(f.name)}
                      className="text-red-400 hover:text-red-600 text-xs px-2 py-0.5 rounded hover:bg-red-50 shrink-0"
                    >
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Validate button */}
        <div className="flex justify-center">
          <button
            onClick={validate}
            disabled={files.length === 0 || loading}
            className="bg-[#005A9C] text-white px-10 py-3 rounded-xl font-semibold text-base hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm flex items-center gap-2"
          >
            {loading ? (
              <>
                <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                Analizando documentos...
              </>
            ) : (
              "Validar Paquete"
            )}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-300 rounded-lg p-4 text-red-700 text-sm">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-6">
            {/* Resultado final */}
            <div
              className={`border-2 rounded-xl p-5 ${
                resultadoConfig[result.resultado_final].bg
              }`}
            >
              <div className="flex items-start justify-between gap-4 mb-2">
                <h2 className="text-lg font-bold text-gray-800">
                  Resultado de Validación
                </h2>
                <span
                  className={`font-bold text-base shrink-0 ${
                    resultadoConfig[result.resultado_final].text
                  }`}
                >
                  {resultadoConfig[result.resultado_final].label}
                </span>
              </div>
              <p className="text-gray-700 text-sm leading-relaxed">
                {result.resumen_ejecutivo}
              </p>
            </div>

            {/* Resumen del caso */}
            <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-base font-semibold text-gray-800 mb-4">
                Información del caso
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {Object.entries({
                  Resguardo: result.resumen.resguardo,
                  NIT: result.resumen.nit,
                  Gobernador: result.resumen.gobernador,
                  "C.C. Gobernador": result.resumen.cedula_gobernador,
                  Banco: result.resumen.banco,
                  "Cuenta Bancaria": result.resumen.cuenta_bancaria,
                  "Fecha del Evento": result.resumen.fecha_evento,
                  Municipio: result.resumen.municipio,
                  Participantes: result.resumen.num_participantes,
                }).map(([k, v]) => (
                  <div key={k} className="flex gap-2 text-sm">
                    <span className="text-gray-500 min-w-[130px] font-medium shrink-0">
                      {k}:
                    </span>
                    <span className="text-gray-800">{v || "—"}</span>
                  </div>
                ))}
              </div>
              {result.resumen.nombre_evento && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <span className="text-gray-500 text-sm font-medium">
                    Evento:{" "}
                  </span>
                  <span className="text-gray-800 text-sm italic">
                    {result.resumen.nombre_evento}
                  </span>
                </div>
              )}
            </section>

            {/* Documentos */}
            <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-base font-semibold text-gray-800 mb-4">
                Revisión de documentos
              </h3>
              <div className="space-y-2">
                {result.documentos.map((doc, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-3 border rounded-lg px-4 py-3 ${statusColor(
                      doc.estado
                    )}`}
                  >
                    <span className="font-bold text-base mt-0.5 shrink-0">
                      {statusIcon(doc.estado)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{doc.nombre}</p>
                      {doc.observacion && (
                        <p className="text-xs mt-0.5 opacity-80">
                          {doc.observacion}
                        </p>
                      )}
                    </div>
                    <span className="text-xs font-semibold uppercase shrink-0">
                      {doc.estado.replace("_", " ")}
                    </span>
                  </div>
                ))}
              </div>

              {result.documentos_faltantes.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-sm font-medium text-red-700 mb-2">
                    Documentos faltantes en el paquete:
                  </p>
                  <ul className="space-y-1">
                    {result.documentos_faltantes.map((d, i) => (
                      <li key={i} className="text-sm text-red-600 flex gap-2">
                        <span className="shrink-0">✗</span> {d}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {/* Validaciones cruzadas */}
            <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-base font-semibold text-gray-800 mb-4">
                Validaciones cruzadas entre documentos
              </h3>
              <div className="space-y-2">
                {result.validaciones_cruzadas.map((v, i) => (
                  <div
                    key={i}
                    className={`border rounded-lg px-4 py-3 ${statusColor(
                      v.estado
                    )}`}
                  >
                    <div className="flex items-start gap-2 justify-between">
                      <span className="text-sm font-medium">
                        {statusIcon(v.estado)} {v.validacion}
                      </span>
                      <span className="text-xs font-bold uppercase shrink-0 ml-2">
                        {v.estado}
                      </span>
                    </div>
                    {v.detalle && (
                      <p className="text-xs mt-1 opacity-75">{v.detalle}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>

      <footer className="mt-12 py-6 border-t border-gray-200 text-center text-gray-400 text-xs">
        URT — Validador de Paquetes de Eventos · Uso interno
      </footer>
    </main>
  );
}
