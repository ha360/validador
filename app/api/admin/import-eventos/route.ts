import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

// Mapea encabezados del Excel (flexibles) a columnas de la DB
const COL_MAP: Record<string, string> = {
  "no. solicitud": "no_solicitud",
  "no solicitud": "no_solicitud",
  solicitud: "no_solicitud",
  "no. evento operador": "no_evento_operador",
  "no evento operador": "no_evento_operador",
  evento: "no_evento_operador",
  meta: "meta",
  enlace: "enlace",
  "fecha solicitud": "fecha_solicitud",
  "fecha de solicitud": "fecha_solicitud",
  "dirección territorial": "direccion_territorial",
  "direccion territorial": "direccion_territorial",
  territorial: "direccion_territorial",
  "objeto del evento": "objeto_evento",
  "objeto evento": "objeto_evento",
  objeto: "objeto_evento",
  tipología: "tipologia",
  tipologia: "tipologia",
  "actividad asociada": "actividad_asociada",
  actividad: "actividad_asociada",
  departamento: "departamento",
  municipio: "municipio",
  "ciudad/municipio": "municipio",
  "fecha inicio": "fecha_inicio",
  "fecha de inicio": "fecha_inicio",
  "fecha fin": "fecha_fin",
  "fecha de fin": "fecha_fin",
  días: "dias_evento",
  dias: "dias_evento",
  "días evento": "dias_evento",
  "nombre responsable": "nombre_responsable",
  responsable: "nombre_responsable",
  "nombre del responsable": "nombre_responsable",
  teléfono: "telefono_responsable",
  telefono: "telefono_responsable",
  "email responsable": "email_responsable",
  "correo responsable": "email_responsable",
  "# asistentes": "num_asistentes",
  asistentes: "num_asistentes",
  "no. asistentes": "num_asistentes",
  población: "poblacion",
  poblacion: "poblacion",
  "nombre comunidad": "nombre_comunidad",
  comunidad: "nombre_comunidad",
  "valor aprobado": "valor_aprobado",
  "valor ejecutado": "valor_ejecutado",
  estado: "estado",
  "estado tramite": "estado_tramite",
  "estado trámite": "estado_tramite",
  legalizado: "legalizado",
  "recibido satisfaccion": "recibido_satisfaccion",
  "recibido satisfacción": "recibido_satisfaccion",
  observaciones: "observaciones",
};

function normalizeHeader(h: string): string {
  return h
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function parseDate(val: unknown): string | null {
  if (!val) return null;
  // Excel serial date
  if (typeof val === "number") {
    const date = XLSX.SSF.parse_date_code(val);
    if (date) {
      const y = date.y;
      const m = String(date.m).padStart(2, "0");
      const d = String(date.d).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }
  // String date
  if (typeof val === "string") {
    const cleaned = val.trim();
    if (!cleaned) return null;
    // Try DD/MM/YYYY
    const match = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (match) {
      const [, d, m, y] = match;
      const year = y.length === 2 ? `20${y}` : y;
      return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    const d = new Date(cleaned);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  }
  return null;
}

function parseBool(val: unknown): boolean {
  if (typeof val === "boolean") return val;
  if (typeof val === "string") {
    const v = val.toLowerCase().trim();
    return v === "si" || v === "sí" || v === "yes" || v === "true" || v === "x" || v === "1";
  }
  if (typeof val === "number") return val === 1;
  return false;
}

function parseNum(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  const n = Number(String(val).replace(/[$,\s]/g, ""));
  return isNaN(n) ? null : n;
}

export async function POST(request: NextRequest) {
  // Solo admin puede importar
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: perfil } = await supabase
    .from("profiles")
    .select("rol")
    .eq("id", user.id)
    .single();

  const rol = perfil?.rol ?? user.user_metadata?.rol ?? "analista";
  if (rol !== "admin") {
    return NextResponse.json({ error: "Sin permisos de administrador" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });

  // Buscar la hoja principal (MATRIZ 2026 o primera con más columnas)
  let sheetName = workbook.SheetNames.find((n) =>
    n.toLowerCase().includes("matriz")
  ) ?? workbook.SheetNames[0];

  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];

  if (rawRows.length < 2) {
    return NextResponse.json({ error: "El archivo está vacío o no tiene datos" }, { status: 400 });
  }

  // Encontrar fila de encabezados — la que tenga más coincidencias con COL_MAP
  let headerRowIdx = 0;
  let maxMatches = 0;

  for (let i = 0; i < Math.min(15, rawRows.length); i++) {
    const row = rawRows[i] as unknown[];
    const matches = row.filter((c) => {
      const norm = normalizeHeader(String(c));
      return COL_MAP[norm] !== undefined;
    }).length;
    if (matches > maxMatches) {
      maxMatches = matches;
      headerRowIdx = i;
    }
  }

  const headers = (rawRows[headerRowIdx] as unknown[]).map((h) =>
    normalizeHeader(String(h))
  );

  // Mapear índices de columna a campos DB
  const colIndexToField: Record<number, string> = {};
  headers.forEach((h, idx) => {
    const field = COL_MAP[h];
    if (field) colIndexToField[idx] = field;
  });

  // Si no encontró ninguna columna conocida, retornar diagnóstico
  if (Object.keys(colIndexToField).length === 0) {
    const muestra = headers.filter(h => h !== "").slice(0, 15);
    return NextResponse.json({
      error: `No se reconocieron columnas del Excel. Encabezados encontrados en fila ${headerRowIdx + 1}: ${muestra.join(" | ")}`,
    }, { status: 400 });
  }

  // Parsear filas de datos
  const DATE_FIELDS = new Set(["fecha_solicitud", "fecha_inicio", "fecha_fin"]);
  const BOOL_FIELDS = new Set(["legalizado", "recibido_satisfaccion"]);
  const NUM_FIELDS = new Set(["no_solicitud", "num_asistentes", "dias_evento", "valor_aprobado", "valor_ejecutado"]);

  const eventos: Record<string, unknown>[] = [];
  for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
    const row = rawRows[i] as unknown[];
    const obj: Record<string, unknown> = {};

    for (const [idxStr, field] of Object.entries(colIndexToField)) {
      const idx = Number(idxStr);
      const val = row[idx];
      if (DATE_FIELDS.has(field)) {
        obj[field] = parseDate(val);
      } else if (BOOL_FIELDS.has(field)) {
        obj[field] = parseBool(val);
      } else if (NUM_FIELDS.has(field)) {
        obj[field] = parseNum(val);
      } else {
        obj[field] = val !== "" ? String(val).trim() : null;
      }
    }

    // Ignorar filas completamente vacías
    const hasContent = Object.values(obj).some((v) => v !== null && v !== "");
    if (hasContent) eventos.push(obj);
  }

  if (eventos.length === 0) {
    const camposDetectados = Object.values(colIndexToField).join(", ");
    return NextResponse.json({
      error: `Se encontraron columnas (${camposDetectados}) pero ninguna fila tiene datos válidos. Verifica que la hoja tenga datos después de la cabecera (fila ${headerRowIdx + 1}).`,
    }, { status: 400 });
  }

  // Usar service_role para el insert (bypass RLS) si está disponible
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const insertClient = serviceKey
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)
    : supabase;

  // Insertar en lotes de 100
  let inserted = 0;
  let errors = 0;
  let primerError = "";
  const BATCH = 100;

  for (let i = 0; i < eventos.length; i += BATCH) {
    const batch = eventos.slice(i, i + BATCH);
    const { error } = await insertClient.from("eventos").insert(batch);
    if (error) {
      errors += batch.length;
      if (!primerError) primerError = error.message;
    } else {
      inserted += batch.length;
    }
  }

  return NextResponse.json({
    ok: inserted > 0,
    hoja: sheetName,
    total: eventos.length,
    inserted,
    errors,
    ...(primerError ? { primerError } : {}),
    usandoServiceKey: !!serviceKey,
  });
}
