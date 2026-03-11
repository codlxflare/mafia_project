# TTS Proxy Worker (ElevenLabs)

Cloudflare Worker, который проксирует запросы к API ElevenLabs. Нужен, когда сервер приложения (например на Beget) получает 403 от `api.elevenlabs.io` из‑за блокировки датацентровых IP со стороны Cloudflare.

## Настройка

1. Установите [Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/) и войдите в Cloudflare:
   ```bash
   npm install -g wrangler
   wrangler login
   ```

2. Задайте секреты (ключ ElevenLabs обязателен; голос и секрет доступа — по желанию):
   ```bash
   wrangler secret put ELEVENLABS_API_KEY
   # опционально:
   wrangler secret put ELEVENLABS_VOICE_ID
   wrangler secret put TTS_WORKER_SECRET
   ```
   `TTS_WORKER_SECRET` — произвольная строка; её же укажете на сервере в `TTS_CF_WORKER_SECRET`, чтобы только ваш сервер мог вызывать Worker.

3. Деплой:
   ```bash
   wrangler deploy
   ```
   В выводе будет URL вида `https://mafia-tts-proxy.<account>.workers.dev`.

## Использование в проекте

На сервере (Beget и т.п.) в `server/.env`:

- `TTS_PROVIDER=elevenlabs`
- `TTS_CF_WORKER_URL=https://mafia-tts-proxy.<account>.workers.dev`
- Если задавали `TTS_WORKER_SECRET` в Worker: `TTS_CF_WORKER_SECRET=<тот же секрет>`

Ключ `ELEVENLABS_API_KEY` на сервере при использовании Worker не нужен (он хранится только в секретах Worker).
