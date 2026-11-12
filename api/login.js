// POST /api/login { senha }  ->  cookie de sessao (30 dias)
// GET  /api/login            ->  { logado: bool }
// DELETE /api/login          ->  sai
import { autenticado, cookieSessao, dentroDoLimite, json, lerJson, senhaConfere } from './_lib.js';

export default async function handler(req, res) {
  if (req.method === 'GET') return json(res, 200, { logado: autenticado(req) });
  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', 'arise_sessao=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
    return json(res, 200, { ok: true });
  }
  if (req.method !== 'POST') return json(res, 405, { erro: 'método não permitido' });
  if (!dentroDoLimite('login', 5)) return json(res, 429, { erro: 'Muitas tentativas. Aguarde 1 minuto.' });
  let dado;
  try { dado = await lerJson(req); } catch { return json(res, 400, { erro: 'pedido inválido' }); }
  try {
    if (!senhaConfere(dado.senha)) return json(res, 401, { erro: 'Senha incorreta.' });
    res.setHeader('Set-Cookie', cookieSessao(req));
    return json(res, 200, { ok: true });
  } catch (e) {
    return json(res, 500, { erro: e.message });
  }
}
