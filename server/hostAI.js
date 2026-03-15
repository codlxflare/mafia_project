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
Классика по числу игроков: 5 — одна мафия, доктор, детектив, мирные; 6 — мафия, дон, доктор, детектив, мирные; 7 — две мафии, доктор, детектив, мирные; 8+ — две мафии, дон, доктор, детектив, мирные.
`;

const HOST_RULES = `Правила (обязательно):
- Объявляй только то, что явно передано в текущем сообщении (кто погиб, кого спас доктор, кого исключили, кто кем был). Запрещено придумывать события, имена или роли.
- Если в фактах указан погибший ночью — обязательно объяви кто погиб. Запрещено говорить «ночью ничего не было» или «никто не погиб», если в фактах перечислен погибший.
- Роль исключённого не раскрывай до финала; раскрывай только когда в фактах явно сказано «раскрой роль».
- Результаты проверки детектива никогда не объявляй и не упоминай — они в тайне. Не произноси подсказки интерфейса (типа «результат отображается над аватаром»).
- Ответ — только текст для озвучки: 1–3 короткие фразы, без кавычек, без пометок («Ведущий:», списков, тире). Один абзац. Запрещено произносить инструкции вроде «одна реплика», «можно с юмором», «скажи одну фразу» — только сам текст объявления.
- В сообщении указано, какое сейчас событие. Не объявляй другие фазы и не смешивай события.
- Веди себя как живой ведущий за столом: можно вздох, паузу, междометие («ну что», «так», «вот»), реакция на имена и аватары. Не повторяй дословно свои недавние реплики — формулируй по-другому.
- Используй прошлые реплики только для коротких отсылок («как я и говорил»), но не копируй их слово в слово.
- Говори каждый раз по-разному: импровизируй, как живой ведущий. Один и тот же факт — разными словами, без шаблонных фраз. Реагируй на имена и контекст, добавляй оттенок (ирония, драма, спокойствие) в зависимости от ситуации.
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
};

const FALLBACK = {
  lobby_waiting: (count, need) => `Пока нас ${count} из ${need}. Ждём остальных.`,
  lobby_ready: (need) => `Все в сборе — ${need}. Погнали.`,
  room_created: (name, need) => `Комната открыта. ${name} за столом, добираем ещё до ${need} человек.`,
  player_joined: (name) => `Вот и ${name} с нами.`,
  game_start: 'Сейчас раздаю роли. Погнали.',
  rules_explanation: () => 'Коротко: ночью мафия, дон, доктор, детектив делают свой ход. Днём — обсуждение и голосование. Исключённый говорит последнее слово. Побеждают мафия или мирные. Погнали.',
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
  night_mafia_chose: () => 'Мафия сделала выбор.',
  night_don_decides: () => 'Дон, решай — кого убираем? Или никого.',
  night_don_decides_chose: () => 'Дон сделал выбор.',
  night_don_check_wake: () => 'Дон, проснись. Проверь одного игрока — детектив он или нет.',
  night_don_check_sleep: () => 'Дон, засыпай.',
  night_don_check_chose: () => 'Дон сделал выбор.',
  night_doctor_wake: () => 'Доктор, твоя смена. Кого спасаем?',
  night_doctor_sleep: () => 'Доктор, засыпай.',
  night_doctor_chose: () => 'Доктор сделал выбор.',
  night_detective_wake: () => 'Детектив, твоя очередь. Кого проверить?',
  night_detective_sleep: () => 'Детектив, засыпай.',
  night_detective_chose: () => 'Детектив сделал выбор.',
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
};

/** Одна строка исхода ночи — единственный источник правды для модели. */
function buildNightOutcomeLine(d) {
  const n = d.victimCount ?? (d.killedName ? 1 : 0);
  const parts = [];
  if (n === 0) {
    parts.push('Ночью никто не погиб.');
    if (d.savedByName) parts.push('Доктор кого-то спас.');
  } else if (n === 1 && d.victims?.[0]) {
    parts.push(`Ночью погиб ${d.victims[0].name} (${d.victims[0].roleName}).`);
    if (d.savedByName) parts.push('Доктор кого-то спас.');
  } else if (n === 2 && d.victims?.length === 2) {
    parts.push(`Ночью погибли ${d.victims[0].name} (${d.victims[0].roleName}) и ${d.victims[1].name} (${d.victims[1].roleName}).`);
  } else if (d.killedName) {
    parts.push(`Ночью погиб ${d.killedName}.`);
  }
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
    if (['night_mafia_chose', 'night_don_decides_chose', 'night_don_check_chose', 'night_doctor_chose', 'night_detective_chose'].includes(type)) return v();
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
  return `${base}\n\nНедавние твои реплики (не повторяй их дословно; скажи по-другому): ${list}.`;
}

function userMessage(type, data = {}) {
  let base;
  switch (type) {
    case 'lobby_waiting':
      base = `В лобби ${data.count} из ${data.need}. Ждём людей. Короткая живая фраза по-русски.`;
      break;
    case 'lobby_ready':
      base = `Наконец-то все в сборе — ${data.need} человек. Можно начинать. Коротко, радость или подъёб.`;
      break;
    case 'room_created':
      base = `Комната открыта. За столом ${data.creatorName}, не хватает ещё до ${data.need} человек. Приветственная фраза — тепло, по-свойски.`;
      break;
    case 'player_joined':
      base = `Только что зашёл ${data.playerName}. Сейчас ${data.count} из ${data.need}. Обрадуйся по-человечески, живо, без официоза.`;
      break;
    case 'game_start':
      base = 'Сейчас раздаю роли. Короткая фраза с предвкушением, чтобы настроить на игру.';
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
      base = `Роли розданы. В игре ${count} человек. Состав только такой — назови только эти роли: ${list}. Никаких лишних. Объяви состав живо. Не говори что город засыпает — правила и начало ночи будут объявлены отдельно.`;
      break;
    }
    case 'rules_explanation':
      base = 'Кратко объясни правила игры новичкам: ночь — мафия и дон выбирают жертву, дон может проверить одного (детектив или нет), доктор спасает одного, детектив проверяет или стреляет; день — обсуждение и голосование; исключённый говорит последнее слово; побеждают мафия или мирные. Две-четыре фразы, живо. В своём стиле.';
      break;
    case 'night_close_eyes':
      base = `Ночь ${data.round || 1}. Все закрывают глаза. Коротко, тихо, с атмосферой.`;
      break;
    case 'night_mafia_wake':
      base = 'Мафия просыпается: откройте глаза, узнайте своих, выберите жертву. Коротко, с напряжением.';
      break;
    case 'night_mafia_sleep':
      base = 'Мафия засыпает. Коротко.';
      break;
    case 'night_mafia_tie':
      base = 'Мафия не смогла определиться — ничья. Объяви переголосование: 10 секунд.';
      break;
    case 'night_mafia_chose':
      base = 'Скажи коротко, что мафия сделала выбор (без повторения «проснитесь»). Одна фраза.';
      break;
    case 'night_don_decides':
      base = 'Дон просыпается. При ничьей мафии за ним последнее слово — выбери жертву или никого.';
      break;
    case 'night_don_decides_chose':
      base = 'Скажи коротко, что дон сделал выбор. Одна фраза.';
      break;
    case 'night_don_check_wake':
      base = 'Дон просыпается отдельно. Можешь проверить одного игрока — детектив он или нет. Только проверка, без убийства. Не говори мафии засыпать — они уже получили команду.';
      break;
    case 'night_don_check_sleep':
      base = 'Дон засыпает. Коротко.';
      break;
    case 'night_don_check_chose':
      base = 'Скажи коротко, что дон сделал выбор (проверку). Одна фраза.';
      break;
    case 'night_doctor_wake':
      base = 'Доктор, твоя смена. Кого спасаем этой ночью?';
      break;
    case 'night_doctor_sleep':
      base = 'Доктор засыпает. Коротко.';
      break;
    case 'night_doctor_chose':
      base = 'Скажи коротко, что доктор сделал выбор. Одна фраза.';
      break;
    case 'night_detective_wake':
      base = 'Детектив, твоя очередь. Кого проверить?';
      break;
    case 'night_detective_sleep':
      base = 'Детектив засыпает. Коротко.';
      break;
    case 'night_detective_chose':
      base = 'Скажи коротко, что детектив сделал выбор. Одна фраза.';
      break;
    case 'night_morning':
      base = 'Скажи только: рассвет, все открывают глаза. Не объявляй итог ночи, не говори кто погиб, не говори что ночь прошла хорошо или спокойно — итог будет объявлен отдельно в следующей реплике. Одна короткая нейтральная фраза.';
      break;
    case 'night_summary': {
      const outcomeLine = buildNightOutcomeLine(data);
      base = `Факт этой ночи (озвучь именно его, не выдумывай): ${outcomeLine}\n\nЕсли в фактах указан погибший — обязательно назови его. Запрещено говорить «ночью ничего не было», «ночь прошла хорошо», «ночь прошла спокойно», если перечислен погибший. Не раскрывай кто убил (роли мафии/дона). Не называй имя того, кого спас доктор — можно сказать только «доктор кого-то спас». Объявляются только погибшие (имя и роль погибшего). Проверку детектива не упоминай. Раунд ${data.round || 1}. Своими словами. В конце объяви обсуждение.`;
      break;
    }
    case 'day_discussion':
      base = `День ${data.round || 1}. Объяви обсуждение: высказывайтесь, подозревайте, разбирайте. Голосование объявлю, когда будете готовы.`;
      break;
    case 'vote_start':
      base = 'Обсуждение кончилось. Голосование — кого выносим?';
      break;
    case 'vote_counting':
      base = 'Все проголосовали. Сейчас подсчитаю голоса.';
      break;
    case 'vote_tie':
      base = 'Строго по фактам: ничья — никто не вылетел. Ночь. Не говори что кого-то исключили.';
      break;
    case 'vote_tie_break':
      base = 'Строго по фактам: ничья. Объяви переголосование: 30 секунд, голосовать только между фаворитами. Пока никого не исключили — не объявляй исключение.';
      break;
    case 'vote_result_summary': {
      const exclRu = data.excludedAvatarId ? avatarRu(data.excludedAvatarId) : null;
      base = `По фактам: город исключил ${data.excludedName}${exclRu ? ` (аватар: ${exclRu})` : ''}. Раскрой роль: ${data.excludedRole || 'игрок'}. Говори только то, что передано — не делай поспешных выводов. Не объявляй исключение, если в сообщении указана ничья.`;
      break;
    }
    case 'game_end_summary': {
      const who = data.winner === 'mafia' ? 'мафия' : 'мирные';
      base = `Игра окончена. Победили ${who}. Скажи это с характером. Роли раскроешь в следующей реплике.`;
      break;
    }
    case 'game_end_reveal': {
      const list = (data.rolesReveal || []).map((p) => {
        const avatarRuName = p.avatarId ? avatarRu(p.avatarId) : null;
        return `${p.name}${avatarRuName ? ` (${avatarRuName})` : ''} — ${ROLE_NAMES[p.role] || p.role}`;
      }).join('; ');
      base = `Расклад: ${list}. Огласи кто кем был — обыгрывай аватары в шутках, без цензуры. Скажи по-своему.`;
      break;
    }
    case 'night_nudge_mafia':
      base = 'Мафия тянет. Подгони или пошути.';
      break;
    case 'night_nudge_doctor':
      base = 'Доктор думает. Подгони или пошути.';
      break;
    case 'night_nudge_detective':
      base = 'Детектив копается. Подгони или пошути.';
      break;
    default:
      base = 'Короткая реплика ведущего в своём стиле.';
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
function postProcessHostLine(text, opts = {}) {
  if (!text || typeof text !== 'string') return text;
  let s = text.trim();
  s = s.replace(/^(\s*)(Ведущий|Диктор|Host):\s*/gi, '').trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith('«') && s.endsWith('»'))) s = s.slice(1, -1).trim();
  s = s.replace(/\n+/g, ' ');
  if (opts.victimCount > 0) {
    s = s.replace(/\s*[Нн]очь прошла (хорошо|спокойно|тихо)[^.]*\.?/gi, ' ').trim();
    s = s.replace(/\s*[Вв]сё (хорошо|спокойно)[^.]*\.?/gi, ' ').trim();
  }
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
    text = postProcessHostLine(text, { victimCount: data.victimCount });
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
