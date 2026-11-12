// Funcoes compartilhadas das rotas /api (Vercel Functions, Node 20+).
// Segredos SO em variaveis de ambiente (painel da Vercel ou .env.local): nunca no codigo.
import crypto from 'node:crypto';

export const SISTEMA = `Você é a Arise AI, assistente pessoal do Jonathan.
Responda SEMPRE em português do Brasil (vocabulário brasileiro), de forma clara, direta e objetiva.
Quando ajudar a escrever ideias de sistemas, organize em: objetivo, público, funcionalidades, regras e dúvidas em aberto.
Não invente leis, normas, números ou fatos; se não souber, diga.`;

const COOKIE = 'arise_sessao';
const DURACAO_S = 60 * 60 * 24 * 30; // 30 dias

function segredo() {
  const s = process.env.ARISE_SEGREDO || process.env.ARISE_SENHA;
  if (!s) throw new Error('Configure ARISE_SENHA nas variáveis de ambiente.');
  return s;
}

function assinar(valor) {
  return crypto.createHmac('sha256', segredo()).update(valor).digest('base64url');
}

export function senhaConfere(tentativa) {
  const certa = process.env.ARISE_SENHA || '';
  if (!certa || typeof tentativa !== 'string') return false;
  const a = crypto.createHash('sha256').update(tentativa).digest();
  const b = crypto.createHash('sha256').update(certa).digest();
  return crypto.timingSafeEqual(a, b);
}

export function cookieSessao(req) {
  const expira = Math.floor(Date.now() / 1000) + DURACAO_S;
  const token = `${expira}.${assinar(String(expira))}`;
  const seguro = (req.headers['x-forwarded-proto'] || '') === 'https' ? '; Secure' : '';
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${DURACAO_S}${seguro}`;
}

export function autenticado(req) {
  const m = (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return false;
  const [expira, assinatura] = m[1].split('.');
  if (!expira || !assinatura || Number(expira) < Date.now() / 1000) return false;
  const esperada = assinar(expira);
  return esperada.length === assinatura.length &&
    crypto.timingSafeEqual(Buffer.from(esperada), Buffer.from(assinatura));
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
