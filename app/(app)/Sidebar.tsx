"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Perfil = {
  nombre: string;
  email: string;
  rol: string;
} | null;

const MODULOS = [
  { id: "matriz",       label: "Matriz de Eventos",  icon: "📋", href: "/matriz" },
  { id: "validador",    label: "Validador",           icon: "✅", href: "/validador" },
  { id: "tarifario",   label: "Tarifario",            icon: "💰", href: "/tarifario" },
  { id: "directorio",  label: "Directorio",           icon: "📞", href: "/directorio" },
  { id: "presupuesto", label: "Presupuesto",          icon: "📊", href: "/presupuesto" },
  { id: "caja_menor",  label: "Caja Menor",           icon: "🧾", href: "/caja-menor" },
  { id: "dashboard",   label: "Dashboard",            icon: "📈", href: "/dashboard" },
  { id: "admin",       label: "Usuarios",             icon: "👥", href: "/admin" },
];

export default function Sidebar({
  perfil,
  acceso,
}: {
  perfil: Perfil;
  acceso: string[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const modulosVisibles = MODULOS.filter((m) => acceso.includes(m.id));

  return (
    <aside className="w-56 bg-[#05243B] flex flex-col shrink-0 h-full">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#005A9C] rounded-lg flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-bold">URT</span>
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">URTFlow</p>
            <p className="text-blue-300 text-xs">Gestión de Eventos</p>
          </div>
        </div>
      </div>

      {/* Navegación */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {modulosVisibles.map((m) => {
          const active = pathname.startsWith(m.href);
          return (
            <Link
              key={m.id}
              href={m.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active
                  ? "bg-[#005A9C] text-white font-medium"
                  : "text-blue-200 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span className="text-base">{m.icon}</span>
              {m.label}
            </Link>
          );
        })}
      </nav>

      {/* Usuario */}
      <div className="px-3 py-4 border-t border-white/10">
        <div className="px-3 py-2 mb-2">
          <p className="text-white text-sm font-medium truncate">
            {perfil?.nombre ?? "Usuario"}
          </p>
          <p className="text-blue-300 text-xs truncate">{perfil?.email}</p>
          <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-white/10 text-blue-200 capitalize">
            {perfil?.rol}
          </span>
        </div>
        <button
          onClick={handleLogout}
          className="w-full text-left px-3 py-2 text-sm text-blue-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
