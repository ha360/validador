import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const rol = user.user_metadata?.rol ?? "analista";
  if (!["admin", "analista"].includes(rol)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const body = await request.json();

  // Calcular días automáticamente si hay fechas
  if (body.fecha_inicio && body.fecha_fin && !body.dias_evento) {
    const inicio = new Date(body.fecha_inicio);
    const fin = new Date(body.fecha_fin);
    const diff = Math.round((fin.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (diff > 0) body.dias_evento = diff;
  }

  const { data, error } = await supabase
    .from("eventos")
    .insert(body)
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}
