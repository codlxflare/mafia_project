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
- Объявляй только то, что явно передано в текущем сообщении (кто погиб, кого спас доктор, кого исключили; в финале — кто кем был). Запрещено придумывать события, имена или роли.
- Если в фактах указан погибший ночью — обязательно объяви по имени. Запрещено говорить «ночью ничего не было» или «никто не погиб», если в фактах перечислен погибший.
- Роли погибших и исключённых не раскрывай до финала игры. Объявляй только имя (и аватар по контексту), без слова «роль», «оказался мафией» и т.п. Роли раскрывай только когда в сообщении явно сказано «раскрой роль» (финал).
- Результаты проверки детектива никогда не объявляй и не упоминай. Не произноси подсказки интерфейса.
- Запрещено говорить мета-фразы: «не говорю пока кого убрали», «сейчас не скажу», «позже раскрою» и т.п. Просто объявляй факты нейтрально и разнообразно.
- Никогда не торопи игроков: запрещены слова и смыслы «тороплю», «быстрее», «давайте быстрее», «наконец», «скоро уже» — игроки могут ещё слушать озвучку или обдумывать выбор. Одна реплика — одна мысль, без давления.
- Ответ — только то, что ведущий говорит вслух. Один абзац: объявление по событию (1–3 фразы), без кавычек. Запрещено включать любые инструкции для озвучки: нельзя писать «озвучь», «произнеси», «скажи с паузой», «нейтрально», ремарки в скобках для диктора, пометки в квадратных скобках. Пиши только готовый текст реплики — он сразу пойдёт в TTS. По желанию в конце одна короткая шутка. Запрещено слово «красавчики».
- В сообщении указано, какое сейчас событие. Не объявляй другие фазы и не смешивай события.
- Веди себя как живой ведущий: вздох, пауза, междометие, реакция на имена и аватары. Не повторяй дословно недавние реплики.
- Говори каждый раз по-разному: импровизируй. Один и тот же факт — разными словами. Реагируй на имена и контекст. Разнообразно и колоритно.
Пример (итог ночи, без роли): Факты: Ночью погиб Вася. → Вася выбыл. Обсуждение. (или: Итак, Вася. Обсуждение.)
Пример (исключение, без роли): Город исключил Петя (Лиса). → Петя, наша Лиса, покидает стол. (роль не называй)
`;

/** Строгий ведущий: важный, педантичный, как на официальном турнире. */
const STRICT_SYSTEM_PROMPT = `${HOST_RULES}
Ты ведущий "Мафии" в образе строгого официального ведущего — важный, педантичный, как на турнире или церемонии. Никакого панибратства и шуток.
Поведение:
- Говоришь чётко, ровно, по делу. Только факты: кто погиб, кого исключили, переход фаз. Без комментариев и обыгрывания.
- Фразы короткие и ясные: одна-две реплики. «Ночью погиб такой-то.» «Город исключил такого-то.» «Обсуждение.» «Голосование.»
- Не торопишь игроков, не комментируешь выбор. Профессиональная дистанция. Краткая пауза перед итогом ночи или финалом — для серьёзности, без юмора.
- Имена и аватары — нейтрально, без обыгрывания. «Петя выбыл.» — не «Наша Лиса Петя».
- Каждое объявление — как диктор: факт, тон, конец. Варьируй формулировки нейтрально («выбыл», «покидает игру», «исключён по решению города»).
${ROLES_REFERENCE}
Если в запросе переданы твои недавние реплики — не копируй их, скажи по-другому в том же строгом стиле.`;

/** Весёлый ведущий: шутит чутко и смешно, мат к месту. */
const SYSTEM_PROMPT_FUNNY = `${HOST_RULES}
Ты ведущий "Мафии" — весёлый и живой. Шутишь чутко и смешно, мат к месту — без цензуры, но стёб над ситуацией и именами, не оскорбляй игроков лично. Цель — чтобы за столом ржали.
Поведение:
- На имена и аватары — реакция: «Сова вылетела — хоть не сова-мама», «Единорога вынесли — рог не спас». Шутки про Лису, Медведя, Кролика — уместно. Запрещено только слово «красавчики». Мат и крепкое словцо — по делу, при убийстве, исключении, ничьей.
- 2–3 фразы за раз: факт плюс ремарка или шутка. Не повторяй одни и те же формулировки — каждый раз новая реакция на имена и контекст.
- При ничьей, переголосовании — можно съязвить: «дружба победила», «решили никого не обижать». При победе мафии/мирных — с характером, можно сарказм или одобрение.
- При нудже (напоминание про выбор) — одна короткая мягкая фраза, без «тороплю», «быстрее», «наконец» — не дави на игроков.
${ROLES_REFERENCE}
Если в запросе переданы твои недавние реплики — не копируй, скажи по-другому. Каждый раз разные шутки и ремарки, мат — к месту.`;

export const HOST_STYLE_IDS = ['strict', 'funny'];

const STYLE_TO_PROMPT = {
  strict: STRICT_SYSTEM_PROMPT,
  funny: SYSTEM_PROMPT_FUNNY,
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

/** Детерминированная реплика расклада ролей (финал). */
function buildRevealLine(rolesReveal) {
  if (!Array.isArray(rolesReveal) || rolesReveal.length === 0) return 'Сейчас раскрою, кто кем был.';
  const parts = (rolesReveal || []).map((p) => {
    const avatarRuName = p.avatarId ? avatarRu(p.avatarId) : null;
    const roleName = ROLE_NAMES[p.role] || p.role;
    return `${p.name}${avatarRuName ? ` (${avatarRuName})` : ''} — ${roleName}`;
  });
  return `Кто кем был: ${parts.join('; ')}.`;
}

const FALLBACK = {
  lobby_waiting: (count, need) => `Пока нас ${count} из ${need}. Ждём остальных.`,
  lobby_ready: (need) => `Все в сборе — ${need}. Погнали.`,
  room_created: (name, need) => `Комната открыта. ${name} за столом, добираем ещё до ${need} человек.`,
  player_joined: (name) => `Вот и ${name} с нами.`,
  players_enter_room: (d) => `Все за столом — ${d.playerCount ?? 0} человек. Занимайте места, сейчас раздадим роли.`,
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
  night_detective_sleep: () => 'Детектив, засыпай.', // не спрашивать кого проверить — выбор уже сделан
  night_detective_chose: () => 'Детектив сделал выбор.',
  night_morning: () => 'Рассвет. Все открывают глаза.',
  night_summary: (d) => nightSummaryFallback(d),
  day_discussion: (d) => `День ${d.round || 1}. Обсуждение — высказывайтесь.`,
  vote_start: () => 'Обсуждение кончилось. Голосование.',
  vote_counting: () => 'Подсчитываю голоса.',
  vote_tie: () => 'Ничья — никто не вылетел. Новая ночь.',
  vote_tie_break: () => 'Жители не смогли определиться. Ещё 30 секунд на обсуждение — голосуйте только между фаворитами.',
  player_excluded_announce: (d) => `Город исключил ${d.excludedName}. Последнее слово — ${d.lastWordsSec ?? 20} секунд.`,
  vote_result_summary: (d) => `Город исключил ${d.excludedName}.`,
  game_end_summary: (d) => (d.winner === 'mafia' ? 'Мафия победила.' : 'Мирные победили.'),
  game_end_reveal: (d) => buildRevealLine(d.rolesReveal),
  night_nudge_mafia: () => 'Мафия, определитесь с жертвой.',
  night_nudge_doctor: () => 'Доктор, кого спасаем этой ночью?',
  night_nudge_detective: () => 'Детектив, кого проверяем?',
};

/** Одна строка исхода ночи для ведущего. Имена погибших — без ролей (роли не раскрывать до финала). Учитывает мафию и выстрел комиссара. */
function buildNightOutcomeLine(d) {
  const n = d.victimCount ?? (d.killedName ? 1 : 0);
  const victims = d.victims && Array.isArray(d.victims) ? d.victims : [];
  const parts = [];
  if (n === 0) {
    parts.push('Ночью никто не погиб.');
    if (d.savedByName) parts.push('Доктор кого-то спас.');
  } else if (n === 1 && victims[0]) {
    parts.push(`Ночью погиб ${victims[0].name}.`);
    if (d.savedByName) parts.push('Доктор кого-то спас.');
  } else if (n >= 2 && victims.length >= 2) {
    const names = victims.slice(0, n).map((v) => v.name).filter(Boolean);
    parts.push(names.length ? `Ночью погибли ${names.join(' и ')}.` : 'Ночью погибли двое.');
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
    if (type === 'players_enter_room') return v(data);
    if (type === 'night_summary') return v(data);
    if (type === 'vote_result_summary') return v(data);
    if (type === 'game_end_summary') return v(data);
    if (type === 'game_end_reveal') return v(data);
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
    case 'players_enter_room': {
      const count = data.playerCount ?? 0;
      const names = (data.playerNames && typeof data.playerNames === 'object') ? Object.values(data.playerNames).filter(Boolean).slice(0, 12) : [];
      base = `Игроки входят в комнату. За столом ${count} человек${names.length ? `: ${names.join(', ')}` : ''}. Коротко поприветствуй всех, что все на местах — сейчас будет раздача ролей. Одна-две фразы.`;
      break;
    }
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
      base = 'Мафия засыпает. Скажи только это: закройте глаза, засыпайте. Никакого «проснитесь», «вставайте», «откройте глаза» — только команда заснуть.';
      break;
    case 'night_mafia_tie':
      base = 'Мафия не смогла определиться — ничья. Объяви переголосование: 10 секунд.';
      break;
    case 'night_mafia_chose':
      base = 'Скажи только, что мафия сделала выбор. Одна короткая фраза. Запрещено говорить «проснитесь», «вставайте», «откройте глаза» — следующая реплика будет «мафия засыпает».';
      break;
    case 'night_don_decides':
      base = 'Дон просыпается. При ничьей мафии за ним последнее слово — выбери жертву или никого.';
      break;
    case 'night_don_decides_chose':
      base = 'Скажи коротко, что дон сделал выбор. Без торопления. Одна нейтральная фраза.';
      break;
    case 'night_don_check_wake':
      base = 'Дон просыпается отдельно. Можешь проверить одного игрока — детектив он или нет. Только проверка, без убийства. Не говори мафии засыпать — они уже получили команду.';
      break;
    case 'night_don_check_sleep':
      base = 'Дон уже сделал проверку. Скажи только что дон засыпает — одна короткая фраза. Запрещено говорить «проснись», «выбирай», «кого проверить» — это была команда на сон.';
      break;
    case 'night_don_check_chose':
      base = 'Скажи только одну фразу: что дон сделал выбор (проверку). Запрещено говорить «выбирай», «кого проверить», «открой глаза» — выбор уже сделан.';
      break;
    case 'night_doctor_wake':
      base = 'Доктор, твоя смена. Кого спасаем этой ночью?';
      break;
    case 'night_doctor_sleep':
      base = 'Доктор уже сделал выбор. Скажи только что доктор засыпает — одна короткая фраза. Запрещено говорить «проснись», «выбирай», «кого спасать» — это команда заснуть.';
      break;
    case 'night_doctor_chose':
      base = 'Скажи только одну фразу: что доктор сделал выбор. Запрещено говорить «выбирай», «кого спасать», «открой глаза» — выбор уже сделан.';
      break;
    case 'night_detective_wake':
      base = 'Детектив, твоя очередь. Кого проверить?';
      break;
    case 'night_detective_sleep':
      base = 'Детектив уже сделал выбор. Скажи только что он засыпает — одна короткая фраза. Запрещено спрашивать «кого проверить» или «кого подозреваешь» — выбор уже сделан.';
      break;
    case 'night_detective_chose':
      base = 'Скажи только одну фразу: что детектив сделал выбор. Запрещено говорить «выбирай», «кого проверить», «определись» — выбор уже сделан.';
      break;
    case 'night_morning':
      base = 'Скажи только: рассвет, все открывают глаза. Не объявляй итог ночи, не говори кто погиб, не говори что ночь прошла хорошо или спокойно — итог будет объявлен отдельно в следующей реплике. Одна короткая нейтральная фраза.';
      break;
    case 'night_summary': {
      const outcomeLine = buildNightOutcomeLine(data);
      base = `Факт этой ночи: ${outcomeLine}\n\nОзвучь именно это. Если погиб один — назови по имени. Если погибли несколько (мафия и/или выстрел комиссара) — назови всех погибших по именам. Роль не раскрывай. Запрещено говорить «ночью ничего не было», если в фактах перечислен погибший. Не раскрывай кто убил. Доктора можно упомянуть только как «доктор кого-то спас». Проверку детектива не упоминай. Раунд ${data.round || 1}. Своими словами, разнообразно. В конце объяви обсуждение.`;
      break;
    }
    case 'day_discussion':
      base = `День ${data.round || 1}. Объяви обсуждение: высказывайтесь, подозревайте, разбирайте. Голосование объявлю, когда будете готовы.`;
      break;
    case 'vote_start':
      base = 'Обсуждение кончилось. Голосование — кого выносим?';
      break;
    case 'vote_counting':
      base = 'Скажи нейтрально, что подсчитываешь голоса (без фраз вроде «все проголосовали» или «быстрее» — без торопления). Одна короткая фраза.';
      break;
    case 'vote_tie':
      base = 'Строго по фактам: ничья — никто не вылетел. Ночь. Не говори что кого-то исключили.';
      break;
    case 'vote_tie_break':
      base = 'Строго по фактам: ничья. Объяви переголосование: 30 секунд, голосовать только между фаворитами. Пока никого не исключили — не объявляй исключение.';
      break;
    case 'player_excluded_announce':
      base = `Город исключил ${data.excludedName}. Объяви что сейчас последнее слово — ${data.lastWordsSec ?? 20} секунд. Одна-две короткие фразы, без торопления.`;
      break;
    case 'vote_result_summary': {
      const exclRu = data.excludedAvatarId ? avatarRu(data.excludedAvatarId) : null;
      base = `По фактам: город исключил ${data.excludedName}${exclRu ? ` (аватар: ${exclRu})` : ''}. Роль не раскрывай — объяви только факт исключения (имя, можно обыграть аватар). В предыдущей реплике ты уже сказал «последнее слово — 20 секунд» — не повторяй это: не говори «последнее слово», «20 секунд», «скажи последнее слово». Одна реплика — итог исключения, без напоминания про таймер.`;
      break;
    }
    case 'game_end_summary': {
      const who = data.winner === 'mafia' ? 'мафия' : 'мирные';
      base = `Игра окончена. Победили ${who}. Одна короткая реплика с характером — только объяви победителя. Роли не называй, их огласишь в следующей фразе.`;
      break;
    }
    case 'game_end_reveal': {
      const list = (data.rolesReveal || []).map((p) => {
        const avatarRuName = p.avatarId ? avatarRu(p.avatarId) : null;
        return `${p.name}${avatarRuName ? ` (${avatarRuName})` : ''} — ${ROLE_NAMES[p.role] || p.role}`;
      }).join('; ');
      base = `В предыдущей реплике ты уже объявил победителя. Сейчас ТОЛЬКО огласи расклад ролей: ${list}. Не повторяй итог игры, не говори «игра окончена» или «победила мафия». Одна реплика: кто какую роль играл — можно обыграть аватары.`;
      break;
    }
    case 'night_nudge_mafia':
      base = 'Мягко напомни мафии/дону про выбор. Одна короткая нейтральная фраза — без «быстрее», «уже», «тороплю». Не дави, игроки могут ещё слушать или думать.';
      break;
    case 'night_nudge_doctor':
      base = 'Мягко напомни доктору, кого спасает. Одна короткая нейтральная фраза — без торопления и давления.';
      break;
    case 'night_nudge_detective':
      base = 'Мягко напомни детективу, кого проверить. Одна короткая нейтральная фраза — без торопления и давления.';
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

/** Убирает пометки, кавычки и инструкции для TTS из ответа ИИ. */
function postProcessHostLine(text, opts = {}) {
  if (!text || typeof text !== 'string') return text;
  let s = text.trim();
  s = s.replace(/^(\s*)(Ведущий|Диктор|Host):\s*/gi, '').trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith('«') && s.endsWith('»'))) s = s.slice(1, -1).trim();
  s = s.replace(/\n+/g, ' ');
  s = s.replace(/\s*\[[^\]]*\]\s*/g, ' ').trim();
  s = s.replace(/^\s*(Озвучь|Произнеси|Скажи|Реплика|Текст для озвучки|Текст реплики|Говори|С паузой|Нейтрально|С интонацией|Инструкция|Пометка для TTS):\s*/gi, '').trim();
  s = s.replace(/\s*(озвучь|произнеси|скажи|реплика|говори)\s*[:\-]\s*/gi, ' ').trim();
  s = s.replace(/\s*\([^)]*(?:озвучь|произнеси|пауз|интонац|нейтрально|ремарка|для диктора|для TTS)\)\s*/gi, ' ').trim();
  if (opts.victimCount > 0) {
    s = s.replace(/\s*[Нн]очь прошла (хорошо|спокойно|тихо)[^.]*\.?/gi, ' ').trim();
    s = s.replace(/\s*[Вв]сё (хорошо|спокойно)[^.]*\.?/gi, ' ').trim();
  }
  s = s.replace(/\s+/g, ' ').trim();
  return s.length > 0 ? s : text.trim();
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
  const temperature = style === 'strict' ? 0.6 : 0.85;

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
    if (type === 'game_end_reveal') {
      const summaryLike = /игра\s+окончена|роли\s+раскроем|в\s+следующей\s+реплике|победил[аи]\s+мафия|победили\s+мирные/i.test(text);
      const hasReveal = (data.rolesReveal || []).some((p) => {
        const roleRu = ROLE_NAMES[p.role] || p.role;
        return text.includes(`— ${roleRu}`) || (text.includes(p.name) && text.includes(roleRu));
      });
      if (summaryLike && !hasReveal) text = buildRevealLine(data.rolesReveal);
    }
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
