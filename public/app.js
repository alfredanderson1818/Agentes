const $ = (sel) => document.querySelector(sel);
const leadsEl = $("#leads");
const readyEl = $("#readyLeads");
const postsEl = $("#posts");
const logEl = $("#log");
const queueCount = $("#queueCount");
const readyCount = $("#readyCount");
const postCount = $("#postCount");

const leads = new Map();
const posts = new Map();

const STATUS_TXT = { idle: "En reposo", working: "⚡ ¡Trabajando!" };

function setMode(sim) {
  const b = $("#modeBadge");
  b.textContent = sim ? "MODO SIMULACIÓN" : "⚡ MODO REAL · API conectada";
  b.className = "badge " + (sim ? "sim" : "real");
}

function setAgent(key, status) {
  const f = document.querySelector(`.fighter[data-key="${key}"]`);
  if (!f) return;
  f.querySelector(".status").textContent = STATUS_TXT[status] || status;
  if (status === "working") {
    f.classList.add("working");
  } else if (f.classList.contains("working")) {
    f.classList.remove("working");
    f.classList.add("flash");
    setTimeout(() => f.classList.remove("flash"), 380);
  }
}

function addLog(line) {
  const d = document.createElement("div");
  d.textContent = line;
  logEl.prepend(d);
}

function showToast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove("show"), 1800);
}

async function copyText(text, label = "Mensaje copiado ✅") {
  try {
    await navigator.clipboard.writeText(text);
    showToast(label);
  } catch {
    showToast("No se pudo copiar 😕");
  }
}

// ---------- LEADS ----------
function leadCardPending(l) {
  const meta = [l.sector, l.ubicacion, l.tamano].filter(Boolean).join(" · ");
  const fit = l.fit ? `<span class="fit fit${l.fit}">fit ${l.fit}/5</span>` : "";
  return `
    <div class="lead">
      <h3>${esc(l.empresa)} ${fit}</h3>
      <div class="meta">${esc(meta)}${l.sitio ? ` · ${esc(l.sitio)}` : ""}</div>
      ${contactoLine(l)}
      <div class="msg">${esc(l.mensaje)}</div>
      ${l.notaRevisor ? `<p class="note">🛡️ Goku: ${esc(l.notaRevisor)}</p>` : ""}
      <div class="actions">
        <button class="btn-ok" data-id="${l.id}" data-act="approve">👍 Aprobar</button>
        <button class="btn-no" data-id="${l.id}" data-act="reject">✖ Descartar</button>
      </div>
    </div>`;
}

function leadCardReady(l) {
  const meta = [l.sector, l.ubicacion].filter(Boolean).join(" · ");
  const btns = [`<button class="btn-ok" data-copy="${l.id}">📋 Copiar</button>`];
  if (l.telefono) btns.push(`<button class="btn-wa" data-wa="${l.id}">📱 WhatsApp directo</button>`);
  btns.push(`<button class="btn-tool" data-li="${l.id}">🔗 ${l.linkedin ? "Abrir perfil LinkedIn" : "Buscar en LinkedIn"}</button>`);
  btns.push(`<button class="btn-tool" data-mail="${l.id}">✉️ ${l.email ? "Enviar email" : "Email (sin dirección)"}</button>`);
  return `
    <div class="lead approved">
      <h3>${esc(l.empresa)}</h3>
      <div class="meta">${esc(meta)}</div>
      ${contactoLine(l)}
      <div class="msg">${esc(l.mensaje)}</div>
      <div class="actions">${btns.join("")}</div>
    </div>`;
}

function renderLeads() {
  const arr = [...leads.values()];
  const pending = arr.filter((l) => l.status === "pending");
  const ready = arr.filter((l) => l.status === "approved");
  queueCount.textContent = pending.length;
  readyCount.textContent = ready.length;
  leadsEl.innerHTML = pending.length
    ? pending.map(leadCardPending).join("")
    : '<p class="empty">Sin mensajes por revisar. Lanza una misión arriba ⚡</p>';
  readyEl.innerHTML = ready.length
    ? ready.map(leadCardReady).join("")
    : '<p class="empty">Aún nada aprobado. Cuando apruebes, aparecerá aquí listo para enviar.</p>';
}

// ---------- POSTS ----------
function renderPosts() {
  const arr = [...posts.values()];
  postCount.textContent = arr.filter((p) => p.status === "pending").length;
  if (!arr.length) {
    postsEl.innerHTML = '<p class="empty">Sin contenido todavía. Pídele un tema a Gohan 📚</p>';
    return;
  }
  postsEl.innerHTML = arr
    .map((p) => {
      const actions =
        p.status === "pending"
          ? `<button class="btn-ok" data-pid="${p.id}" data-act="approve">👍 Aprobar</button>
             <button class="btn-no" data-pid="${p.id}" data-act="reject">✖ Descartar</button>`
          : p.status === "approved"
          ? `<button class="btn-ok" data-copypost="${p.id}">📋 Copiar</button>
             <button class="btn-tool" data-openli="1">🔗 Abrir LinkedIn</button>`
          : "";
      return `
        <div class="lead ${p.status === "pending" ? "" : p.status}">
          <h3>${esc(p.titulo)}</h3>
          <div class="msg">${esc(p.post)}</div>
          ${p.notaRevisor ? `<p class="note">🛡️ Goku: ${esc(p.notaRevisor)}</p>` : ""}
          ${p.status === "rejected" ? '<p class="verdict rejected">✖ Descartado</p>' : `<div class="actions">${actions}</div>`}
        </div>`;
    })
    .join("");
}

function contactoLine(l) {
  const quien = l.contacto_nombre
    ? `👤 ${esc(l.contacto_nombre)}${l.contacto_cargo ? " — " + esc(l.contacto_cargo) : ""}`
    : l.contacto_cargo
    ? `👤 Buscar a: ${esc(l.contacto_cargo)}`
    : "";
  const canales = [];
  if (l.telefono) canales.push(`📱 ${esc(l.telefono)}`);
  if (l.email) canales.push(`✉️ ${esc(l.email)}`);
  if (l.linkedin) canales.push(`🔗 LinkedIn`);
  const canalesHtml = canales.length ? `<small>${canales.join("  ·  ")}</small>` : "";
  if (!quien && !l.perfil && !canales.length) return "";
  return `<div class="contacto">${quien}${l.perfil ? `<small>🟢 ${esc(l.perfil)}</small>` : ""}${canalesHtml}</div>`;
}

function esc(s = "") {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// ---------- ACCIONES ----------
leadsEl.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-id]");
  if (!btn) return;
  fetch(`/api/lead/${btn.dataset.id}/${btn.dataset.act}`, { method: "POST" });
});

readyEl.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const l = leads.get(parseInt(btn.dataset.copy || btn.dataset.wa || btn.dataset.li || btn.dataset.mail));
  if (!l) return;
  if (btn.dataset.copy) {
    copyText(l.mensaje);
  } else if (btn.dataset.wa) {
    // WhatsApp directo al número, con el mensaje ya escrito.
    window.open(`https://wa.me/${l.telefono}?text=${encodeURIComponent(l.mensaje)}`, "_blank");
  } else if (btn.dataset.li) {
    // Perfil real si Piccolo lo encontró; si no, búsqueda como respaldo.
    const url = l.linkedin
      ? l.linkedin
      : `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(l.empresa)}`;
    window.open(url, "_blank");
  } else if (btn.dataset.mail) {
    const to = l.email || "";
    window.open(`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent("PAGASI – " + l.empresa)}&body=${encodeURIComponent(l.mensaje)}`);
  }
});

postsEl.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  if (btn.dataset.pid) fetch(`/api/post/${btn.dataset.pid}/${btn.dataset.act}`, { method: "POST" });
  else if (btn.dataset.copypost) copyText(posts.get(parseInt(btn.dataset.copypost)).post, "Post copiado ✅");
  else if (btn.dataset.openli) window.open("https://www.linkedin.com/feed/", "_blank");
});

$("#startBtn").addEventListener("click", () => {
  setBusy(true);
  fetch("/api/mission/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mercado: $("#mercado").value.trim() || "LATAM",
      tipo: $("#tipo").value.trim(),
      cantidad: $("#cantidad").value,
    }),
  });
});

$("#contentBtn").addEventListener("click", () => {
  setBusy(true);
  fetch("/api/content/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tema: $("#tema").value.trim() }),
  });
});

function setBusy(busy) {
  $("#startBtn").disabled = busy;
  $("#contentBtn").disabled = busy;
}

// ---------- CARGA + EVENTOS EN VIVO ----------
async function init() {
  const state = await (await fetch("/api/state")).json();
  setMode(state.simMode);
  for (const [key, a] of Object.entries(state.agents)) setAgent(key, a.status);
  for (const l of state.leads) leads.set(l.id, l);
  for (const p of state.posts || []) posts.set(p.id, p);
  state.mission.log.forEach(addLog);
  setBusy(!!state.mission.running);
  renderLeads();
  renderPosts();
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

// Si existe una imagen en /assets/<personaje>.png, la usa como sprite real.
function loadSprites() {
  ["krillin", "piccolo", "vegeta", "gohan", "goku"].forEach((key) => {
    const img = new Image();
    img.onload = () => {
      const char = document.querySelector(`.fighter[data-key="${key}"] .char`);
      if (char) {
        char.classList.add("img");
        char.style.backgroundImage = `url('assets/${key}.png')`;
      }
    };
    img.src = `assets/${key}.png`;
  });
}

loadSprites();
init();
connect();
