import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

function normalizeText(h: string): string {
  return h
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function parseNum(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  const n = Number(String(val).replace(/[$,\s.]/g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}

// The TARIFARIO sheet is wide-format:
// Col 0: ITEM/SERVICIO, Col 1: SUB_ITEM, Col 2: RANGO
// Then for each department, 3 columns: URBANO <50K HAB | VEREDA/INSPECCIÓN | CIUDAD CAPITAL
// Two header rows: one with dept names (merged), one with zone names
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

  const sheetName = workbook.SheetNames.find(n => normalizeText(n).includes("tarif")) ?? workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Use raw rows; defval="" so empty cells are strings
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];

  if (rawRows.length < 3) return NextResponse.json({ error: "Hoja vacía" }, { status: 400 });

  // Find the ZONE header row — the one containing "URBANO" or "VEREDA"
  const ZONA_KEYWORDS = ["urbano", "vereda", "capital", "ciudad capital"];
  let zoneRowIdx = -1;
  for (let i = 0; i < Math.min(20, rawRows.length); i++) {
    const row = rawRows[i] as string[];
    const zoneMatches = row.filter(c => ZONA_KEYWORDS.some(k => normalizeText(String(c)).includes(k))).length;
    if (zoneMatches >= 2) { zoneRowIdx = i; break; }
  }

  if (zoneRowIdx < 1) {
    return NextResponse.json({ error: `No se encontró la fila de zonas (URBANO/VEREDA/CAPITAL) en las primeras 20 filas de la hoja "${sheetName}"` }, { status: 400 });
  }

  const deptRowIdx = zoneRowIdx - 1;
  const deptRow = rawRows[deptRowIdx] as string[];
  const zoneRow = rawRows[zoneRowIdx] as string[];

  // Determine first data column (skip item/sub_item/rango columns at start)
  // The first department starts at the first column that has a real dept name in deptRow
  // We find the data start column by looking for when the dept row has non-empty values past col 0-2
  let dataStartCol = 3;
  for (let c = 3; c < deptRow.length; c++) {
    const cell = normalizeText(String(deptRow[c]));
    if (cell.length > 2 && !["servicio", "item", "sub", "rango", "personas"].some(k => cell.includes(k))) {
      dataStartCol = c;
      break;
    }
  }

  // Build column → (department, zone) map
  // Department names are spread across 3 consecutive columns (merged cells show only on first col)
  interface ColMap { departamento: string; zona: string }
  const colMap: Record<number, ColMap> = {};
  let currentDept = "";

  for (let c = dataStartCol; c < zoneRow.length; c++) {
    const deptCell = String(deptRow[c]).trim();
    if (deptCell) currentDept = deptCell;
    const zoneCell = String(zoneRow[c]).trim();
    if (zoneCell && currentDept) {
      colMap[c] = { departamento: currentDept, zona: zoneCell };
    }
  }

  if (Object.keys(colMap).length === 0) {
    return NextResponse.json({ error: `No se pudo construir el mapa de departamentos/zonas. Verifica la estructura de la hoja "${sheetName}".` }, { status: 400 });
  }

  // Parse data rows
  const dataStartRow = zoneRowIdx + 1;
  const tarifas: Record<string, unknown>[] = [];
  let currentItem = "";

  for (let r = dataStartRow; r < rawRows.length; r++) {
    const row = rawRows[r] as unknown[];
    const col0 = String(row[0] ?? "").trim();
    const col1 = String(row[1] ?? "").trim();
    const col2 = String(row[2] ?? "").trim();

    // Track current item (category) — carries forward when sub-rows don't repeat it
    if (col0) currentItem = col0;
    if (!currentItem) continue;

    // Skip total/summary rows
    const norm0 = normalizeText(col0 || currentItem);
    if (norm0.includes("total") || norm0.includes("subtotal")) continue;

    // For each department/zone column, create one record
    for (const [colStr, meta] of Object.entries(colMap)) {
      const c = Number(colStr);
      const valor = parseNum(row[c]);
      if (valor === null) continue; // skip empty cells

      tarifas.push({
        item: currentItem,
        sub_item: col1 || null,
        rango: col2 || null,
        departamento: meta.departamento,
        zona: meta.zona,
        valor_unitario: valor,
      });
    }
  }

  if (tarifas.length === 0) {
    return NextResponse.json({ error: `Se detectaron ${Object.keys(colMap).length} columnas de departamento/zona pero ningún valor numérico en los datos.` }, { status: 400 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const insertClient = serviceKey
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)
    : supabase;

  // Borrar tarifas existentes y reinsertar
  await insertClient.from("tarifario").delete().neq("id", 0);

  let inserted = 0, errors = 0, primerError = "";
  const BATCH = 500;
  for (let i = 0; i < tarifas.length; i += BATCH) {
    const { error } = await insertClient.from("tarifario").insert(tarifas.slice(i, i + BATCH));
    if (error) { errors += Math.min(BATCH, tarifas.length - i); if (!primerError) primerError = error.message; }
    else inserted += Math.min(BATCH, tarifas.length - i);
  }

  return NextResponse.json({ ok: inserted > 0, hoja: sheetName, inserted, errors, ...(primerError ? { primerError } : {}) });
}
