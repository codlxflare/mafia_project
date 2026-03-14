/**
 * Спецификация синхронности: проверка, что в коде сервера порядок вызовов
 * соответствует правилу «сначала реплика ведущего, потом пауза, потом событие игрокам».
 * Не требует запуска сервера.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverCode = readFileSync(join(__dirname, 'index.js'), 'utf8');

describe('Спецификация синхронности (порядок в коде)', () => {
  it('ночь: после say(night_mafia_wake) идёт delay, затем emitNightTurn(mafia)', () => {
    const mafiaWakeIdx = serverCode.indexOf("say('night_mafia_wake'");
    assert(mafiaWakeIdx >= 0, 'В коде должен быть вызов say(night_mafia_wake)');
    const afterMafiaWake = serverCode.slice(mafiaWakeIdx);
    assert(afterMafiaWake.includes('await delay('), 'После реплики мафии должна быть пауза delay()');
    assert(afterMafiaWake.includes("emitNightTurn(io, code, 'mafia')"), 'После паузы — emitNightTurn(mafia)');
  });

  it('ночь: после say(night_doctor_wake) идёт delay, затем emitNightTurn(doctor)', () => {
    const idx = serverCode.indexOf("say('night_doctor_wake'");
    assert(idx >= 0);
    const after = serverCode.slice(idx);
    assert(after.includes('await delay('));
    assert(after.includes("emitNightTurn(io, code, 'doctor')"));
  });

  it('день: после night_summary идёт delay, затем host_announced day и phase day (одна фраза — без отдельного day_discussion)', () => {
    const summaryIdx = serverCode.indexOf("getHostLine('night_summary'");
    assert(summaryIdx >= 0);
    const after = serverCode.slice(summaryIdx);
    assert(after.includes("emit('host_announced', 'day')"), 'После итога ночи — host_announced day');
    assert(after.includes("emit('phase', 'day')"), 'После обсуждения — phase day');
  });

  it('голосование: после vote_start идёт delay, затем phase voting', () => {
    const idx = serverCode.indexOf("getHostLine('vote_start'");
    assert(idx >= 0);
    const after = serverCode.slice(idx);
    assert(after.includes('await delay('));
    assert(after.includes("emit('phase', 'voting')"));
  });

  it('финал: после game_end_summary — пауза, game_end_reveal — пауза, затем game_ended', () => {
    const idx = serverCode.indexOf("getHostLine('game_end_summary'");
    assert(idx >= 0);
    const after = serverCode.slice(idx);
    assert(after.includes("getHostLine('game_end_reveal'"), 'Два шага финала: победитель, затем расклад');
    assert(after.includes("emit('game_ended'"));
  });
});
