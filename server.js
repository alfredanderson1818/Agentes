import "./env.js"; // carga .env ANTES de importar el resto
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bus, state, runMission, runContentMission, decideLead, decidePost } from "./orchestrator.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Estado actual (al cargar la página).
app.get("/api/state", (_req, res) => res.json(state));

// Iniciar misión: { mercado, tipo, cantidad }
app.post("/api/mission/start", (req, res) => {
  const { mercado, tipo, cantidad } = req.body || {};
  const brief = {
    mercado: mercado || "LATAM",
    tipo: tipo || "financieras de motos",
    cantidad: Math.min(Math.max(parseInt(cantidad) || 5, 1), 25),
  };
  runMission(brief);
  res.json({ ok: true, brief });
});

// Iniciar misión de contenido (Gohan): { tema }
app.post("/api/content/start", (req, res) => {
  const tema = (req.body?.tema || "cómo reducir la mora en financiamiento a cuotas").trim();
  runContentMission(tema);
  res.json({ ok: true, tema });
});

// Aprobar / rechazar un lead.
app.post("/api/lead/:id/:decision", (req, res) => {
  const id = parseInt(req.params.id);
  const decision = req.params.decision === "approve" ? "approved" : "rejected";
  const lead = decideLead(id, decision);
  res.json({ ok: !!lead, lead });
});

// Aprobar / rechazar un post de contenido.
app.post("/api/post/:id/:decision", (req, res) => {
  const id = parseInt(req.params.id);
  const decision = req.params.decision === "approve" ? "approved" : "rejected";
  const post = decidePost(id, decision);
  res.json({ ok: !!post, post });
});

// Exportar todos los leads a CSV (base de datos descargable, abrible en Excel).
app.get("/api/leads.csv", (_req, res) => {
  const cols = ["id", "empresa", "sector", "ubicacion", "sitio", "tamano", "fit",
    "contacto_nombre", "contacto_cargo", "telefono", "linkedin", "email",
    "status", "createdAt", "mensaje"];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = state.leads.map((l) => cols.map((c) => esc(l[c])).join(","));
  const csv = "﻿" + [cols.join(","), ...rows].join("\r\n");
  res.set({
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="leads-pagasi.csv"`,
  });
  res.send(csv);
});

// Stream de eventos en vivo (SSE) para animar el dashboard.
app.get("/api/events", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();
  const send = (e) => res.write(`data: ${JSON.stringify(e)}\n\n`);
  send({ type: "hello", payload: { simMode: state.simMode } });
  const onEvent = (e) => send(e);
  bus.on("event", onEvent);
  req.on("close", () => bus.off("event", onEvent));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🐉 Agentes-Z corriendo en http://localhost:${PORT}`);
  console.log(state.simMode ? "⚠️  MODO SIMULACIÓN (sin API key)\n" : "✅ Modo real (API conectada)\n");
});
