/**
 * Cloudflare Worker: прокси для ElevenLabs TTS.
 * Используется, когда сервер (например Beget) получает 403 от api.elevenlabs.io из‑за Cloudflare.
 * Запросы с edge CF к ElevenLabs обычно проходят.
 *
 * Секреты (wrangler secret put): ELEVENLABS_API_KEY, опционально ELEVENLABS_VOICE_ID, TTS_WORKER_SECRET.
 */

const ELEVENLABS_MODEL = 'eleven_multilingual_v2';
const ELEVENLABS_OUTPUT = 'mp3_44100_128';
const DEFAULT_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb';

export default {
  async fetch(request, env, _ctx) {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const secret = env.TTS_WORKER_SECRET;
    if (secret) {
      const auth = request.headers.get('Authorization') || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      if (token !== secret) {
        return new Response('Unauthorized', { status: 401 });
      }
    }

    const apiKey = env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'ELEVENLABS_API_KEY not set in Worker' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let body;
    try {
      body = await request.json();
    } catch (_) {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const text = body?.text;
    if (!text || typeof text !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing or invalid "text" in body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const voiceId = body.voice_id || env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${ELEVENLABS_OUTPUT}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text: text.trim(),
        model_id: ELEVENLABS_MODEL,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return new Response(
        JSON.stringify({ error: errText.slice(0, 500), status: response.status }),
        { status: response.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const audio = await response.arrayBuffer();
    return new Response(audio, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    });
  },
};
