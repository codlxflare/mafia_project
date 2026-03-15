/**
 * Тесты ИИ-ведущего: fallback-реплики (без API ключа) и порядок типов событий.
 * Запуск: node --test hostAI.test.js (из папки server)
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { getHostLine } from './hostAI.js';

const originalApiKey = process.env.OPENAI_API_KEY;
const originalDeepSeek = process.env.DEEPSEEK_API_KEY;
const originalLLMProvider = process.env.LLM_PROVIDER;

describe('hostAI fallback (без API ключа)', () => {
  beforeEach(() => {
    process.env.LLM_PROVIDER = 'openai';
    delete process.env.OPENAI_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
  });
  afterEach(() => {
    if (originalApiKey !== undefined) process.env.OPENAI_API_KEY = originalApiKey;
    if (originalDeepSeek !== undefined) process.env.DEEPSEEK_API_KEY = originalDeepSeek;
    if (originalLLMProvider !== undefined) process.env.LLM_PROVIDER = originalLLMProvider;
    else delete process.env.LLM_PROVIDER;
  });

  it('room_created возвращает строку с именем и need', async () => {
    const line = await getHostLine('room_created', { creatorName: 'Вася', need: 5 });
    assert(typeof line === 'string');
    assert(line.length > 0);
    assert(line.includes('5') || line.includes('пять') || line.includes('человек'));
  });

  it('game_start возвращает короткую фразу', async () => {
    const line = await getHostLine('game_start');
    assert(typeof line === 'string' && line.length > 0);
  });

  it('roles_done возвращает состав по roleCounts', async () => {
    const line = await getHostLine('roles_done', {
      playerCount: 6,
      roleCounts: { mafia: 1, don: 1, doctor: 1, detective: 1, civilian: 2 },
    });
    assert(typeof line === 'string' && line.length > 0);
    assert(line.includes('6') || line.includes('шесть') || line.includes('человек'));
  });

  it('night_close_eyes упоминает ночь/раунд', async () => {
    const line = await getHostLine('night_close_eyes', { round: 1 });
    assert(typeof line === 'string' && line.length > 0);
  });

  it('night_mafia_wake — призыв к мафии', async () => {
    const line = await getHostLine('night_mafia_wake');
    assert(typeof line === 'string' && line.length > 0);
  });

  it('night_summary при убийстве упоминает имя', async () => {
    const line = await getHostLine('night_summary', {
      round: 1,
      killedName: 'Петя',
      savedByName: null,
      victimCount: 1,
    });
    assert(typeof line === 'string' && line.length > 0);
  });

  it('night_summary при спасении доктором', async () => {
    const line = await getHostLine('night_summary', {
      round: 1,
      killedName: null,
      savedByName: 'Маша',
      victimCount: 0,
    });
    assert(typeof line === 'string' && line.length > 0);
  });

  it('day_discussion возвращает фразу про обсуждение', async () => {
    const line = await getHostLine('day_discussion', { round: 1 });
    assert(typeof line === 'string' && line.length > 0);
  });

  it('vote_start — объявление голосования', async () => {
    const line = await getHostLine('vote_start');
    assert(typeof line === 'string' && line.length > 0);
  });

  it('vote_result_summary упоминает исключённого', async () => {
    const line = await getHostLine('vote_result_summary', { excludedName: 'Коля' });
    assert(typeof line === 'string' && line.length > 0);
  });

  it('game_end_summary — победитель мафия/мирные', async () => {
    const m = await getHostLine('game_end_summary', { winner: 'mafia' });
    const c = await getHostLine('game_end_summary', { winner: 'civilians' });
    assert(typeof m === 'string' && m.length > 0);
    assert(typeof c === 'string' && c.length > 0);
  });

  it('game_end_reveal возвращает строку', async () => {
    const line = await getHostLine('game_end_reveal', {
      rolesReveal: [
        { name: 'А', role: 'mafia' },
        { name: 'Б', role: 'civilian' },
      ],
    });
    assert(typeof line === 'string' && line.length > 0);
  });

  it('roles_done при 5 игроках (мафия, доктор, детектив, мирные) возвращает осмысленную фразу', async () => {
    const line = await getHostLine('roles_done', {
      playerCount: 5,
      roleCounts: { mafia: 1, doctor: 1, detective: 1, civilian: 1, lucky: 1 },
    });
    assert(typeof line === 'string' && line.length > 0);
  });

  it('night_summary при только убийстве не упоминает доктора/детектива в контексте этой ночи', async () => {
    const line = await getHostLine('night_summary', {
      round: 1,
      killedName: 'Игрок',
      victimCount: 1,
      savedByName: null,
      detectiveCheckedName: null,
      detectiveWasMafia: null,
    });
    assert(typeof line === 'string' && line.length > 0);
    assert(line.includes('Игрок') || line.includes('погиб') || line.includes('ночью'), 'Должно быть объявление об убийстве');
    const lower = line.toLowerCase();
    assert(!lower.includes('доктор спас'), 'Не должно быть «доктор спас», если доктора не было');
    assert(!lower.includes('детектив проверил'), 'Не должно быть «детектив проверил», если не передано');
  });

  it('night_summary при спокойной ночи (никто не погиб, нет спасения) — нейтральная фраза', async () => {
    const line = await getHostLine('night_summary', {
      round: 1,
      killedName: null,
      victimCount: 0,
      savedByName: null,
      detectiveCheckedName: null,
      detectiveWasMafia: null,
    });
    assert(typeof line === 'string' && line.length > 0);
    const lower = line.toLowerCase();
    assert(!lower.includes('доктор спас'), 'Не должно быть упоминания доктора');
    assert(!lower.includes('детектив проверил'), 'Не должно быть упоминания проверки детектива');
  });
});
