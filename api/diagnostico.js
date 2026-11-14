// GET /api/diagnostico  ->  testa os modelos do Gemini e mostra qual e o mais rapido.
// So para administradores (ARISE_ADMINS) ou, se nao houver lista de admins, e-mails de ARISE_EMAILS.
import { autenticado, diagnosticarModelos, ehAdmin, json } from './_lib.js';

export default async function handler(req, res) {
  const u = autenticado(req);
  if (!u) return json(res, 401, { erro: 'faça login' });
  const admins = (process.env.ARISE_ADMINS || process.env.ARISE_EMAILS || '').toLowerCase();
  if (!ehAdmin(u.email) && !admins.split(/[,;\s]+/).includes(u.email)) return json(res, 403, { erro: 'só para administradores' });
  try {
    const resultados = (await diagnosticarModelos()).sort((a, b) => (b.ok - a.ok) || (a.ms - b.ms));
    const recomendado = resultados.find((r) => r.ok)?.modelo || null;
    return json(res, 200, {
      regiao: process.env.VERCEL_REGION || 'local',
      modeloFixado: process.env.GEMINI_MODELO || null,
      recomendado,
      resultados,
    });
  } catch (e) {
    return json(res, 500, { erro: e.message });
  }
}
