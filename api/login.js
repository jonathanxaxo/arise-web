// GET    /api/login  ->  { logado, email, nome, clientId }
// POST   /api/login  { credential }  (botao "Entrar com Google")  ->  cookie de sessao
// DELETE /api/login  ->  sai
import { autenticado, cookieSessao, dentroDoLimite, emailPermitido, json, lerJson, verificarGoogle } from './_lib.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const u = autenticado(req);
    return json(res, 200, { logado: !!u, email: u?.email || '', nome: u?.nome || '', clientId: process.env.GOOGLE_CLIENT_ID || '' });
  }
  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', 'arise_sessao=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    return json(res, 200, { ok: true });
  }
  if (req.method !== 'POST') return json(res, 405, { erro: 'método não permitido' });
  if (!dentroDoLimite('login', 20)) return json(res, 429, { erro: 'Muitas tentativas. Aguarde 1 minuto.' });

  let dado;
  try { dado = await lerJson(req); } catch { return json(res, 400, { erro: 'pedido inválido' }); }
  try {
    const usuario = await verificarGoogle(dado.credential);
    if (!emailPermitido(usuario.email)) {
      return json(res, 403, { erro: `O e-mail ${usuario.email} ainda não tem acesso. Peça a liberação ao administrador.` });
    }
    res.setHeader('Set-Cookie', cookieSessao(req, usuario));
    return json(res, 200, { ok: true, email: usuario.email, nome: usuario.nome });
  } catch (e) {
    return json(res, 401, { erro: e.message });
  }
}
