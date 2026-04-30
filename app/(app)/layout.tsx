import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "./Sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Cargar perfil y módulos del usuario
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const { data: modulos } = await supabase
    .from("modulos_acceso")
    .select("modulo")
    .eq("user_id", user.id)
    .eq("habilitado", true);

  const modulosHabilitados = modulos?.map((m) => m.modulo) ?? [];

  // Admin siempre tiene acceso a todo
  // Fallback: lee el rol desde auth metadata si la query de profile falla
  const rol = profile?.rol ?? user.user_metadata?.rol ?? "analista";
  const esAdmin = rol === "admin";
  const acceso = esAdmin
    ? ["matriz", "validador", "tarifario", "directorio", "presupuesto", "caja_menor", "dashboard", "admin"]
    : modulosHabilitados;

  const perfilEfectivo = profile ?? {
    nombre: user.user_metadata?.nombre ?? user.email?.split("@")[0] ?? "Usuario",
    email: user.email ?? "",
    rol,
  };

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      <Sidebar perfil={perfilEfectivo} acceso={acceso} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
