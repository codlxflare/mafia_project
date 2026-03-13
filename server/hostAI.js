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

const SYSTEM_PROMPT = `Ты реальный ведущий "Мафии" за столом — не диктор и не зануда, а живой человек с характером. Весёлый, смешной, по-настоящему ведёшь игру и реагируешь на происходящее. Твои шутки — человеческие, как в компании друзей: сарказм, подколы, абсурд, не шаблонные фразы. Цель — чтобы за столом смеялись.

Характер и тон:
- Мат разрешён и приветствуется по ситуации: смерть, вылет игрока, победа мафии, ничья, любой яркий момент. Без самоцензуры — разговорный русский как в жизни. "Блин", "ё-моё", "охренеть", "ну вы даёте" и крепче. Одна-две вкрапления на реплику, по делу. Не цензурь себя.
- Обязательно шути про аватары игроков. Тебе передают, какой у кого аватар (Лиса, Единорог, Сова, Панда и т.д.). Используй это в каждой реплике, где уместно: убит — "Единорога сегодня лишили рога", "Лисицу мафия придушила"; исключён — "Сову вынесли", "Панду город выгнал"; доктор спас — "Доктор поднял на ноги Кролика"; проверка детектива — "Детектив проверил Енота". Имя игрока можно сочетать с аватаром: "Вася-единорог вылетел". Фантазируй в том же духе.
- Юмор: подкалывай город и мафию, ирония, пошловатость ок. Менталитет ведущего в русской компании — тепло, цинично, без официоза.

Правила объявлений:
- Объявляй только факты (кто погиб, кого спас доктор, кого проверил детектив, кого исключили, кто кем был). Не придумывай событий. Роль исключённого не раскрывай до финала.
- Фразы короткие, для озвучки: без кавычек и пометок. Одна-три фразы максимум.
${ROLES_REFERENCE}`;

const STRICT_SYSTEM_PROMPT = `Ты ведущий "Мафии" — нейтральный диктор. Тон строгий, без шуток и стёба. Объявляешь только факты игры.

Правила:
- Разговорный русский, но без мата и подколов. Короткие чёткие фразы.
- Тебе передают факты (кто погиб, кого спас доктор, кого исключили и т.д.). Объявляй только это, по имени. Роль исключённого не раскрывай до финала.
- Фразы для озвучки: одна-три, без кавычек.
${ROLES_REFERENCE}`;

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

function nightSummaryFallback(d) {
  const n = d.victimCount ?? (d.killedName ? 1 : 0);
  if (n === 0) return `Доктор красавчик — ночью никто не погиб. Обсуждение.`;
  if (n === 1 && d.victims?.[0]) return `Ночью погиб ${d.victims[0].name} — ${d.victims[0].roleName}. Обсуждение.`;
  if (n === 2 && d.victims?.length === 2) return `Ночью погибли ${d.victims[0].name} — ${d.victims[0].roleName}, и ${d.victims[1].name} — ${d.victims[1].roleName}. Обсуждение.`;
  if (d.killedName) return `Ночью погиб ${d.killedName}. Обсуждение.`;
  if (d.savedByName) return `Доктор спас ${d.savedByName}. Ночью никто не погиб. Обсуждение.`;
  if (d.veteranSavedHimself) return `Ветеран защитился. Ночью никто не погиб. Обсуждение.`;
  return 'Ночью никто не пострадал. Обсуждение.';
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

function userMessage(type, data = {}) {
  switch (type) {
    case 'lobby_waiting':
      return `В лобби ${data.count} из ${data.need}. Ждём людей. Одна живая фраза — можно с лёгким стёбом или теплом, по-русски.`;
    case 'lobby_ready':
      return `Наконец-то все в сборе — ${data.need} человек. Можно начинать. Одна фраза — радость или лёгкий подъёб.`;
    case 'room_created':
      return `Комната открыта. За столом ${data.creatorName}, не хватает ещё до ${data.need} человек. Скажи одну приветственную фразу — тепло, по-свойски, как будто зовёшь друзей за стол. Можно с юмором.`;
    case 'player_joined':
      return `Только что зашёл ${data.playerName}. Сейчас ${data.count} из ${data.need}. Одна фраза — обрадуйся по-человечески: «Вот и ${data.playerName}», «Подъехал ${data.playerName}» — живо, без официоза.`;
    case 'game_start':
      return 'Сейчас раздаю роли. Одна фраза — с предвкушением, можно чуть зловеще или с юмором, чтобы настроить на игру.';
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
      return `Роли розданы. В игре ${count} человек. Состав только такой — назови только эти роли: ${list}. Никаких лишних. Объяви состав живо, по-русски — можно с лёгкой иронией или напряжением. Потом скажи, что город засыпает. Одна-две фразы.`;
    }
    case 'night_close_eyes':
      return `Ночь ${data.round || 1}. Все закрывают глаза. Одна фраза — тихо, с атмосферой, можно чуть зловеще или с юмором.`;
    case 'night_mafia_wake':
      return 'Мафия просыпается: откройте глаза, узнайте своих, выберите жертву. Одна реплика — напряжение, можно с лёгким злодейским оттенком или стёбом.';
    case 'night_mafia_sleep':
      return 'Мафия засыпает. Коротко — можно с намёком или иронией.';
    case 'night_mafia_tie':
      return 'Мафия не смогла определиться — ничья. Объяви переголосование: 10 секунд, можно с стёбом.';
    case 'night_don_decides':
      return 'Дон просыпается. При ничьей мафии за ним последнее слово — выбери жертву или никого. Одна реплика.';
    case 'night_doctor_wake':
      return 'Доктор, твоя смена. Кого спасаем этой ночью? Одна реплика — можно с надеждой или лёгким юмором.';
    case 'night_doctor_sleep':
      return 'Доктор засыпает. Коротко.';
    case 'night_detective_wake':
      return 'Детектив, твоя очередь. Кого проверить? Одна реплика — интрига, можно с намёком.';
    case 'night_detective_sleep':
      return 'Детектив засыпает. Коротко.';
    case 'night_morning':
      return 'Рассвет. Все открывают глаза. Одна фраза — облегчение, драма или ирония, в зависимости от того, что было ночью.';
    case 'night_summary': {
      const n = data.victimCount ?? (data.killedName ? 1 : 0);
      const parts = [];
      if (n === 0) parts.push('Жертв нет — доктор спас всех (или мафия не выбрала). Скажи что-то вроде «Доктор красавчик» или «Ночью никто не пострадал».');
      else if (n === 1 && data.victims?.[0]) parts.push(`Одна жертва: ${data.victims[0].name} (аватар: ${data.victims[0].avatarId ? avatarRu(data.victims[0].avatarId) : '—'}), роль: ${data.victims[0].roleName}. Назови имя и роль, пошути про аватар.`);
      else if (n === 2 && data.victims?.length === 2) parts.push(`Две жертвы: ${data.victims[0].name} — ${data.victims[0].roleName}, ${data.victims[1].name} — ${data.victims[1].roleName}. Назови обоих по имени и роли, с юмором.`);
      if (data.savedByName) parts.push(`Доктор спас: ${data.savedByName}.`);
      if (data.veteranSavedHimself) parts.push('Ветеран защитился этой ночью.');
      if (data.detectiveCheckedName != null) parts.push(`Детектив проверил ${data.detectiveCheckedName}: ${data.detectiveWasMafia ? 'мафия' : 'мирный'}.`);
      parts.push(`Раунд ${data.round || 1}.`);
      return `Итог ночи. ${parts.join(' ')} Своими словами, без цензуры. Одна-три фразы. Обсуждение объявишь отдельно.`;
    }
    case 'day_discussion':
      return `День ${data.round || 1}. Объяви обсуждение: высказывайтесь, подозревайте, разбирайте. Голосование объявлю, когда будете готовы. Одна-две фразы — живо, по-свойски, можно с подкалом.`;
    case 'vote_start':
      return 'Обсуждение кончилось. Голосование — кого выносим? Одна фраза, можно с напряжением или стёбом.';
    case 'vote_counting':
      return 'Все проголосовали. Сейчас подсчитаю голоса. Одна короткая фраза.';
    case 'vote_tie':
      return 'Ничья — никто не вылетел. Ночь. Одна фраза — можно с иронией («город решил помиловать всех») или облегчением.';
    case 'vote_tie_break':
      return 'Жители не смогли определиться. Объяви: 30 секунд на обсуждение, голосовать только между фаворитами. Участники, против которых голосуют, в переголосовании голоса не имеют.';
    case 'vote_result_summary': {
      const exclRu = data.excludedAvatarId ? avatarRu(data.excludedAvatarId) : null;
      return `Город прощается с ${data.excludedName}${exclRu ? ` (аватар: ${exclRu})` : ''}. Раскрой роль: ${data.excludedRole || 'игрок'}. Пошути про аватар и роль. С характером, без цензуры. Одна-две фразы.`;
    }
    case 'game_end_summary': {
      const who = data.winner === 'mafia' ? 'мафия' : 'мирные';
      return `Игра окончена. Победили ${who}. Скажи это с характером — можно злорадством, облегчением или стёбом. Роли раскроешь в следующей реплике. Одна-две фразы.`;
    }
    case 'game_end_reveal': {
      const list = (data.rolesReveal || []).map((p) => {
        const avatarRuName = p.avatarId ? avatarRu(p.avatarId) : null;
        return `${p.name}${avatarRuName ? ` (${avatarRuName})` : ''} — ${ROLE_NAMES[p.role] || p.role}`;
      }).join('; ');
      return `Расклад: ${list}. Огласи кто кем был — обыгрывай аватары в шутках, без цензуры, с юмором и матом где уместно. Две-три фразы, чтобы было смешно.`;
    }
    case 'night_nudge_mafia':
      return 'Мафия тянет. Подгони или пошути — одна фраза, можно с лёгким матом или стёбом.';
    case 'night_nudge_doctor':
      return 'Доктор думает. Подгони или пошути — одна фраза.';
    case 'night_nudge_detective':
      return 'Детектив копается. Подгони или пошути — одна фраза.';
    case 'night_veteran_wake':
      return 'Ветеран, проснись. Один раз за игру можешь включить защиту — этой ночью не убьют. Включаешь или нет? Одна реплика — можно с намёком.';
    case 'night_veteran_sleep':
      return 'Ветеран засыпает. Коротко.';
    case 'night_nudge_veteran':
      return 'Ветеран не определился. Подгони — одна фраза.';
    default:
      return 'Одна короткая реплика ведущего — живой русский, можно с юмором или стёбом.';
  }
}

const AI_TIMEOUT_MS = 3000;
const AI_SUMMARY_TIMEOUT_MS = 5000;
const SUMMARY_TYPES = ['night_summary', 'vote_result_summary', 'game_end_summary', 'game_end_reveal'];

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

  const voiceStyle = data.voiceStyle === 'strict' ? 'strict' : 'funny';
  const systemPrompt = voiceStyle === 'strict' ? STRICT_SYSTEM_PROMPT : SYSTEM_PROMPT;

  const maxTokens = SUMMARY_TYPES.includes(type) ? 220 : 80;
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
        temperature: 0.9,
      }),
    });
    clearTimeout(timeoutId);
    if (!r.ok) return fallbackText(type, data);
    const j = await r.json();
    const text = j.choices?.[0]?.message?.content?.trim();
    return text && text.length > 0 ? text : fallbackText(type, data);
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
