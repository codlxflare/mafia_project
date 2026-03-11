/**
 * Тест синхронности: порядок событий ведущий (host_says) → выбор (night_turn) → фаза.
 * Запуск с быстрыми задержками: MAFIA_DELAY_AFTER_HOST_WAKE_MS=0 MAFIA_NIGHT_WAIT_MS=500 node --test sync.test.js
 * Или: npm run test:sync (предварительно установить socket.io-client)
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { io } from 'socket.io-client';

const TEST_PORT = 3998;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

function waitForPort(port, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tryConnect = () => {
      const socket = createConnection(port, '127.0.0.1', () => {
        socket.destroy();
        resolve();
      });
      socket.on('error', () => {
        if (Date.now() - start > timeoutMs) reject(new Error(`Port ${port} not open in time`));
        else setTimeout(tryConnect, 50);
      });
    };
    tryConnect();
  });
}

const runIntegration = process.env.RUN_SYNC_INTEGRATION === '1';

describe('Синхронность ИИ-ведущий и игроки (интеграция)', () => {
  let serverProcess;

  before(async () => {
    if (!runIntegration) return;
    serverProcess = spawn(
      process.execPath,
      ['index.js'],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          MAFIA_TEST_PORT: String(TEST_PORT),
          MAFIA_DELAY_AFTER_HOST_WAKE_MS: '0',
          MAFIA_DELAY_AFTER_NIGHT_SUMMARY_MS: '0',
          MAFIA_DELAY_AFTER_DAY_DISCUSSION_MS: '0',
          MAFIA_DELAY_AFTER_VOTE_START_MS: '0',
          MAFIA_NIGHT_WAIT_MS: '1500',
          MAFIA_NIGHT_NUDGE_MS: '5000',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    await waitForPort(TEST_PORT);
  });

  after(() => {
    if (serverProcess?.kill) serverProcess.kill('SIGTERM');
  });

  it('ночь: host_says (проснитесь) приходит до night_turn; день: phase day только после host_says (итог ночи и обсуждение)', { skip: !runIntegration }, async () => {
    const eventLog = []; // { socketId, event, payload, t }
    const sockets = [];
    let roomCode;
    let creatorId;

    const connect = (name) =>
      new Promise((resolve) => {
        const socket = io(BASE_URL, { transports: ['websocket'], forceNew: true });
        socket.on('connect', () => {
          sockets.push(socket);
          const push = (event, payload) => eventLog.push({ id: socket.id, event, payload, t: Date.now() });
          socket.onAny((event, ...args) => push(event, args[0]));
          resolve(socket);
        });
      });

    const createRoom = (socket, name) =>
      new Promise((resolve, reject) => {
        socket.emit('create_room', name || 'Creator', (res) => {
          if (res?.error) return reject(new Error(res.error));
          roomCode = res.code;
          creatorId = res.playerId;
          resolve(res);
        });
      });

    const joinRoom = (socket, name) =>
      new Promise((resolve, reject) => {
        socket.emit('join_room', { code: roomCode, playerName: name }, (res) => {
          if (res?.error) return reject(new Error(res.error));
          resolve(res);
        });
      });

    const startGame = (socket) =>
      new Promise((resolve, reject) => {
        socket.emit('start_game', (res) => {
          if (res?.error) return reject(new Error(res.error));
          resolve(res);
        });
      });

    // Подключаем 5 клиентов
    const s0 = await connect('Creator');
    await createRoom(s0, 'Creator');
    const s1 = await connect('P1');
    await joinRoom(s1, 'P1');
    const s2 = await connect('P2');
    await joinRoom(s2, 'P2');
    const s3 = await connect('P3');
    await joinRoom(s3, 'P3');
    const s4 = await connect('P4');
    await joinRoom(s4, 'P4');

    s0.emit('start_game');

    // Ждём фазу day или таймаут
    const phaseDayReceived = new Promise((resolve) => {
      const check = (event, payload) => {
        if (event === 'phase' && payload === 'day') resolve();
      };
      sockets.forEach((s) => s.onAny(check));
    });
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout waiting for phase day')), 12000));

    // Как только приходит night_turn — сразу шлём выбор (чтобы ночь не зависала)
    const roleBySocket = new Map();
    sockets.forEach((s) => {
      s.on('your_role', (role) => roleBySocket.set(s.id, role));
      s.on('night_turn', (data) => {
        const role = roleBySocket.get(s.id);
        const step = data?.step;
        const isMyStep =
          (step === 'mafia' && (role === 'mafia' || role === 'don')) ||
          (step === 'doctor' && role === 'doctor') ||
          (step === 'detective' && role === 'detective') ||
          (step === 'veteran' && role === 'veteran');
        if (!isMyStep || !data?.aliveIds?.length) return;
        const alive = data.aliveIds;
        const me = s.id;
        const target = alive.find((id) => id !== me) || alive[0];
        if (step === 'mafia' || step === 'don') s.emit('night_choice', { victimId: target });
        else if (step === 'doctor') s.emit('night_choice', { savedId: target });
        else if (step === 'detective') s.emit('night_choice', { checkId: target });
        else if (step === 'veteran') s.emit('night_choice', { veteranProtect: false });
      });
    });

    await Promise.race([phaseDayReceived, timeout]);

    // Анализ лога: берём события одного сокета (creator), у него есть host_says и phase
    const bySocket = new Map();
    for (const e of eventLog) {
      if (!bySocket.has(e.id)) bySocket.set(e.id, []);
      bySocket.get(e.id).push(e);
    }

    const hostSaysEvents = eventLog.filter((e) => e.event === 'host_says');
    const nightTurnEvents = eventLog.filter((e) => e.event === 'night_turn');
    const phaseEvents = eventLog.filter((e) => e.event === 'phase');

    assert(hostSaysEvents.length >= 3, 'Ожидалось минимум 3 реплики ведущего (старт, роли, закрыть глаза, мафия проснись, ...)');
    assert(nightTurnEvents.length >= 1, 'Ожидался хотя бы один night_turn (мафия или др.)');
    assert(phaseEvents.some((e) => e.payload === 'day'), 'Ожидалась фаза day');

    // Ключевая проверка синхронности: каждый night_turn должен быть ПОСЛЕ хотя бы одной host_says
    const firstNightTurn = nightTurnEvents[0];
    const hostSaysBeforeFirstTurn = hostSaysEvents.filter((h) => h.t <= firstNightTurn.t);
    assert(
      hostSaysBeforeFirstTurn.length >= 2,
      `Синхронность нарушена: night_turn пришёл после только ${hostSaysBeforeFirstTurn.length} реплик ведущего. Ожидалось: сначала "закройте глаза", потом "проснитесь", потом night_turn.`
    );

    // День: phase 'day' должен прийти после нескольких host_says (итог ночи + обсуждение)
    const phaseDay = phaseEvents.find((e) => e.payload === 'day');
    const hostSaysBeforeDay = hostSaysEvents.filter((h) => h.t <= phaseDay.t);
    assert(
      hostSaysBeforeDay.length >= 5,
      `Синхронность дня: phase day пришла после только ${hostSaysBeforeDay.length} реплик. Ожидалось: итог ночи и обсуждение до перехода в день.`
    );

    sockets.forEach((s) => s.disconnect());
  }, { timeout: 20000 });
});
