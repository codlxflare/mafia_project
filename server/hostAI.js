/**
 * ИИ-ведущий: реагирует на события игры, ничего не заготовлено.
 * Получает факты (имена, роли, аватары, исход) и сам формулирует объявление.
 */

/** Названия аватаров по-русски для шуток: «Единорога лишили рога», «Сову вынесли» */
const AVATAR_NAMES_RU = {
  fox: 'Лиса', bear: 'Медведь', wolf: 'Волк', owl: 'Сова', cat: 'Кот', dog: 'Собака',
  tiger: 'Тигр', rabbit: 'Кролик', dragon: 'Дракон', unicorn: 'Единорог', frog: 'Лягушка',
  panda: 'Панда', lion: 'Лев', monkey: 'Обезьяна', butterfly: 'Бабочка', raccoon: 'Енот',
};

function avatarRu(avatarId) {
  return avatarId ? (AVATAR_NAMES_RU[avatarId] || avatarId) : null;
}

const ROLES_REFERENCE = `
Роли (состав зависит от числа игроков — объявляй только те, что в списке фактов):
- Мафия — ночью выбирает жертву, днём прикидывается своим.
- Дон — босс мафии, в проверке детектива светится как мирный.
- Доктор — ночью может спасти одного от пули мафии.
- Детектив — ночью проверяет одного: мафия или мирный (дон для него мирный).
- Мирный, везунчик, журналист — днём голосуют, ночью спят.
- Ветеран — мирный; раз за игру (только первая ночь) может включить защиту.
Классика по числу игроков: 5 — одна мафия, доктор, детектив, мирные; 6 — мафия, дон, доктор, детектив, мирные; 7 — две мафии, доктор, детектив, мирные; 8+ — две мафии, дон, доктор, детектив, ветеран, мирные.
`;

const HOST_RULES = `Правила (обязательно):
- Объявляй только то, что явно передано в текущем сообщении (кто погиб, кого спас доктор, кого исключили, кто кем был). Запрещено придумывать события, имена или роли.
- Роль исключённого не раскрывай до финала; раскрывай только когда в фактах явно сказано «раскрой роль».
- Ответ — только текст для озвучки: 1–3 короткие фразы, без кавычек, без пометок («Ведущий:», списков, тире). Один абзац.
- В сообщении указано, какое сейчас событие. Не объявляй другие фазы и не смешивай события.
- Веди себя как живой ведущий за столом: можно вздох, паузу, междометие («ну что», «так», «вот»), реакция на имена и аватары. Один и тот же факт можно сказать по-разному — не будь роботом.
- Используй свои прошлые реплики для отсылок («как я и говорил», «вот мы и дошли») — так ты звучишь как один и тот же ведущий.
Пример формата (итог ночи): Факты: Ночью погиб Вася (мирный). → Хороший ответ: Ну что ж, Вася выбыл. Обсуждение.
Пример формата (исключение): Город прощается с Петя (аватар: Лиса), роль — мафия. → Хороший ответ: Петя, наша Лиса, оказался мафией. Такие дела.
`;

const SYSTEM_PROMPT_FUNNY = `${HOST_RULES}
Ты ведущий "Мафии" в образе сапожника — мужик с подворотни, грубоватый, с матом и без церемоний. Говоришь как в гараже или на кухне: просто, по-пацански, с крепким словцом. Разговорчивый: пару фраз для разрядки, подкол, мат к месту. Цель — чтобы за столом ржали.
- Мат — твой родной язык. Подъёбы, сарказм, шутки про аватары (Лиса, Единорог, Сова и т.д.). Упоминай только имена и факты из запроса.
${ROLES_REFERENCE}
Если в запросе переданы твои недавние реплики — можешь делать короткие отсылки к уже сказанному.`;

const STRICT_SYSTEM_PROMPT = `${HOST_RULES}
Ты ведущий "Мафии" — нейтральный диктор. Тон строгий, без шуток и стёба. Объявляешь только факты игры. Разговорный русский, но без мата и подколов. Короткие чёткие фразы.
${ROLES_REFERENCE}
Если в запросе переданы твои недавние реплики — можешь делать короткие отсылки к уже сказанному.`;

const FRIENDLY_SYSTEM_PROMPT = `${HOST_RULES}
Ты ведущий "Мафии" — добрый и весёлый. Шути про аватары и имена игроков, тепло, без мата. Как друг за столом. 2–3 фразы, разговорчиво.
${ROLES_REFERENCE}
Если в запросе переданы твои недавние реплики — можешь делать короткие отсылки к уже сказанному.`;

const CALM_SYSTEM_PROMPT = `${HOST_RULES}
Ты ведущий "Мафии" — спокойный, сдержанный. Короткие нейтральные фразы, только факты. Без шуток и мата. Одна-две фразы.
${ROLES_REFERENCE}
Если в запросе переданы твои недавние реплики — можешь делать короткие отсылки к уже сказанному.`;

const PIRATE_SYSTEM_PROMPT = `${HOST_RULES}
Ты ведущий "Мафии" в образе пирата. Йо-хо-хо, морская тема, драматично, с лёгким юмором. Без грубого мата. Упоминай аватары в морском духе. 2–3 фразы.
${ROLES_REFERENCE}
Если в запросе переданы твои недавние реплики — можешь делать короткие отсылки к уже сказанному.`;

const DETECTIVE_SYSTEM_PROMPT = `${HOST_RULES}
Ты ведущий "Мафии" в стиле сыщика/нуар. Загадочно, коротко, интрига. Без мата. Одна-две фразы.
${ROLES_REFERENCE}
Если в запросе переданы твои недавние реплики — можешь делать короткие отсылки к уже сказанному.`;

const POET_SYSTEM_PROMPT = `${HOST_RULES}
Ты ведущий "Мафии" в образе поэта. Красиво, образно, метафоры. Без мата. 2–3 фразы.
${ROLES_REFERENCE}
Если в запросе переданы твои недавние реплики — можешь делать короткие отсылки к уже сказанному.`;

const TROLL_SYSTEM_PROMPT = `${HOST_RULES}
Ты ведущий "Мафии" — тролль. Подколы, сарказм, провокации. Можно мягкий мат («блин», «ну вы даёте»). Шутки про аватары. 2–3 фразы.
${ROLES_REFERENCE}
Если в запросе переданы твои недавние реплики — можешь делать короткие отсылки к уже сказанному.`;

export const HOST_STYLE_IDS = ['strict', 'funny', 'friendly', 'calm', 'pirate', 'detective', 'poet', 'troll'];

const STYLE_TO_PROMPT = {
  strict: STRICT_SYSTEM_PROMPT,
  funny: SYSTEM_PROMPT_FUNNY,
  friendly: FRIENDLY_SYSTEM_PROMPT,
  calm: CALM_SYSTEM_PROMPT,
  pirate: PIRATE_SYSTEM_PROMPT,
  detective: DETECTIVE_SYSTEM_PROMPT,
  poet: POET_SYSTEM_PROMPT,
  troll: TROLL_SYSTEM_PROMPT,
};

const ROLE_NAMES = {
  mafia: 'мафия',
  don: 'дон',
  doctor: 'доктор',
  detective: 'детектив',
  civilian: 'мирный',
  lucky: 'везунчик',
  journalist: 'журналист',
  veteran: 'ветеран',
};

const FALLBACK = {
  lobby_waiting: (count, need) => `Пока нас ${count} из ${need}. Ждём остальных.`,
  lobby_ready: (need) => `Все в сборе — ${need}. Погнали.`,
  room_created: (name, need) => `Комната открыта. ${name} за столом, добираем ещё до ${need} человек.`,
  player_joined: (name) => `Вот и ${name} с нами.`,
  game_start: 'Сейчас раздаю роли. Погнали.',
  rules_explanation: () => 'Коротко: ночью мафия, доктор, детектив и ветеран делают свой ход. Днём — обсуждение и голосование. Исключённый говорит последнее слово. Побеждают мафия или мирные. Погнали.',
  roles_done: (d) => {
    if (!d?.playerCount) return 'Роли розданы. Город засыпает.';
    const parts = Object.entries(d.roleCounts || {}).map(([role, n]) => {
      const name = ROLE_NAMES[role] || role;
      if (n === 1) return `один ${name}`;
      if (n === 2) return `два ${name}`;
      return `${n} ${name}`;
    });
    return `В игре ${d.playerCount} человек. ${parts.join(', ')}. Город засыпает.`;
  },
  night_close_eyes: (round) => `Ночь ${round}. Все закрывают глаза.`,
  night_mafia_wake: () => 'Мафия, проснитесь. Выберите жертву.',
  night_mafia_sleep: () => 'Мафия, засыпайте.',
  night_mafia_tie: () => 'Мафия не смогла определиться. Переголосование — 10 секунд.',
  night_don_decides: () => 'Дон, решай — кого убираем? Или никого.',
  night_doctor_wake: () => 'Доктор, твоя смена. Кого спасаем?',
  night_doctor_sleep: () => 'Доктор, засыпай.',
  night_detective_wake: () => 'Детектив, твоя очередь. Кого проверить?',
  night_detective_sleep: () => 'Детектив, засыпай.',
  night_morning: () => 'Рассвет. Все открывают глаза.',
  night_summary: (d) => nightSummaryFallback(d),
  day_discussion: (d) => `День ${d.round || 1}. Обсуждение — высказывайтесь.`,
  vote_start: () => 'Обсуждение кончилось. Голосование.',
  vote_counting: () => 'Все проголосовали. Подсчитываю.',
  vote_tie: () => 'Ничья — никто не вылетел. Новая ночь.',
  vote_tie_break: () => 'Жители не смогли определиться. Ещё 30 секунд на обсуждение — голосуйте только между фаворитами.',
  vote_result_summary: (d) => (d.excludedRole ? `Город прощается с ${d.excludedName}. Его роль — ${d.excludedRole}.` : `Город решил: исключён ${d.excludedName}.`),
  game_end_summary: (d) => (d.winner === 'mafia' ? 'Мафия победила.' : 'Мирные победили.'),
  game_end_reveal: () => 'Сейчас раскрою, кто кем был.',
  night_nudge_mafia: () => 'Мафия, выбирайте уже.',
  night_nudge_doctor: () => 'Доктор, решай — кого спасаем?',
  night_nudge_detective: () => 'Детектив, твоя проверка.',
  night_veteran_wake: () => 'Ветеран, проснись. Включить защиту на эту ночь?',
  night_veteran_sleep: () => 'Ветеран, засыпай.',
  night_nudge_veteran: () => 'Ветеран, решай — защищаешься или нет?',
};

/** Одна строка исхода ночи — единственный источник правды для модели. */
function buildNightOutcomeLine(d) {
  const n = d.victimCount ?? (d.killedName ? 1 : 0);
  const parts = [];
  if (n === 0) {
    parts.push('Ночью никто не погиб.');
    if (d.savedByName) parts.push(`Доктор спас: ${d.savedByName}.`);
    if (d.veteranSavedHimself) parts.push('Ветеран защитился.');
  } else if (n === 1 && d.victims?.[0]) {
    parts.push(`Ночью погиб ${d.victims[0].name} (${d.victims[0].roleName}).`);
    if (d.savedByName) parts.push(`Доктор спас: ${d.savedByName}.`);
  } else if (n === 2 && d.victims?.length === 2) {
    parts.push(`Ночью погибли ${d.victims[0].name} (${d.victims[0].roleName}) и ${d.victims[1].name} (${d.victims[1].roleName}).`);
  } else if (d.killedName) {
    parts.push(`Ночью погиб ${d.killedName}.`);
  }
  if (d.detectiveCheckedName != null) parts.push(`Детектив проверил ${d.detectiveCheckedName}: ${d.detectiveWasMafia ? 'мафия' : 'мирный'}.`);
  return parts.length ? parts.join(' ') : 'Ночью никто не пострадал.';
}

function nightSummaryFallback(d) {
  const line = buildNightOutcomeLine(d);
  return `${line} Обсуждение.`;
}

function fallbackText(type, data = {}) {
  const v = FALLBACK[type];
  if (typeof v === 'function') {
    if (type === 'lobby_waiting') return v(data.count, data.need);
    if (type === 'lobby_ready') return v(data.need);
    if (type === 'room_created') return v(data.creatorName, data.need);
    if (type === 'night_summary') return v(data);
    if (type === 'vote_result_summary') return v(data);
    if (type === 'game_end_summary') return v(data);
    if (type === 'roles_done') return v(data);
    if (type === 'rules_explanation') return v();
    if (type === 'day_discussion') return v(data);
    if (type === 'player_joined') return v(data.playerName);
    if (['night_close_eyes', 'night_mafia_wake'].includes(type)) return v(data.round);
    if (type === 'night_mafia_tie') return v();
    if (type === 'vote_tie_break') return v();
    if (type.startsWith('night_nudge_')) return v();
    return v();
  }
  return v || '...';
}

function appendRecentHostLines(base, data) {
  const lines = data.recentHostLines;
  if (!Array.isArray(lines) || lines.length === 0) return base;
  const list = lines.slice(-8).join(' | ');
  return `${base}\n\nНедавние твои реплики в этой игре (для отсылок): ${list}. Можешь сделать уместную отсылку к ним.`;
}

function userMessage(type, data = {}) {
  let base;
  switch (type) {
    case 'lobby_waiting':
      base = `В лобби ${data.count} из ${data.need}. Ждём людей. Одна живая фраза — можно с лёгким стёбом или теплом, по-русски.`;
      break;
    case 'lobby_ready':
      base = `Наконец-то все в сборе — ${data.need} человек. Можно начинать. Одна фраза — радость или лёгкий подъёб.`;
      break;
    case 'room_created':
      base = `Комната открыта. За столом ${data.creatorName}, не хватает ещё до ${data.need} человек. Скажи одну приветственную фразу — тепло, по-свойски, как будто зовёшь друзей за стол. Можно с юмором.`;
      break;
    case 'player_joined':
      base = `Только что зашёл ${data.playerName}. Сейчас ${data.count} из ${data.need}. Одна фраза — обрадуйся по-человечески: «Вот и ${data.playerName}», «Подъехал ${data.playerName}» — живо, без официоза.`;
      break;
    case 'game_start':
      base = 'Сейчас раздаю роли. Одна фраза — с предвкушением, можно чуть зловеще или с юмором, чтобы настроить на игру.';
      break;
    case 'roles_done': {
      const count = data.playerCount || 0;
      const roleCounts = data.roleCounts || {};
      const list = Object.entries(roleCounts)
        .map(([role, n]) => {
          const name = ROLE_NAMES[role] || role;
          if (n === 1) return `один ${name}`;
          if (n === 2) return `два ${name}`;
          return `${n} ${name}`;
        })
        .join(', ');
      base = `Роли розданы. В игре ${count} человек. Состав только такой — назови только эти роли: ${list}. Никаких лишних. Объяви состав живо, по-русски — можно с лёгкой иронией или напряжением. Потом скажи, что город засыпает. Одна-две фразы.`;
      break;
    }
    case 'rules_explanation':
      base = 'Кратко объясни правила игры новичкам: ночь — мафия выбирает жертву, доктор спасает одного, детектив проверяет, ветеран может один раз защититься; день — обсуждение и голосование; исключённый говорит последнее слово; побеждают мафия или мирные. Две-четыре фразы, живо, чтобы все поняли. В своём стиле.';
      break;
    case 'night_close_eyes':
      base = `Ночь ${data.round || 1}. Все закрывают глаза. Одна фраза — тихо, с атмосферой, можно чуть зловеще или с юмором.`;
      break;
    case 'night_mafia_wake':
      base = 'Мафия просыпается: откройте глаза, узнайте своих, выберите жертву. Одна реплика — напряжение, можно с лёгким злодейским оттенком или стёбом.';
      break;
    case 'night_mafia_sleep':
      base = 'Мафия засыпает. Коротко — можно с намёком или иронией.';
      break;
    case 'night_mafia_tie':
      base = 'Мафия не смогла определиться — ничья. Объяви переголосование: 10 секунд, можно с стёбом.';
      break;
    case 'night_don_decides':
      base = 'Дон просыпается. При ничьей мафии за ним последнее слово — выбери жертву или никого. Одна реплика.';
      break;
    case 'night_doctor_wake':
      base = 'Доктор, твоя смена. Кого спасаем этой ночью? Одна реплика — можно с надеждой или лёгким юмором.';
      break;
    case 'night_doctor_sleep':
      base = 'Доктор засыпает. Коротко.';
      break;
    case 'night_detective_wake':
      base = 'Детектив, твоя очередь. Кого проверить? Одна реплика — интрига, можно с намёком.';
      break;
    case 'night_detective_sleep':
      base = 'Детектив засыпает. Коротко.';
      break;
    case 'night_morning':
      base = 'Рассвет. Все открывают глаза. Одна фраза — облегчение, драма или ирония, в зависимости от того, что было ночью.';
      break;
    case 'night_summary': {
      const outcomeLine = buildNightOutcomeLine(data);
      base = `Единственный факт этой ночи (озвучь именно его, не придумывай другой исход): ${outcomeLine}\n\nРаунд ${data.round || 1}. Своими словами, в своём стиле, добавь тон (шутку/драму). Скажи по-своему, не шаблонно; можно начать с паузы или междометия. Одна-три фразы. Обсуждение объявишь отдельно. Упоминай только имена и факты из этого сообщения.`;
      break;
    }
    case 'day_discussion':
      base = `День ${data.round || 1}. Объяви обсуждение: высказывайтесь, подозревайте, разбирайте. Голосование объявлю, когда будете готовы. Одна-две фразы — живо, по-свойски, можно с подкалом.`;
      break;
    case 'vote_start':
      base = 'Обсуждение кончилось. Голосование — кого выносим? Одна фраза, можно с напряжением или стёбом.';
      break;
    case 'vote_counting':
      base = 'Все проголосовали. Сейчас подсчитаю голоса. Одна короткая фраза.';
      break;
    case 'vote_tie':
      base = 'Ничья — никто не вылетел. Ночь. Одна фраза — можно с иронией («город решил помиловать всех») или облегчением.';
      break;
    case 'vote_tie_break':
      base = 'Жители не смогли определиться. Объяви: 30 секунд на обсуждение, голосовать только между фаворитами. Участники, против которых голосуют, в переголосовании голоса не имеют.';
      break;
    case 'vote_result_summary': {
      const exclRu = data.excludedAvatarId ? avatarRu(data.excludedAvatarId) : null;
      base = `Город прощается с ${data.excludedName}${exclRu ? ` (аватар: ${exclRu})` : ''}. Раскрой роль: ${data.excludedRole || 'игрок'}. Пошути про аватар и роль. Скажи по-своему, не шаблонно; можно начать с паузы или междометия. С характером, без цензуры. Одна-две фразы.`;
      break;
    }
    case 'game_end_summary': {
      const who = data.winner === 'mafia' ? 'мафия' : 'мирные';
      base = `Игра окончена. Победили ${who}. Скажи это с характером — можно злорадством, облегчением или стёбом. Роли раскроешь в следующей реплике. Одна-две фразы.`;
      break;
    }
    case 'game_end_reveal': {
      const list = (data.rolesReveal || []).map((p) => {
        const avatarRuName = p.avatarId ? avatarRu(p.avatarId) : null;
        return `${p.name}${avatarRuName ? ` (${avatarRuName})` : ''} — ${ROLE_NAMES[p.role] || p.role}`;
      }).join('; ');
      base = `Расклад: ${list}. Огласи кто кем был — обыгрывай аватары в шутках, без цензуры, с юмором и матом где уместно. Скажи по-своему, не шаблонно; можно начать с паузы или междометия. Две-три фразы, чтобы было смешно.`;
      break;
    }
    case 'night_nudge_mafia':
      base = 'Мафия тянет. Подгони или пошути — одна фраза, можно с лёгким матом или стёбом.';
      break;
    case 'night_nudge_doctor':
      base = 'Доктор думает. Подгони или пошути — одна фраза.';
      break;
    case 'night_nudge_detective':
      base = 'Детектив копается. Подгони или пошути — одна фраза.';
      break;
    case 'night_veteran_wake':
      base = 'Ветеран, проснись. Один раз за игру можешь включить защиту — этой ночью не убьют. Включаешь или нет? Одна реплика — можно с намёком.';
      break;
    case 'night_veteran_sleep':
      base = 'Ветеран засыпает. Коротко.';
      break;
    case 'night_nudge_veteran':
      base = 'Ветеран не определился. Подгони — одна фраза.';
      break;
    default:
      base = 'Одна короткая реплика ведущего — живой русский, можно с юмором или стёбом.';
  }
  if (data.gameContext && typeof data.gameContext === 'string' && data.gameContext.trim()) {
    base = `Контекст игры: ${data.gameContext.trim()}\n\n${base}`;
  }
  return appendRecentHostLines(base, data);
}

const AI_TIMEOUT_MS = 3000;
const AI_SUMMARY_TIMEOUT_MS = 5000;
const SUMMARY_TYPES = ['night_summary', 'vote_result_summary', 'game_end_summary', 'game_end_reveal'];

/** Убирает пометки и кавычки из ответа ИИ перед озвучкой. */
function postProcessHostLine(text) {
  if (!text || typeof text !== 'string') return text;
  let s = text.trim();
  s = s.replace(/^(\s*)(Ведущий|Диктор|Host):\s*/gi, '').trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith('«') && s.endsWith('»'))) s = s.slice(1, -1).trim();
  s = s.replace(/\n+/g, ' ');
  return s.trim() || text.trim();
}

/** Конфиг LLM для генерации реплик: OpenAI или DeepSeek (см. LLM_PROVIDER в .env). */
function getLLMConfig() {
  const provider = (process.env.LLM_PROVIDER || 'openai').toLowerCase();
  if (provider === 'deepseek') {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    return apiKey
      ? { url: 'https://api.deepseek.com/v1/chat/completions', apiKey, model: 'deepseek-chat' }
      : null;
  }
  const apiKey = process.env.OPENAI_API_KEY;
  return apiKey
    ? { url: 'https://api.openai.com/v1/chat/completions', apiKey, model: 'gpt-4o-mini' }
    : null;
}

export async function getHostLine(type, data = {}) {
  const llm = getLLMConfig();
  if (!llm) return fallbackText(type, data);

  const style = HOST_STYLE_IDS.includes(data.voiceStyle) ? data.voiceStyle : 'funny';
  const systemPrompt = STYLE_TO_PROMPT[style];
  const temperature = (style === 'strict' || style === 'calm') ? 0.6 : 0.85;

  const maxTokens = SUMMARY_TYPES.includes(type) ? 280 : 140;
  const timeoutMs = SUMMARY_TYPES.includes(type) ? AI_SUMMARY_TIMEOUT_MS : AI_TIMEOUT_MS;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const r = await fetch(llm.url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${llm.apiKey}`,
      },
      body: JSON.stringify({
        model: llm.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage(type, data) },
        ],
        max_tokens: maxTokens,
        temperature,
      }),
    });
    clearTimeout(timeoutId);
    if (!r.ok) return fallbackText(type, data);
    const j = await r.json();
    let text = j.choices?.[0]?.message?.content?.trim();
    if (!text || text.length === 0) return fallbackText(type, data);
    text = postProcessHostLine(text);
    return text.length > 0 ? text : fallbackText(type, data);
  } catch (e) {
    clearTimeout(timeoutId);
    if (e?.name === 'AbortError') {
      /* таймаут — сразу fallback, игра не зависает */
    } else {
      console.error('hostAI error', type, e?.message);
    }
    return fallbackText(type, data);
  }
}
