import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Extrae campos clave de máximo 2 archivos por llamada (≤ 3MB por request)
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No se recibieron archivos" }, { status: 400 });
    }

    const userContent: Anthropic.MessageParam["content"] = [];

    for (const file of files) {
      const bytes = await file.arrayBuffer();
      const base64 = Buffer.from(bytes).toString("base64");

      if (file.name.toLowerCase().endsWith(".pdf")) {
        userContent.push({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: base64 },
          title: file.name,
        } as Anthropic.DocumentBlockParam);
      } else {
        userContent.push({
          type: "text",
          text: `[Archivo Excel: ${file.name}]`,
        });
      }
    }

    userContent.push({
      type: "text",
      text: `Extrae los campos clave de cada documento. Responde SOLO con JSON válido:
{
  "documentos": [
    {
      "archivo": "nombre del archivo",
      "tipo": "tipo de documento (ej: Acta de Posesión, RUT, Cédula, Certificación Bancaria, Disposición de Asistencia, Autorización de Consignación, Cotización, Soporte Adquisición, Autorización Ritual, Solicitud de Evento CO-FO-10, Solicitud Tiquetes CO-FO-11, Certificado Representación Legal, Otro)",
      "presente": true,
      "campos": {
        "resguardo": "nombre si aparece",
        "nit": "NIT si aparece",
        "gobernador": "nombre del gobernador si aparece",
        "cedula_gobernador": "CC del gobernador si aparece",
        "banco": "nombre del banco si aparece",
        "cuenta_bancaria": "número de cuenta si aparece",
        "tipo_cuenta": "tipo de cuenta (individual/jurídica) si aparece",
        "fecha_evento": "fecha del evento si aparece",
        "nombre_evento": "nombre del evento si aparece",
        "municipio": "municipio si aparece",
        "num_participantes": "número de participantes si aparece",
        "vigencia": "año de vigencia si es un acta de posesión",
        "observacion": "cualquier problema o dato importante"
      }
    }
  ]
}`,
    });

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: "Eres un extractor de datos de documentos de la URT Colombia. Responde ÚNICAMENTE con JSON válido, sin texto adicional.",
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userContent }],
    });

    const rawText =
      response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "No se pudo parsear respuesta", raw: rawText }, { status: 500 });
    }

    return NextResponse.json(JSON.parse(jsonMatch[0]));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
