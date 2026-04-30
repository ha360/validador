import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  // Verificar que quien llama es admin
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: perfil } = await supabase
    .from("profiles")
    .select("rol")
    .eq("id", user.id)
    .single();

  const rolUsuario = perfil?.rol ?? user.user_metadata?.rol ?? "analista";
  if (rolUsuario !== "admin") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json(
      { error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en las variables de entorno del servidor" },
      { status: 500 }
    );
  }

  const { nombre, email, password, rol, modulos } = await request.json();

  // Crear usuario con cliente admin (service_role)
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey
  );

  const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre, rol },
  });

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 400 });
  }

  // Asignar módulos de acceso
  if (modulos && modulos.length > 0 && newUser.user) {
    await adminClient.from("modulos_acceso").insert(
      modulos.map((m: string) => ({
        user_id: newUser.user!.id,
        modulo: m,
        habilitado: true,
      }))
    );
  }

  return NextResponse.json({ ok: true, id: newUser.user?.id });
}
