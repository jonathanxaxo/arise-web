"use strict";
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

function esc(t) {
  return String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
// Markdown simples e seguro: escapa tudo antes de formatar
function md(texto) {
  const blocos = [];
  let t = esc(texto).replace(/```[\w-]*\n?([\s\S]*?)(```|$)/g, (_, c) => { blocos.push(`<pre><code>${c.replace(/\n$/, "")}</code></pre>`); return `\u0000${blocos.length - 1}\u0000`; });
  t = t.replace(/`([^`\n]+)`/g, "<code>$1</code>").replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>").replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<i>$2</i>");
  let html = "", lista = null;
  const fecha = () => { if (lista) { html += `</${lista}>`; lista = null; } };
  for (const l of t.split("\n")) {
    let m;
    if ((m = l.match(/^\s*[-*•]\s+(.*)/))) { if (lista !== "ul") { fecha(); html += "<ul>"; lista = "ul"; } html += `<li>${m[1]}</li>`; }
    else if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) { if (lista !== "ol") { fecha(); html += "<ol>"; lista = "ol"; } html += `<li>${m[1]}</li>`; }
    else if ((m = l.match(/^#{1,4}\s+(.*)/))) { fecha(); html += `<h4>${m[1]}</h4>`; }
    else if (l.trim() === "") { /* mantem a lista aberta */ }
    else { fecha(); html += `<p>${l}</p>`; }
  }
  fecha();
  return html.replace(/\u0000(\d+)\u0000/g, (_, i) => blocos[i]).replace(/<p>(<pre>[\s\S]*?<\/pre>)<\/p>/g, "$1");
}

async function api(url, opcoes = {}) {
  const r = await fetch(url, { headers: { "Content-Type": "application/json" }, credentials: "same-origin", ...opcoes });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && url !== "/api/login") { mostrarLogin(); throw new Error("Sessão expirada. Entre de novo."); }
  if (!r.ok) throw new Error(d.erro || `erro ${r.status}`);
  return d;
}

// ---------------- login com Google ----------------
let clientId = "";
let botaoDesenhado = false;

function desenharBotaoGoogle(tentativas = 0) {
  if (botaoDesenhado) return;
  if (!window.google?.accounts?.id) {
    if (tentativas < 50) setTimeout(() => desenharBotaoGoogle(tentativas + 1), 200);
    else $("#erro-login").textContent = "Não consegui carregar o login do Google. Verifique a internet.";
    return;
  }
  if (!clientId) { $("#erro-login").textContent = "Login do Google ainda não configurado (GOOGLE_CLIENT_ID)."; return; }
  google.accounts.id.initialize({ client_id: clientId, callback: aoEntrarComGoogle, ux_mode: "popup", auto_select: false });
  google.accounts.id.renderButton($("#botao-google"), { type: "standard", theme: "filled_black", size: "medium", shape: "pill", text: "signin_with", logo_alignment: "left", width: 230, locale: "pt-BR" });
  botaoDesenhado = true;
}

async function aoEntrarComGoogle(resposta) {
  $("#erro-login").textContent = "Entrando…";
  try {
    const d = await api("/api/login", { method: "POST", body: JSON.stringify({ credential: resposta.credential }) });
    mostrarApp(d);
  } catch (err) { $("#erro-login").textContent = err.message; }
}

function mostrarLogin() { $("#app").hidden = true; $("#tela-login").hidden = false; desenharBotaoGoogle(); }
function mostrarApp(u = {}) {
  $("#erro-login").textContent = "";
  $("#tela-login").hidden = true; $("#app").hidden = false;
  $("#usuario").textContent = u.email || "";
  $("#nome-boas-vindas").textContent = u.nome || "bem-vindo";
  $("#txt").focus();
}

$("#btn-sair").addEventListener("click", async () => {
  await fetch("/api/login", { method: "DELETE" });
  window.google?.accounts?.id?.disableAutoSelect();
  mostrarLogin();
});
api("/api/login").then(d => { clientId = d.clientId; d.logado ? mostrarApp(d) : mostrarLogin(); }).catch(() => mostrarLogin());

// ---------------- abas ----------------
$$(".aba").forEach(b => b.addEventListener("click", () => {
  $$(".aba").forEach(x => x.classList.toggle("ativa", x === b));
  $$(".painel").forEach(p => p.classList.toggle("ativo", p.id === "aba-" + b.dataset.aba));
}));

// ---------------- chat ----------------
const historico = [];
const txt = $("#txt"), msgs = $("#mensagens"), rol = $("#rolagem");
txt.addEventListener("input", () => { txt.style.height = "auto"; txt.style.height = Math.min(txt.scrollHeight, 180) + "px"; });
txt.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#form-chat").requestSubmit(); } });

function novaMsg(papel, texto = "") {
  const div = document.createElement("div");
  div.className = `msg ${papel === "user" ? "eu" : "ia"}`;
  div.innerHTML = `<div class="avatar">${papel === "user" ? esc(($("#usuario").textContent || "eu").charAt(0).toUpperCase()) : ""}</div><div class="balao"></div>`;
  const b = $(".balao", div);
  papel === "user" ? (b.textContent = texto) : (b.innerHTML = md(texto));
  msgs.appendChild(div);
  return b;
}

async function enviar(texto) {
  texto = texto.trim();
  if (!texto) return;
  $("#boas-vindas").style.display = "none";
  novaMsg("user", texto);
  historico.push({ role: "user", content: texto });
  const balao = novaMsg("assistant");
  balao.classList.add("digitando");
  $("#btn-enviar").disabled = true;
  rol.scrollTop = rol.scrollHeight;
  try {
    const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mensagens: historico }) });
    if (r.status === 401) { mostrarLogin(); throw new Error("Sessão expirada. Entre de novo."); }
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.erro || `erro ${r.status}`); }
    const leitor = r.body.getReader(), dec = new TextDecoder();
    let total = "";
    for (;;) {
      const { value, done } = await leitor.read();
      if (done) break;
      total += dec.decode(value, { stream: true });
      balao.innerHTML = md(total);
      rol.scrollTop = rol.scrollHeight;
    }
    historico.push({ role: "assistant", content: total });
  } catch (e) {
    balao.innerHTML = `<span class="erro">${esc(e.message)}</span>`;
    historico.pop();
  } finally {
    balao.classList.remove("digitando");
    $("#btn-enviar").disabled = false;
    txt.focus();
  }
}
$("#form-chat").addEventListener("submit", e => { e.preventDefault(); const t = txt.value; txt.value = ""; txt.style.height = "auto"; enviar(t); });
$$(".sug").forEach(b => b.addEventListener("click", () => enviar(b.dataset.texto || b.textContent)));
$("#btn-nova").addEventListener("click", () => { historico.length = 0; msgs.innerHTML = ""; $("#boas-vindas").style.display = ""; });

// ---------------- melhorar ideia ----------------
$("#btn-ideia").addEventListener("click", async () => {
  const btn = $("#btn-ideia"), ideia = $("#ideia-in").value;
  btn.disabled = true; btn.textContent = "Melhorando…";
  try {
    const d = await api("/api/ideia", { method: "POST", body: JSON.stringify({ ideia }) });
    $("#ideia-out").textContent = d.ideia;
    $("#ideia-out-box").hidden = false;
  } catch (e) {
    $("#ideia-out").textContent = "Erro: " + e.message;
    $("#ideia-out-box").hidden = false;
  } finally { btn.disabled = false; btn.textContent = "✨ Melhorar ideia"; }
});
$("#btn-copiar").addEventListener("click", async () => {
  const t = $("#ideia-out").textContent;
  try { await navigator.clipboard.writeText(t); $("#btn-copiar").textContent = "Copiado ✓"; }
  catch { getSelection().selectAllChildren($("#ideia-out")); $("#btn-copiar").textContent = "Use Ctrl+C"; }
  setTimeout(() => ($("#btn-copiar").textContent = "Copiar"), 2000);
});
