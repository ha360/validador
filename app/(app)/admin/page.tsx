import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AdminClient from "./AdminClient";

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: perfil } = await supabase
    .from("profiles")
    .select("rol")
    .eq("id", user!.id)
    .single();

  const rol = perfil?.rol ?? user!.user_metadata?.rol ?? "analista";
  if (rol !== "admin") redirect("/");

  const { data: usuarios } = await supabase
    .from("profiles")
    .select("id, nombre, email, rol, activo, created_at")
    .order("created_at", { ascending: false });

  const { data: modulos } = await supabase
    .from("modulos_acceso")
    .select("user_id, modulo, habilitado");

  const { data: usoTotal } = await supabase
    .from("uso_validador")
    .select("user_id");

  const usoCount: Record<string, number> = {};
  usoTotal?.forEach((u) => {
    usoCount[u.user_id] = (usoCount[u.user_id] ?? 0) + 1;
  });

  const modulosPorUsuario: Record<string, string[]> = {};
  modulos?.forEach((m) => {
    if (m.habilitado) {
      modulosPorUsuario[m.user_id] = [
        ...(modulosPorUsuario[m.user_id] ?? []),
        m.modulo,
      ];
    }
  });

  return (
    <AdminClient
      usuarios={usuarios ?? []}
      modulosPorUsuario={modulosPorUsuario}
      usoCount={usoCount}
    />
  );
}
