import "./env.js";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const model = process.env.MODEL_WORKER || "claude-haiku-4-5-20251001";

console.log("Modelo:", model);
try {
  const msg = await client.messages.create({
    model,
    max_tokens: 1500,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
    messages: [{ role: "user", content: "Busca en la web 3 financieras de motos reales en Colombia que dan crédito a cuotas. Dame nombre y sitio web." }],
  });
  console.log("stop_reason:", msg.stop_reason);
  console.log("bloques:", msg.content.map((b) => b.type).join(", "));
  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  console.log("\n--- TEXTO ---\n" + (text || "(vacío)"));
} catch (e) {
  console.log("ERROR:", e.status || "", e.name, "-", e.message);
}
