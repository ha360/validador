import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: totalEventos }, { data: usoStats }, { data: ultimosUsos }] =
    await Promise.all([
      supabase.from("eventos").select("id, estado", { count: "exact" }),
      supabase
        .from("uso_validador")
        .select("resultado")
        .eq("user_id", user!.id),
      supabase
        .from("uso_validador")
        .select("fecha, resguardo, resultado, num_documentos")
        .eq("user_id", user!.id)
        .order("fecha", { ascending: false })
        .limit(5),
    ]);

  const totalValidaciones = usoStats?.length ?? 0;
  const aprobados = usoStats?.filter((u) => u.resultado === "APROBADO").length ?? 0;
  const conObs = usoStats?.filter((u) => u.resultado === "APROBADO_CON_OBSERVACIONES").length ?? 0;
  const rechazados = usoStats?.filter((u) => u.resultado === "RECHAZADO").length ?? 0;

  const estadosEvento = totalEventos?.reduce(
    (acc: Record<string, number>, e) => {
      acc[e.estado ?? "Sin estado"] = (acc[e.estado ?? "Sin estado"] ?? 0) + 1;
      return acc;
    },
    {}
  );

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-800">Dashboard</h1>
        <p className="text-gray-500 text-sm">Resumen de actividad del sistema</p>
      </div>

      {/* Estadísticas validador */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Mi uso del Validador
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total validaciones", value: totalValidaciones, color: "text-blue-700" },
            { label: "Aprobados", value: aprobados, color: "text-green-700" },
            { label: "Con observaciones", value: conObs, color: "text-yellow-700" },
            { label: "Rechazados", value: rechazados, color: "text-red-700" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-gray-500 text-xs mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Últimas validaciones */}
      {ultimosUsos && ultimosUsos.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Últimas validaciones realizadas
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Fecha</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Resguardo</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Docs</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {ultimosUsos.map((u, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(u.fecha).toLocaleDateString("es-CO")}
                    </td>
                    <td className="px-4 py-3 text-gray-800">{u.resguardo ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-500">{u.num_documentos}</td>
                    <td className="px-4 py-3">
                      <ResultadoBadge resultado={u.resultado} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Matriz: resumen de estados */}
      {estadosEvento && Object.keys(estadosEvento).length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Eventos en Matriz (por estado)
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(estadosEvento).map(([estado, count]) => (
              <div key={estado} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <p className="text-xl font-bold text-gray-800">{count}</p>
                <p className="text-gray-500 text-xs mt-1 truncate">{estado}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {(!estadosEvento || Object.keys(estadosEvento).length === 0) && (
        <section className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-center">
          <p className="text-blue-700 font-medium">La Matriz de Eventos está vacía</p>
          <p className="text-blue-500 text-sm mt-1">
            El administrador puede importar datos desde el módulo Matriz.
          </p>
        </section>
      )}
    </div>
  );
}

function ResultadoBadge({ resultado }: { resultado: string }) {
  const map: Record<string, string> = {
    APROBADO: "bg-green-100 text-green-700",
    APROBADO_CON_OBSERVACIONES: "bg-yellow-100 text-yellow-700",
    RECHAZADO: "bg-red-100 text-red-700",
  };
  const labels: Record<string, string> = {
    APROBADO: "Aprobado",
    APROBADO_CON_OBSERVACIONES: "Con obs.",
    RECHAZADO: "Rechazado",
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${map[resultado] ?? "bg-gray-100 text-gray-600"}`}>
      {labels[resultado] ?? resultado}
    </span>
  );
}
