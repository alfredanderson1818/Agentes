const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

/* ░░ LLUVIA DE CÓDIGO (Matrix rain) ░░ */
function startRain() {
  const c = $("#rain"), x = c.getContext("2d");
  const glyphs = "アイウエオカキクケコサシスセソタチツテトナニ0123456789ABCDEF<>[]{}/\\=+*#$%".split("");
  let w, h, cols, drops;
  function resize() {
    w = c.width = innerWidth; h = c.height = innerHeight;
    cols = Math.floor(w / 16);
    drops = Array(cols).fill(0).map(() => Math.random() * -60);
  }
  resize(); addEventListener("resize", resize);
  function draw() {
    x.fillStyle = "rgba(0,3,0,0.075)"; x.fillRect(0, 0, w, h);
    x.font = "15px monospace";
    for (let i = 0; i < cols; i++) {
      const t = glyphs[(Math.random() * glyphs.length) | 0];
      const py = drops[i] * 16;
      x.shadowColor = "#00ff6a"; x.shadowBlur = 6;
      x.fillStyle = Math.random() < 0.03 ? "#d7ffd0" : "#00ff6a";
      x.fillText(t, i * 16, py);
      x.shadowBlur = 0;
      if (py > h && Math.random() > 0.975) drops[i] = 0;
      drops[i]++;
    }
    requestAnimationFrame(draw);
  }
  draw();
}

/* ░░ OPERATIVOS ░░ */
const AGENTS = [
  { key: "krillin", name: "SCOUT", role: "// Prospectador" },
  { key: "piccolo", name: "RECON", role: "// Investigador" },
  { key: "vegeta", name: "ENVOY", role: "// Outreach" },
  { key: "gohan", name: "SCRIBE", role: "// Contenido" },
  { key: "goku", name: "WARDEN", role: "// Revisor" },
];
const OP_SVG = `<svg class="op" viewBox="0 0 100 130" aria-hidden="true">
  <path class="op-suit" d="M6 130 Q6 86 34 76 L44 71 L50 80 L56 71 L66 76 Q94 86 94 130 Z"/>
  <path class="op-tie" d="M44 71 L50 110 L56 71 L51 78 L50 82 L49 78 Z"/>
  <ellipse class="op-head" cx="50" cy="44" rx="20" ry="25"/>
  <g class="op-shades"><rect x="32" y="40" width="14" height="9" rx="2"/><rect x="54" y="40" width="14" height="9" rx="2"/><rect x="46" y="43" width="8" height="2.5"/></g>
</svg>`;
function buildRoster() {
  $("#roster").innerHTML = AGENTS.map((a) => `
    <article class="agent" data-key="${a.key}">
      <div class="agent__scan"></div>
      <div class="char">${OP_SVG}</div>
      <div class="agent__meta">
        <div class="agent__name">${a.name} <span class="agent__live">●</span></div>
        <div class="agent__role">${a.role}</div>
        <div class="agent__bar"><i></i></div>
        <div class="agent__status status">EN ESPERA</div>
      </div>
    </article>`).join("");
}

const leadsEl = () => $("#leads"), readyEl = () => $("#readyLeads"), postsEl = () => $("#posts"), logEl = () => $("#log");
const leads = new Map();
const posts = new Map();
const STATUS_TXT = { idle: "EN ESPERA", working: "▶ EJECUTANDO" };

/* Pipeline CRM */
const ETAPA = {
  por_contactar: { label: "Por contactar", cls: "" },
  contactado: { label: "Contactado", cls: "" },
  respondio: { label: "Respondió", cls: "et-gold" },
  demo: { label: "Demo agendada", cls: "et-gold" },
  ganado: { label: "Ganado", cls: "et-green" },
  perdido: { label: "Perdido", cls: "et-rose" },
};
const FUNNEL = ["por_contactar", "contactado", "respondio", "demo", "ganado"];
const NEXT = {
  por_contactar: [["📤 Marcar enviado", "contactado"]],
  contactado: [["💬 Respondió", "respondio"], ["✖ Perdido", "perdido"]],
  respondio: [["📅 Demo", "demo"], ["✖ Perdido", "perdido"]],
  demo: [["🏆 Ganado", "ganado"], ["✖ Perdido", "perdido"]],
  ganado: [],
  perdido: [["↩ Reactivar", "por_contactar"]],
};

function setMode(sim) {
  const b = $("#modeBadge");
  b.textContent = sim ? "MODO SIM" : "● ONLINE";
  b.className = "badge " + (sim ? "sim" : "real");
}
function setAgent(key, status) {
  const a = document.querySelector(`.agent[data-key="${key}"]`);
  if (!a) return;
  a.querySelector(".status").textContent = STATUS_TXT[status] || status;
  if (status === "working") a.classList.add("working");
  else if (a.classList.contains("working")) {
    a.classList.remove("working"); a.classList.add("flash");
    setTimeout(() => a.classList.remove("flash"), 420);
  }
}
function addLog(line) {
  const d = document.createElement("div");
  d.className = "feed-item"; d.textContent = line;
  logEl().prepend(d);
  while (logEl().children.length > 120) logEl().lastChild.remove();
}

/* KPIs */
function animateCount(el, to) {
  const from = Number(el.dataset.v) || 0;
  if (from === to) return;
  el.dataset.v = to;
  const t0 = performance.now();
  const step = (t) => {
    const p = Math.min((t - t0) / 600, 1), e = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + (to - from) * e);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function refreshKpis() {
  const arr = [...leads.values()];
  const pending = arr.filter((l) => l.status === "pending").length;
  const ready = arr.filter((l) => l.status === "approved").length;
  animateCount($("#kpiTotal"), arr.length);
  animateCount($("#kpiPending"), pending);
  animateCount($("#kpiReady"), ready);
  animateCount($("#kpiPosts"), posts.size);
  $("#tabPending").textContent = pending;
  $("#tabReady").textContent = ready;
  $("#tabContent").textContent = posts.size;
}

function showToast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(showToast._t); showToast._t = setTimeout(() => t.classList.remove("show"), 1800);
}
async function copyText(text, label = "Copiado ✅") {
  try { await navigator.clipboard.writeText(text); showToast(label); } catch { showToast("No se pudo copiar"); }
}
function esc(s = "") { return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function contactoLine(l) {
  const quien = l.contacto_nombre ? `▸ ${esc(l.contacto_nombre)}${l.contacto_cargo ? " — " + esc(l.contacto_cargo) : ""}`
    : l.contacto_cargo ? `▸ Contactar a: ${esc(l.contacto_cargo)}` : "";
  const ch = [];
  if (l.telefono) ch.push(`📱 ${esc(l.telefono)}`);
  if (l.email) ch.push(`✉ ${esc(l.email)}`);
  if (l.linkedin) ch.push(`🔗 LinkedIn`);
  if (!quien && !l.perfil && !ch.length) return "";
  return `<div class="contacto">${quien}${l.perfil ? `<small>↳ ${esc(l.perfil)}</small>` : ""}${ch.length ? `<small>${ch.join("  ·  ")}</small>` : ""}</div>`;
}

function leadPending(l) {
  const meta = [l.sector, l.ubicacion, l.tamano].filter(Boolean).join(" · ");
  const fit = l.fit ? `<span class="fit fit${l.fit}">fit ${l.fit}/5</span>` : "";
  return `<div class="lead">
    <div class="lead__top"><h3>${esc(l.empresa)}</h3>${fit}</div>
    <div class="meta">${esc(meta)}${l.sitio ? " · " + esc(l.sitio) : ""}</div>
    ${contactoLine(l)}
    <div class="msg">${esc(l.mensaje)}</div>
    ${l.notaRevisor ? `<p class="note">⛨ WARDEN: ${esc(l.notaRevisor)}</p>` : ""}
    <div class="actions">
      <button class="abtn a-ok" data-id="${l.id}" data-act="approve">▶ Aprobar</button>
      <button class="abtn a-no" data-id="${l.id}" data-act="reject">✖ Descartar</button>
    </div></div>`;
}
function renderFunnel(ready) {
  const c = {}; FUNNEL.forEach((e) => (c[e] = 0));
  ready.forEach((l) => { if (c[l.etapa] != null) c[l.etapa]++; });
  return `<div class="funnel">${FUNNEL.map((e) => `<div class="fchip"><b>${c[e]}</b><span>${ETAPA[e].label}</span></div>`).join('<i class="farr">›</i>')}</div>`;
}
function leadReady(l) {
  const meta = [l.sector, l.ubicacion].filter(Boolean).join(" · ");
  const et = ETAPA[l.etapa] || ETAPA.por_contactar;
  const send = [`<button class="abtn a-ok" data-copy="${l.id}">📋 Copiar</button>`];
  if (l.telefono) send.push(`<button class="abtn a-wa" data-wa="${l.id}">📱 WhatsApp</button>`);
  send.push(`<button class="abtn a-stage" data-li="${l.id}">🔗 ${l.linkedin ? "LinkedIn" : "Buscar LI"}</button>`);
  send.push(`<button class="abtn a-stage" data-mail="${l.id}">✉ ${l.email ? "Email" : "Email s/d"}</button>`);
  const adv = (NEXT[l.etapa] || []).map(([t, to]) => `<button class="abtn a-stage" data-id="${l.id}" data-etapa="${to}">${t}</button>`).join("");
  const fuBtn = ["contactado", "respondio", "demo"].includes(l.etapa) ? `<button class="abtn a-stage" data-followup="${l.id}">🔁 Follow-up</button>` : "";
  const fus = (l.followups || []).map((f, i) => `
    <div class="fu"><div class="fu__h">↳ FOLLOW-UP #${i + 1}</div><div class="msg">${esc(f.texto)}</div>
      <div class="actions"><button class="abtn a-ok" data-copyfu="${l.id}" data-i="${i}">📋 Copiar</button>
      ${l.telefono ? `<button class="abtn a-wa" data-wafu="${l.id}" data-i="${i}">📱 WhatsApp</button>` : ""}</div></div>`).join("");
  return `<div class="lead approved ${l.etapa === "perdido" ? "is-lost" : ""}">
    <div class="lead__top"><h3>${esc(l.empresa)}</h3><span class="etb ${et.cls}">${et.label}</span></div>
    <div class="meta">${esc(meta)}</div>
    ${contactoLine(l)}
    <div class="msg">${esc(l.mensaje)}</div>
    <div class="actions">${send.join("")}</div>
    <div class="stagebar">${adv}${fuBtn}</div>
    ${fus}</div>`;
}
function renderLeads() {
  const arr = [...leads.values()];
  const pending = arr.filter((l) => l.status === "pending");
  const ready = arr.filter((l) => l.status === "approved");
  leadsEl().innerHTML = pending.length ? pending.map(leadPending).join("") : '<p class="empty">// sin objetivos en cola — ejecuta una misión</p>';
  readyEl().innerHTML = ready.length ? renderFunnel(ready) + ready.map(leadReady).join("") : '<p class="empty">// pipeline vacío — lo que apruebes aparece aquí</p>';
  refreshKpis();
}
function renderPosts() {
  const arr = [...posts.values()];
  postsEl().innerHTML = arr.length ? arr.map((p) => {
    const acts = p.status === "pending"
      ? `<button class="abtn a-ok" data-pid="${p.id}" data-act="approve">▶ Aprobar</button><button class="abtn a-no" data-pid="${p.id}" data-act="reject">✖ Descartar</button>`
      : p.status === "approved"
      ? `<button class="abtn a-ok" data-copypost="${p.id}">📋 Copiar</button><button class="abtn a-stage" data-openli="1">🔗 LinkedIn</button>` : "";
    return `<div class="lead ${p.status === "pending" ? "" : p.status}"><div class="lead__top"><h3>${esc(p.titulo)}</h3></div>
      <div class="msg">${esc(p.post)}</div>${p.notaRevisor ? `<p class="note">⛨ WARDEN: ${esc(p.notaRevisor)}</p>` : ""}
      ${p.status === "rejected" ? '<p class="verdict rejected">✖ Descartado</p>' : `<div class="actions">${acts}</div>`}</div>`;
  }).join("") : '<p class="empty">// sin contenido — pídele un tema a SCRIBE</p>';
  refreshKpis();
}

/* acciones */
document.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-id], button[data-copy], button[data-wa], button[data-li], button[data-mail], button[data-etapa], button[data-followup], button[data-copyfu], button[data-wafu], button[data-pid], button[data-copypost], button[data-openli]");
  if (!b) return;
  const d = b.dataset;
  if (d.pid) { fetch(`/api/post/${d.pid}/${d.act}`, { method: "POST" }); return; }
  if (d.copypost) { copyText(posts.get(+d.copypost).post, "Post copiado ✅"); return; }
  if (d.openli) { window.open("https://www.linkedin.com/feed/", "_blank"); return; }
  if (d.act && d.id) { fetch(`/api/lead/${d.id}/${d.act}`, { method: "POST" }); return; }
  const id = parseInt(d.id || d.copy || d.wa || d.li || d.mail || d.followup || d.copyfu || d.wafu);
  const l = leads.get(id); if (!l) return;
  if (d.copy) copyText(l.mensaje);
  else if (d.wa) window.open(`https://wa.me/${l.telefono}?text=${encodeURIComponent(l.mensaje)}`, "_blank");
  else if (d.li) window.open(l.linkedin || `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(l.empresa)}`, "_blank");
  else if (d.mail) window.open(`mailto:${encodeURIComponent(l.email || "")}?subject=${encodeURIComponent("PAGASI – " + l.empresa)}&body=${encodeURIComponent(l.mensaje)}`);
  else if (d.etapa) fetch(`/api/lead/${id}/etapa`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ etapa: d.etapa }) });
  else if (d.followup) { b.disabled = true; b.textContent = "⏳ generando…"; fetch(`/api/lead/${id}/followup`, { method: "POST" }); }
  else if (d.copyfu) copyText(l.followups[+d.i].texto, "Follow-up copiado ✅");
  else if (d.wafu) window.open(`https://wa.me/${l.telefono}?text=${encodeURIComponent(l.followups[+d.i].texto)}`, "_blank");
});

/* tabs */
function bindTabs() {
  $$(".tab[data-tab]").forEach((tab) => tab.addEventListener("click", () => {
    $$(".tab[data-tab]").forEach((t) => t.classList.remove("is-active"));
    $$(".tabpane").forEach((p) => p.classList.remove("is-active"));
    tab.classList.add("is-active");
    $(`.tabpane[data-pane="${tab.dataset.tab}"]`).classList.add("is-active");
  }));
}

/* formularios */
function setBusy(b) { $("#startBtn").disabled = b; $("#contentBtn").disabled = b; }
function bindForms() {
  $("#startBtn").addEventListener("click", () => {
    setBusy(true);
    fetch("/api/mission/start", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mercado: $("#mercado").value.trim() || "LATAM", tipo: $("#tipo").value.trim(), cantidad: $("#cantidad").value }) });
  });
  $("#contentBtn").addEventListener("click", () => {
    setBusy(true);
    fetch("/api/content/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tema: $("#tema").value.trim() }) });
  });
}

/* sprites opcionales (agent-<key>.png) */
function loadSprites() {
  AGENTS.forEach(({ key }) => {
    const img = new Image();
    img.onload = () => {
      const c = document.querySelector(`.agent[data-key="${key}"] .char`);
      if (c) { c.style.backgroundImage = `url('assets/agent-${key}.png')`; c.classList.add("has-img"); }
    };
    img.src = `assets/agent-${key}.png`;
  });
}

/* init + SSE */
async function init() {
  const s = await (await fetch("/api/state")).json();
  setMode(s.simMode);
  for (const [k, a] of Object.entries(s.agents)) setAgent(k, a.status);
  for (const l of s.leads) leads.set(l.id, l);
  for (const p of s.posts || []) posts.set(p.id, p);
  s.mission.log.forEach(addLog);
  setBusy(!!s.mission.running);
  renderLeads(); renderPosts();
}
function connect() {
  const es = new EventSource("/api/events");
  es.onmessage = (ev) => {
    const { type, payload } = JSON.parse(ev.data);
    if (type === "hello") setMode(payload.simMode);
    else if (type === "agent") setAgent(payload.key, payload.status);
    else if (type === "log") addLog(payload.line);
    else if (type === "lead") { leads.set(payload.id, payload); renderLeads(); }
    else if (type === "leadUpdate") {
      if (payload.lead) leads.set(payload.id, payload.lead);
      else { const l = leads.get(payload.id); if (l && payload.status) l.status = payload.status; }
      renderLeads();
    }
    else if (type === "post") { posts.set(payload.id, payload); renderPosts(); }
    else if (type === "postUpdate") { const p = posts.get(payload.id); if (p) { p.status = payload.status; renderPosts(); } }
    else if (type === "mission") setBusy(!!payload.running);
  };
  es.onerror = () => { es.close(); setTimeout(connect, 2000); };
}

startRain();
buildRoster();
bindTabs();
bindForms();
loadSprites();
init();
connect();
