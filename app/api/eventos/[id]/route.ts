import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

const CAMPOS_EDITABLES = new Set([
  "estado",
  "estado_tramite",
  "legalizado",
  "recibido_satisfaccion",
  "observaciones",
  "valor_ejecutado",
]);

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: perfil } = await supabase
    .from("profiles")
    .select("rol")
    .eq("id", user.id)
    .single();

  const rolEvento = perfil?.rol ?? user.user_metadata?.rol ?? "analista";
  if (!["admin", "analista"].includes(rolEvento)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const body = await request.json();
  const { cambios, notas } = body as {
    cambios: Record<string, unknown>;
    notas?: string;
  };

  // Filtrar solo campos editables
  const camposPermitidos = Object.fromEntries(
    Object.entries(cambios).filter(([k]) => CAMPOS_EDITABLES.has(k))
  );

  if (Object.keys(camposPermitidos).length === 0) {
    return NextResponse.json({ error: "No hay campos válidos para actualizar" }, { status: 400 });
  }

  // Leer estado anterior del evento
  const { data: eventoActual, error: readError } = await supabase
    .from("eventos")
    .select("estado, estado_tramite, legalizado, recibido_satisfaccion, observaciones, valor_ejecutado")
    .eq("id", id)
    .single();

  if (readError || !eventoActual) {
    return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
  }

  // Actualizar evento
  const { error: updateError } = await supabase
    .from("eventos")
    .update({ ...camposPermitidos, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Registrar cambios en historial
  const registros = Object.entries(camposPermitidos).map(([campo, valorNuevo]) => ({
    evento_id: Number(id),
    user_id: user.id,
    campo,
    valor_anterior: String(eventoActual[campo as keyof typeof eventoActual] ?? ""),
    valor_nuevo: String(valorNuevo ?? ""),
    notas: notas ?? null,
  }));

  await supabase.from("eventos_cambios").insert(registros);

  return NextResponse.json({ ok: true });
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  // Obtener historial de cambios del evento
  const { data: cambios, error } = await supabase
    .from("eventos_cambios")
    .select("id, campo, valor_anterior, valor_nuevo, notas, fecha, profiles(nombre)")
    .eq("evento_id", id)
    .order("fecha", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ cambios: cambios ?? [] });
}
