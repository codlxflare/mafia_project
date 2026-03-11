/**
 * TTS: OpenAI или ElevenLabs.
 * Переменные окружения:
 *   TTS_PROVIDER=openai|elevenlabs  — провайдер (по умолчанию openai).
 *   Для OpenAI: OPENAI_API_KEY, TTS_VOICE (alloy|echo|fable|onyx|nova|shimmer).
 *   Для ElevenLabs: ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID (id голоса для русского).
 *   TTS_CF_WORKER_URL — если задан, ElevenLabs вызывается через Cloudflare Worker (для Beget/датацентров, ключ в секретах Worker).
 *   TTS_CF_WORKER_SECRET — опционально, Bearer-токен для вызова Worker.
 *   TTS_PROXY или HTTPS_PROXY — прокси для запросов (например через VPN): http://127.0.0.1:port или socks5://127.0.0.1:port
 */

import { ProxyAgent } from 'undici';

const OPENAI_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
const ELEVENLABS_DEFAULT_VOICE = 'JBFqnCBsd6RMkjVDRZzb';
const ELEVENLABS_MODEL = 'eleven_multilingual_v2';
const ELEVENLABS_OUTPUT = 'mp3_44100_128';

/** Опции fetch: если задан TTS_PROXY или HTTPS_PROXY (http/https) — запросы идут через прокси. withoutProxy=true — не использовать прокси. */
function getFetchOptions(withoutProxy = false) {
  if (withoutProxy) return {};
  const proxy = (process.env.TTS_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY)?.trim();
  if (!proxy) return {};
  const protocol = proxy.split(':')[0]?.toLowerCase();
  if (protocol !== 'http' && protocol !== 'https') {
    if (protocol === 'socks5' || protocol === 'socks4') {
      console.warn('[TTS] Прокси socks не поддерживается (нужен http или https). Запрос без прокси.');
    }
    return {};
  }
  try {
    return { dispatcher: new ProxyAgent(proxy) };
  } catch (e) {
    console.error('[TTS] Ошибка прокси:', e.message);
    return {};
  }
}

function isNetworkOrProxyError(e) {
  const msg = (e?.message || String(e)).toLowerCase();
  return /fetch failed|econnrefused|socket hang up|etimedout|econnreset|proxy|network/i.test(msg);
}

function getProvider() {
  const p = (process.env.TTS_PROVIDER || 'openai').toLowerCase();
  return p === 'elevenlabs' ? 'elevenlabs' : 'openai';
}

/** Проверка ключа OpenAI. @returns {Promise<{ ok: boolean, error?: string }>} */
async function checkOpenAIKey() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: 'Ключ не задан: OPENAI_API_KEY в server/.env' };
  try {
    const r = await fetch('https://api.openai.com/v1/models', {
      ...getFetchOptions(),
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (r.ok) return { ok: true };
    const err = await r.text();
    let msg = 'Ключ недействителен';
    try {
      const j = JSON.parse(err);
      if (j.error?.message) msg = j.error.message;
    } catch (_) {}
    return { ok: false, error: msg };
  } catch (e) {
    return { ok: false, error: e.message || 'Ошибка сети' };
  }
}

/** Проверка ключа ElevenLabs. @returns {Promise<{ ok: boolean, error?: string }>} */
async function checkElevenLabsKey() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return { ok: false, error: 'Ключ не задан: ELEVENLABS_API_KEY в server/.env' };
  try {
    const r = await fetch('https://api.elevenlabs.io/v1/models', {
      ...getFetchOptions(),
      headers: {
        'xi-api-key': apiKey,
        'User-Agent': 'MafiaGame-Server/1.0 (Node.js; TTS)',
      },
    });
    if (r.ok) return { ok: true };
    const err = await r.text();
    let msg = 'Ключ недействителен';
    try {
      const j = JSON.parse(err);
      if (j.detail?.message) msg = j.detail.message;
      else if (j.message) msg = j.message;
    } catch (_) {}
    return { ok: false, error: msg };
  } catch (e) {
    return { ok: false, error: e.message || 'Ошибка сети' };
  }
}

/**
 * Проверка ключа TTS. Успех, если доступен хотя бы один провайдер (основной или fallback).
 * @returns {Promise<{ ok: boolean, error?: string, fallback?: string }>}
 */
export async function checkTtsKey() {
  const provider = getProvider();
  if (provider === 'elevenlabs') {
    if ((process.env.TTS_CF_WORKER_URL || '').trim()) return { ok: true };
    const result = await checkElevenLabsKey();
    if (result.ok) return result;
    if (process.env.OPENAI_API_KEY) {
      const openai = await checkOpenAIKey();
      if (openai.ok) return { ok: true, fallback: 'openai' };
    }
    return result;
  }
  const result = await checkOpenAIKey();
  if (result.ok) return result;
  if (process.env.ELEVENLABS_API_KEY) {
    const el = await checkElevenLabsKey();
    if (el.ok) return { ok: true, fallback: 'elevenlabs' };
  }
  return result;
}

/** Синтез через OpenAI (внутренний вызов и fallback при 403 ElevenLabs). При ошибке прокси — повтор без прокси. */
async function synthesizeOpenAI(text, withoutProxy = false) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('TTS не настроен: задайте OPENAI_API_KEY в server/.env');
  const voice = OPENAI_VOICES.includes(process.env.TTS_VOICE) ? process.env.TTS_VOICE : 'onyx';
  const opts = getFetchOptions(withoutProxy);
  try {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      ...opts,
      method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'tts-1-hd',
      input: text,
      voice,
      response_format: 'mp3',
      speed: 0.9,
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    let msg = 'Ошибка синтеза речи';
    try {
      const j = JSON.parse(errText);
      if (j.error?.message) msg = j.error.message;
    } catch (_) {}
    console.error('[TTS OpenAI]', response.status, errText.slice(0, 300));
    const err = new Error(msg);
    err.status = response.status;
    throw err;
  }
  return Buffer.from(await response.arrayBuffer());
  } catch (e) {
    if (!withoutProxy && Object.keys(getFetchOptions(false)).length > 0 && isNetworkOrProxyError(e)) {
      console.warn('[TTS] Прокси недоступен (', e?.message, '), повтор без прокси.');
      return synthesizeOpenAI(text, true);
    }
    throw e;
  }
}

/** Синтез через Cloudflare Worker (прокси ElevenLabs). Ключ хранится в секретах Worker. */
async function synthesizeElevenLabsViaWorker(text) {
  const workerUrl = (process.env.TTS_CF_WORKER_URL || '').trim();
  if (!workerUrl) throw new Error('TTS_CF_WORKER_URL не задан');
  const headers = { 'Content-Type': 'application/json' };
  const secret = (process.env.TTS_CF_WORKER_SECRET || '').trim();
  if (secret) headers['Authorization'] = `Bearer ${secret}`;
  const voiceId = process.env.ELEVENLABS_VOICE_ID || ELEVENLABS_DEFAULT_VOICE;
  const response = await fetch(workerUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ text: text.trim(), voice_id: voiceId }),
  });
  if (!response.ok) {
    const errBody = await response.text();
    let msg = errBody.slice(0, 300);
    try {
      const j = JSON.parse(errBody);
      if (j?.error) msg = j.error;
    } catch (_) {}
    const err = new Error(msg || `Worker error ${response.status}`);
    err.status = response.status;
    throw err;
  }
  return Buffer.from(await response.arrayBuffer());
}

/** Синтез через ElevenLabs (прямой вызов API). При 403 (Cloudflare) бросает с err.isCloudflareBlock = true. При ошибке прокси — повтор без прокси. */
async function synthesizeElevenLabs(text, withoutProxy = false) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('TTS не настроен: задайте ELEVENLABS_API_KEY в server/.env');
  const voiceId = process.env.ELEVENLABS_VOICE_ID || ELEVENLABS_DEFAULT_VOICE;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${ELEVENLABS_OUTPUT}`;
  const opts = getFetchOptions(withoutProxy);
  try {
    const response = await fetch(url, {
      ...opts,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
        'xi-api-key': apiKey,
        'User-Agent': 'MafiaGame-Server/1.0 (Node.js; TTS)',
      },
      body: JSON.stringify({
        text: text.trim(),
        model_id: ELEVENLABS_MODEL,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      const isCloudflare = response.status === 403 && /Just a moment|cloudflare/i.test(errText);
      let msg = 'Ошибка синтеза речи';
      if (isCloudflare) {
        msg = 'ElevenLabs недоступен из этой сети (Cloudflare). Запустите сервер с другого IP/VPN или используйте TTS_PROVIDER=openai.';
      } else {
        try {
          const j = JSON.parse(errText);
          if (j.detail?.message) msg = j.detail.message;
          else if (j.message) msg = j.message;
        } catch (_) {}
      }
      console.error('[TTS ElevenLabs]', response.status, errText.slice(0, 300));
      const err = new Error(msg);
      err.status = response.status;
      err.isCloudflareBlock = isCloudflare;
      throw err;
    }
    return Buffer.from(await response.arrayBuffer());
  } catch (e) {
    if (!withoutProxy && Object.keys(getFetchOptions(false)).length > 0 && isNetworkOrProxyError(e)) {
      console.warn('[TTS] Прокси недоступен (', e?.message, '), повтор без прокси.');
      return synthesizeElevenLabs(text, true);
    }
    throw e;
  }
}

/**
 * Синтез речи. Возвращает буфер MP3.
 * При TTS_PROVIDER=elevenlabs при любой ошибке (сеть, 403, прокси) пробует OpenAI, если задан OPENAI_API_KEY.
 */
export async function synthesizeSpeech(text) {
  if (!text || typeof text !== 'string' || text.length > 4000) {
    throw new Error('Нужен текст до 4000 символов');
  }
  const provider = getProvider();
  if (provider === 'elevenlabs') {
    try {
      const workerUrl = (process.env.TTS_CF_WORKER_URL || '').trim();
      if (workerUrl) return await synthesizeElevenLabsViaWorker(text);
      return await synthesizeElevenLabs(text);
    } catch (e) {
      if (process.env.OPENAI_API_KEY) {
        const hint = e?.isCloudflareBlock ? '403 (Cloudflare)' : (e?.message || 'недоступен');
        console.warn('[TTS] ElevenLabs', hint, '— пробуем OpenAI.');
        try {
          const buf = await synthesizeOpenAI(text);
          console.warn('[TTS] OpenAI fallback: OK');
          return buf;
        } catch (openaiErr) {
          console.error('[TTS] OpenAI fallback failed:', openaiErr?.message || openaiErr);
          throw new Error('ElevenLabs и OpenAI недоступны. Озвучка только браузером.');
        }
      }
      throw e;
    }
  }
  return await synthesizeOpenAI(text);
}

/** Является ли TTS настроенным (есть ключ для выбранного провайдера). */
export function isTtsConfigured() {
  const provider = getProvider();
  if (provider === 'elevenlabs') return !!(process.env.ELEVENLABS_API_KEY || (process.env.TTS_CF_WORKER_URL || '').trim());
  return !!process.env.OPENAI_API_KEY;
}
