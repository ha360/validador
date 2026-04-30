import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
Nota: algunos paquetes incluyen Certificado de Representación Legal del Ministerio del Interior en lugar o además del Acta de Posesión — es válido.

VALIDACIONES CRUZADAS obligatorias:
- NIT del resguardo: debe coincidir en RUT, Certificación Bancaria, Autorización y demás documentos
- Nombre del Gobernador: debe coincidir en Acta de Posesión, Carta de Asistencia, Autorización y Cédula
- Cédula (CC) del Gobernador: debe coincidir en todos los documentos
- Número de cuenta bancaria: comparar Certificación Bancaria vs Autorización (ignorar guiones, comparar solo dígitos)
- Fecha del evento: debe ser la misma en todos los documentos
- Nombre del Resguardo: debe ser consistente
- Vigencia del Acta de Posesión: debe cubrir el año del evento

FORMATO: responde ÚNICAMENTE con JSON válido, sin texto adicional.`;

export async function POST(request: NextRequest) {
  try {
    // Recibe los datos ya extraídos (JSON puro, sin archivos)
    const { documentos_extraidos } = await request.json();

    if (!documentos_extraidos || documentos_extraidos.length === 0) {
      return NextResponse.json({ error: "No se recibieron datos extraídos" }, { status: 400 });
    }

    const resumen = JSON.stringify(documentos_extraidos, null, 2);

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: [
        {
          type: "text",
          text: VALIDATION_SYSTEM,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `A continuación están los datos extraídos de cada documento del paquete:

${resumen}

Con base en esta información, genera el informe de validación completo en JSON:
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
}`,
        },
      ],
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
