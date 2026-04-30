import { createClient } from "@/lib/supabase/server";
import MatrizClient from "./MatrizClient";

export default async function MatrizPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  const { data: perfil } = await supabase
    .from("profiles")
    .select("rol")
    .eq("id", user!.id)
    .single();

  const esAdmin = (perfil?.rol ?? user!.user_metadata?.rol) === "admin";

  const { data: eventos } = await supabase
    .from("eventos")
    .select(
      "id, no_solicitud, no_evento_operador, fecha_inicio, fecha_fin, direccion_territorial, nombre_comunidad, objeto_evento, municipio, num_asistentes, valor_aprobado, valor_ejecutado, estado, estado_tramite, legalizado, recibido_satisfaccion, observaciones"
    )
    .order("no_solicitud", { ascending: true })
    .limit(1000);

  // Extraer territoriales únicas para el filtro
  const territoriales = Array.from(
    new Set((eventos ?? []).map((e) => e.direccion_territorial).filter(Boolean) as string[])
  ).sort();

  return (
    <MatrizClient
      eventos={eventos ?? []}
      esAdmin={esAdmin}
      territoriales={territoriales}
    />
  );
}
