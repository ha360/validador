import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Instrucciones de validación — siempre iguales, se cachean entre llamadas
// para ahorrar tokens (cache_control ephemeral, TTL 5 min en Anthropic)
const VALIDATION_SYSTEM = `Eres un validador de documentos para la Unidad de Restitución de Tierras (URT) de Colombia, decreto ley de Víctimas 4633 de 2011.

DOCUMENTOS REQUERIDOS en todo paquete de evento:
1. Acta de Posesión del Cabildo (vigente para el año del evento)
2. Solicitud de Evento — formulario CO-FO-10
3. Solicitud de Tiquetes/Transporte — formulario CO-FO-11
4. RUT del Resguardo
5. Cédula del Representante Legal / Gobernador
6. Certificación Bancaria (a nombre del resguardo)
7. Disposición / Carta de Asistencia (firmada por el gobernador)
8. Cotización del Evento
9. Soporte de Adquisición / No Obligados a Facturar
10. Autorización de Consignación y Compromiso de Reembolso
11. Autorización Ritual (si aplica)

VALIDACIONES CRUZADAS obligatorias:
- NIT del resguardo: debe coincidir en RUT, Certificación Bancaria, Autorización de Consignación y demás documentos donde aparezca
- Nombre del Gobernador: debe coincidir en Acta de Posesión, Carta de Asistencia, Autorización de Consignación y Cédula
- Cédula (CC) del Gobernador: debe coincidir en todos los documentos
- Número de cuenta bancaria: comparar Certificación Bancaria vs Autorización de Consignación (ignorar guiones y formato, comparar solo dígitos)
- Fecha del evento: debe ser la misma en todos los documentos que la mencionen
- Nombre del Resguardo: debe ser consistente en todos los documentos
- Vigencia del Acta de Posesión: debe corresponder al año actual o cubrir el año del evento

FORMATO DE RESPUESTA — responde ÚNICAMENTE con JSON válido, sin texto adicional:
{
  "resumen": {
    "resguardo": "",
    "nit": "",
    "gobernador": "",
    "cedula_gobernador": "",
    "banco": "",
    "cuenta_bancaria": "",
    "fecha_evento": "",
    "nombre_evento": "",
    "municipio": "",
    "num_participantes": ""
  },
  "documentos": [
    {"nombre": "", "tipo": "", "presente": true, "estado": "OK|OBSERVACION|FALTANTE", "observacion": ""}
  ],
  "validaciones_cruzadas": [
    {"validacion": "", "estado": "OK|FALLA", "detalle": ""}
  ],
  "documentos_faltantes": [],
  "resultado_final": "APROBADO|APROBADO_CON_OBSERVACIONES|RECHAZADO",
  "resumen_ejecutivo": ""
}`;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: "No se recibieron archivos" },
        { status: 400 }
      );
    }

    // Construir contenido del mensaje: primero los documentos, luego la instrucción
    const userContent: Anthropic.MessageParam["content"] = [];
    const fileNames: string[] = [];

    for (const file of files) {
      const bytes = await file.arrayBuffer();
      const base64 = Buffer.from(bytes).toString("base64");
      fileNames.push(file.name);

      if (file.name.toLowerCase().endsWith(".pdf")) {
        userContent.push({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: base64 },
          title: file.name,
        } as Anthropic.DocumentBlockParam);
      } else {
        // Excel u otro: mencionar el nombre para que Claude lo tenga en cuenta
        userContent.push({
          type: "text",
          text: `[Archivo: ${file.name} — formulario Excel adjunto al paquete]`,
        });
      }
    }

    // Instrucción final con los nombres de archivos recibidos
    userContent.push({
      type: "text",
      text: `Archivos recibidos en este paquete: ${fileNames.join(", ")}\n\nValida todos los documentos y devuelve el JSON de resultado.`,
    });

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: [
        {
          type: "text",
          text: VALIDATION_SYSTEM,
          // Cache_control marca este bloque para ser cacheado.
          // Las instrucciones son siempre iguales → ahorro del 90% en esos tokens.
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userContent }],
    });

    const rawText =
      response.content[0].type === "text" ? response.content[0].text : "";

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "No se pudo parsear la respuesta", raw: rawText },
        { status: 500 }
      );
    }

    const validationResult = JSON.parse(jsonMatch[0]);
    return NextResponse.json(validationResult);
  } catch (error) {
    console.error("Validation error:", error);
    const message =
      error instanceof Error ? error.message : "Error interno al procesar";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
