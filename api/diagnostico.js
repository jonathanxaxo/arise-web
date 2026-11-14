// GET /api/diagnostico?nivel=minimal|low|none|padrao&filtro=lite
// Mede o tempo ate a 1a palavra de cada modelo do Gemini e recomenda o mais rapido.
// So para administradores (ARISE_ADMINS) ou, se nao houver lista de admins, e-mails de ARISE_EMAILS.
import { autenticado, diagnosticarModelos, ehAdmin, json } from './_lib.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  const u = autenticado(req);
  if (!u) return json(res, 401, { erro: 'faça login' });
  const admins = (process.env.ARISE_ADMINS || process.env.ARISE_EMAILS || '').toLowerCase();
  if (!ehAdmin(u.email) && !admins.split(/[,;\s]+/).includes(u.email)) return json(res, 403, { erro: 'só para administradores' });
  const q = new URL(req.url, 'http://x').searchParams;
  const nivel = ['none', 'minimal', 'low', 'padrao'].includes(q.get('nivel')) ? q.get('nivel') : 'minimal';
  try {
    const resultados = (await diagnosticarModelos({ nivel, filtro: q.get('filtro') || '' }))
      .sort((a, b) => (b.ok - a.ok) || ((a.msPrimeiraPalavra ?? a.ms) - (b.msPrimeiraPalavra ?? b.ms)));
    const melhor = resultados.find((r) => r.ok);
    return json(res, 200, {
      regiao: process.env.VERCEL_REGION || 'local',
      nivelTestado: nivel,
      modeloFixado: process.env.GEMINI_MODELO || null,
      recomendado: melhor ? `${melhor.modelo} (1a palavra em ${(melhor.msPrimeiraPalavra / 1000).toFixed(1)} s)` : null,
      resultados,
    });
  } catch (e) {
    return json(res, 500, { erro: e.message });
  }
}
