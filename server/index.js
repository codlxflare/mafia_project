import 'dotenv/config';
import { fileURLToPath } from 'url';
import path from 'path';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { assignRoles, checkWin, getAlivePlayers, getAliveMafia, isMafiaForDetective, ROLES, MIN_PLAYERS } from './gameLogic.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDistPath = path.join(__dirname, '..', 'client', 'dist');
import { getHostLine, HOST_STYLE_IDS } from './hostAI.js';
import { checkTtsKey, synthesizeSpeech, isTtsConfigured } from './tts.js';

const app = express();
const httpServer = createServer(app);
const corsOrigin = process.env.CORS_ORIGIN ?? '*';
const io = new Server(httpServer, { cors: { origin: corsOrigin } });

app.use(express.json());

// Проверка ключа TTS (OpenAI или ElevenLabs — см. TTS_PROVIDER в .env).
app.get('/api/tts/check', async (req, res) => {
  try {
    const result = await checkTtsKey();
    res.json(result);
  } catch (e) {
    res.json({ ok: false, error: e.message || 'Ошибка проверки' });
  }
});

// ИИ-голос ведущего: OpenAI TTS или ElevenLabs (лучше русский). См. server/tts.js и .env.example
app.post('/api/tts', async (req, res) => {
  if (!isTtsConfigured()) {
    const provider = (process.env.TTS_PROVIDER || 'openai').toLowerCase();
    const keyName = provider === 'elevenlabs' ? 'ELEVENLABS_API_KEY' : 'OPENAI_API_KEY';
    res.status(503).json({ error: `TTS не настроен: задайте ${keyName} в server/.env` });
    return;
  }
  const { text, type } = req.body || {};
  if (!text || typeof text !== 'string' || text.length > 4000) {
    res.status(400).json({ error: 'Нужен текст до 4000 символов' });
    return;
  }
  try {
    const buffer = await synthesizeSpeech(text, { type });
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  } catch (e) {
    console.error('TTS error', e.message || e);
    const status = e.status === 403 ? 403 : e.status === 401 ? 401 : 502;
    res.status(status).json({ error: e.message || 'Ошибка сервера TTS' });
  }
});

app.use(express.static(clientDistPath, { fallthrough: true }));

// Если static не отдал индекс (нет сборки), подсказка для dev
app.get('/', (req, res) => {
  res.status(404).send(
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Мафия</title></head><body><p>В режиме разработки откройте <a href="http://localhost:5173">http://localhost:5173</a>.</p></body></html>'
  );
});

// Комнаты: code -> { creatorId, playerIds, playerNames, gameState, phase, announceQueue, announceInProgress, hostRecentLines }
const rooms = new Map();

/** Добавляет реплику ведущего в контекст комнаты (последние 8). */
function pushHostLine(room, line) {
  if (!room || !line) return;
  room.hostRecentLines = (room.hostRecentLines || []).concat(String(line).trim()).slice(-8);
}

/** Краткий контекст игры для ИИ: раунд, фаза, выбывшие, погибший прошлой ночью. */
function buildGameContext(room) {
  if (!room?.gameState) return undefined;
  const round = room.gameState.roundIndex ?? 1;
  const phase = room.phase || '—';
  const dead = Array.from(room.gameState.dead || []).map((id) => room.playerNames[id] || id).filter(Boolean);
  const lastKilled = room.gameState.lastKilled ? (room.playerNames[room.gameState.lastKilled] || room.gameState.lastKilled) : null;
  let s = `Раунд ${round}. Фаза: ${phase}.`;
  if (dead.length) s += ` Выбыли: ${dead.join(', ')}.`;
  if (lastKilled) s += ` Прошлой ночью погиб: ${lastKilled}.`;
  return s;
}

/** Обрабатывает очередь объявлений в лобби по одному (присоединился X — сразу одна реплика). */
async function processRoomAnnounces(io, code) {
  const room = rooms.get(code);
  if (!room || room.announceInProgress || !room.announceQueue?.length) return;
  room.announceInProgress = true;
  const item = room.announceQueue.shift();
  try {
    const line = await getHostLine(item.type, { ...item.data, voiceStyle: room.hostVoiceStyle, recentHostLines: (room.hostRecentLines || []).slice(-8), gameContext: buildGameContext(room) });
    io.to(code).emit('host_says', { text: line, type: item.type });
    pushHostLine(room, line);
  } finally {
    room.announceInProgress = false;
    if (room.announceQueue?.length > 0) processRoomAnnounces(io, code);
  }
}

function generateCode() {
  let code;
  do {
    code = String(Math.floor(100000 + Math.random() * 900000));
  } while (rooms.has(code));
  return code;
}

function getRoom(socket) {
  const code = socket.data.roomCode;
  return code ? rooms.get(code) : null;
}

/** Игрок в игре считается подключённым, если не в списке отключённых. */
function isConnected(room, playerId) {
  return !room.disconnectedIds?.has(playerId);
}

const MAX_PLAYER_NAME_LEN = 50;
/** Нормализует имя игрока: строка, trim, обрезка по длине. */
function normalizePlayerName(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s.slice(0, MAX_PLAYER_NAME_LEN) : null;
}
/** Код комнаты: 6 цифр. */
function isValidRoomCode(value) {
  if (value == null) return false;
  const s = String(value).trim();
  return s.length === 6 && /^\d{6}$/.test(s);
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const log = (tag, ...args) => console.log(`[Mafia:${tag}]`, ...args);

const readDelay = (envKey, defaultMs) => {
  const v = process.env[envKey];
  if (v === undefined || v === '') return defaultMs;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : defaultMs;
};

const NIGHT_WAIT_MS = readDelay('MAFIA_NIGHT_WAIT_MS', 90000);
const NIGHT_NUDGE_MS = readDelay('MAFIA_NIGHT_NUDGE_MS', 20000);
/** Первый нудж не раньше чем через N сек, чтобы не торопить сразу после «проснитесь». Один нудж на шаг. */
const NIGHT_NUDGE_FIRST_DELAY_MS = readDelay('MAFIA_NIGHT_NUDGE_FIRST_DELAY_MS', 28000);
/** Пауза перед репликой ведущего (мс), чтобы ощущалось «собирается сказать». */
const HOST_PAUSE_BEFORE_MS = readDelay('MAFIA_HOST_PAUSE_BEFORE_MS', 300);
/** Скорость озвучки: символов в секунду (русский TTS ~10–12). */
const SPEECH_CHARS_PER_SEC = readDelay('MAFIA_SPEECH_CHARS_PER_SEC', 10);
const SPEECH_BUFFER_MS = readDelay('MAFIA_SPEECH_BUFFER_MS', 800);
const SPEECH_MIN_MS = readDelay('MAFIA_SPEECH_MIN_MS', 2200);
const SPEECH_MAX_MS = readDelay('MAFIA_SPEECH_MAX_MS', 16000);

/** Длительность паузы после реплики (мс), с ±8% случайностью для естественного ритма. */
function speechDurationMs(text) {
  if (!text || typeof text !== 'string') return SPEECH_MIN_MS;
  const len = String(text).trim().length;
  let ms = (len / SPEECH_CHARS_PER_SEC) * 1000 + SPEECH_BUFFER_MS;
  ms = Math.round(ms * (0.92 + Math.random() * 0.16));
  return Math.min(SPEECH_MAX_MS, Math.max(SPEECH_MIN_MS, ms));
}

/** Пауза после реплики с учётом типа: для драматичных — чуть длиннее. */
function speechDurationAfterMs(text, type) {
  let ms = speechDurationMs(text);
  if (type === 'night_summary' || type === 'vote_result_summary') {
    ms = Math.round(ms * 1.15);
    return Math.min(SPEECH_MAX_MS, Math.max(SPEECH_MIN_MS, ms));
  }
  return ms;
}

/** Доп. пауза после «проснитесь», чтобы ведущий успел объявить перед показом выбора (только у создателя TTS). */
const DELAY_AFTER_WAKE_BEFORE_TURN_MS = readDelay('MAFIA_DELAY_AFTER_WAKE_BEFORE_TURN_MS', 1600);
/** Пауза после выбора перед «засыпайте» (отклик после клика). */
const DELAY_AFTER_CHOICE_BEFORE_SLEEP_MS = readDelay('MAFIA_DELAY_AFTER_CHOICE_BEFORE_SLEEP_MS', 600);
/** Макс. ожидание после короткой фразы «засыпайте» перед следующим шагом. */
const TRANSITION_PHRASE_MAX_MS = readDelay('MAFIA_TRANSITION_PHRASE_MAX_MS', 1400);

/** Игроки, которым нужен ход для данного шага (по socket id). */
function getPlayerIdsForNightStep(room, roleKey) {
  if (!room?.gameState) return [];
  const alive = getAlivePlayers(room.gameState);
  if (roleKey === 'mafia') return getAliveMafia(room.gameState);
  if (roleKey === 'don_decides') return alive.filter((id) => room.gameState.roles[id] === ROLES.don);
  if (roleKey === 'don_check') return alive.filter((id) => room.gameState.roles[id] === ROLES.don);
  if (roleKey === 'doctor') return alive.filter((id) => room.gameState.roles[id] === ROLES.doctor);
  if (roleKey === 'detective') return alive.filter((id) => room.gameState.roles[id] === ROLES.detective);
  return [];
}

/** Объявить шаг ночи всей комнате — кто должен ходить, решает клиент по своей роли. */
function emitNightTurn(io, code, roleKey) {
  const room = rooms.get(code);
  if (!room?.gameState) return;
  const alive = getAlivePlayers(room.gameState);
  const payload = { step: roleKey, round: room.gameState.roundIndex ?? 1, aliveIds: alive };
  if (roleKey === 'doctor') payload.doctorCanHealSelf = !room.gameState.doctorSelfHealed;
  log('Server', 'emitNightTurn', roleKey, 'code=', code, 'aliveCount=', alive.length);
  io.to(code).emit('night_turn', payload);
}

/** Объявить всей комнате конец шага — клиент сбрасывает ход, если step совпадает. */
function emitNightTurnEnd(io, code, roleKey) {
  log('Server', 'emitNightTurnEnd', roleKey);
  io.to(code).emit('night_turn_end', { step: roleKey });
}

const MAFIA_REVOTE_SEC = 10;

/** Подсчёт голосов мафии: возвращает { victimId, tied }. */
function countMafiaVotes(room) {
  const mafiaVotes = room.gameState.nightChoices.mafiaVotes || {};
  const alive = getAlivePlayers(room.gameState);
  const counts = {};
  Object.values(mafiaVotes).forEach((targetId) => {
    if (alive.includes(targetId)) counts[targetId] = (counts[targetId] || 0) + 1;
  });
  const entries = Object.entries(counts);
  if (entries.length === 0) return { victimId: null, tied: false };
  const max = Math.max(...entries.map((e) => e[1]));
  const best = entries.filter((e) => e[1] === max);
  if (best.length === 1) return { victimId: best[0][0], tied: false };
  return { victimId: null, tied: true };
}

/** Переголосование мафии при ничьей (10 сек), затем подсчёт. Возвращает victimId или null. */
async function mafiaRevoteAndResolve(io, code) {
  const room = rooms.get(code);
  if (!room?.gameState) return null;
  room.gameState.nightChoices.mafiaVotes = {};
  room.gameState.currentNightStep = 'mafia';
  io.to(code).emit('night_step', 'mafia');
  io.to(code).emit('mafia_tie_revote', { secondsLeft: MAFIA_REVOTE_SEC });
  await delay(MAFIA_REVOTE_SEC * 1000);
  const r = rooms.get(code);
  if (!r?.gameState || r.phase !== 'night') return null;
  const { victimId } = countMafiaVotes(r);
  return victimId;
}

/** Ждём выбор роли (мафия/доктор/детектив) или таймаут. Пока ждём — раз в NUDGE отправляем подбадривание. */
function waitForNightChoice(io, code, roleKey) {
  const room = rooms.get(code);
  if (room) room._nightWaitStep = roleKey;

  return new Promise((resolve) => {
    let resolved = false;
    let nudgeTimeoutId = null;
    const done = () => {
      if (resolved) return;
      resolved = true;
      const r = rooms.get(code);
      if (r) delete r._nightWaitDone;
      clearInterval(checkInterval);
      clearTimeout(timeout);
      if (nudgeTimeoutId != null) clearTimeout(nudgeTimeoutId);
      resolve();
    };
    if (room) room._nightWaitDone = done;

    const check = () => {
      const r = rooms.get(code);
      if (!r?.gameState || r.phase !== 'night') {
        done();
        return;
      }
      const alive = getAlivePlayers(r.gameState);
      const need =
        roleKey === 'mafia'
          ? getAliveMafia(r.gameState).some((id) => isConnected(r, id))
          : roleKey === 'don_decides' || roleKey === 'don_check'
            ? alive.some((id) => r.gameState.roles[id] === ROLES.don && isConnected(r, id))
            : roleKey === 'doctor'
              ? alive.some((id) => r.gameState.roles[id] === ROLES.doctor && isConnected(r, id))
              : roleKey === 'detective'
                ? alive.some((id) => r.gameState.roles[id] === ROLES.detective && isConnected(r, id))
                : false;
      if (!need) {
        const mafiaCount = r?.gameState ? getAliveMafia(r.gameState).length : 0;
        log('Server', 'waitForNightChoice DONE (no players for step)', roleKey, 'aliveMafia=', mafiaCount, 'playerIds=', r?.gameState?.playerIds?.length);
        done();
        return;
      }
      const mafiaIds = roleKey === 'mafia' ? getAliveMafia(r.gameState) : [];
      const mafiaConnected = roleKey === 'mafia' ? mafiaIds.filter((id) => isConnected(r, id)) : [];
      const has =
        roleKey === 'mafia'
          ? mafiaConnected.length > 0 && mafiaConnected.every((id) => r.gameState.nightChoices.mafiaVotes?.[id] != null)
          : roleKey === 'don_decides'
            ? r.gameState.nightChoices.donMafiaChoice !== undefined
            : roleKey === 'don_check'
              ? r.gameState.nightChoices.donCheckId != null
              : roleKey === 'doctor'
                ? r.gameState.nightChoices.doctor != null
                : roleKey === 'detective'
                  ? (r.gameState.nightChoices.detectiveCheckId != null || r.gameState.nightChoices.commissionerShotId != null)
                    : false;
      if (has) {
        log('Server', 'waitForNightChoice DONE (choice received)', roleKey);
        done();
        return;
      }
    };
    log('Server', 'waitForNightChoice START', roleKey, 'timeoutMs=', NIGHT_WAIT_MS);
    const checkInterval = setInterval(check, 200);
    const timeout = setTimeout(() => {
      if (!resolved) log('Server', 'waitForNightChoice TIMEOUT', roleKey);
      done();
    }, NIGHT_WAIT_MS);
    nudgeTimeoutId = setTimeout(async () => {
      if (resolved) return;
      const r = rooms.get(code);
      if (!r?.gameState || r.phase !== 'night' || r._nightWaitStep !== roleKey) return;
      const mafiaIds = roleKey === 'mafia' ? getAliveMafia(r.gameState) : [];
      const mafiaConnectedNudge = roleKey === 'mafia' ? mafiaIds.filter((id) => isConnected(r, id)) : [];
      const has =
        roleKey === 'mafia'
          ? mafiaConnectedNudge.length > 0 && mafiaConnectedNudge.every((id) => r.gameState.nightChoices.mafiaVotes?.[id] != null)
          : roleKey === 'don_decides'
            ? r.gameState.nightChoices.donMafiaChoice !== undefined
            : roleKey === 'don_check'
              ? r.gameState.nightChoices.donCheckId != null
              : roleKey === 'doctor'
                ? r.gameState.nightChoices.doctor != null
                : roleKey === 'detective'
                  ? (r.gameState.nightChoices.detectiveCheckId != null || r.gameState.nightChoices.commissionerShotId != null)
                  : false;
      if (has) return;
      log('Server', 'waitForNightChoice nudge (once)', roleKey);
      const nudgeKey = (roleKey === 'don_decides' || roleKey === 'don_check') ? 'night_nudge_mafia' : `night_nudge_${roleKey}`;
      const line = await getHostLine(nudgeKey, { voiceStyle: r?.hostVoiceStyle, recentHostLines: (r?.hostRecentLines || []).slice(-8), gameContext: buildGameContext(r) });
      if (resolved) return;
      const r2 = rooms.get(code);
      if (!r2?.gameState || r2.phase !== 'night' || r2._nightWaitStep !== roleKey) return;
      const mafiaIds2 = roleKey === 'mafia' ? getAliveMafia(r2.gameState).filter((id) => isConnected(r2, id)) : [];
      const hasNow =
        roleKey === 'mafia'
          ? mafiaIds2.length > 0 && mafiaIds2.every((id) => r2.gameState.nightChoices.mafiaVotes?.[id] != null)
          : roleKey === 'don_decides'
            ? r2.gameState.nightChoices.donMafiaChoice !== undefined
            : roleKey === 'don_check'
              ? r2.gameState.nightChoices.donCheckId != null
              : roleKey === 'doctor'
                ? r2.gameState.nightChoices.doctor != null
                : roleKey === 'detective'
                  ? (r2.gameState.nightChoices.detectiveCheckId != null || r2.gameState.nightChoices.commissionerShotId != null)
                  : false;
      if (hasNow) return;
      io.to(code).emit('host_says', { text: line, type: nudgeKey });
      pushHostLine(r2, line);
    }, NIGHT_NUDGE_FIRST_DELAY_MS);
    check();
  });
}

async function runNightSequence(io, code) {
  const room = rooms.get(code);
  log('Server', 'runNightSequence START', 'code=', code);
  if (!room?.gameState) {
    log('Server', 'runNightSequence ABORT no room/gameState');
    return;
  }
  clearDiscussionTurnTimeout(room);
  room.gameState.currentNightStep = null;
  io.to(code).emit('night_step', null);
  const round = room.gameState.roundIndex ?? 1;
  const alive = getAlivePlayers(room.gameState);
  const needMafia = getAliveMafia(room.gameState).length > 0;
  const needDoctor = alive.some((id) => room.gameState.roles[id] === ROLES.doctor);
  const needDetective = alive.some((id) => room.gameState.roles[id] === ROLES.detective);
  log('Server', 'night round', round, 'needMafia=', needMafia, 'needDoctor=', needDoctor, 'needDetective=', needDetective);

  const say = async (step, data = {}) => {
    const text = await getHostLine(step, { ...data, voiceStyle: room.hostVoiceStyle, recentHostLines: (room.hostRecentLines || []).slice(-8), gameContext: buildGameContext(room) });
    log('Server', 'host_says', step);
    io.to(code).emit('host_says', { text, type: step });
    pushHostLine(room, text);
    await delay(speechDurationAfterMs(text, step));
  };

  const sayTransition = async (step, data = {}) => {
    const text = await getHostLine(step, { ...data, voiceStyle: room.hostVoiceStyle, recentHostLines: (room.hostRecentLines || []).slice(-8), gameContext: buildGameContext(room) });
    log('Server', 'host_says', step);
    io.to(code).emit('host_says', { text, type: step });
    pushHostLine(room, text);
    await delay(Math.min(speechDurationMs(text), TRANSITION_PHRASE_MAX_MS));
  };

  await say('night_close_eyes', { round });

  log('Server', '--- MAFIA STEP ---');
  room.gameState.currentNightStep = 'mafia';
  room.gameState.nightChoices.mafiaVotes = {};
  io.to(code).emit('night_step', 'mafia');
  await say('night_mafia_wake', { round });
  await delay(DELAY_AFTER_WAKE_BEFORE_TURN_MS);
  io.to(code).emit('host_announced', 'night_mafia');
  emitNightTurn(io, code, 'mafia');
  await waitForNightChoice(io, code, 'mafia');
  let rAfterMafia = rooms.get(code);
  if (rAfterMafia?.gameState && rAfterMafia.phase === 'night') {
    let mafiaVictimId = null;
    const { victimId: firstCount, tied } = countMafiaVotes(rAfterMafia);
    if (tied) {
      const line = await getHostLine('night_mafia_tie', { voiceStyle: rAfterMafia.hostVoiceStyle, recentHostLines: (rAfterMafia.hostRecentLines || []).slice(-8), gameContext: buildGameContext(rAfterMafia) });
      io.to(code).emit('host_says', { text: line, type: 'night_mafia_tie' });
      pushHostLine(rAfterMafia, line);
      await delay(speechDurationMs(line));
      mafiaVictimId = await mafiaRevoteAndResolve(io, code);
      rAfterMafia = rooms.get(code);
      if (mafiaVictimId == null && rAfterMafia?.gameState && rAfterMafia.phase === 'night') {
        const al = getAlivePlayers(rAfterMafia.gameState);
        const donAlive = al.some((id) => rAfterMafia.gameState.roles[id] === ROLES.don);
        if (donAlive) {
          rAfterMafia.gameState.currentNightStep = 'don_decides';
          rAfterMafia.gameState.nightChoices.donMafiaChoice = undefined;
          io.to(code).emit('night_step', 'don_decides');
          await say('night_don_decides', { voiceStyle: rAfterMafia.hostVoiceStyle });
          await delay(DELAY_AFTER_WAKE_BEFORE_TURN_MS);
          io.to(code).emit('host_announced', 'night_don_decides');
          emitNightTurn(io, code, 'don_decides');
          await waitForNightChoice(io, code, 'don_decides');
          rAfterMafia = rooms.get(code);
          if (rAfterMafia?.gameState?.nightChoices?.donMafiaChoice !== undefined) {
            const choice = rAfterMafia.gameState.nightChoices.donMafiaChoice;
            mafiaVictimId = choice && al.includes(choice) ? choice : null;
          }
          await say('night_don_decides_chose', { voiceStyle: rAfterMafia.hostVoiceStyle });
          await delay(DELAY_AFTER_CHOICE_BEFORE_SLEEP_MS);
          emitNightTurnEnd(io, code, 'don_decides');
        }
      }
    } else {
      mafiaVictimId = firstCount;
    }
    rAfterMafia = rooms.get(code);
    if (rAfterMafia?.gameState) {
      rAfterMafia.gameState.nightChoices.mafia = mafiaVictimId ?? undefined;
      getAliveMafia(rAfterMafia.gameState).forEach((id) => io.to(id).emit('mafia_target_set', { targetId: mafiaVictimId ?? null }));
    }
  }
  log('Server', '--- MAFIA STEP DONE ---');
  await delay(DELAY_AFTER_CHOICE_BEFORE_SLEEP_MS);
  emitNightTurnEnd(io, code, 'mafia');
  room.gameState.currentNightStep = null;
  io.to(code).emit('night_step', null);
  await say('night_mafia_chose', { voiceStyle: room.hostVoiceStyle });
  await sayTransition('night_mafia_sleep');

  const needDonCheck = getAlivePlayers(room.gameState).some((id) => room.gameState.roles[id] === ROLES.don);
  if (needDonCheck) {
    room.gameState.currentNightStep = 'don_check';
    room.gameState.nightChoices.donCheckId = undefined;
    io.to(code).emit('night_step', 'don_check');
    await say('night_don_check_wake', { voiceStyle: room.hostVoiceStyle });
    await delay(DELAY_AFTER_WAKE_BEFORE_TURN_MS);
    io.to(code).emit('host_announced', 'night_don_check');
    emitNightTurn(io, code, 'don_check');
    await waitForNightChoice(io, code, 'don_check');
    const rDon = rooms.get(code);
    if (rDon?.gameState?.nightChoices?.donCheckId != null) {
      const donCheckId = rDon.gameState.nightChoices.donCheckId;
      const isDetective = rDon.gameState.roles[donCheckId] === ROLES.detective;
      const donIds = getPlayerIdsForNightStep(rDon, 'don_check');
      donIds.forEach((donId) => io.to(donId).emit('don_result', { targetId: donCheckId, isDetective }));
    }
    await delay(DELAY_AFTER_CHOICE_BEFORE_SLEEP_MS);
    emitNightTurnEnd(io, code, 'don_check');
    room.gameState.currentNightStep = null;
    io.to(code).emit('night_step', null);
    await say('night_don_check_chose', { voiceStyle: room.hostVoiceStyle });
    await sayTransition('night_don_check_sleep');
  }

  if (needDoctor) {
    room.gameState.currentNightStep = 'doctor';
    io.to(code).emit('night_step', 'doctor');
    await say('night_doctor_wake');
    await delay(DELAY_AFTER_WAKE_BEFORE_TURN_MS);
    io.to(code).emit('host_announced', 'night_doctor');
    emitNightTurn(io, code, 'doctor');
    await waitForNightChoice(io, code, 'doctor');
    await delay(DELAY_AFTER_CHOICE_BEFORE_SLEEP_MS);
    emitNightTurnEnd(io, code, 'doctor');
    room.gameState.currentNightStep = null;
    io.to(code).emit('night_step', null);
    await say('night_doctor_chose');
    await sayTransition('night_doctor_sleep');
  }

  if (needDetective) {
    room.gameState.currentNightStep = 'detective';
    io.to(code).emit('night_step', 'detective');
    await say('night_detective_wake');
    await delay(DELAY_AFTER_WAKE_BEFORE_TURN_MS);
    io.to(code).emit('host_announced', 'night_detective');
    emitNightTurn(io, code, 'detective');
    await waitForNightChoice(io, code, 'detective');
    await delay(DELAY_AFTER_CHOICE_BEFORE_SLEEP_MS);
    emitNightTurnEnd(io, code, 'detective');
    room.gameState.currentNightStep = null;
    io.to(code).emit('night_step', null);
    await say('night_detective_chose');
    await sayTransition('night_detective_sleep');
  }

  await say('night_morning');

  const r = rooms.get(code);
  if (!r?.gameState || r.phase !== 'night') return;
  const mafiaVictimId = r.gameState.nightChoices.mafia;
  const savedId = needDoctor ? r.gameState.nightChoices.doctor : null;
  const commissionerShotId = r.gameState.nightChoices.commissionerShotId ?? null;
  const al = getAlivePlayers(r.gameState);

  let mafiaKill = mafiaVictimId && al.includes(mafiaVictimId) ? mafiaVictimId : null;
  if (savedId === mafiaKill) mafiaKill = null;

  let commissionerKill = commissionerShotId && al.includes(commissionerShotId) ? commissionerShotId : null;
  if (savedId === commissionerKill) commissionerKill = null;

  const victimIds = [...new Set([mafiaKill, commissionerKill].filter(Boolean))];
  r.gameState.lastKilled = mafiaKill ?? commissionerKill ?? null;
  r.gameState.savedByDoctor = savedId;
  const detectiveCheckedId = needDetective ? r.gameState.nightChoices.detectiveCheckId : null;
  r.gameState.detectiveChecked = detectiveCheckedId;
  r.gameState.nightChoices = {};
  victimIds.forEach((id) => r.gameState.dead.add(id));

  const win = checkWin(r.gameState);
  if (win) {
    r.phase = 'ended';
    const avatars = r.playerAvatars || {};
    const ROLE_NAMES_RU = { mafia: 'мафия', don: 'дон', doctor: 'доктор', detective: 'детектив', civilian: 'мирный', lucky: 'везунчик', journalist: 'журналист' };
    const victims = victimIds.map((id) => ({
      name: r.playerNames[id],
      role: r.gameState.roles[id],
      roleName: ROLE_NAMES_RU[r.gameState.roles[id]] || r.gameState.roles[id],
      avatarId: avatars[id],
    }));
    const nightSummaryData = {
      round: r.gameState.roundIndex ?? 1,
      victimCount: victims.length,
      victims,
      savedByName: savedId ? r.playerNames[savedId] : null,
      savedAvatarId: savedId ? avatars[savedId] : null,
      detectiveCheckedName: detectiveCheckedId != null ? r.playerNames[detectiveCheckedId] : null,
      detectiveCheckedAvatarId: detectiveCheckedId != null ? avatars[detectiveCheckedId] : null,
      detectiveWasMafia: detectiveCheckedId != null ? isMafiaForDetective(r.gameState.roles[detectiveCheckedId]) : null,
      voiceStyle: r.hostVoiceStyle,
      killedName: victimIds[0] ? r.playerNames[victimIds[0]] : null,
      killedAvatarId: victimIds[0] ? avatars[victimIds[0]] : null,
    };
    await delay(HOST_PAUSE_BEFORE_MS);
    const dayLine = await getHostLine('night_summary', { ...nightSummaryData, recentHostLines: (r.hostRecentLines || []).slice(-8), gameContext: buildGameContext(r) });
    io.to(code).emit('host_says', { text: dayLine, type: 'night_summary' });
    pushHostLine(r, dayLine);
    await delay(speechDurationAfterMs(dayLine, 'night_summary'));
    const detectiveId = al.find((id) => r.gameState.roles[id] === ROLES.detective);
    if (detectiveId && r.gameState.detectiveChecked != null) {
      io.to(detectiveId).emit('detective_result', {
        targetId: r.gameState.detectiveChecked,
        isMafia: isMafiaForDetective(r.gameState.roles[r.gameState.detectiveChecked]),
      });
    }
    const rolesReveal = r.playerIds.map((id) => ({
      name: r.playerNames[id] || id,
      role: r.gameState.roles[id],
      avatarId: r.playerAvatars?.[id] ?? null,
    }));
    await delay(HOST_PAUSE_BEFORE_MS);
    const endLine = await getHostLine('game_end_summary', { winner: win, voiceStyle: r.hostVoiceStyle, recentHostLines: (r.hostRecentLines || []).slice(-8), gameContext: buildGameContext(r) });
    io.to(code).emit('host_says', { text: endLine, type: 'game_end_summary' });
    pushHostLine(r, endLine);
    await delay(speechDurationMs(endLine));
    await delay(HOST_PAUSE_BEFORE_MS);
    const revealLine = await getHostLine('game_end_reveal', { rolesReveal, voiceStyle: r.hostVoiceStyle, recentHostLines: (r.hostRecentLines || []).slice(-8), gameContext: buildGameContext(r) });
    io.to(code).emit('host_says', { text: revealLine, type: 'game_end_reveal' });
    pushHostLine(r, revealLine);
    await delay(speechDurationMs(revealLine));
    io.to(code).emit('phase', 'ended');
    io.to(code).emit('room_updated', roomForClient(r));
    const voteHistoryForClient = (r.voteHistory || []).map((v) => ({
      round: v.round,
      votes: v.tie ? null : Object.fromEntries(Object.entries(v.votes || {}).map(([id, targetId]) => [r.playerNames[id] || id, r.playerNames[targetId] || targetId])),
      excludedName: v.tie ? null : r.playerNames[v.excludedId],
      tie: v.tie,
    }));
    const gameEndPayload = {
      winner: win,
      roles: r.gameState.roles,
      playerNames: r.playerNames,
      voteHistory: voteHistoryForClient,
      battleLog: r.battleLog || [],
    };
    r.gameEndResult = gameEndPayload;
    io.to(code).emit('game_ended', gameEndPayload);
    log('Server', 'runNightSequence DONE -> ended (win after night)', 'winner=', win);
    return;
  }

  if (checkWin(r.gameState)) return;
  r.phase = 'day';
  const avatars = r.playerAvatars || {};
  const ROLE_NAMES_RU = { mafia: 'мафия', don: 'дон', doctor: 'доктор', detective: 'детектив', civilian: 'мирный', lucky: 'везунчик', journalist: 'журналист' };
  const victims = victimIds.map((id) => ({
    name: r.playerNames[id],
    role: r.gameState.roles[id],
    roleName: ROLE_NAMES_RU[r.gameState.roles[id]] || r.gameState.roles[id],
    avatarId: avatars[id],
  }));
  const nightSummaryData = {
    round: r.gameState.roundIndex ?? 1,
    victimCount: victims.length,
    victims,
    savedByName: savedId ? r.playerNames[savedId] : null,
    savedAvatarId: savedId ? avatars[savedId] : null,
    detectiveCheckedName: detectiveCheckedId != null ? r.playerNames[detectiveCheckedId] : null,
    detectiveCheckedAvatarId: detectiveCheckedId != null ? avatars[detectiveCheckedId] : null,
    detectiveWasMafia: detectiveCheckedId != null ? isMafiaForDetective(r.gameState.roles[detectiveCheckedId]) : null,
    voiceStyle: r.hostVoiceStyle,
    killedName: victimIds[0] ? r.playerNames[victimIds[0]] : null,
    killedAvatarId: victimIds[0] ? avatars[victimIds[0]] : null,
  };
  await delay(HOST_PAUSE_BEFORE_MS);
  const dayLine = await getHostLine('night_summary', { ...nightSummaryData, recentHostLines: (r.hostRecentLines || []).slice(-8), gameContext: buildGameContext(r) });
  io.to(code).emit('host_says', { text: dayLine, type: 'night_summary' });
  pushHostLine(r, dayLine);
  await delay(speechDurationAfterMs(dayLine, 'night_summary'));
  const detectiveId = al.find((id) => r.gameState.roles[id] === ROLES.detective);
  if (detectiveId && r.gameState.detectiveChecked != null) {
    io.to(detectiveId).emit('detective_result', {
      targetId: r.gameState.detectiveChecked,
      isMafia: isMafiaForDetective(r.gameState.roles[r.gameState.detectiveChecked]),
    });
  }
  io.to(code).emit('host_announced', 'day');
  if (r.battleLog) r.battleLog.push({ type: 'night_end', round: r.gameState.roundIndex ?? 1, killed: victimIds.map((id) => r.playerNames[id]) });
  log('Server', 'runNightSequence DONE -> day', 'killed=', victimIds.length ? victimIds.map((id) => r.playerNames[id]) : null);
  io.to(code).emit('phase', 'day');
  io.to(code).emit('room_updated', roomForClient(r));
  const aliveCount = getAlivePlayers(r.gameState).length;
  const turnSec = r.discussionTurnSec ?? 60;
  const discussionTotalSec = turnSec * Math.max(1, aliveCount);
  io.to(code).emit('day_started', {
    killed: victimIds[0] ?? null,
    killedIds: victimIds,
    alive: getAlivePlayers(r.gameState),
    roundIndex: r.gameState.roundIndex,
    discussionTimerSec: discussionTotalSec,
    discussionTotalSec,
    discussionTurnSec: turnSec,
  });
  r.discussionTurnIndex = 0;
  scheduleNextDiscussionTurn(io, code);
}

/** Очищает таймер очереди слова на обсуждении (при смене фазы с day). */
function clearDiscussionTurnTimeout(room) {
  if (room?.discussionTurnTimeout != null) {
    clearTimeout(room.discussionTurnTimeout);
    room.discussionTurnTimeout = null;
  }
  delete room?._currentDiscussionTurn;
  delete room?._currentDiscussionTurnEndTime;
}

/** По очереди даёт слово каждому живому игроку на обсуждении; при start_voting таймер очищается. */
function scheduleNextDiscussionTurn(io, code) {
  const room = rooms.get(code);
  if (!room?.gameState || room.phase !== 'day') return;
  const alive = getAlivePlayers(room.gameState);
  if (alive.length === 0) return;
  const idx = room.discussionTurnIndex ?? 0;
  const playerId = alive[idx % alive.length];
  const playerName = room.playerNames[playerId] || 'Игрок';
  const turnSec = room.discussionTurnSec ?? 60;
  room._currentDiscussionTurn = { playerId, playerName, turnSec };
  room._currentDiscussionTurnEndTime = Date.now() + turnSec * 1000;
  io.to(code).emit('discussion_turn_start', { playerId, playerName, turnSec });
  room.discussionTurnTimeout = setTimeout(() => {
    room.discussionTurnTimeout = null;
    delete room._currentDiscussionTurn;
    delete room._currentDiscussionTurnEndTime;
    io.to(code).emit('discussion_turn_end', { playerId });
    room.discussionTurnIndex = idx + 1;
    scheduleNextDiscussionTurn(io, code);
  }, turnSec * 1000);
}

/** Возвращает только сериализуемые поля комнаты для emit (без Set, циклов, таймеров). */
function roomForClient(room) {
  if (!room) return null;
  const r = {
    playerIds: Array.isArray(room.playerIds) ? room.playerIds.slice() : [],
    playerNames: room.playerNames && typeof room.playerNames === 'object' ? { ...room.playerNames } : {},
    playerAvatars: room.playerAvatars && typeof room.playerAvatars === 'object' ? { ...room.playerAvatars } : {},
    phase: room.phase,
  };
  if (room.discussionTimerSec != null) r.discussionTimerSec = room.discussionTimerSec;
  if (room.discussionTurnSec != null) r.discussionTurnSec = room.discussionTurnSec;
  if (room.hostVoiceStyle != null) r.hostVoiceStyle = room.hostVoiceStyle;
  if (room.voteTieFavorites != null) r.voteTieFavorites = room.voteTieFavorites;
  if (room.disconnectedIds?.size) r.disconnectedIds = [...room.disconnectedIds];
  if (room.gameState) {
    r.gameState = {
      dead: Array.from(room.gameState.dead || []),
      playerIds: Array.isArray(room.gameState.playerIds) ? room.gameState.playerIds.slice() : [],
      roundIndex: room.gameState.roundIndex,
    };
  }
  return r;
}

io.on('connection', (socket) => {
  socket.on('create_room', (playerName, cb) => {
    if (socket.data.roomCode) {
      cb({ error: 'Уже в комнате' });
      return;
    }
    const name = normalizePlayerName(playerName) || 'Ведущий';
    const code = generateCode();
    socket.data.roomCode = code;
    socket.data.playerId = socket.id;
    socket.data.isCreator = true;
    socket.join(code);
    rooms.set(code, {
      creatorId: socket.id,
      playerIds: [socket.id],
      playerNames: { [socket.id]: name },
      playerAvatars: { [socket.id]: 'fox' },
      gameState: null,
      phase: 'lobby',
      announceQueue: [],
      announceInProgress: false,
      discussionTimerSec: 120,
      discussionTurnSec: 60,
      hostVoiceStyle: 'funny',
      hostRecentLines: [],
      voteHistory: [],
      battleLog: [],
    });
    cb({ code, playerId: socket.id });
    io.to(code).emit('room_updated', roomForClient(rooms.get(code)));
    const roomCreated = rooms.get(code);
    getHostLine('room_created', { creatorName: name, need: MIN_PLAYERS, voiceStyle: roomCreated?.hostVoiceStyle, recentHostLines: (roomCreated?.hostRecentLines || []).slice(-8), gameContext: buildGameContext(roomCreated) }).then((line) => {
      io.to(code).emit('host_says', { text: line, type: 'room_created' });
      pushHostLine(roomCreated, line);
    });
  });

  socket.on('join_room', (payload, cb) => {
    if (!payload || typeof payload !== 'object') {
      cb({ error: 'Неверные данные' });
      return;
    }
    const rawCode = payload.code;
    const trimmedCode = isValidRoomCode(rawCode) ? String(rawCode).trim() : null;
    if (!trimmedCode) {
      cb({ error: 'Неверный код комнаты' });
      return;
    }
    const room = rooms.get(trimmedCode);
    if (!room) {
      cb({ error: 'Комната не найдена' });
      return;
    }
    if (room.phase !== 'lobby') {
      cb({ error: 'Игра уже идёт' });
      return;
    }
    if (room.playerIds.length >= 12) {
      cb({ error: 'Комната заполнена' });
      return;
    }
    if (room.playerIds.includes(socket.id)) {
      cb({ joined: true, playerId: socket.id });
      return;
    }
    if (socket.data.roomCode) {
      cb({ error: 'Уже в другой комнате' });
      return;
    }
    const name = normalizePlayerName(payload.playerName) || `Игрок ${room.playerIds.length + 1}`;
    const lobbyDisconnected = room.lobbyDisconnectedIds || new Set();
    const reconnectingId = [...lobbyDisconnected].find((id) => room.playerNames[id] === name);
    if (reconnectingId != null) {
      replacePlayerIdInRoom(room, reconnectingId, socket.id);
      lobbyDisconnected.delete(reconnectingId);
      if (lobbyDisconnected.size === 0) delete room.lobbyDisconnectedIds;
      else room.lobbyDisconnectedIds = lobbyDisconnected;
      socket.data.roomCode = trimmedCode;
      socket.data.playerId = socket.id;
      socket.join(trimmedCode);
      cb({ joined: true, playerId: socket.id, isCreator: room.creatorId === socket.id });
      io.to(trimmedCode).emit('room_updated', roomForClient(rooms.get(trimmedCode)));
      return;
    }
    socket.data.roomCode = trimmedCode;
    socket.data.playerId = socket.id;
    socket.join(trimmedCode);
    room.playerIds.push(socket.id);
    room.playerNames[socket.id] = name;
    if (!room.playerAvatars) room.playerAvatars = {};
    room.playerAvatars[socket.id] = room.playerAvatars[socket.id] || 'bear';
    cb({ joined: true, playerId: socket.id, isCreator: false });
    io.to(trimmedCode).emit('room_updated', roomForClient(rooms.get(trimmedCode)));
    const need = MIN_PLAYERS;
    const count = room.playerIds.length;
    if (!room.announceQueue) room.announceQueue = [];
    if (room.announceInProgress === undefined) room.announceInProgress = false;
    room.announceQueue.push({
      type: 'player_joined',
      data: { playerName: name, count, need },
    });
    processRoomAnnounces(io, trimmedCode);
  });

  /** Заменить игрока oldId на newId во всех структурах комнаты (для rejoin после дисконнекта). */
  function replacePlayerIdInRoom(room, oldId, newId) {
    const idx = room.playerIds.indexOf(oldId);
    if (idx >= 0) room.playerIds[idx] = newId;
    if (room.playerNames[oldId] != null) {
      room.playerNames[newId] = room.playerNames[oldId];
      delete room.playerNames[oldId];
    }
    if (room.playerAvatars && room.playerAvatars[oldId] != null) {
      room.playerAvatars[newId] = room.playerAvatars[oldId];
      delete room.playerAvatars[oldId];
    }
    if (room.creatorId === oldId) room.creatorId = newId;
    if (room.gameState) {
      const gs = room.gameState;
      if (Array.isArray(gs.playerIds)) {
        const pi = gs.playerIds.indexOf(oldId);
        if (pi >= 0) gs.playerIds[pi] = newId;
      }
      if (gs.roles[oldId] != null) {
        gs.roles[newId] = gs.roles[oldId];
        delete gs.roles[oldId];
      }
      if (gs.dead?.has(oldId)) {
        gs.dead.delete(oldId);
        gs.dead.add(newId);
      }
      if (gs.lastKilled === oldId) gs.lastKilled = newId;
      if (gs.detectiveChecked === oldId) gs.detectiveChecked = newId;
      if (gs.lastCommissionerShotId === oldId) gs.lastCommissionerShotId = newId;
      if (gs.savedByDoctor === oldId) gs.savedByDoctor = newId;
      const nc = gs.nightChoices || {};
      if (nc.doctor === oldId) nc.doctor = newId;
      if (nc.mafia === oldId) nc.mafia = newId;
      if (nc.detectiveCheckId === oldId) nc.detectiveCheckId = newId;
      if (nc.commissionerShotId === oldId) nc.commissionerShotId = newId;
      if (nc.donMafiaChoice === oldId) nc.donMafiaChoice = newId;
      if (nc.donCheckId === oldId) nc.donCheckId = newId;
      if (nc.mafiaVotes && nc.mafiaVotes[oldId] !== undefined) {
        const target = nc.mafiaVotes[oldId];
        delete nc.mafiaVotes[oldId];
        nc.mafiaVotes[newId] = target;
      }
      Object.keys(nc.mafiaVotes || {}).forEach((voterId) => {
        if (nc.mafiaVotes[voterId] === oldId) nc.mafiaVotes[voterId] = newId;
      });
    }
    if (room.votes && room.votes[oldId] !== undefined) {
      room.votes[newId] = room.votes[oldId];
      delete room.votes[oldId];
    }
    if (room.votes) {
      Object.keys(room.votes).forEach((voterId) => {
        if (room.votes[voterId] === oldId) room.votes[voterId] = newId;
      });
    }
    if (Array.isArray(room.voteTieFavorites)) {
      room.voteTieFavorites = room.voteTieFavorites.map((id) => (id === oldId ? newId : id));
    }
    (room.voteHistory || []).forEach((v) => {
      if (v.votes && v.votes[oldId] !== undefined) {
        v.votes[newId] = v.votes[oldId];
        delete v.votes[oldId];
      }
      Object.keys(v.votes || {}).forEach((vid) => {
        if (v.votes[vid] === oldId) v.votes[vid] = newId;
      });
      if (v.excludedId === oldId) v.excludedId = newId;
    });
    room.disconnectedIds?.delete(oldId);
    room.lobbyDisconnectedIds?.delete(oldId);
  }

  socket.on('rejoin_room', (payload, cb) => {
    if (!payload || typeof payload !== 'object') {
      cb({ error: 'Неверные данные' });
      return;
    }
    const trimmedCode = isValidRoomCode(payload.code) ? String(payload.code).trim() : null;
    if (!trimmedCode) {
      cb({ error: 'Неверный код комнаты' });
      return;
    }
    const room = rooms.get(trimmedCode);
    if (!room) {
      cb({ error: 'Комната не найдена' });
      return;
    }
    if (room.phase === 'lobby') {
      cb({ error: 'Используйте «Войти по коду» — игра ещё не началась' });
      return;
    }
    if (!room.disconnectedIds?.size) {
      cb({ error: 'Нет отключённых игроков для возвращения' });
      return;
    }
    const name = normalizePlayerName(payload.playerName) || '';
    if (!name) {
      cb({ error: 'Введите имя, под которым вы были в комнате' });
      return;
    }
    const oldId = [...(room.disconnectedIds || [])].find((id) => room.playerNames[id] === name);
    if (!oldId) {
      cb({ error: 'В комнате нет отключённого игрока с таким именем. Введите имя точно как при первом входе.' });
      return;
    }
    if (socket.data.roomCode) {
      cb({ error: 'Уже в другой комнате' });
      return;
    }
    replacePlayerIdInRoom(room, oldId, socket.id);
    socket.data.roomCode = trimmedCode;
    socket.data.playerId = socket.id;
    socket.data.isCreator = room.creatorId === socket.id;
    socket.join(trimmedCode);
    cb({ joined: true, playerId: socket.id, isCreator: room.creatorId === socket.id });
    io.to(trimmedCode).emit('room_updated', roomForClient(room));
    socket.emit('phase', room.phase);
    socket.emit('your_role', room.gameState.roles[socket.id]);
    if (room.phase === 'night' && room.gameState.currentNightStep) {
      socket.emit('night_step', room.gameState.currentNightStep);
      const roleKey = room.gameState.currentNightStep;
      const alive = getAlivePlayers(room.gameState);
      const payload = { step: roleKey, round: room.gameState.roundIndex ?? 1, aliveIds: alive };
      if (roleKey === 'doctor') payload.doctorCanHealSelf = !room.gameState.doctorSelfHealed;
      socket.emit('night_turn', payload);
    }
    if (room.phase === 'day' || room.phase === 'voting') {
      const alive = getAlivePlayers(room.gameState);
      const turnSec = room.discussionTurnSec ?? 60;
      const totalSec = turnSec * Math.max(1, alive.length);
      socket.emit('day_started', {
        killed: null,
        killedIds: [],
        alive,
        roundIndex: room.gameState.roundIndex ?? 1,
        discussionTimerSec: totalSec,
        discussionTotalSec: totalSec,
        discussionTurnSec: turnSec,
      });
    }
    if (room.phase === 'voting' && room.votes && Object.keys(room.votes).length > 0) {
      const alive = getAlivePlayers(room.gameState);
      const canVote = room.voteTieFavorites?.length
        ? alive.filter((id) => !room.voteTieFavorites.includes(id))
        : alive;
      const counts = {};
      Object.entries(room.votes).forEach(([voterId, target]) => {
        if (canVote.includes(voterId) && alive.includes(target)) {
          counts[target] = (counts[target] || 0) + 1;
        }
      });
      socket.emit('vote_counts', { counts: { ...counts } });
    }
    if (room.phase === 'day' || room.phase === 'voting') {
      socket.emit('host_announced', 'day');
      if (room.phase === 'day' && room._currentDiscussionTurn) {
        const t = room._currentDiscussionTurn;
        const fullSec = room.discussionTurnSec ?? 60;
        const secLeft = room._currentDiscussionTurnEndTime != null
          ? Math.max(1, Math.ceil((room._currentDiscussionTurnEndTime - Date.now()) / 1000))
          : t.turnSec;
        socket.emit('discussion_turn_start', { playerId: t.playerId, playerName: t.playerName, turnSec: secLeft, totalTurnSec: fullSec });
      }
    }
    if (room.phase === 'voting' && room.voteTieFavorites?.length && room._voteTieBreakEndTime != null) {
      const secLeft = Math.max(0, Math.ceil((room._voteTieBreakEndTime - Date.now()) / 1000));
      socket.emit('vote_tie_break', { secondsLeft: secLeft });
    }
    if (room.phase === 'voting' && room._excludedForLastWords) {
      socket.emit('player_excluded', room._excludedForLastWords);
    }
    if (room.phase === 'ended' && room.gameEndResult) {
      socket.emit('game_ended', room.gameEndResult);
    }
  });

  socket.on('room_settings', (opts, cb) => {
    const room = getRoom(socket);
    if (!room || room.creatorId !== socket.id || room.phase !== 'lobby') return cb?.({ error: 'not_creator' });
    if (opts?.discussionTimerSec != null) room.discussionTimerSec = Math.max(60, Math.min(300, Number(opts.discussionTimerSec) || 120));
    if (opts?.discussionTurnSec != null) room.discussionTurnSec = Math.max(30, Math.min(120, Number(opts.discussionTurnSec) || 60));
    if (opts?.hostVoiceStyle != null) room.hostVoiceStyle = HOST_STYLE_IDS.includes(opts.hostVoiceStyle) ? opts.hostVoiceStyle : 'funny';
    cb?.({ ok: true });
    io.to(socket.data.roomCode).emit('room_updated', roomForClient(rooms.get(socket.data.roomCode)));
  });

  const VALID_AVATARS = new Set(['fox', 'bear', 'wolf', 'owl', 'cat', 'dog', 'tiger', 'rabbit', 'dragon', 'unicorn', 'frog', 'panda', 'lion', 'monkey', 'butterfly', 'raccoon']);
  socket.on('set_avatar', (avatarId, cb) => {
    const room = getRoom(socket);
    if (!room) return cb?.({ error: 'no_room' });
    const id = VALID_AVATARS.has(avatarId) ? avatarId : 'fox';
    if (!room.playerAvatars) room.playerAvatars = {};
    room.playerAvatars[socket.id] = id;
    io.to(socket.data.roomCode).emit('room_updated', roomForClient(rooms.get(socket.data.roomCode)));
    cb?.({ ok: true });
  });

  socket.on('start_game', async () => {
    const room = getRoom(socket);
    if (!room || room.creatorId !== socket.id || room.phase !== 'lobby') return;
    if (room.playerIds.length < MIN_PLAYERS) return;
    if (room._runNightRunning) {
      log('Server', 'start_game IGNORED (night already running)');
      return;
    }
    const roles = assignRoles(room.playerIds);
    room.voteHistory = [];
    room.battleLog = [];
    room.gameState = {
      roles,
      playerIds: room.playerIds,
      dead: new Set(),
      lastKilled: null,
      savedByDoctor: null,
      detectiveChecked: null,
      nightChoices: {},
      roundIndex: 1,
      currentNightStep: null,
      doctorSelfHealed: false,
      lastCommissionerShotId: null,
      voteTieFavorites: null,
    };
    room.phase = 'roles';
    room.disconnectedIds = new Set(room.lobbyDisconnectedIds || []);
    delete room.lobbyDisconnectedIds;
    room.hostRecentLines = [];
    const code = socket.data.roomCode;
    io.to(code).emit('game_started', { playerIds: room.playerIds, phase: 'roles', roundIndex: 1 });
    const startLine = await getHostLine('game_start', { voiceStyle: room.hostVoiceStyle, recentHostLines: (room.hostRecentLines || []).slice(-8), gameContext: buildGameContext(room) });
    io.to(code).emit('host_says', { text: startLine, type: 'game_start' });
    pushHostLine(room, startLine);
    await delay(speechDurationMs(startLine));
    room.playerIds.forEach((id) => io.to(id).emit('your_role', roles[id]));
    const DELAY_AFTER_ROLES_REVEAL_MS = readDelay('MAFIA_DELAY_AFTER_ROLES_REVEAL_MS', 5500);
    await delay(DELAY_AFTER_ROLES_REVEAL_MS);
    const roleCounts = {};
    Object.values(roles).forEach((r) => { roleCounts[r] = (roleCounts[r] || 0) + 1; });
    const rolesDoneLine = await getHostLine('roles_done', {
      playerCount: room.playerIds.length,
      roleCounts,
      voiceStyle: room.hostVoiceStyle,
      recentHostLines: (room.hostRecentLines || []).slice(-8),
      gameContext: buildGameContext(room),
    });
    io.to(code).emit('host_says', { text: rolesDoneLine, type: 'roles_done' });
    pushHostLine(room, rolesDoneLine);
    io.to(code).emit('phase', 'roles_done');
    await delay(speechDurationMs(rolesDoneLine));
    const rulesLine = await getHostLine('rules_explanation', { voiceStyle: room.hostVoiceStyle, recentHostLines: (room.hostRecentLines || []).slice(-8), gameContext: buildGameContext(room) });
    io.to(code).emit('host_says', { text: rulesLine, type: 'rules_explanation' });
    pushHostLine(room, rulesLine);
    await delay(speechDurationMs(rulesLine));
    const DELAY_AFTER_ROLES_DONE_BEFORE_NIGHT_MS = readDelay('MAFIA_DELAY_AFTER_ROLES_DONE_BEFORE_NIGHT_MS', 1800);
    await delay(DELAY_AFTER_ROLES_DONE_BEFORE_NIGHT_MS);
    log('Server', 'start_game -> phase night, running runNightSequence');
    room.phase = 'night';
    io.to(code).emit('phase', 'night');
    io.to(code).emit('room_updated', roomForClient(room));
    room._runNightRunning = true;
    runNightSequence(io, code).finally(() => {
      const r = rooms.get(code);
      if (r) delete r._runNightRunning;
    });
  });

  socket.on('night_choice', (payload) => {
    const room = getRoom(socket);
    log('Server', 'night_choice received', 'socketId=', socket.id, 'phase=', room?.phase, 'payloadKeys=', Object.keys(payload || {}));
    if (!room?.gameState || room.phase !== 'night') {
      log('Server', 'night_choice IGNORED (no room/gameState or phase !== night)');
      return;
    }
    const alive = getAlivePlayers(room.gameState);
    const role = room.gameState.roles[socket.id];
    if (payload.victimId !== undefined && (role === ROLES.mafia || role === ROLES.don)) {
      const id = payload.victimId;
      if (alive.includes(id)) {
        if (!room.gameState.nightChoices.mafiaVotes) room.gameState.nightChoices.mafiaVotes = {};
        room.gameState.nightChoices.mafiaVotes[socket.id] = id;
        log('Server', 'night_choice SET mafia vote', socket.id, '->', id);
      }
    }
    if (payload.savedId !== undefined && role === ROLES.doctor) {
      const id = payload.savedId;
      if (alive.includes(id) || id === socket.id) {
        room.gameState.nightChoices.doctor = id;
        if (id === socket.id) room.gameState.doctorSelfHealed = true;
        log('Server', 'night_choice SET doctor savedId=', id);
      }
    }
    if (payload.checkId !== undefined && role === ROLES.detective) {
      const id = payload.checkId;
      if (alive.includes(id)) {
        room.gameState.nightChoices.detectiveCheckId = id;
        room.gameState.nightChoices.commissionerShotId = undefined;
        log('Server', 'night_choice SET detective checkId=', id);
        io.to(socket.id).emit('detective_result', {
          targetId: id,
          isMafia: isMafiaForDetective(room.gameState.roles[id]),
        });
      }
    }
    if (payload.shootId !== undefined && role === ROLES.detective) {
      const id = payload.shootId;
      if (alive.includes(id)) {
        room.gameState.nightChoices.commissionerShotId = id;
        room.gameState.nightChoices.detectiveCheckId = undefined;
        log('Server', 'night_choice SET commissioner shootId=', id);
      }
    }
    if (room.gameState.currentNightStep === 'don_decides' && role === ROLES.don) {
      const id = payload.victimId;
      if (id === null || id === undefined) {
        room.gameState.nightChoices.donMafiaChoice = null;
        log('Server', 'night_choice SET don decides: nobody');
      } else if (alive.includes(id)) {
        room.gameState.nightChoices.donMafiaChoice = id;
        log('Server', 'night_choice SET don decides victim=', id);
      }
    }
    if (room.gameState.currentNightStep === 'don_check' && role === ROLES.don && payload.donCheckId !== undefined) {
      const id = payload.donCheckId;
      if (alive.includes(id)) {
        room.gameState.nightChoices.donCheckId = id;
        log('Server', 'night_choice SET don check target=', id);
      }
    }
    socket.emit('choice_received');
    io.to(socket.data.roomCode).emit('room_updated', roomForClient(room));

    const step = room.gameState.currentNightStep;
    if (step === 'mafia') {
      const mafiaVotes = room.gameState.nightChoices.mafiaVotes || {};
      const byTarget = {};
      Object.entries(mafiaVotes).forEach(([, targetId]) => {
        if (!byTarget[targetId]) {
          byTarget[targetId] = {
            targetId,
            name: room.playerNames[targetId] || targetId,
            avatarId: room.playerAvatars?.[targetId] ?? null,
            count: 0,
          };
        }
        byTarget[targetId].count += 1;
      });
      const votesByTarget = Object.values(byTarget);
      getAliveMafia(room.gameState).forEach((id) => io.to(id).emit('mafia_votes', { votesByTarget }));
    }
    if (!step) return;
    const mafiaAll = step === 'mafia' && getAliveMafia(room.gameState).every((id) => room.gameState.nightChoices.mafiaVotes?.[id] != null);
    const donDecidesAll = step === 'don_decides' && room.gameState.nightChoices.donMafiaChoice !== undefined;
    const donCheckAll = step === 'don_check' && room.gameState.nightChoices.donCheckId != null;
    const complete =
      mafiaAll ||
      donDecidesAll ||
      donCheckAll ||
      (step === 'doctor' && room.gameState.nightChoices.doctor != null) ||
      (step === 'detective' && (room.gameState.nightChoices.detectiveCheckId != null || room.gameState.nightChoices.commissionerShotId != null));
    if (complete && room._nightWaitDone) {
      log('Server', 'night_choice completes step, resolving wait', step);
      room._nightWaitDone();
    }
  });

  const GET_NIGHT_STATE_COOLDOWN_MS = 2000;
  socket.on('get_night_state', () => {
    const now = Date.now();
    if ((socket.data.lastGetNightState || 0) + GET_NIGHT_STATE_COOLDOWN_MS > now) return;
    socket.data.lastGetNightState = now;
    const room = getRoom(socket);
    if (!room) return;
    socket.emit('phase', room.phase);
    if (room.phase === 'night' && room.gameState?.currentNightStep) {
      const step = room.gameState.currentNightStep;
      socket.emit('night_step', step);
      socket.emit('host_announced', `night_${step}`);
      const alive = getAlivePlayers(room.gameState);
      const payload = { step, round: room.gameState.roundIndex ?? 1, aliveIds: alive };
      if (step === 'doctor') payload.doctorCanHealSelf = !room.gameState.doctorSelfHealed;
      socket.emit('night_turn', payload);
    }
  });

  // Альтернативный путь завершения ночи (текущий клиент не использует; основной сценарий — runNightSequence).
  socket.on('night_phase_done', async (payload) => {
    const room = getRoom(socket);
    if (!room?.gameState || room.phase !== 'night') return;
    const { victimId, savedId, checkId } = payload || {};
    const alive = getAlivePlayers(room.gameState);
    let target = victimId && alive.includes(victimId) ? victimId : null;
    if (savedId === target) target = null;
    room.gameState.lastKilled = target;
    room.gameState.savedByDoctor = savedId;
    room.gameState.detectiveChecked = checkId;
    room.phase = 'day';
    if (target) room.gameState.dead.add(target);
    const avatars = room.playerAvatars || {};
    const nightSummaryData = {
      round: room.gameState.roundIndex ?? 1,
      killedName: target ? room.playerNames[target] : null,
      killedAvatarId: target ? avatars[target] : null,
      savedByName: savedId ? room.playerNames[savedId] : null,
      savedAvatarId: savedId ? avatars[savedId] : null,
      detectiveCheckedName: checkId != null ? room.playerNames[checkId] : null,
      detectiveCheckedAvatarId: checkId != null ? avatars[checkId] : null,
      detectiveWasMafia: checkId != null ? isMafiaForDetective(room.gameState.roles[checkId]) : null,
    };
    await delay(HOST_PAUSE_BEFORE_MS);
    const dayLine = await getHostLine('night_summary', { ...nightSummaryData, voiceStyle: room.hostVoiceStyle, recentHostLines: (room.hostRecentLines || []).slice(-8), gameContext: buildGameContext(room) });
    io.to(socket.data.roomCode).emit('host_says', { text: dayLine, type: 'night_summary' });
    pushHostLine(room, dayLine);
    io.to(socket.data.roomCode).emit('phase', 'day');
    io.to(socket.data.roomCode).emit('day_started', {
      killed: target,
      alive: getAlivePlayers(room.gameState),
      roundIndex: room.gameState.roundIndex,
    });
  });

  const VOTE_TIE_BREAK_SEC = 30;
  const ROLE_NAMES_RU = { mafia: 'мафия', don: 'дон', doctor: 'доктор', detective: 'детектив', civilian: 'мирный', lucky: 'везунчик', journalist: 'журналист' };

  socket.on('vote', async (targetId) => {
    const room = getRoom(socket);
    if (!room?.gameState || room.phase !== 'voting') return;
    const alive = getAlivePlayers(room.gameState);
    const favorites = room.voteTieFavorites;
    if (favorites) {
      if (favorites.includes(socket.id)) return;
      if (!favorites.includes(targetId)) return;
    } else {
      if (!alive.includes(targetId)) return;
    }
    if (!room.votes) room.votes = {};
    room.votes[socket.id] = targetId;
    socket.emit('vote_received');
    const canVoteBase = favorites ? alive.filter((id) => !favorites.includes(id)) : alive;
    const canVote = canVoteBase.filter((id) => isConnected(room, id));
    // Текущие промежуточные счётчики голосов — для отображения над игроками.
    const currentCounts = {};
    Object.entries(room.votes || {}).forEach(([voterId, target]) => {
      if (canVote.includes(voterId) && alive.includes(target)) {
        currentCounts[target] = (currentCounts[target] || 0) + 1;
      }
    });
    const code = socket.data.roomCode;
    io.to(code).emit('vote_counts', { counts: { ...currentCounts } });

    const voted = Object.keys(room.votes).filter((id) => canVote.includes(id));
    if (voted.length !== canVote.length) return;
    if (room.voteCountingStarted) return;
    room.voteCountingStarted = true;
    try {
    await delay(1200);
    const rBeforeCount = rooms.get(code);
    if (!rBeforeCount?.gameState || rBeforeCount.phase !== 'voting' || !rBeforeCount.voteCountingStarted) {
      if (rBeforeCount) rBeforeCount.voteCountingStarted = false;
      return;
    }
    const countingLine = await getHostLine('vote_counting', { voiceStyle: room.hostVoiceStyle, recentHostLines: (room.hostRecentLines || []).slice(-8), gameContext: buildGameContext(room) });
    io.to(code).emit('host_says', { text: countingLine, type: 'vote_counting' });
    pushHostLine(room, countingLine);
    await delay(speechDurationMs(countingLine));

    const r = rooms.get(code);
    if (!r?.gameState || r.phase !== 'voting') return;
    const al = getAlivePlayers(r.gameState);
    const favoritesForCount = r.voteTieFavorites;
    const canVoteCountBase = favoritesForCount ? al.filter((id) => !favoritesForCount.includes(id)) : al;
    const canVoteCount = canVoteCountBase.filter((id) => isConnected(r, id));
    const validTargets = favoritesForCount || al;
    const counts = {};
    Object.entries(r.votes || {}).forEach(([voterId, target]) => {
      if (canVoteCount.includes(voterId) && validTargets.includes(target)) counts[target] = (counts[target] || 0) + 1;
    });
    const entries = Object.entries(counts).filter(([id]) => validTargets.includes(id));
    const max = Math.max(...entries.map((e) => e[1]), 0);
    const tied = entries.filter((e) => e[1] === max);

    io.to(code).emit('vote_counts', { counts: { ...counts } });

    if (tied.length > 1 || max === 0) {
      if (!r.voteTieFavorites) {
        r.voteTieFavorites = tied.map((e) => e[0]);
        r.votes = {};
        r.voteCountingStarted = false;
        io.to(code).emit('room_updated', roomForClient(r));
        io.to(code).emit('vote_counts', { counts: {} });
        if (r.voteHistory) r.voteHistory.push({ round: r.gameState.roundIndex ?? 1, votes: {}, excludedId: null, tie: true });
        if (r.battleLog) r.battleLog.push({ type: 'vote_tie', round: r.gameState.roundIndex ?? 1 });
        const line = await getHostLine('vote_tie_break', { voiceStyle: r.hostVoiceStyle, recentHostLines: (r.hostRecentLines || []).slice(-8), gameContext: buildGameContext(r) });
        io.to(code).emit('host_says', { text: line, type: 'vote_tie_break' });
        pushHostLine(r, line);
        await delay(speechDurationMs(line));
        r._voteTieBreakEndTime = Date.now() + VOTE_TIE_BREAK_SEC * 1000;
        io.to(code).emit('vote_tie_break', { secondsLeft: VOTE_TIE_BREAK_SEC });
        await delay(VOTE_TIE_BREAK_SEC * 1000);
        const r2 = rooms.get(code);
        if (!r2?.gameState || r2.phase !== 'voting') return;
        delete r2._voteTieBreakEndTime;
        const al2 = getAlivePlayers(r2.gameState);
        const fav2 = r2.voteTieFavorites || [];
        const canVoteRevote = fav2.length ? al2.filter((id) => !fav2.includes(id)) : al2;
        const canVoteRevoteConnected = canVoteRevote.filter((id) => isConnected(r2, id));
        const validTargetsRevote = fav2.length ? fav2 : al2;
        const countsRevote = {};
        Object.entries(r2.votes || {}).forEach(([voterId, target]) => {
          if (canVoteRevoteConnected.includes(voterId) && validTargetsRevote.includes(target)) countsRevote[target] = (countsRevote[target] || 0) + 1;
        });
        const entriesRevote = Object.entries(countsRevote).filter(([id]) => validTargetsRevote.includes(id));
        const maxRevote = Math.max(...entriesRevote.map((e) => e[1]), 0);
        const tiedRevote = entriesRevote.filter((e) => e[1] === maxRevote);
        r2.voteTieFavorites = null;
        r2.voteCountingStarted = false;
        io.to(code).emit('room_updated', roomForClient(r2));
        io.to(code).emit('vote_counts', { counts: {} });
        if (tiedRevote.length > 1 || maxRevote === 0) {
          r2.votes = {};
          if (r2.voteHistory) r2.voteHistory.push({ round: r2.gameState.roundIndex ?? 1, votes: {}, excludedId: null, tie: true });
          const lineTie = await getHostLine('vote_tie', { voiceStyle: r2.hostVoiceStyle, recentHostLines: (r2.hostRecentLines || []).slice(-8), gameContext: buildGameContext(r2) });
          io.to(code).emit('host_says', { text: lineTie, type: 'vote_tie' });
          pushHostLine(r2, lineTie);
          await delay(speechDurationMs(lineTie));
          clearDiscussionTurnTimeout(r2);
          r2.phase = 'night';
          r2.gameState.roundIndex = (r2.gameState.roundIndex || 1) + 1;
          io.to(code).emit('phase', 'night');
          io.to(code).emit('round', r2.gameState.roundIndex);
          runNightSequence(io, code);
        } else {
          const [excludedIdRevote] = tiedRevote[0];
          r2.gameState.dead.add(excludedIdRevote);
          const excludedNameRevote = r2.playerNames[excludedIdRevote];
          const excludedRoleRevote = r2.gameState.roles[excludedIdRevote];
          if (r2.voteHistory) r2.voteHistory.push({ round: r2.gameState.roundIndex ?? 1, votes: { ...(r2.votes || {}) }, excludedId: excludedIdRevote, tie: false });
          r2.votes = {};
          if (r2.battleLog) r2.battleLog.push({ type: 'vote_excluded', round: r2.gameState.roundIndex ?? 1, excludedName: excludedNameRevote });
          io.to(code).emit('room_updated', roomForClient(r2));
          const LAST_WORDS_MS_REVOTE = readDelay('MAFIA_LAST_WORDS_MS', 20000);
          const lastWordsSecRevote = Math.round(LAST_WORDS_MS_REVOTE / 1000);
          r2._excludedForLastWords = { playerId: excludedIdRevote, excludedName: excludedNameRevote, lastWordsSec: lastWordsSecRevote };
          io.to(code).emit('player_excluded', { playerId: excludedIdRevote, excludedName: excludedNameRevote, lastWordsSec: lastWordsSecRevote });
          await delay(LAST_WORDS_MS_REVOTE);
          clearDiscussionTurnTimeout(r2);
          delete r2._excludedForLastWords;
          await delay(HOST_PAUSE_BEFORE_MS);
          const voteLineRevote = await getHostLine('vote_result_summary', {
            excludedName: excludedNameRevote,
            excludedRole: excludedRoleRevote ? ROLE_NAMES_RU[excludedRoleRevote] || excludedRoleRevote : null,
            excludedAvatarId: r2.playerAvatars?.[excludedIdRevote] ?? null,
            round: r2.gameState.roundIndex ?? 1,
            voiceStyle: r2.hostVoiceStyle,
            recentHostLines: (r2.hostRecentLines || []).slice(-8),
            gameContext: buildGameContext(r2),
          });
          io.to(code).emit('host_says', { text: voteLineRevote, type: 'vote_result_summary' });
          pushHostLine(r2, voteLineRevote);
          await delay(speechDurationAfterMs(voteLineRevote, 'vote_result_summary'));
          const winRevote = checkWin(r2.gameState);
          if (winRevote) {
            clearDiscussionTurnTimeout(r2);
            r2.phase = 'ended';
            const rolesRevealRevote = r2.playerIds.map((id) => ({ name: r2.playerNames[id] || id, role: r2.gameState.roles[id], avatarId: r2.playerAvatars?.[id] ?? null }));
            await delay(HOST_PAUSE_BEFORE_MS);
            const endLineRevote = await getHostLine('game_end_summary', { winner: winRevote, voiceStyle: r2.hostVoiceStyle, recentHostLines: (r2.hostRecentLines || []).slice(-8), gameContext: buildGameContext(r2) });
            io.to(code).emit('host_says', { text: endLineRevote, type: 'game_end_summary' });
            pushHostLine(r2, endLineRevote);
            await delay(speechDurationMs(endLineRevote));
            await delay(HOST_PAUSE_BEFORE_MS);
            const revealLineRevote = await getHostLine('game_end_reveal', { rolesReveal: rolesRevealRevote, voiceStyle: r2.hostVoiceStyle, recentHostLines: (r2.hostRecentLines || []).slice(-8), gameContext: buildGameContext(r2) });
            io.to(code).emit('host_says', { text: revealLineRevote, type: 'game_end_reveal' });
            pushHostLine(r2, revealLineRevote);
            await delay(speechDurationMs(revealLineRevote));
            io.to(code).emit('phase', 'ended');
            io.to(code).emit('room_updated', roomForClient(r2));
            const voteHistoryRevote = (r2.voteHistory || []).map((v) => ({ round: v.round, votes: v.tie ? null : Object.fromEntries(Object.entries(v.votes || {}).map(([id, targetId]) => [r2.playerNames[id] || id, r2.playerNames[targetId] || targetId])), excludedName: v.tie ? null : r2.playerNames[v.excludedId], tie: v.tie }));
            r2.gameEndResult = { winner: winRevote, roles: r2.gameState.roles, playerNames: r2.playerNames, voteHistory: voteHistoryRevote, battleLog: r2.battleLog || [] };
            io.to(code).emit('game_ended', r2.gameEndResult);
          } else {
            clearDiscussionTurnTimeout(r2);
            r2.phase = 'night';
            r2.gameState.roundIndex = (r2.gameState.roundIndex || 1) + 1;
            io.to(code).emit('phase', 'night');
            io.to(code).emit('round', r2.gameState.roundIndex);
            runNightSequence(io, code);
          }
        }
        return;
      }
      delete r._voteTieBreakEndTime;
      r.voteTieFavorites = null;
      if (r.voteHistory) r.voteHistory.push({ round: r.gameState.roundIndex ?? 1, votes: { ...r.votes }, excludedId: null, tie: true });
      const line = await getHostLine('vote_tie', { voiceStyle: r.hostVoiceStyle, recentHostLines: (r.hostRecentLines || []).slice(-8), gameContext: buildGameContext(r) });
      io.to(code).emit('host_says', { text: line, type: 'vote_tie' });
      pushHostLine(r, line);
      await delay(speechDurationMs(line));
      clearDiscussionTurnTimeout(r);
      r.phase = 'night';
      r.votes = {};
      r.gameState.roundIndex = (r.gameState.roundIndex || 1) + 1;
      io.to(code).emit('phase', 'night');
      io.to(code).emit('round', r.gameState.roundIndex);
      runNightSequence(io, code);
      return;
    }
    const [excludedId] = tied[0];
    r.gameState.dead.add(excludedId);
    const excludedName = r.playerNames[excludedId];
    const excludedRole = r.gameState.roles[excludedId];
    delete r._voteTieBreakEndTime;
    r.voteTieFavorites = null;
    if (r.voteHistory) r.voteHistory.push({ round: r.gameState.roundIndex ?? 1, votes: { ...r.votes }, excludedId, tie: false });
    if (r.battleLog) r.battleLog.push({ type: 'vote_excluded', round: r.gameState.roundIndex ?? 1, excludedName });
    io.to(code).emit('room_updated', roomForClient(r));
    const LAST_WORDS_MS = readDelay('MAFIA_LAST_WORDS_MS', 20000);
    const lastWordsSec = Math.round(LAST_WORDS_MS / 1000);
    r._excludedForLastWords = { playerId: excludedId, excludedName, lastWordsSec };
    io.to(code).emit('player_excluded', { playerId: excludedId, excludedName, lastWordsSec });
    await delay(LAST_WORDS_MS);
    clearDiscussionTurnTimeout(r);
    delete r._excludedForLastWords;
    await delay(HOST_PAUSE_BEFORE_MS);
    const voteLine = await getHostLine('vote_result_summary', {
      excludedName,
      excludedRole: excludedRole ? ROLE_NAMES_RU[excludedRole] || excludedRole : null,
      excludedAvatarId: r.playerAvatars?.[excludedId] ?? null,
      round: r.gameState.roundIndex ?? 1,
      voiceStyle: r.hostVoiceStyle,
      recentHostLines: (r.hostRecentLines || []).slice(-8),
      gameContext: buildGameContext(r),
    });
    io.to(code).emit('host_says', { text: voteLine, type: 'vote_result_summary' });
    pushHostLine(r, voteLine);
    await delay(speechDurationAfterMs(voteLine, 'vote_result_summary'));
    r.votes = {};
    const win = checkWin(r.gameState);
    if (win) {
      clearDiscussionTurnTimeout(r);
      r.phase = 'ended';
      const rolesReveal = r.playerIds.map((id) => ({
        name: r.playerNames[id] || id,
        role: r.gameState.roles[id],
        avatarId: r.playerAvatars?.[id] ?? null,
      }));
      await delay(HOST_PAUSE_BEFORE_MS);
      const endLine = await getHostLine('game_end_summary', { winner: win, voiceStyle: r.hostVoiceStyle, recentHostLines: (r.hostRecentLines || []).slice(-8), gameContext: buildGameContext(r) });
      io.to(code).emit('host_says', { text: endLine, type: 'game_end_summary' });
      pushHostLine(r, endLine);
      await delay(speechDurationMs(endLine));
      await delay(HOST_PAUSE_BEFORE_MS);
      const revealLine = await getHostLine('game_end_reveal', { rolesReveal, voiceStyle: r.hostVoiceStyle, recentHostLines: (r.hostRecentLines || []).slice(-8), gameContext: buildGameContext(r) });
      io.to(code).emit('host_says', { text: revealLine, type: 'game_end_reveal' });
      pushHostLine(r, revealLine);
      await delay(speechDurationMs(revealLine));
      io.to(code).emit('phase', 'ended');
      io.to(code).emit('room_updated', roomForClient(r));
      const voteHistoryForClient = (r.voteHistory || []).map((v) => ({
        round: v.round,
        votes: v.tie ? null : Object.fromEntries(Object.entries(v.votes || {}).map(([id, targetId]) => [r.playerNames[id] || id, r.playerNames[targetId] || targetId])),
        excludedName: v.tie ? null : r.playerNames[v.excludedId],
        tie: v.tie,
      }));
      const gameEndPayload = {
        winner: win,
        roles: r.gameState.roles,
        playerNames: r.playerNames,
        voteHistory: voteHistoryForClient,
        battleLog: r.battleLog || [],
      };
      r.gameEndResult = gameEndPayload;
      io.to(code).emit('game_ended', gameEndPayload);
    } else {
      clearDiscussionTurnTimeout(r);
      r.phase = 'night';
      r.gameState.roundIndex = (r.gameState.roundIndex || 1) + 1;
      io.to(code).emit('phase', 'night');
      io.to(code).emit('round', r.gameState.roundIndex);
      runNightSequence(io, code);
    }
    } catch (voteErr) {
      if (room) room.voteCountingStarted = false;
      throw voteErr;
    }
  });

  socket.on('start_voting', async () => {
    const room = getRoom(socket);
    if (!room?.gameState || room.phase !== 'day') return;
    clearDiscussionTurnTimeout(room);
    room.phase = 'voting';
    room.votes = {};
    room.voteCountingStarted = false;
    room.voteTieFavorites = null;
    const code = socket.data.roomCode;
    const line = await getHostLine('vote_start', { voiceStyle: room.hostVoiceStyle, recentHostLines: (room.hostRecentLines || []).slice(-8), gameContext: buildGameContext(room) });
    const r = rooms.get(code);
    if (!r?.gameState || r.phase !== 'voting') return;
    io.to(code).emit('host_says', { text: line, type: 'vote_start' });
    pushHostLine(r, line);
    await delay(speechDurationMs(line));
    const r2 = rooms.get(code);
    if (r2?.phase === 'voting') {
      io.to(code).emit('phase', 'voting');
      io.to(code).emit('room_updated', roomForClient(r2));
    }
  });

  socket.on('last_words', (text) => {
    const room = getRoom(socket);
    if (!room?.gameState || typeof text !== 'string') return;
    const trimmed = text.trim().slice(0, 300);
    if (!trimmed) return;
    io.to(socket.data.roomCode).emit('last_words_said', { playerName: room.playerNames[socket.id] || 'Игрок', text: trimmed });
  });

  socket.on('reaction', (emoji) => {
    const room = getRoom(socket);
    if (!room || !['👀', '😂', '😱', '🤐', '👍', '👎'].includes(emoji)) return;
    io.to(socket.data.roomCode).emit('reaction', { playerId: socket.id, playerName: room.playerNames[socket.id] || 'Игрок', emoji });
  });

  socket.on('play_again', () => {
    const room = getRoom(socket);
    if (!room || room.creatorId !== socket.id || room.phase !== 'ended') return;
    room.phase = 'lobby';
    room.gameState = null;
    room.gameEndResult = null;
    room._excludedForLastWords = null;
    if (room.disconnectedIds?.size) {
      room.lobbyDisconnectedIds = new Set(room.disconnectedIds);
    }
    room.disconnectedIds = null;
    room.hostRecentLines = [];
    room.voteHistory = [];
    room.battleLog = [];
    io.to(socket.data.roomCode).emit('phase', 'lobby');
    io.to(socket.data.roomCode).emit('room_updated', roomForClient(room));
    io.to(socket.data.roomCode).emit('play_again_done');
  });

  socket.on('disconnect', () => {
    const room = getRoom(socket);
    if (!room) return;
    if (room.phase === 'lobby') {
      if (!room.lobbyDisconnectedIds) room.lobbyDisconnectedIds = new Set();
      room.lobbyDisconnectedIds.add(socket.id);
      const code = socket.data.roomCode;
      if (room.playerIds.length > 0 && room.playerIds.every((id) => room.lobbyDisconnectedIds.has(id))) {
        rooms.delete(code);
        return;
      }
      io.to(code).emit('room_updated', roomForClient(rooms.get(code)));
      return;
    }
    if (room.gameState) {
      if (!room.disconnectedIds) room.disconnectedIds = new Set();
      room.disconnectedIds.add(socket.id);
      const code = socket.data.roomCode;
      if (room.playerIds.length > 0 && room.playerIds.every((id) => room.disconnectedIds.has(id))) {
        rooms.delete(code);
        return;
      }
    }
    io.to(socket.data.roomCode).emit('room_updated', roomForClient(rooms.get(socket.data.roomCode)));
  });
});

const PORT = process.env.MAFIA_TEST_PORT || process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
httpServer.listen(PORT, HOST, () => console.log(`Mafia server http://${HOST}:${PORT}`));
