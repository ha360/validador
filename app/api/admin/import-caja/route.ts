import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

function norm(h: string): string {
  return h.toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

function parseDate(val: unknown): string | null {
  if (!val) return null;
  if (typeof val === "number") {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  if (typeof val === "string") {
    const m = val.trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) {
      const year = m[3].length === 2 ? `20${m[3]}` : m[3];
      return `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    }
    const d = new Date(val.trim());
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  }
  return null;
}

function parseNum(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  const n = Number(String(val).replace(/[$,\s]/g, ""));
  return isNaN(n) ? null : n;
}

const COL_MAP: Record<string, string> = {
  "no. evento": "no_evento",
  "no evento": "no_evento",
  evento: "no_evento",
  "no. solicitud": "no_solicitud",
  "no solicitud": "no_solicitud",
  solicitud: "no_solicitud",
  fecha: "fecha",
  "fecha del gasto": "fecha",
  "fecha gasto": "fecha",
  concepto: "concepto",
  "descripcion": "concepto",
  "descripción": "concepto",
  beneficiario: "beneficiario",
  "nombre beneficiario": "beneficiario",
  "proveedor": "beneficiario",
  valor: "valor",
  "valor gasto": "valor",
  monto: "valor",
  "tipo gasto": "tipo_gasto",
  "tipo de gasto": "tipo_gasto",
  categoria: "tipo_gasto",
  "no. soporte": "no_soporte",
  "no soporte": "no_soporte",
  soporte: "no_soporte",
  comprobante: "no_soporte",
  observaciones: "observaciones",
  notas: "observaciones",
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
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });

  const sheetName =
    workbook.SheetNames.find(n => norm(n).includes("caja")) ??
    workbook.SheetNames[0];

  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
  if (rawRows.length < 2) return NextResponse.json({ error: "Hoja vacía" }, { status: 400 });

  let headerIdx = 0, maxMatches = 0;
  for (let i = 0; i < Math.min(15, rawRows.length); i++) {
    const matches = (rawRows[i] as string[]).filter(c => COL_MAP[norm(String(c))] !== undefined).length;
    if (matches > maxMatches) { maxMatches = matches; headerIdx = i; }
  }

  const headers = (rawRows[headerIdx] as string[]).map(h => norm(String(h)));
  const colToField: Record<number, string> = {};
  headers.forEach((h, idx) => { if (COL_MAP[h]) colToField[idx] = COL_MAP[h]; });

  if (Object.keys(colToField).length === 0) {
    return NextResponse.json({ error: `No se reconocieron columnas. Encabezados: ${headers.filter(h => h).slice(0, 10).join(" | ")}` }, { status: 400 });
  }

  const DATE_FIELDS = new Set(["fecha"]);
  const NUM_FIELDS = new Set(["valor", "no_solicitud"]);

  const registros: Record<string, unknown>[] = [];
  for (let r = headerIdx + 1; r < rawRows.length; r++) {
    const row = rawRows[r] as unknown[];
    const obj: Record<string, unknown> = {};
    for (const [idxStr, field] of Object.entries(colToField)) {
      const val = row[Number(idxStr)];
      if (DATE_FIELDS.has(field)) obj[field] = parseDate(val);
      else if (NUM_FIELDS.has(field)) obj[field] = parseNum(val);
      else obj[field] = String(val ?? "").trim() || null;
    }
    const hasData = Object.values(obj).some(v => v !== null && v !== "");
    if (hasData) registros.push(obj);
  }

  if (registros.length === 0) return NextResponse.json({ error: "No se encontraron registros con datos" }, { status: 400 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const insertClient = serviceKey ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey) : supabase;

  await insertClient.from("caja_menor").delete().neq("id", 0);

  let inserted = 0, errors = 0, primerError = "";
  const BATCH = 200;
  for (let i = 0; i < registros.length; i += BATCH) {
    const { error } = await insertClient.from("caja_menor").insert(registros.slice(i, i + BATCH));
    if (error) { errors += Math.min(BATCH, registros.length - i); if (!primerError) primerError = error.message; }
    else inserted += Math.min(BATCH, registros.length - i);
  }

  return NextResponse.json({ ok: inserted > 0, hoja: sheetName, inserted, errors, ...(primerError ? { primerError } : {}) });
}
