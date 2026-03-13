/**
 * Unit-тесты логики игры: роли, победа, живые/мёртвые.
 * Запуск: node --test gameLogic.test.js (из папки server)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  assignRoles,
  checkWin,
  getAlivePlayers,
  getAliveMafia,
  isMafiaForDetective,
  needVeteran,
  ROLES,
  MIN_PLAYERS,
  MAX_PLAYERS,
} from './gameLogic.js';

describe('assignRoles', () => {
  it('возвращает null при числе игроков < MIN_PLAYERS', () => {
    assert.strictEqual(assignRoles(['a', 'b', 'c']), null);
    assert.strictEqual(assignRoles([]), null);
  });

  it('возвращает null при числе игроков > MAX_PLAYERS', () => {
    const ids = Array.from({ length: 13 }, (_, i) => `p${i}`);
    assert.strictEqual(assignRoles(ids), null);
  });

  it('при 5 игроках: 1 мафия-дон, доктор, детектив, 2 мирных', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const roles = assignRoles(ids);
    assert(roles);
    const values = Object.values(roles);
    assert.strictEqual(values.filter((r) => r === ROLES.mafia).length, 1);
    assert.strictEqual(values.filter((r) => r === ROLES.doctor).length, 1);
    assert.strictEqual(values.filter((r) => r === ROLES.detective).length, 1);
    assert.strictEqual(values.filter((r) => r === ROLES.don).length, 0);
    assert.strictEqual(values.filter((r) => r === ROLES.civilian).length, 2);
    assert.strictEqual(values.filter((r) => r === ROLES.lucky || r === ROLES.journalist).length, 0);
    assert.strictEqual(values.length, 5);
  });

  it('при 6 игроках: мафия, дон, доктор, детектив, 2 мирных', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const roles = assignRoles(ids);
    assert(roles);
    const values = Object.values(roles);
    assert.strictEqual(values.filter((r) => r === ROLES.mafia).length, 1);
    assert.strictEqual(values.filter((r) => r === ROLES.don).length, 1);
    assert.strictEqual(values.filter((r) => r === ROLES.doctor).length, 1);
    assert.strictEqual(values.filter((r) => r === ROLES.detective).length, 1);
    assert.strictEqual(values.filter((r) => r === ROLES.civilian).length, 2);
    assert.strictEqual(values.length, 6);
  });

  it('при 7 игроках: 2 мафии, доктор, детектив, 3 мирных', () => {
    const ids = Array.from({ length: 7 }, (_, i) => `p${i}`);
    const roles = assignRoles(ids);
    assert(roles);
    const values = Object.values(roles);
    assert.strictEqual(values.filter((r) => r === ROLES.mafia).length, 2);
    assert.strictEqual(values.filter((r) => r === ROLES.don).length, 0);
    assert.strictEqual(values.filter((r) => r === ROLES.doctor).length, 1);
    assert.strictEqual(values.filter((r) => r === ROLES.detective).length, 1);
    assert.strictEqual(values.filter((r) => r === ROLES.civilian).length, 3);
    assert.strictEqual(values.length, 7);
  });

  it('при 8 игроках: 2 мафии, дон, доктор, детектив, ветеран, 2 мирных', () => {
    const ids = Array.from({ length: 8 }, (_, i) => `p${i}`);
    const roles = assignRoles(ids);
    assert(roles);
    const values = Object.values(roles);
    assert.strictEqual(values.filter((r) => r === ROLES.mafia).length, 2);
    assert.strictEqual(values.filter((r) => r === ROLES.don).length, 1);
    assert.strictEqual(values.filter((r) => r === ROLES.veteran).length, 1);
    assert.strictEqual(values.filter((r) => r === ROLES.civilian).length, 2);
    assert.strictEqual(values.length, 8);
  });

  it('при 9 игроках: 2 мафии, дон, доктор, детектив, ветеран, 3 мирных', () => {
    const ids = Array.from({ length: 9 }, (_, i) => `p${i}`);
    const roles = assignRoles(ids);
    assert(roles);
    const values = Object.values(roles);
    assert.strictEqual(values.filter((r) => r === ROLES.mafia).length, 2);
    assert.strictEqual(values.filter((r) => r === ROLES.don).length, 1);
    assert.strictEqual(values.filter((r) => r === ROLES.doctor).length, 1);
    assert.strictEqual(values.filter((r) => r === ROLES.detective).length, 1);
    assert.strictEqual(values.filter((r) => r === ROLES.veteran).length, 1);
    assert.strictEqual(values.filter((r) => r === ROLES.civilian).length, 3);
    assert.strictEqual(values.length, 9);
  });

  it('при 10–12 игроках: 2 мафии, дон, доктор, детектив, ветеран, остальные мирные', () => {
    for (const n of [10, 11, 12]) {
      const ids = Array.from({ length: n }, (_, i) => `p${i}`);
      const roles = assignRoles(ids);
      assert(roles, `n=${n}`);
      const values = Object.values(roles);
      assert.strictEqual(values.filter((r) => r === ROLES.mafia).length, 2, `n=${n} mafia`);
      assert.strictEqual(values.filter((r) => r === ROLES.don).length, 1, `n=${n} don`);
      assert.strictEqual(values.filter((r) => r === ROLES.doctor).length, 1, `n=${n} doctor`);
      assert.strictEqual(values.filter((r) => r === ROLES.detective).length, 1, `n=${n} detective`);
      assert.strictEqual(values.filter((r) => r === ROLES.veteran).length, 1, `n=${n} veteran`);
      const civilians = values.filter((r) => r === ROLES.civilian).length;
      assert.strictEqual(civilians, n - 6, `n=${n} civilians`);
      assert.strictEqual(values.filter((r) => r === ROLES.lucky || r === ROLES.journalist).length, 0, `n=${n} no lucky/journalist`);
      assert.strictEqual(values.length, n, `n=${n} total`);
    }
  });

  it('каждый игрок получает ровно одну роль', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const roles = assignRoles(ids);
    assert(roles);
    assert.strictEqual(Object.keys(roles).length, 5);
    assert.deepStrictEqual(Object.keys(roles).sort(), ids.slice().sort());
  });
});

describe('getAlivePlayers / getAliveMafia', () => {
  it('getAlivePlayers исключает мёртвых', () => {
    const gameState = {
      playerIds: ['a', 'b', 'c'],
      dead: new Set(['b']),
    };
    assert.deepStrictEqual(getAlivePlayers(gameState), ['a', 'c']);
  });

  it('getAliveMafia возвращает только мафию и дона', () => {
    const gameState = {
      playerIds: ['a', 'b', 'c', 'd'],
      dead: new Set(),
      roles: { a: ROLES.mafia, b: ROLES.don, c: ROLES.doctor, d: ROLES.civilian },
    };
    const mafia = getAliveMafia(gameState);
    assert.strictEqual(mafia.length, 2);
    assert(mafia.includes('a'));
    assert(mafia.includes('b'));
  });
});

describe('isMafiaForDetective', () => {
  it('дон для детектива — мирный', () => {
    assert.strictEqual(isMafiaForDetective(ROLES.don), false);
  });
  it('мафия для детектива — мафия', () => {
    assert.strictEqual(isMafiaForDetective(ROLES.mafia), true);
  });
});

describe('needVeteran', () => {
  it('возвращает true если ветеран жив', () => {
    const gameState = {
      playerIds: ['a', 'b'],
      dead: new Set(),
      roles: { a: ROLES.veteran, b: ROLES.civilian },
    };
    assert.strictEqual(needVeteran(gameState), true);
  });
  it('возвращает false если ветеран мёртв', () => {
    const gameState = {
      playerIds: ['a', 'b'],
      dead: new Set(['a']),
      roles: { a: ROLES.veteran, b: ROLES.civilian },
    };
    assert.strictEqual(needVeteran(gameState), false);
  });
});

describe('checkWin', () => {
  const makeState = (roles, dead = []) => ({
    playerIds: Object.keys(roles),
    dead: new Set(dead),
    roles,
  });

  it('мирные побеждают, когда мафии не осталось', () => {
    const state = makeState(
      { a: ROLES.mafia, b: ROLES.civilian },
      ['a']
    );
    assert.strictEqual(checkWin(state), 'civilians');
  });

  it('мафия побеждает, когда мафий >= мирных', () => {
    const state = makeState(
      { a: ROLES.mafia, b: ROLES.don, c: ROLES.civilian }
    );
    assert.strictEqual(checkWin(state), 'mafia');
  });

  it('ничья при 1 мафия и 1 мирный', () => {
    const state = makeState({ a: ROLES.mafia, b: ROLES.civilian });
    assert.strictEqual(checkWin(state), 'mafia');
  });

  it('игра продолжается при 1 мафия и 2 мирных', () => {
    const state = makeState({
      a: ROLES.mafia,
      b: ROLES.civilian,
      c: ROLES.doctor,
    });
    assert.strictEqual(checkWin(state), null);
  });
});
