import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

function norm(h: string): string {
  return h.toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

const COL_MAP: Record<string, string> = {
  nombre: "nombre",
  "nombre completo": "nombre",
  funcionario: "nombre",
  enlace: "nombre",
  cargo: "cargo",
  "cargo/rol": "cargo",
  rol: "cargo",
  email: "email",
  correo: "email",
  "correo electronico": "email",
  "correo electrónico": "email",
  telefono: "telefono",
  teléfono: "telefono",
  celular: "telefono",
  "celular/telefono": "telefono",
  departamento: "departamento",
  zona: "zona",
  "direccion territorial": "zona",
  "dirección territorial": "zona",
  territorial: "zona",
  tipo: "tipo",
  "tipo de enlace": "tipo",
};

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: perfil } = await supabase.from("profiles").select("rol").eq("id", user.id).single();
  const rol = perfil?.rol ?? user.user_metadata?.rol ?? "analista";
  if (rol !== "admin") return NextResponse.json({ error: "Sin permisos de administrador" }, { status: 403 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer" });

  const sheetName =
    workbook.SheetNames.find(n => norm(n).includes("distribucion") || norm(n).includes("distribución") || norm(n).includes("enlace")) ??
    workbook.SheetNames[0];

  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
  if (rawRows.length < 2) return NextResponse.json({ error: "Hoja vacía" }, { status: 400 });

  // Find header row
  let headerIdx = 0, maxMatches = 0;
  for (let i = 0; i < Math.min(10, rawRows.length); i++) {
    const matches = (rawRows[i] as string[]).filter(c => COL_MAP[norm(String(c))] !== undefined).length;
    if (matches > maxMatches) { maxMatches = matches; headerIdx = i; }
  }

  const headers = (rawRows[headerIdx] as string[]).map(h => norm(String(h)));
  const colToField: Record<number, string> = {};
  headers.forEach((h, idx) => { if (COL_MAP[h]) colToField[idx] = COL_MAP[h]; });

  if (Object.keys(colToField).length === 0) {
    return NextResponse.json({ error: `No se reconocieron columnas. Encabezados: ${headers.filter(h => h).slice(0, 10).join(" | ")}` }, { status: 400 });
  }

  const registros: Record<string, unknown>[] = [];
  for (let r = headerIdx + 1; r < rawRows.length; r++) {
    const row = rawRows[r] as unknown[];
    const obj: Record<string, unknown> = {};
    for (const [idxStr, field] of Object.entries(colToField)) {
      const val = String(row[Number(idxStr)] ?? "").trim();
      obj[field] = val || null;
    }
    if (obj.nombre) registros.push(obj);
  }

  if (registros.length === 0) return NextResponse.json({ error: "No se encontraron registros con nombre" }, { status: 400 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const insertClient = serviceKey ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey) : supabase;

  await insertClient.from("directorio").delete().neq("id", 0);

  let inserted = 0, errors = 0, primerError = "";
  const BATCH = 200;
  for (let i = 0; i < registros.length; i += BATCH) {
    const { error } = await insertClient.from("directorio").insert(registros.slice(i, i + BATCH));
    if (error) { errors += Math.min(BATCH, registros.length - i); if (!primerError) primerError = error.message; }
    else inserted += Math.min(BATCH, registros.length - i);
  }

  return NextResponse.json({ ok: inserted > 0, hoja: sheetName, inserted, errors, ...(primerError ? { primerError } : {}) });
}
