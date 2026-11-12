# Arise Web

A Arise AI na internet: chat e **"Melhorar ideia"** (transforma uma ideia vaga num texto claro para colar no [SEMA Gênese](https://sema-genese.vercel.app)). Usa o **Gemini** (Google) no plano gratuito e fica no ar 24h, sem depender do computador ligado.

> A Arise **local** (Ollama + e-mails + repositórios) é outro projeto e continua só no PC. Este site não lê e-mails nem repositórios.

## Como funciona
- Site estático (`index.html`, `style.css`, `app.js`) + funções da Vercel em `api/`.
- A chave do Gemini fica **só** na variável de ambiente `GEMINI_API_KEY` da Vercel: nunca aparece na página nem no GitHub.
- Login com **"Entrar com Google"**: só entram os e-mails liberados (`ARISE_EMAILS`) ou domínios inteiros (`ARISE_DOMINIOS`). A senha da pessoa fica no Google; o site confere a assinatura do Google.
- Sessão de 7 dias em cookie `HttpOnly` assinado. Tirar um e-mail da lista derruba o acesso dele.
- Limite por pessoa: por minuto e por dia (`ARISE_LIMITE_DIA`, padrão 60), para não estourar a cota grátis.
- O texto enviado vai para o Google (Gemini). **Não use dados pessoais ou sigilosos.**

## Publicar na Vercel (uma vez)
1. Gere a chave grátis em https://aistudio.google.com/app/apikey.
2. Em https://vercel.com/new, importe o repositório `arise-web` (sem build, framework "Other").
3. Em **Settings → Environment Variables**, cadastre:
   - `GEMINI_API_KEY` = sua chave
   - `GOOGLE_CLIENT_ID` = ID do cliente OAuth (tipo "Aplicativo da Web") do Google Cloud
   - `ARISE_SEGREDO` = texto aleatório longo (assina as sessões)
   - `ARISE_EMAILS` = e-mails liberados, separados por vírgula (ex.: `voce@sema.mt.gov.br, colega@seplag.mt.gov.br`)
   - (opcional) `ARISE_DOMINIOS` = domínios inteiros liberados (ex.: `sema.mt.gov.br`)
   - (opcional) `ARISE_LIMITE_DIA` = mensagens por pessoa por dia (padrão 60)
   - (opcional) `GEMINI_MODELO` = nome exato do modelo; sem isso a Arise escolhe sozinha o "flash" mais recente.
4. Faça o deploy e entre com o Google.

**Liberar um colega:** edite `ARISE_EMAILS` em Settings → Environment Variables e faça **Redeploy**.

## Testar no PC
```powershell
copy .env.example .env.local   # preencha as variáveis
npm run dev                     # http://127.0.0.1:3100
```
Para testar sem gastar a cota, aponte para a Arise local: `GEMINI_BASE_URL=http://localhost:11434/v1` e `GEMINI_MODELO=arise-ai`.
