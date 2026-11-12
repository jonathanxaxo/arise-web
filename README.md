# Arise Web

A Arise AI na internet: chat e **"Melhorar ideia"** (transforma uma ideia vaga num texto claro para colar no [SEMA Gênese](https://sema-genese.vercel.app)). Usa o **Gemini** (Google) no plano gratuito e fica no ar 24h, sem depender do computador ligado.

> A Arise **local** (Ollama + e-mails + repositórios) é outro projeto e continua só no PC. Este site não lê e-mails nem repositórios.

## Como funciona
- Site estático (`index.html`, `style.css`, `app.js`) + funções da Vercel em `api/`.
- A chave do Gemini fica **só** na variável de ambiente `GEMINI_API_KEY` da Vercel: nunca aparece na página nem no GitHub.
- Acesso protegido por senha (`ARISE_SENHA`), com sessão de 30 dias em cookie `HttpOnly`.
- Limite de mensagens por minuto para não estourar a cota grátis.
- O texto enviado vai para o Google (Gemini). **Não use dados pessoais ou sigilosos.**

## Publicar na Vercel (uma vez)
1. Gere a chave grátis em https://aistudio.google.com/app/apikey.
2. Em https://vercel.com/new, importe o repositório `arise-web` (sem build, framework "Other").
3. Em **Settings → Environment Variables**, cadastre:
   - `GEMINI_API_KEY` = sua chave
   - `ARISE_SENHA` = uma senha forte só sua
   - (opcional) `GEMINI_MODELO` = nome exato do modelo; sem isso a Arise escolhe sozinha o "flash" mais recente.
4. Faça o deploy e entre com a senha.

## Testar no PC
```powershell
copy .env.example .env.local   # preencha as variáveis
npm run dev                     # http://127.0.0.1:3100
```
Para testar sem gastar a cota, aponte para a Arise local: `GEMINI_BASE_URL=http://localhost:11434/v1` e `GEMINI_MODELO=arise-ai`.
