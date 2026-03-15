/**
 * Логика игры: роли, фазы, победа.
 * Роли: mafia, don, doctor, detective, civilian, lucky, journalist.
 */

export const ROLES = {
  mafia: 'mafia',
  don: 'don',
  doctor: 'doctor',
  detective: 'detective',
  civilian: 'civilian',
  lucky: 'lucky',
  journalist: 'journalist',
};

/** Краткое описание роли для ведущего (что делает ночью/днём). */
export const ROLE_DESCRIPTIONS = {
  mafia: 'Мафия — ночью просыпается с другими мафиози, выбирает одну жертву для убийства. Днём притворяется мирным.',
  don: 'Дон — босс мафии. Ночью участвует в выборе жертвы вместе с мафией. При проверке детективом показывается как мирный.',
  doctor: 'Доктор — ночью может спасти одного игрока (если мафия выбрала его — остаётся жив).',
  detective: 'Детектив — ночью проверяет одного игрока: мафия он или мирный (дон при проверке показывается мирным).',
  civilian: 'Мирный житель — ночью не просыпается. Днём участвует в обсуждении и голосовании.',
  lucky: 'Везунчик — мирный житель, без ночного действия. Днём голосует.',
  journalist: 'Журналист — мирный житель, без ночного действия. Днём голосует.',
};

const MIN_PLAYERS = 5;
const MAX_PLAYERS = 12;

// Для раздачи состава по ТЗ все дополнительные мирные — обычные `civilian`.
const CIVILIAN_FLAVOR = [ROLES.civilian];

function shuffle(a) {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function randomCivilianFlavor() {
  return CIVILIAN_FLAVOR[Math.floor(Math.random() * CIVILIAN_FLAVOR.length)];
}

/**
 * Распределение ролей по количеству игроков (ТЗ 2.3).
 * 5: 1 мафия-дон, доктор, детектив, 2 мирных.
 * 6: мафия, дон, доктор, детектив, 2 мирных.
 * 7: 2 мафии, доктор, детектив, 3 мирных.
 * 8–12: 2 мафии, дон, доктор, детектив, остальные мирные.
 * Все мирные в раздаче — роль civilian (без отдельных везунчик/журналист).
 */
export function assignRoles(playerIds) {
  const n = playerIds.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) return null;

  const roles = [];
  if (n === 5) {
    roles.push(ROLES.mafia, ROLES.doctor, ROLES.detective, ...Array(2).fill(null).map(randomCivilianFlavor));
  } else if (n === 6) {
    roles.push(ROLES.mafia, ROLES.don, ROLES.doctor, ROLES.detective, ...Array(2).fill(null).map(randomCivilianFlavor));
  } else if (n === 7) {
    roles.push(ROLES.mafia, ROLES.mafia, ROLES.doctor, ROLES.detective, ...Array(3).fill(null).map(randomCivilianFlavor));
  } else {
    const civilians = n - 5;
    roles.push(ROLES.mafia, ROLES.mafia, ROLES.don, ROLES.doctor, ROLES.detective, ...Array(civilians).fill(null).map(randomCivilianFlavor));
  }

  const shuffled = shuffle(roles);
  const assignment = {};
  playerIds.forEach((id, i) => {
    assignment[id] = shuffled[i];
  });
  return assignment;
}

export function getAlivePlayers(gameState) {
  return gameState.playerIds.filter((id) => !gameState.dead.has(id));
}

/** Мафия + Дон считаются мафией для победы */
export function getAliveMafia(gameState) {
  return getAlivePlayers(gameState).filter(
    (id) => gameState.roles[id] === ROLES.mafia || gameState.roles[id] === ROLES.don
  );
}

/** Детектив видит дона как мирного */
export function isMafiaForDetective(role) {
  return role === ROLES.mafia;
}

export function checkWin(gameState) {
  const alive = getAlivePlayers(gameState);
  const mafiaCount = getAliveMafia(gameState).length;
  const civilianCount = alive.length - mafiaCount;

  if (mafiaCount === 0) return 'civilians';
  if (mafiaCount >= civilianCount) return 'mafia';
  return null;
}

/** Мирные роли (без ночного действия мафии/дона). */
export function isCivilianSide(role) {
  return role !== ROLES.mafia && role !== ROLES.don;
}

export { MIN_PLAYERS, MAX_PLAYERS };
