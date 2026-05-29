// Carga las variables del archivo .env hacia process.env.
// Se importa ANTES que todo lo demás para que llm.js vea la API key.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

try {
  const raw = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    // El .env gana si la variable no existe o está vacía en el entorno.
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  // Sin .env → la app corre en modo simulación.
}
