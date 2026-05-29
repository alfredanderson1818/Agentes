// El orquestador: coordina a Krillin (prospecta), Vegeta (redacta outreach)
// y Goku (revisa/aprueba). Esto es CÓDIGO normal, no IA — aquí no se gasta nada.
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ask, parseJson, SIM_MODE } from "./llm.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, "data", "leads.json");
const POSTS_FILE = path.join(__dirname, "data", "posts.json");

export const bus = new EventEmitter();

// Perfil de Cliente Ideal (ICP) de PAGASI.
const ICP = `CLIENTE IDEAL de PAGASI: financieras de motos/vehículos, casas comerciales, cooperativas, dealers y prestamistas PEQUEÑOS A MEDIANOS (PYME) que dan crédito a cuotas y probablemente gestionan su cartera a mano o en Excel.
EVITAR (marcar como tamaño "grande" o "corporativo", fit 1-2):
- Bancos y grandes cadenas nacionales.
- Fintechs con capital de riesgo / rondas de inversión, operación MULTIPAÍS, o que mencionan haber desembolsado "miles" o "100k+" créditos: esas ya tienen sistema propio y ciclo de compra largo y burocrático.
El punto dulce es una operación que mueve decenas o pocos cientos de créditos y aún se gestiona artesanalmente.`;

const FIT_MINIMO = 3; // descarta leads con fit por debajo de esto
// Señales de que un prospecto es demasiado grande (fintech/corporativo).
const SENALES_GIGANTE = /\b(100k|100\.000|miles de cr[eé]ditos|ronda|serie [a-c]|venture|capital de riesgo|multipa[ií]s|varios pa[ií]ses|unicornio|banco)\b/i;

// Decide si un prospecto pasa el filtro de calidad (ICP).
function pasaFiltro(p) {
  const tamano = String(p.tamano || "").toLowerCase();
  if (tamano.includes("grande") || tamano.includes("corporativo") || tamano.includes("banco")) {
    return { ok: false, motivo: `tamaño "${p.tamano}" fuera del perfil PYME` };
  }
  const blob = `${p.senal || ""} ${p.sector || ""} ${p.empresa || ""}`;
  if (SENALES_GIGANTE.test(blob)) {
    return { ok: false, motivo: "señales de fintech grande/corporativo (volumen alto, inversión o multipaís)" };
  }
  const fit = Number(p.fit) || 0;
  if (fit && fit < FIT_MINIMO) {
    return { ok: false, motivo: `fit ${fit}/5 por debajo del mínimo (${FIT_MINIMO})` };
  }
  return { ok: true };
}

export const state = {
  simMode: SIM_MODE,
  mission: { running: false, brief: null, log: [] },
  agents: {
    krillin: { name: "Krillin", role: "Prospectador", status: "idle" },
    piccolo: { name: "Piccolo", role: "Investigador", status: "idle" },
    vegeta: { name: "Vegeta", role: "Outreach", status: "idle" },
    gohan: { name: "Gohan", role: "Contenido", status: "idle" },
    goku: { name: "Goku", role: "Revisor", status: "idle" },
  },
  leads: loadLeads(),
  posts: loadPosts(),
};

let seq = state.leads.reduce((m, l) => Math.max(m, l.id), 0);
let seqPost = state.posts.reduce((m, p) => Math.max(m, p.id), 0);

function loadLeads() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return [];
  }
}
function saveLeads() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(state.leads, null, 2));
}
function loadPosts() {
  try {
    return JSON.parse(fs.readFileSync(POSTS_FILE, "utf8"));
  } catch {
    return [];
  }
}
function savePosts() {
  fs.writeFileSync(POSTS_FILE, JSON.stringify(state.posts, null, 2));
}

function emit(type, payload) {
  bus.emit("event", { type, payload });
}
function setAgent(key, status) {
  state.agents[key].status = status;
  emit("agent", { key, status });
}
function log(msg) {
  const line = msg;
  state.mission.log.push(line);
  emit("log", { line });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- AGENTES ----------

async function krillinProspecta(brief) {
  setAgent("krillin", "working");
  log(`🥋 Krillin sale a buscar prospectos en: ${brief.mercado}`);

  // Busca DE MÁS (pool) para que, tras filtrar gigantes, queden suficientes PYMEs.
  const pool = Math.min(brief.cantidad * 3, 12);
  let leads;
  if (SIM_MODE) {
    await sleep(1500);
    leads = simLeads(brief);
  } else {
    // ETAPA 1: descubrir empresas reales con búsqueda web (texto libre, su fortaleza).
    const hallazgos = await ask({
      role: "worker",
      web: true,
      maxTokens: 4000,
      system:
        "Eres un investigador de mercado. SIEMPRE usas búsqueda web para encontrar empresas REALES (con sitio web verificable) que dan crédito a cuotas. Prioriza PYMEs: financieras de motos, distribuidoras/concesionarios de motos, casas comerciales y cooperativas. EVITA bancos y grandes cadenas nacionales.",
      prompt: `Busca empresas reales en "${brief.mercado}" del tipo "${brief.tipo}". Haz varias búsquedas, por ejemplo: "financieras de motos ${brief.mercado}", "distribuidora de motos crédito ${brief.mercado}", "casa comercial crédito a cuotas ${brief.mercado}", "cooperativa crédito moto ${brief.mercado}".
Lista hasta ${pool} empresas reales (NO bancos), cada una con: nombre exacto, sitio web, y una frase de qué hace / por qué da crédito a cuotas.`,
    });

    // ETAPA 2: estructurar a JSON estricto (sin web) aplicando el ICP.
    const text = await ask({
      role: "worker",
      maxTokens: 3000,
      system: `Conviertes hallazgos de investigación en JSON estricto, aplicando este perfil:
${ICP}`,
      prompt: `De estos hallazgos, devuelve SOLO un array JSON [{"empresa","sector","ubicacion","sitio","senal","tamano","fit"}], sin texto antes ni después.
- "senal": por qué sería buen prospecto (observación neutral). "sitio": URL real si aparece.
- "tamano": "micro" | "pyme" | "mediana" | "grande" | "corporativo". "fit": 1-5 (5 = PYME perfecta que da crédito a cuotas; 1 = banco/gigante/fintech con inversión).
- NO inventes empresas ni pongas objetos de relleno. Si los hallazgos no contienen empresas válidas, devuelve [].

HALLAZGOS:
${hallazgos}`,
    });
    leads = parseJson(text, []);
  }

  // Saneamiento: descarta placeholders / nombres no válidos.
  const BASURA = /no hay|sin (datos|informaci)|datos p[uú]blicos|n\/?a\b|desconocid|placeholder|ejemplo/i;
  leads = (Array.isArray(leads) ? leads : [])
    .filter((l) => l && typeof l.empresa === "string" && l.empresa.trim().length > 2 && !BASURA.test(l.empresa))
    .slice(0, pool);

  log(`🥋 Krillin encontró ${leads.length} prospecto(s) real(es) (buscó hasta ${pool}).`);
  setAgent("krillin", "idle");
  return leads;
}

async function piccoloInvestiga(lead, brief) {
  setAgent("piccolo", "working");
  log(`🟢 Piccolo investiga a fondo a "${lead.empresa}"...`);
  let info;
  if (SIM_MODE) {
    await sleep(1100);
    info = simPiccolo(lead);
  } else {
    const text = await ask({
      role: "worker",
      web: true,
      maxTokens: 3000,
      system:
        "Eres un investigador B2B. Con búsqueda web, perfilas una empresa, encuentras a la PERSONA correcta para contactar (dueño, gerente general, comercial o jefe de cartera/cobranza) y sus CANALES DE CONTACTO directos (WhatsApp/teléfono, perfil de LinkedIn, email). Nunca inventes datos: si no hallas algo real, déjalo en \"\". Responde SOLO JSON.",
      prompt: `Investiga a "${lead.empresa}" (${lead.sector || brief.tipo}, ${lead.ubicacion || brief.mercado}, ${lead.sitio || "sin sitio"}). Busca su sitio web y redes para encontrar contacto directo.
Devuelve SOLO JSON:
{"contacto_nombre":"<nombre real o \\"\\">","contacto_cargo":"<cargo a contactar>","perfil":"<2-3 frases: qué hace, tamaño aprox, cómo opera el crédito>","dolor_probable":"<hipótesis honesta del reto operativo>","gancho":"<el ángulo más fuerte para abrir>","telefono":"<número real con código de país solo dígitos para WhatsApp, ej 573001234567, o \\"\\">","linkedin":"<URL real del perfil de LinkedIn de la empresa o la persona, o \\"\\">","email":"<email real de contacto o \\"\\">","tamano_real":"<micro|pyme|mediana|grande|corporativo>","es_buen_fit":<true si es PYME que encaja con PAGASI; false si es banco, gran cadena nacional o fintech grande/con inversión>,"fuente":"<dónde lo viste>"}`,
    });
    info = parseJson(text, { contacto_nombre: "", contacto_cargo: "Gerente General", perfil: "", dolor_probable: "", gancho: lead.senal || "", telefono: "", linkedin: "", email: "", tamano_real: lead.tamano || "", es_buen_fit: true, fuente: "" });
  }
  setAgent("piccolo", "idle");
  return info;
}

async function vegetaRedacta(lead, info, brief) {
  setAgent("vegeta", "working");
  let mensaje;
  if (SIM_MODE) {
    await sleep(900);
    mensaje = simMensaje(lead, info);
  } else {
    const saludo = info.contacto_nombre ? info.contacto_nombre : `equipo de ${lead.empresa}`;
    const text = await ask({
      role: "worker",
      system:
        "Eres un copywriter de ventas B2B directo y humano. Escribes mensajes de outreach cortos (máx 90 palabras), sin sonar a spam ni a IA. Idioma: español de LATAM. REGLAS DE HONESTIDAD: nunca afirmes ni asumas problemas internos del prospecto que no puedas saber. Presenta el caso de éxito propio como dato verificable, no como promesa para ellos.",
      prompt: `Escribe un mensaje de LinkedIn/email para ${saludo} de "${lead.empresa}".
Producto: PAGASI, sistema de gestión de créditos a cuotas.
Investigación de Piccolo sobre esta empresa:
- Perfil: ${info.perfil || "(n/d)"}
- Ángulo/gancho más fuerte: ${info.gancho || lead.senal || "da crédito a cuotas"}
- Reto probable (hipótesis honesta): ${info.dolor_probable || "(n/d)"}
Caso de éxito real que DEBES usar, con contexto: "una financiera de motos gestiona hoy 100+ créditos activos con 0% de morosidad usando PAGASI". Preséntalo como resultado nuestro con un cliente, NO como algo garantizado para ellos.
Abre conectando con el gancho específico. Cierra con una pregunta suave para una demo. Devuelve SOLO el texto del mensaje.`,
    });
    mensaje = text;
  }
  setAgent("vegeta", "idle");
  return mensaje;
}

async function gokuRevisa(lead, mensaje) {
  setAgent("goku", "working");
  let review;
  if (SIM_MODE) {
    await sleep(700);
    review = { veredicto: "aprobado", motivo: "Mensaje claro y con el gancho de 0% mora.", mensaje_corregido: mensaje };
  } else {
    const text = await ask({
      role: "reviewer",
      system:
        "Eres el revisor de calidad y veracidad del outreach. Tu objetivo es que SALGAN mensajes honestos y efectivos, no bloquear. POLÍTICA: si el problema es de redacción (tono, una suposición indebida, falta de contexto en una cifra), CORRÍGELO tú en 'mensaje_corregido' y aprueba. Solo rechaza si el prospecto no encaja con PAGASI o si la empresa no parece real. El caso '100+ créditos activos con 0% de morosidad' SÍ es un dato real y verificable de un cliente: es válido usarlo, solo asegúrate de que se presente como resultado nuestro con un cliente y no como promesa para el prospecto.",
      prompt: `Lead: ${JSON.stringify(lead)}
Mensaje propuesto: """${mensaje}"""
Revisa honestidad, tono y fit. Si es arreglable, reescribe el mensaje a una versión honesta y lista para enviar y APRUÉBALO.
Devuelve SOLO JSON: {"veredicto":"aprobado"|"rechazado","motivo":"...","mensaje_corregido":"<mensaje final listo para enviar>"}`,
    });
    review = parseJson(text, { veredicto: "aprobado", motivo: "—", mensaje_corregido: mensaje });
  }
  setAgent("goku", "idle");
  return review;
}

async function gohanContenido(tema) {
  setAgent("gohan", "working");
  log(`📚 Gohan escribe contenido para LinkedIn: "${tema}"`);
  let posts;
  if (SIM_MODE) {
    await sleep(1400);
    posts = simPosts(tema);
  } else {
    const text = await ask({
      role: "worker",
      system:
        "Eres un creador de contenido B2B para LinkedIn, en español de LATAM. Escribes posts de autoridad para dueños/gerentes de financieras y casas comerciales que dan crédito a cuotas. Tono: experto, cercano, sin clickbait. Promueves indirectamente PAGASI (software de gestión de créditos). Puedes usar el dato real: una financiera de motos gestiona 100+ créditos con 0% de morosidad usando PAGASI.",
      prompt: `Genera 3 posts de LinkedIn sobre el tema: "${tema}".
Cada post: un titular gancho, 80-130 palabras, 1 idea clara útil para quien da crédito, cierre con pregunta o invitación suave. Incluye 2-3 hashtags.
Devuelve SOLO un array JSON: [{"titulo","post"}].`,
    });
    posts = parseJson(text, []).slice(0, 3);
  }
  log(`📚 Gohan generó ${posts.length} borradores de contenido.`);
  setAgent("gohan", "idle");
  return posts;
}

async function gokuRevisaPost(post) {
  setAgent("goku", "working");
  let review;
  if (SIM_MODE) {
    await sleep(600);
    review = { veredicto: "aprobado", motivo: "Aporta valor y promueve sin sonar a venta.", texto_corregido: post.post };
  } else {
    const text = await ask({
      role: "reviewer",
      system:
        "Revisas contenido de LinkedIn por veracidad (no inventar cifras más allá del caso real: 100+ créditos, 0% mora), valor real y tono profesional. Corriges si hace falta.",
      prompt: `Post propuesto: """${post.post}"""
Devuelve SOLO JSON: {"veredicto":"aprobado"|"rechazado","motivo":"...","texto_corregido":"..."}`,
    });
    review = parseJson(text, { veredicto: "aprobado", motivo: "—", texto_corregido: post.post });
  }
  setAgent("goku", "idle");
  return review;
}

// ---------- ORQUESTACIÓN ----------

export async function runMission(brief) {
  if (state.mission.running) return;
  state.mission = { running: true, brief, log: [] };
  emit("mission", { running: true, brief });
  log(`🚀 Misión iniciada: ${brief.cantidad} prospectos de "${brief.tipo}" en "${brief.mercado}".`);

  try {
    const prospectos = await krillinProspecta(brief);
    let aprobados = 0;
    let primero = true;
    for (const p of prospectos) {
      if (aprobados >= brief.cantidad) break; // ya tenemos los que pediste
      if (!primero) await sleep(3000); // respira para no saturar el límite/min
      primero = false;
      const filtro = pasaFiltro(p);
      if (!filtro.ok) {
        log(`⛔ Descartado "${p.empresa}" (${filtro.motivo}). No encaja con el cliente ideal.`);
        continue;
      }
      const info = await piccoloInvestiga(p, brief);
      // SEGUNDO FILTRO: con la investigación profunda de Piccolo, descarta gigantes
      // que Krillin no detectó (sus señales aparecen recién aquí).
      const tr = String(info.tamano_real || "").toLowerCase();
      if (info.es_buen_fit === false || tr.includes("grande") || tr.includes("corporativo") ||
          SENALES_GIGANTE.test(`${info.perfil} ${info.dolor_probable} ${info.gancho}`)) {
        log(`⛔ Piccolo descartó "${p.empresa}": tras investigarlo resultó ${info.tamano_real || "no-PYME"} (gigante/banco/fintech). No encaja.`);
        continue;
      }
      const mensaje = await vegetaRedacta(p, info, brief);
      const review = await gokuRevisa(p, mensaje);
      if (review.veredicto === "rechazado") {
        log(`🟠 Goku rechazó "${p.empresa}": ${review.motivo}`);
        continue;
      }
      const lead = {
        id: ++seq,
        empresa: p.empresa,
        sector: p.sector || brief.tipo,
        ubicacion: p.ubicacion || brief.mercado,
        sitio: p.sitio || "",
        senal: p.senal || "",
        tamano: p.tamano || "",
        fit: Number(p.fit) || null,
        contacto_nombre: info.contacto_nombre || "",
        contacto_cargo: info.contacto_cargo || "",
        perfil: info.perfil || "",
        telefono: (info.telefono || "").replace(/\D/g, ""),
        linkedin: info.linkedin || "",
        email: info.email || "",
        mensaje: review.mensaje_corregido || mensaje,
        notaRevisor: review.motivo || "",
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      state.leads.unshift(lead);
      saveLeads();
      emit("lead", lead);
      aprobados++;
      log(`✅ Goku aprobó "${p.empresa}" (${aprobados}/${brief.cantidad}) → en cola.`);
    }
    if (aprobados === 0) {
      log("⚠️ Esta vez no quedó ningún lead. Prueba otra ciudad/tipo o sube la cantidad.");
    }
    log(`🏁 Misión completada. ${aprobados} lead(s) listos.`);
  } catch (err) {
    log(`💥 Error en la misión: ${err.message}`);
  } finally {
    state.mission.running = false;
    setAgent("krillin", "idle");
    setAgent("piccolo", "idle");
    setAgent("vegeta", "idle");
    setAgent("goku", "idle");
    emit("mission", { running: false });
  }
}

export async function runContentMission(tema) {
  if (state.mission.running) return;
  state.mission = { running: true, brief: { tema }, log: [] };
  emit("mission", { running: true, brief: { tema } });
  log(`🚀 Misión de contenido: "${tema}".`);
  try {
    const borradores = await gohanContenido(tema);
    for (const b of borradores) {
      const review = await gokuRevisaPost(b);
      if (review.veredicto === "rechazado") {
        log(`🟠 Goku rechazó un post: ${review.motivo}`);
        continue;
      }
      const post = {
        id: ++seqPost,
        titulo: b.titulo || "Post de LinkedIn",
        post: review.texto_corregido || b.post,
        notaRevisor: review.motivo || "",
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      state.posts.unshift(post);
      savePosts();
      emit("post", post);
      log(`✅ Goku aprobó contenido: "${post.titulo}".`);
    }
    log("🏁 Misión de contenido completada.");
  } catch (err) {
    log(`💥 Error: ${err.message}`);
  } finally {
    state.mission.running = false;
    setAgent("gohan", "idle");
    setAgent("goku", "idle");
    emit("mission", { running: false });
  }
}

export function decidePost(id, decision) {
  const post = state.posts.find((p) => p.id === id);
  if (!post) return null;
  post.status = decision;
  savePosts();
  emit("postUpdate", { id, status: decision });
  return post;
}

export function decideLead(id, decision) {
  const lead = state.leads.find((l) => l.id === id);
  if (!lead) return null;
  lead.status = decision; // "approved" | "rejected"
  saveLeads();
  emit("leadUpdate", { id, status: decision });
  return lead;
}

// ---------- DATOS SIMULADOS (sin API key) ----------

function simLeads(brief) {
  const base = [
    { empresa: "Motofácil Crédito", sector: "Financiera de motos", senal: "Vende motos a cuotas, cobranza manual en Excel", tamano: "pyme", fit: 5 },
    { empresa: "Banco Nacional", sector: "Banco", senal: "Ofrece crédito de consumo", tamano: "corporativo", fit: 1 },
    { empresa: "Casa Comercial El Progreso", sector: "Casa comercial", senal: "Crédito en electrodomésticos sin sistema centralizado", tamano: "pyme", fit: 5 },
    { empresa: "CrediMoto del Sur", sector: "Dealer de motos", senal: "Crece rápido, financia a cuotas", tamano: "pyme", fit: 4 },
    { empresa: "Cooperativa Avanza", sector: "Cooperativa de crédito", senal: "Financia equipos, necesita reportes en tiempo real", tamano: "mediana", fit: 4 },
  ];
  return base.slice(0, Math.max(brief.cantidad, 2)).map((b) => ({ ...b, ubicacion: brief.mercado, sitio: "" }));
}

function simPosts(tema) {
  return [
    {
      titulo: "La mora no es mala suerte, es falta de sistema",
      post: `La mora no se controla con llamadas a último momento. Se controla con datos.\n\nUna financiera de motos con la que trabajamos gestiona 100+ créditos con 0% de morosidad. ¿El secreto? Visibilidad en tiempo real: quién debe, cuánto y desde cuándo, sin Excel ni adivinanzas.\n\nSi das crédito a cuotas, tu activo más valioso es saber. ¿Cómo controlas tu cartera hoy?\n\n#crédito #financiamiento #fintech`,
    },
    {
      titulo: "3 señales de que tu cobranza se quedó chica",
      post: `Tema: ${tema}.\n\n1) Usas Excel para la cartera. 2) No sabes la mora real de hoy. 3) Calculas comisiones a mano.\n\nNo es falta de esfuerzo, es falta de herramienta. Con un sistema de gestión de créditos, esas 3 horas diarias se vuelven 3 clics.\n\n¿Cuál de las tres te suena? 👇\n\n#cobranza #pymes #crédito`,
    },
  ];
}

function simPiccolo(lead) {
  return {
    contacto_nombre: "",
    contacto_cargo: "Gerente Comercial",
    perfil: `${lead.empresa} es una ${lead.sector?.toLowerCase() || "empresa"} que da crédito a cuotas; opera con seguimiento manual de cartera.`,
    dolor_probable: "El control de cuotas y la cobranza temprana probablemente se llevan en Excel.",
    gancho: lead.senal || "da crédito a cuotas",
    telefono: "573001234567",
    linkedin: "https://www.linkedin.com/company/" + (lead.empresa || "").toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    email: "contacto@" + (lead.empresa || "empresa").toLowerCase().replace(/[^a-z0-9]+/g, "") + ".com",
    tamano_real: lead.tamano || "pyme",
    es_buen_fit: true,
    fuente: "sitio web (simulado)",
  };
}

function simMensaje(lead, info = {}) {
  const saludo = info.contacto_nombre || `equipo de ${lead.empresa}`;
  return `Hola ${saludo}. Vi que ${(info.gancho || lead.senal || "financian a cuotas").toLowerCase()}. Ayudamos a una financiera de motos a gestionar 100+ créditos con control total y 0% de morosidad usando PAGASI, nuestro sistema de gestión de créditos a cuotas (amortización, cobranza, comisiones y reportes en tiempo real). ¿Tendrían 15 min esta semana para una demo rápida adaptada a ${lead.sector?.toLowerCase() || "su operación"}?`;
}
