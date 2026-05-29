// Capa de acceso al modelo. Si no hay ANTHROPIC_API_KEY, devuelve null
// y el orquestador usa el modo simulación.
import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
export const SIM_MODE = !apiKey;

const client = SIM_MODE ? null : new Anthropic({ apiKey, maxRetries: 0 });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Crea un mensaje con reintentos ante el límite de velocidad (429),
// esperando lo que indique el servidor o un backoff creciente.
async function createWithRetry(params) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await client.messages.create(params);
    } catch (e) {
      const status = e?.status || e?.statusCode;
      if (status === 429 && attempt < 5) {
        let ra = 0;
        try { ra = Number(e?.headers?.get?.("retry-after") || e?.headers?.["retry-after"]) || 0; } catch {}
        const waitMs = (ra > 0 ? ra + 1 : 20 + attempt * 15) * 1000;
        console.log(`⏳ Límite de velocidad (429). Esperando ${Math.round(waitMs / 1000)}s y reintentando…`);
        await sleep(waitMs);
        continue;
      }
      throw e;
    }
  }
}

const WORKER = process.env.MODEL_WORKER || "claude-haiku-4-5-20251001";
const REVIEWER = process.env.MODEL_REVIEWER || "claude-opus-4-8";
const USE_WEB_SEARCH = (process.env.USE_WEB_SEARCH || "true") === "true";

export const MODELS = { WORKER, REVIEWER };

// Extrae el texto plano de una respuesta del API.
function textOf(message) {
  return (message.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

// Intenta parsear el primer bloque JSON que encuentre en el texto.
export function parseJson(text, fallback) {
  try {
    const start = text.indexOf("{");
    const startArr = text.indexOf("[");
    const s =
      startArr !== -1 && (startArr < start || start === -1) ? startArr : start;
    if (s === -1) return fallback;
    const open = text[s];
    const close = open === "[" ? "]" : "}";
    const end = text.lastIndexOf(close);
    return JSON.parse(text.slice(s, end + 1));
  } catch {
    return fallback;
  }
}

// Llamada genérica. `web` activa la herramienta de búsqueda web (para Krillin).
export async function ask({ role = "worker", system, prompt, web = false, maxTokens = 2000 }) {
  if (SIM_MODE) throw new Error("SIM_MODE: no hay API key");

  const model = role === "reviewer" ? REVIEWER : WORKER;
  const tools =
    web && USE_WEB_SEARCH
      ? [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }]
      : undefined;

  const messages = [{ role: "user", content: prompt }];
  const parts = [];
  // La búsqueda web puede devolver stop_reason="pause_turn": hay que continuar
  // el turno para que el modelo termine de redactar la respuesta.
  for (let i = 0; i < 5; i++) {
    const message = await createWithRetry({
      model,
      max_tokens: maxTokens,
      system,
      tools,
      messages,
    });
    parts.push(textOf(message));
    if (message.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: message.content });
      continue;
    }
    break;
  }
  return parts.filter(Boolean).join("\n").trim();
}
