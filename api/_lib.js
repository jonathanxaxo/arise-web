// Funcoes compartilhadas das rotas /api (Vercel Functions, Node 20+).
// Segredos SO em variaveis de ambiente (painel da Vercel ou .env.local): nunca no codigo.
import crypto from 'node:crypto';

export const SISTEMA = `Você é a Arise AI, assistente de trabalho da equipe.
Responda SEMPRE em português do Brasil (vocabulário brasileiro), de forma clara, direta e objetiva.
Quando ajudar a escrever ideias de sistemas, organize em: objetivo, público, funcionalidades, regras e dúvidas em aberto.
Não invente leis, normas, números ou fatos; se não souber, diga.`;

const COOKIE = 'arise_sessao';
const DURACAO_S = 60 * 60 * 24 * 7; // 7 dias

function segredo() {
  const s = process.env.ARISE_SEGREDO || process.env.ARISE_SENHA;
  if (!s) throw new Error('Configure ARISE_SEGREDO nas variáveis de ambiente.');
  return s;
}

function assinar(valor) {
  return crypto.createHmac('sha256', segredo()).update(valor).digest('base64url');
}

// ---------- quem pode entrar ----------
const lista = (v) => String(v || '').split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);

/** ARISE_EMAILS: e-mails liberados. ARISE_DOMINIOS: dominios inteiros liberados (ex.: sema.mt.gov.br). */
export function emailPermitido(email) {
  const e = String(email || '').toLowerCase();
  if (!e.includes('@')) return false;
  if (lista(process.env.ARISE_EMAILS).includes(e)) return true;
  return lista(process.env.ARISE_DOMINIOS).includes(e.split('@')[1]);
}

export function ehAdmin(email) {
  return lista(process.env.ARISE_ADMINS).includes(String(email || '').toLowerCase());
}

// ---------- login com Google (confere a assinatura do ID token, sem bibliotecas) ----------
let chavesGoogle = { expira: 0, chaves: {} };

async function chavePublicaGoogle(kid) {
  if (Date.now() > chavesGoogle.expira || !chavesGoogle.chaves[kid]) {
    const r = await fetch('https://www.googleapis.com/oauth2/v3/certs');
    if (!r.ok) throw new Error('não consegui falar com o Google');
    const { keys } = await r.json();
    chavesGoogle = { expira: Date.now() + 3600_000, chaves: Object.fromEntries(keys.map((k) => [k.kid, k])) };
  }
  const jwk = chavesGoogle.chaves[kid];
  if (!jwk) throw new Error('chave do Google desconhecida');
  return crypto.createPublicKey({ key: jwk, format: 'jwk' });
}

/** Valida o "credential" do botão Entrar com Google e devolve { email, nome }. */
export async function verificarGoogle(credencial) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('Configure GOOGLE_CLIENT_ID nas variáveis de ambiente.');
  const partes = String(credencial || '').split('.');
  if (partes.length !== 3) throw new Error('login inválido');
  const [h64, p64, s64] = partes;
  const cab = JSON.parse(Buffer.from(h64, 'base64url'));
  if (cab.alg !== 'RS256') throw new Error('login inválido');
  const ok = crypto.verify('RSA-SHA256', Buffer.from(`${h64}.${p64}`), await chavePublicaGoogle(cab.kid), Buffer.from(s64, 'base64url'));
  if (!ok) throw new Error('assinatura do Google inválida');
  const p = JSON.parse(Buffer.from(p64, 'base64url'));
  const agora = Date.now() / 1000;
  if (p.aud !== clientId) throw new Error('login de outro aplicativo');
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(p.iss)) throw new Error('emissor inválido');
  if (!(p.exp > agora - 60)) throw new Error('login expirado, tente de novo');
  if (p.email_verified !== true && p.email_verified !== 'true') throw new Error('e-mail não verificado pelo Google');
  return { email: String(p.email).toLowerCase(), nome: String(p.given_name || p.name || '').slice(0, 60) };
}

// ---------- sessao em cookie assinado ----------
export function cookieSessao(req, usuario) {
  const dados = Buffer.from(JSON.stringify({ e: usuario.email, n: usuario.nome, x: Math.floor(Date.now() / 1000) + DURACAO_S })).toString('base64url');
  const seguro = (req.headers['x-forwarded-proto'] || '') === 'https' ? '; Secure' : '';
  return `${COOKIE}=${dados}.${assinar(dados)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DURACAO_S}${seguro}`;
}

/** Devolve { email, nome } se a sessao for valida E o e-mail ainda estiver liberado; senao null. */
export function autenticado(req) {
  const m = (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return null;
  const [dados, assinatura] = m[1].split('.');
  if (!dados || !assinatura) return null;
  const esperada = assinar(dados);
  if (esperada.length !== assinatura.length || !crypto.timingSafeEqual(Buffer.from(esperada), Buffer.from(assinatura))) return null;
  try {
    const s = JSON.parse(Buffer.from(dados, 'base64url'));
    if (!(s.x > Date.now() / 1000) || !emailPermitido(s.e)) return null; // tirar da lista derruba o acesso
    return { email: s.e, nome: s.n || '' };
  } catch { return null; }
}

// ---------- limite diario por pessoa (aproximado: por instancia da Vercel) ----------
const usoDiario = new Map();
export function dentroDoLimiteDiario(email) {
  const max = Number(process.env.ARISE_LIMITE_DIA || 60);
  const dia = new Date().toISOString().slice(0, 10);
  const chave = `${dia}|${email}`;
  const n = (usoDiario.get(chave) || 0) + 1;
  usoDiario.set(chave, n);
  if (usoDiario.size > 5000) usoDiario.clear();
  return n <= max;
}

export async function lerJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let bruto = '';
  for await (const pedaco of req) {
    bruto += pedaco;
    if (bruto.length > 200_000) throw new Error('mensagem grande demais');
  }
  return bruto ? JSON.parse(bruto) : {};
}

export function json(res, status, dado) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(dado));
}

// Limite simples por instancia: evita gasto acidental da cota gratis.
const acessos = new Map();
export function dentroDoLimite(chave, maxPorMinuto = 20) {
  const agora = Date.now();
  const lista = (acessos.get(chave) || []).filter((t) => agora - t < 60_000);
  lista.push(agora);
  acessos.set(chave, lista);
  return lista.length <= maxPorMinuto;
}

// ---------- Gemini (endpoint compativel com OpenAI) ----------
const BASE = () => (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai').replace(/\/$/, '');
let modeloEmCache = null;

// Usa GEMINI_MODELO se definido; senao escolhe sozinho o "flash" mais recente disponivel para a chave.
export async function modelo() {
  if (process.env.GEMINI_MODELO) return process.env.GEMINI_MODELO;
  if (modeloEmCache) return modeloEmCache;
  const r = await fetch(`${BASE()}/models`, { headers: { Authorization: `Bearer ${process.env.GEMINI_API_KEY}` } });
  if (!r.ok) throw new Error(`não consegui listar os modelos do Gemini (${r.status}). Defina GEMINI_MODELO.`);
  const ids = ((await r.json()).data || []).map((m) => String(m.id).replace(/^models\//, ''));
  const candidatos = ids.filter((id) => /flash/.test(id) && !/(lite|image|tts|audio|live|thinking|exp|preview|embedding)/.test(id));
  const ordenar = (a, b) => b.localeCompare(a, 'en', { numeric: true });
  modeloEmCache = candidatos.sort(ordenar)[0] || ids.filter((id) => /flash/.test(id)).sort(ordenar)[0];
  if (!modeloEmCache) throw new Error('nenhum modelo "flash" disponível. Defina GEMINI_MODELO.');
  return modeloEmCache;
}

export async function chamarGemini(mensagens, { stream = true } = {}) {
  if (!process.env.GEMINI_API_KEY) throw new Error('Configure GEMINI_API_KEY nas variáveis de ambiente.');
  return fetch(`${BASE()}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GEMINI_API_KEY}` },
    body: JSON.stringify({ model: await modelo(), messages: mensagens, stream, temperature: 0.6 }),
  });
}
