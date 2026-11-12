// POST /api/chat  { mensagens: [{role, content}] }  ->  texto em streaming
import { SISTEMA, autenticado, chamarGemini, dentroDoLimite, dentroDoLimiteDiario, json, lerJson, motivoErro } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { erro: 'use POST' });
  const usuario = autenticado(req);
  if (!usuario) return json(res, 401, { erro: 'faça login' });
  if (!dentroDoLimite('chat:' + usuario.email)) return json(res, 429, { erro: 'Muitas mensagens em 1 minuto. Aguarde um pouco.' });
  if (!dentroDoLimiteDiario(usuario.email)) return json(res, 429, { erro: 'Você atingiu o limite de uso de hoje. Volte amanhã.' });

  let dado;
  try { dado = await lerJson(req); } catch { return json(res, 400, { erro: 'pedido inválido' }); }
  const historico = (Array.isArray(dado.mensagens) ? dado.mensagens : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 12_000) }));
  if (!historico.length) return json(res, 400, { erro: 'mensagem vazia' });

  let resp;
  try {
    resp = await chamarGemini([{ role: 'system', content: SISTEMA }, ...historico]);
  } catch (e) {
    return json(res, 500, { erro: e.message });
  }
  if (!resp.ok) return json(res, 502, { erro: await motivoErro(resp) });

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Accel-Buffering', 'no');

  // Converte o SSE do provedor em texto puro
  const leitor = resp.body.getReader();
  const dec = new TextDecoder();
  let resto = '';
  try {
    for (;;) {
      const { value, done } = await leitor.read();
      if (done) break;
      resto += dec.decode(value, { stream: true });
      const linhas = resto.split('\n');
      resto = linhas.pop();
      for (const l of linhas) {
        const t = l.trim();
        if (!t.startsWith('data:')) continue;
        const conteudo = t.slice(5).trim();
        if (conteudo === '[DONE]') continue;
        try {
          const pedaco = JSON.parse(conteudo).choices?.[0]?.delta?.content;
          if (pedaco) res.write(pedaco);
        } catch { /* linha parcial: ignora */ }
      }
    }
  } catch (e) {
    res.write(`\n\n[erro] ${e.message}`);
  }
  res.end();
}
