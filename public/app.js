const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const leadsEl = $("#leads");
const readyEl = $("#readyLeads");
const postsEl = $("#posts");
const logEl = $("#log");

const leads = new Map();
const posts = new Map();
const STATUS_TXT = { idle: "En reposo", working: "⚡ Trabajando" };

/* ---------- modo ---------- */
function setMode(sim) {
  const b = $("#modeBadge");
  b.textContent = sim ? "MODO SIMULACIÓN" : "● API conectada";
  b.className = "badge " + (sim ? "sim" : "real");
}

/* ---------- agentes ---------- */
function setAgent(key, status) {
  const a = document.querySelector(`.agent[data-key="${key}"]`);
  if (!a) return;
  a.querySelector(".status").textContent = STATUS_TXT[status] || status;
  if (status === "working") {
    a.classList.add("working");
  } else if (a.classList.contains("working")) {
    a.classList.remove("working");
    a.classList.add("flash");
    setTimeout(() => a.classList.remove("flash"), 420);
  }
}

/* ---------- feed ---------- */
function addLog(line) {
  const d = document.createElement("div");
  d.className = "feed-item";
  d.textContent = line;
  logEl.prepend(d);
  while (logEl.children.length > 120) logEl.lastChild.remove();
}

/* ---------- KPIs animados ---------- */
function animateCount(el, to) {
  const from = Number(el.dataset.v) || 0;
  if (from === to) return;
  el.dataset.v = to;
  const t0 = performance.now(), dur = 600;
  const step = (t) => {
    const p = Math.min((t - t0) / dur, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + (to - from) * eased);
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

/* ---------- toast / copiar ---------- */
function showToast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove("show"), 1800);
}
async function copyText(text, label = "Mensaje copiado ✅") {
  try { await navigator.clipboard.writeText(text); showToast(label); }
  catch { showToast("No se pudo copiar 😕"); }
}
function esc(s = "") {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function contactoLine(l) {
  const quien = l.contacto_nombre
    ? `👤 ${esc(l.contacto_nombre)}${l.contacto_cargo ? " — " + esc(l.contacto_cargo) : ""}`
    : l.contacto_cargo ? `👤 Contactar a: ${esc(l.contacto_cargo)}` : "";
  const canales = [];
  if (l.telefono) canales.push(`📱 ${esc(l.telefono)}`);
  if (l.email) canales.push(`✉️ ${esc(l.email)}`);
  if (l.linkedin) canales.push(`🔗 LinkedIn`);
  if (!quien && !l.perfil && !canales.length) return "";
  return `<div class="contacto">${quien}${l.perfil ? `<small>🟢 ${esc(l.perfil)}</small>` : ""}${canales.length ? `<small>${canales.join("  ·  ")}</small>` : ""}</div>`;
}

/* ---------- render leads ---------- */
function leadPending(l) {
  const meta = [l.sector, l.ubicacion, l.tamano].filter(Boolean).join(" · ");
  const fit = l.fit ? `<span class="fit fit${l.fit}">fit ${l.fit}/5</span>` : "";
  return `<div class="lead">
    <div class="lead__top"><h3>${esc(l.empresa)}</h3>${fit}</div>
    <div class="meta">${esc(meta)}${l.sitio ? " · " + esc(l.sitio) : ""}</div>
    ${contactoLine(l)}
    <div class="msg">${esc(l.mensaje)}</div>
    ${l.notaRevisor ? `<p class="note">🛡️ Goku: ${esc(l.notaRevisor)}</p>` : ""}
    <div class="actions">
      <button class="abtn a-ok" data-id="${l.id}" data-act="approve">👍 Aprobar</button>
      <button class="abtn a-no" data-id="${l.id}" data-act="reject">✖ Descartar</button>
    </div></div>`;
}
function leadReady(l) {
  const meta = [l.sector, l.ubicacion].filter(Boolean).join(" · ");
  const b = [`<button class="abtn a-ok" data-copy="${l.id}">📋 Copiar</button>`];
  if (l.telefono) b.push(`<button class="abtn a-wa" data-wa="${l.id}">📱 WhatsApp</button>`);
  b.push(`<button class="abtn a-tool" data-li="${l.id}">🔗 ${l.linkedin ? "Perfil LinkedIn" : "Buscar LinkedIn"}</button>`);
  b.push(`<button class="abtn a-tool" data-mail="${l.id}">✉️ ${l.email ? "Email" : "Email (s/d)"}</button>`);
  return `<div class="lead approved">
    <div class="lead__top"><h3>${esc(l.empresa)}</h3></div>
    <div class="meta">${esc(meta)}</div>
    ${contactoLine(l)}
    <div class="msg">${esc(l.mensaje)}</div>
    <div class="actions">${b.join("")}</div></div>`;
}
function renderLeads() {
  const arr = [...leads.values()];
  const pending = arr.filter((l) => l.status === "pending");
  const ready = arr.filter((l) => l.status === "approved");
  leadsEl.innerHTML = pending.length ? pending.map(leadPending).join("")
    : '<p class="empty">Sin prospectos por revisar. Lanza una misión ⚡</p>';
  readyEl.innerHTML = ready.length ? ready.map(leadReady).join("")
    : '<p class="empty">Aún nada aprobado. Lo que apruebes aparece aquí, listo para enviar.</p>';
  refreshKpis();
}
function renderPosts() {
  const arr = [...posts.values()];
  postsEl.innerHTML = arr.length ? arr.map((p) => {
    const acts = p.status === "pending"
      ? `<button class="abtn a-ok" data-pid="${p.id}" data-act="approve">👍 Aprobar</button>
         <button class="abtn a-no" data-pid="${p.id}" data-act="reject">✖ Descartar</button>`
      : p.status === "approved"
      ? `<button class="abtn a-ok" data-copypost="${p.id}">📋 Copiar</button>
         <button class="abtn a-tool" data-openli="1">🔗 Abrir LinkedIn</button>` : "";
    return `<div class="lead ${p.status === "pending" ? "" : p.status}">
      <div class="lead__top"><h3>${esc(p.titulo)}</h3></div>
      <div class="msg">${esc(p.post)}</div>
      ${p.notaRevisor ? `<p class="note">🛡️ Goku: ${esc(p.notaRevisor)}</p>` : ""}
      ${p.status === "rejected" ? '<p class="verdict rejected">✖ Descartado</p>' : `<div class="actions">${acts}</div>`}
    </div>`;
  }).join("") : '<p class="empty">Sin contenido. Pídele un tema a Gohan 📝</p>';
  refreshKpis();
}

/* ---------- acciones ---------- */
leadsEl.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-id]");
  if (b) fetch(`/api/lead/${b.dataset.id}/${b.dataset.act}`, { method: "POST" });
});
readyEl.addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  const l = leads.get(parseInt(b.dataset.copy || b.dataset.wa || b.dataset.li || b.dataset.mail));
  if (!l) return;
  if (b.dataset.copy) copyText(l.mensaje);
  else if (b.dataset.wa) window.open(`https://wa.me/${l.telefono}?text=${encodeURIComponent(l.mensaje)}`, "_blank");
  else if (b.dataset.li) window.open(l.linkedin || `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(l.empresa)}`, "_blank");
  else if (b.dataset.mail) window.open(`mailto:${encodeURIComponent(l.email || "")}?subject=${encodeURIComponent("PAGASI – " + l.empresa)}&body=${encodeURIComponent(l.mensaje)}`);
});
postsEl.addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.pid) fetch(`/api/post/${b.dataset.pid}/${b.dataset.act}`, { method: "POST" });
  else if (b.dataset.copypost) copyText(posts.get(parseInt(b.dataset.copypost)).post, "Post copiado ✅");
  else if (b.dataset.openli) window.open("https://www.linkedin.com/feed/", "_blank");
});

/* ---------- tabs ---------- */
$$(".tab[data-tab]").forEach((tab) => {
  tab.addEventListener("click", () => {
    $$(".tab[data-tab]").forEach((t) => t.classList.remove("is-active"));
    $$(".tabpane").forEach((p) => p.classList.remove("is-active"));
    tab.classList.add("is-active");
    $(`.tabpane[data-pane="${tab.dataset.tab}"]`).classList.add("is-active");
  });
});

/* ---------- formularios ---------- */
function setBusy(b) { $("#startBtn").disabled = b; $("#contentBtn").disabled = b; }
$("#startBtn").addEventListener("click", () => {
  setBusy(true);
  fetch("/api/mission/start", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mercado: $("#mercado").value.trim() || "LATAM", tipo: $("#tipo").value.trim(), cantidad: $("#cantidad").value }) });
});
$("#contentBtn").addEventListener("click", () => {
  setBusy(true);
  fetch("/api/content/start", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tema: $("#tema").value.trim() }) });
});

/* ---------- sprites reales ---------- */
function loadSprites() {
  ["krillin", "piccolo", "vegeta", "gohan", "goku"].forEach((key) => {
    const img = new Image();
    img.onload = () => {
      const c = document.querySelector(`.agent[data-key="${key}"] .char`);
      if (c) c.style.backgroundImage = `url('assets/${key}.png')`;
    };
    img.src = `assets/${key}.png`;
  });
}

/* ---------- init + SSE ---------- */
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
    else if (type === "leadUpdate") { const l = leads.get(payload.id); if (l) { l.status = payload.status; renderLeads(); } }
    else if (type === "post") { posts.set(payload.id, payload); renderPosts(); }
    else if (type === "postUpdate") { const p = posts.get(payload.id); if (p) { p.status = payload.status; renderPosts(); } }
    else if (type === "mission") setBusy(!!payload.running);
  };
  es.onerror = () => { es.close(); setTimeout(connect, 2000); };
}

loadSprites();
init();
connect();
