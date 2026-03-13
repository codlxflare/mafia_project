import { useState, useEffect, useRef } from 'react';
import { getAvatarEmoji } from '../avatars';

const ROLE_NAMES = {
  mafia: 'Мафия',
  don: 'Дон',
  doctor: 'Доктор',
  detective: 'Детектив',
  civilian: 'Мирный житель',
  lucky: 'Везунчик',
  journalist: 'Журналист',
  veteran: 'Ветеран',
};
const ROLE_DESCR = {
  mafia: 'Ночью выбираешь жертву вместе с напарниками. Днём притворяйся мирным.',
  don: 'Босс мафии. Ночью участвуешь в выборе жертвы. Детективу при проверке покажешься мирным.',
  doctor: 'Ночью можешь спасти одного игрока от убийства.',
  detective: 'Ночью проверяешь одного игрока — мафия он или нет (дон скрывается).',
  civilian: 'Ищи мафию по поведению и голосуй на обсуждении.',
  lucky: 'Мирный житель. Ночью не просыпаешься. Днём голосуй и ищи мафию.',
  journalist: 'Мирный житель. Ночью не просыпаешься. Днём голосуй и ищи мафию.',
  veteran: 'Мирный. Один раз за игру (только первая ночь) можешь включить защиту — этой ночью тебя не убьют.',
};

const REACTION_EMOJIS = ['👀', '😂', '😱', '🤐', '👍', '👎'];

export default function Game({
  socket,
  room,
  playerId,
  playerName,
  isCreator,
  role,
  phase,
  alive,
  roundIndex,
  nightStep,
  nightTurn,
  gameResult,
  discussionTimerSec = 120,
  reactions = [],
  excludedForLastWords,
  voteCounts = {},
  hostAnnouncedDay = false,
  hostAnnouncedNightStep = null,
  speakHost,
  setSpeakHost,
  audioUnlocked,
  onEnableTts,
  onTestVoice,
  ttsError,
  setTtsError,
  keyCheck,
  onCheckKey,
  soundEffects = true,
  setSoundEffects,
  playTurnSound,
}) {
  const [detectiveResult, setDetectiveResult] = useState(null);
  const [roleCardDismissed, setRoleCardDismissed] = useState(false);
  const [introCutsceneDone, setIntroCutsceneDone] = useState(false);
  const [myChoice, setMyChoice] = useState(null);
  const [myVote, setMyVote] = useState(null);
  const [discussionSecondsLeft, setDiscussionSecondsLeft] = useState(null);
  const [lastWordsSecondsLeft, setLastWordsSecondsLeft] = useState(null);
  const [discussionTurn, setDiscussionTurn] = useState(null);
  const [detectiveAction, setDetectiveAction] = useState(null);
  const [mafiaRevoteSec, setMafiaRevoteSec] = useState(null);
  const discussionTimerRef = useRef(null);
  const lastWordsTimerRef = useRef(null);
  const discussionTurnTimerRef = useRef(null);
  useEffect(() => { setRoleCardDismissed(false); }, [role]);
  useEffect(() => {
    if (phase !== 'roles' && phase !== 'roles_done') return;
    const t = setTimeout(() => setIntroCutsceneDone(true), 5200);
    return () => clearTimeout(t);
  }, [phase]);
  useEffect(() => { if (phase !== 'night') setMyChoice(null); setDetectiveAction(null); setMafiaRevoteSec(null); }, [phase]);
  useEffect(() => { if (nightTurn?.step !== 'detective') setDetectiveAction(null); }, [nightTurn?.step]);
  useEffect(() => { if (phase !== 'voting') setMyVote(null); }, [phase]);
  useEffect(() => {
    if (!socket || nightTurn?.step !== 'mafia') return;
    const onRevote = (data) => {
      setMyChoice(null);
      setMafiaRevoteSec(data?.secondsLeft ?? 10);
    };
    socket.on('mafia_tie_revote', onRevote);
    return () => { socket.off('mafia_tie_revote', onRevote); };
  }, [socket, nightTurn?.step]);
  useEffect(() => {
    if (mafiaRevoteSec == null || mafiaRevoteSec <= 0) return;
    const t = setInterval(() => setMafiaRevoteSec((s) => (s != null && s > 0 ? s - 1 : null)), 1000);
    return () => clearInterval(t);
  }, [mafiaRevoteSec]);
  useEffect(() => {
    if (phase === 'day' && hostAnnouncedDay && discussionTimerSec) {
      setDiscussionSecondsLeft(discussionTimerSec);
      discussionTimerRef.current = setInterval(() => {
        setDiscussionSecondsLeft((s) => (s == null || s <= 0 ? null : s - 1));
      }, 1000);
      return () => { clearInterval(discussionTimerRef.current); };
    }
    setDiscussionSecondsLeft(null);
  }, [phase, hostAnnouncedDay, roundIndex, discussionTimerSec]);
  useEffect(() => {
    if (excludedForLastWords?.playerId === playerId && excludedForLastWords?.lastWordsSec != null) {
      setLastWordsSecondsLeft(excludedForLastWords.lastWordsSec);
      lastWordsTimerRef.current = setInterval(() => {
        setLastWordsSecondsLeft((s) => (s == null || s <= 0 ? null : s - 1));
      }, 1000);
      return () => { clearInterval(lastWordsTimerRef.current); };
    }
    setLastWordsSecondsLeft(null);
  }, [excludedForLastWords?.playerId, excludedForLastWords?.lastWordsSec, playerId]);
  useEffect(() => {
    if (phase !== 'day') setDiscussionTurn(null);
  }, [phase]);
  useEffect(() => {
    if (!socket || !playTurnSound) return;
    const onStart = (data) => {
      setDiscussionTurn({ playerId: data.playerId, playerName: data.playerName, secondsLeft: data.turnSec ?? 60 });
      playTurnSound('start');
    };
    const onEnd = () => playTurnSound('end');
    socket.on('discussion_turn_start', onStart);
    socket.on('discussion_turn_end', onEnd);
    return () => {
      socket.off('discussion_turn_start', onStart);
      socket.off('discussion_turn_end', onEnd);
    };
  }, [socket, playTurnSound]);
  useEffect(() => {
    if (!discussionTurn) return;
    discussionTurnTimerRef.current = setInterval(() => {
      setDiscussionTurn((prev) => {
        if (!prev || prev.secondsLeft == null || prev.secondsLeft <= 0) return prev;
        return { ...prev, secondsLeft: prev.secondsLeft - 1 };
      });
    }, 1000);
    return () => { clearInterval(discussionTurnTimerRef.current); };
  }, [discussionTurn?.playerId]);
  const dead = room?.gameState?.dead || [];
  const playerIds = room?.playerIds || [];
  const playerNames = room?.playerNames || {};
  const playerAvatars = room?.playerAvatars || {};
  const aliveIds = (nightTurn?.aliveIds && nightTurn.aliveIds.length > 0)
    ? nightTurn.aliveIds
    : alive.length
      ? alive
      : playerIds.filter((id) => !dead.includes(id));

  const voteTieFavorites = room?.voteTieFavorites;
  const votingCandidates = voteTieFavorites?.length
    ? aliveIds.filter((id) => voteTieFavorites.includes(id))
    : aliveIds.filter((id) => id !== playerId);
  const canVoteInTieBreak = !voteTieFavorites || !voteTieFavorites.includes(playerId);

  const isDead = dead.includes(playerId);
  const isAliveForVote = aliveIds.includes(playerId);
  const nightChoiceAllowed = !hostAnnouncedNightStep || (nightTurn && hostAnnouncedNightStep === `night_${nightTurn.step}`);

  const sendNightChoice = (payload, chosenName) => {
    if (typeof window !== 'undefined') console.log('[Mafia:Client]', 'emit night_choice', Object.keys(payload || {}));
    socket?.emit('night_choice', payload);
    if (payload.victimId !== undefined) setMyChoice(payload.victimId == null ? { id: 'nobody', name: 'Никого' } : { id: payload.victimId, name: chosenName });
    if (payload.savedId != null) setMyChoice({ id: payload.savedId, name: chosenName });
    if (payload.checkId != null) setMyChoice({ id: payload.checkId, name: chosenName });
    if (payload.shootId != null) setMyChoice({ id: payload.shootId, name: chosenName });
    if (payload.veteranProtect !== undefined) setMyChoice({ id: 'veteran', name: payload.veteranProtect ? 'Защита' : 'Пропуск' });
  };

  const sendVote = (targetId, name) => {
    socket?.emit('vote', targetId);
    setMyVote({ id: targetId, name });
  };

  const startVoting = () => {
    socket?.emit('start_voting');
  };

  function getTableSelection() {
    if (phase === 'night' && nightTurn && !isDead && nightChoiceAllowed) {
      if (nightTurn.step === 'mafia') {
        const ids = aliveIds.filter((id) => id !== playerId);
        return {
          tableSelectableIds: ids,
          tableChosenId: myChoice?.id ?? null,
          tableOnSelect: (id, name) => sendNightChoice({ victimId: id }, name),
          tableSelectionHint: 'Клик по аватару — выбор жертвы',
        };
      }
      if (nightTurn.step === 'don_decides') {
        const ids = aliveIds.filter((id) => id !== playerId);
        return {
          tableSelectableIds: ids,
          tableChosenId: myChoice?.id != null && myChoice?.id !== 'nobody' ? myChoice.id : null,
          tableOnSelect: (id, name) => sendNightChoice({ victimId: id }, name),
          tableSelectionHint: 'Дон решает при ничьей. Кого убираем?',
        };
      }
      if (nightTurn.step === 'doctor') {
        const ids = nightTurn?.doctorCanHealSelf === false
          ? aliveIds.filter((id) => id !== playerId)
          : aliveIds;
        return {
          tableSelectableIds: ids,
          tableChosenId: myChoice?.id ?? null,
          tableOnSelect: (id, name) => sendNightChoice({ savedId: id }, name),
          tableSelectionHint: 'Клик по аватару — кого спасти',
        };
      }
      if (nightTurn.step === 'detective' && detectiveAction != null) {
        const ids = aliveIds.filter((id) => id !== playerId);
        return {
          tableSelectableIds: ids,
          tableChosenId: myChoice?.id ?? null,
          tableOnSelect: (id, name) =>
            detectiveAction === 'check'
              ? sendNightChoice({ checkId: id }, name)
              : sendNightChoice({ shootId: id }, name),
          tableSelectionHint: detectiveAction === 'check' ? 'Клик по аватару — проверить' : 'Клик по аватару — выстрел',
        };
      }
    }
    if (phase === 'voting' && isAliveForVote && !isDead && canVoteInTieBreak && !myVote) {
      return {
        tableSelectableIds: votingCandidates,
        tableChosenId: myVote?.id ?? null,
        tableOnSelect: (id, name) => sendVote(id, name),
        tableSelectionHint: 'Клик по аватару — ваш голос',
      };
    }
    return { tableSelectableIds: [], tableChosenId: null, tableOnSelect: null, tableSelectionHint: null };
  }

  const { tableSelectableIds, tableChosenId, tableOnSelect, tableSelectionHint } = getTableSelection();

  useEffect(() => {
    if (!socket) return;
    const onResult = (data) => setDetectiveResult(data);
    socket.on('detective_result', onResult);
    return () => socket.off('detective_result', onResult);
  }, [socket]);

  const showNightWait = phase === 'night' && !isDead && (!nightTurn || !nightChoiceAllowed);
  const phaseClass = [
    (phase === 'roles' || phase === 'roles_done') && 'game--roles',
    phase === 'night' && 'game--night',
    phase === 'day' && 'game--day',
    phase === 'voting' && 'game--voting',
    phase === 'ended' && 'game--ended',
    phase === 'ended' && gameResult?.winner === 'mafia' && 'game--ended-mafia',
    phase === 'ended' && gameResult?.winner === 'civilians' && 'game--ended-civilians',
    phase === 'day' && hostAnnouncedDay && 'game--with-discussion',
  ].filter(Boolean).join(' ');

  const showIntroCutscene = (phase === 'roles' || phase === 'roles_done') && !introCutsceneDone;

  return (
    <div className={`screen game ${phaseClass}`.trim()}>
      {showIntroCutscene && (
        <div className="intro-cutscene intro-cutscene--enter" onClick={() => setIntroCutsceneDone(true)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setIntroCutsceneDone(true)} aria-label="Пропустить катсцену">
          <div className="intro-cutscene-backdrop" />
          <div className="intro-cutscene-content" onClick={(e) => e.stopPropagation()}>
            <p className="intro-cutscene-title">Игроки входят в комнату</p>
            <p className="intro-cutscene-subtitle">и занимают места за столом</p>
            <div className="intro-cutscene-progress" aria-hidden />
            <button type="button" className="intro-cutscene-skip btn secondary small" onClick={() => setIntroCutsceneDone(true)}>Пропустить</button>
          </div>
        </div>
      )}
      {role && !roleCardDismissed && (
        <div className="role-card-overlay" onClick={() => setRoleCardDismissed(true)}>
          <div className="role-card role-card--reveal" onClick={(e) => e.stopPropagation()}>
            <span className="role-card-label">Ваша роль</span>
            <span className={`role-card-name role-${role}`}>{ROLE_NAMES[role]}</span>
            <p className="role-card-desc">{ROLE_DESCR[role]}</p>
            <button type="button" className="btn primary" onClick={() => setRoleCardDismissed(true)}>
              Понятно
            </button>
          </div>
        </div>
      )}
      <div className="game-header">
        <span className="role-badge role-badge--glow">{role ? ROLE_NAMES[role] : '—'}</span>
        {phase && phase !== 'ended' && (
          <span className={`phase-badge phase-badge--${phase} phase-badge--pulse`} key={`${phase}-${roundIndex}`}>
            {phase === 'night' && `Ночь ${roundIndex || 1}`}
            {phase === 'day' && `День ${roundIndex || 1}`}
            {phase === 'voting' && `Голосование · День ${roundIndex || 1}`}
            {phase === 'roles' && 'Роли'}
            {phase === 'roles_done' && 'Старт'}
          </span>
        )}
      </div>

      {phase === 'ended' && gameResult && (
        <div className="game-result-overlay">
          <div className={`game-result game-result-${gameResult.winner} game-result--enter`}>
            <p className="result-badge">Игра окончена</p>
            <h2 className="result-title">
              {gameResult.winner === 'mafia' ? 'Победа мафии' : 'Победа мирных'}
            </h2>
            <p className="result-subtitle">
              {gameResult.winner === 'mafia'
                ? 'Город пал. Мафия взяла верх.'
                : 'Город спасён. Мафия разоблачена.'}
            </p>
            <div className="game-result-scroll">
              <div className="roles-reveal">
                <h4>Расклад по ролям</h4>
                <ul className="roles-reveal-list">
                  {(room?.playerIds || []).map((id) => (
                    <li key={id} className="roles-reveal-item">
                      <span className="roles-reveal-name">{gameResult.playerNames?.[id] || id}</span>
                      <span className={`roles-reveal-role role-${gameResult.roles?.[id] || ''}`}>
                        {ROLE_NAMES[gameResult.roles?.[id]] || gameResult.roles?.[id] || '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              {gameResult.voteHistory?.length > 0 && (
                <div className="vote-reveal">
                  <h4>Кто за кого голосовал</h4>
                  <ul className="vote-reveal-list">
                    {gameResult.voteHistory.map((v, i) => (
                      <li key={i}>
                        {v.tie ? `Раунд ${v.round}: ничья` : `Раунд ${v.round}: исключён ${v.excludedName}. Голоса: ${v.votes ? Object.entries(v.votes).map(([who, target]) => `${who} → ${target}`).join(', ') : '—'}`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {gameResult.battleLog?.length > 0 && (
                <div className="battle-log">
                  <h4>Ход игры</h4>
                  <ul className="battle-log-list">
                    {gameResult.battleLog.map((e, i) => (
                      <li key={i}>
                        {e.type === 'night_end' && `Ночь ${e.round}: ${e.killed ? `погиб ${e.killed}` : 'никто не погиб'}`}
                        {e.type === 'vote_tie' && `День ${e.round}: ничья`}
                        {e.type === 'vote_excluded' && `День ${e.round}: исключён ${e.excludedName}`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            {isCreator && (
              <button type="button" className="btn primary" onClick={() => socket?.emit('play_again')}>
                Играем ещё
              </button>
            )}
          </div>
        </div>
      )}

      {isCreator && (
        <details className="game-settings">
          <summary>Настройки озвучки</summary>
          <div className="game-settings-inner">
            <label className="tts-toggle">
              <input
                type="checkbox"
                checked={speakHost}
                onChange={(e) => setSpeakHost(e.target.checked)}
              />
              <span>Озвучивать ведущего</span>
            </label>
            {typeof setSoundEffects === 'function' && (
              <label className="tts-toggle">
                <input type="checkbox" checked={soundEffects} onChange={(e) => setSoundEffects(e.target.checked)} />
                <span>Звуки фаз</span>
              </label>
            )}
            {ttsError && (
              <p className="tts-error small">
                {ttsError}
                <button type="button" className="btn-link-inline" onClick={() => setTtsError(null)}>скрыть</button>
              </p>
            )}
          </div>
        </details>
      )}

      {excludedForLastWords?.playerId === playerId && (
        <div className="last-words-block">
          <p className="last-words-title">Последнее слово — говорите вслух</p>
          <p className="last-words-timer">{lastWordsSecondsLeft != null ? lastWordsSecondsLeft : excludedForLastWords.lastWordsSec} сек</p>
        </div>
      )}
      {isDead && !excludedForLastWords?.playerId && (
        <div className="you-dead you-dead--pulse">
          Вы выбыли. Следите за игрой и не выдавайте роли.
        </div>
      )}
      {isDead && excludedForLastWords?.playerId && excludedForLastWords.playerId !== playerId && (
        <div className="you-dead">
          Ожидание последнего слова исключённого ({excludedForLastWords.excludedName})…
        </div>
      )}

      {showNightWait && (
        <div className="night-wait night-wait--enter">
          <p className="night-wait-text">Ждите своей очереди.</p>
          <p className="night-wait-hint">Кнопки появятся на вашем ходе.</p>
        </div>
      )}
      {phase === 'night' && nightTurn?.step === 'mafia' && !isDead && nightChoiceAllowed && (
        <div className="night-choice night-choice--mafia night-choice--table-only">
          {mafiaRevoteSec != null && mafiaRevoteSec > 0 && (
            <p className="night-choice-hint" style={{ marginBottom: 8 }}>Переголосование: {mafiaRevoteSec} с</p>
          )}
          <h3 className="night-choice-title">Выберите жертву</h3>
          {myChoice?.id != null ? (
            <div className="choice-confirm">
              <span className="choice-confirm-icon">✓</span>
              <span>Вы выбрали: <strong>{myChoice.name}</strong></span>
            </div>
          ) : (
            <p className="night-choice-hint">{tableSelectionHint}</p>
          )}
        </div>
      )}
      {phase === 'night' && nightTurn?.step === 'don_decides' && !isDead && nightChoiceAllowed && (
        <div className="night-choice night-choice--mafia night-choice--table-only">
          <h3 className="night-choice-title">Дон решает при ничьей</h3>
          {myChoice?.id != null ? (
            <div className="choice-confirm">
              <span className="choice-confirm-icon">✓</span>
              <span>Вы выбрали: <strong>{myChoice.name}</strong></span>
            </div>
          ) : (
            <>
              <p className="night-choice-hint">{tableSelectionHint}</p>
              <button type="button" className="btn choice-btn night-choice-btn" style={{ marginTop: 8 }} onClick={() => sendNightChoice({ victimId: null })}>
                Никого
              </button>
            </>
          )}
        </div>
      )}
      {phase === 'night' && nightTurn?.step === 'doctor' && !isDead && nightChoiceAllowed && (
        <div className="night-choice night-choice--doctor night-choice--table-only">
          <h3 className="night-choice-title">Кого спасти?</h3>
          {myChoice?.id != null ? (
            <div className="choice-confirm">
              <span className="choice-confirm-icon">✓</span>
              <span>Вы выбрали: <strong>{myChoice.name}</strong></span>
            </div>
          ) : (
            <p className="night-choice-hint">{tableSelectionHint}</p>
          )}
        </div>
      )}
      {phase === 'night' && nightTurn?.step === 'detective' && !isDead && nightChoiceAllowed && (
        detectiveAction == null ? (
          <div className="night-choice night-choice--detective night-choice--enter">
            <h3 className="night-choice-title">Что делаем?</h3>
            <p className="night-choice-hint">Проверить или стрелять</p>
            <div className="player-list player-list--choice">
              <button type="button" className="btn choice-btn night-choice-btn" onClick={() => setDetectiveAction('check')}>
                Проверить
              </button>
              <button type="button" className="btn choice-btn night-choice-btn" onClick={() => setDetectiveAction('kill')}>
                Убить
              </button>
            </div>
          </div>
        ) : (
          <div className="night-choice night-choice--detective night-choice--table-only">
            <h3 className="night-choice-title">{detectiveAction === 'check' ? 'Кого проверить?' : 'В кого стреляете?'}</h3>
            {myChoice?.id != null ? (
              <div className="choice-confirm">
                <span className="choice-confirm-icon">✓</span>
                <span>Вы выбрали: <strong>{myChoice.name}</strong></span>
              </div>
            ) : (
              <p className="night-choice-hint">{tableSelectionHint}</p>
            )}
          </div>
        )
      )}
      {phase === 'night' && nightTurn?.step === 'veteran' && !isDead && nightChoiceAllowed && (
        <VeteranChoice
          chosen={myChoice?.id != null}
          chosenName={myChoice?.name}
          onProtect={() => sendNightChoice({ veteranProtect: true })}
          onSkip={() => sendNightChoice({ veteranProtect: false })}
        />
      )}
      {detectiveResult && (
        <p className="detective-result detective-result--enter" aria-live="polite">
          Результат проверки отображается над аватаром выбранного игрока за столом.
        </p>
      )}

      {phase === 'day' && hostAnnouncedDay && isCreator && (
        <button className="btn primary btn-cta" onClick={startVoting}>
          Завершить обсуждение → Голосование
        </button>
      )}

      {phase === 'day' && hostAnnouncedDay && isAliveForVote && !isDead && (
        <div className="discussion-panel">
          <div className="discussion-panel-top">
            <span className="discussion-panel-title">Обсуждение</span>
            {discussionSecondsLeft != null && (
              <span className="discussion-panel-total" aria-label="Общее время">{Math.floor(discussionSecondsLeft / 60)}:{(discussionSecondsLeft % 60).toString().padStart(2, '0')}</span>
            )}
          </div>
          {discussionTurn ? (
            <div className={`discussion-now ${discussionTurn.playerId === playerId ? 'discussion-now--you' : ''}`} aria-live="polite">
              <span className="discussion-now-name">{discussionTurn.playerId === playerId ? 'Вы' : discussionTurn.playerName}</span>
              <span className="discussion-now-time">{discussionTurn.secondsLeft != null ? discussionTurn.secondsLeft : '—'} с</span>
            </div>
          ) : (
            <div className="discussion-now discussion-now--idle" aria-hidden>—</div>
          )}
          <div className="discussion-actions">
            <div className="discussion-reactions" role="group" aria-label="Реакции">
              {REACTION_EMOJIS.map((emoji) => (
                <button key={emoji} type="button" className="discussion-reaction-btn" onClick={() => socket?.emit('reaction', emoji)} title={emoji}>{emoji}</button>
              ))}
            </div>
            {reactions.length > 0 && (
              <div className="discussion-feed" aria-label="Реакции игроков">
                {reactions.slice(-6).map((r, i) => (
                  r.type === 'last_words'
                    ? <span key={i} className="discussion-feed-item discussion-feed-item--words"><strong>{r.playerName}</strong>: {r.text}</span>
                    : <span key={i} className="discussion-feed-item"><span className="discussion-feed-emoji">{r.emoji}</span>{r.playerName}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {phase === 'voting' && isAliveForVote && !isDead && (
        <div className="vote-block vote-block--enter vote-block--voting">
          <h3 className="vote-block-title">
            {voteTieFavorites?.length ? 'Переголосование: только между фаворитами' : 'Голосование: кого исключить?'}
          </h3>
          {!canVoteInTieBreak ? (
            <p className="vote-block-hint">Вы в числе фаворитов — в переголосовании голоса не имеете.</p>
          ) : myVote ? (
            <div className="choice-confirm">
              <span className="choice-confirm-icon">✓</span>
              <span>Ваш голос против: <strong>{myVote.name}</strong></span>
            </div>
          ) : (
            <p className="vote-block-hint">{tableSelectionHint}</p>
          )}
          <div className="reactions-row">
            {REACTION_EMOJIS.map((emoji) => (
              <button key={emoji} type="button" className="btn reaction-btn" onClick={() => socket?.emit('reaction', emoji)}>{emoji}</button>
            ))}
          </div>
          {reactions.length > 0 && (
            <div className="reactions-feed">
              {reactions.slice(-8).map((r, i) => (
                r.type === 'last_words' ? <p key={i} className="reaction-item last-words"><strong>{r.playerName}:</strong> {r.text}</p> : <p key={i} className="reaction-item"><span className="reaction-emoji">{r.emoji}</span> {r.playerName}</p>
              ))}
            </div>
          )}
        </div>
      )}

      <GameTable
        playerIds={playerIds}
        playerNames={playerNames}
        playerAvatars={playerAvatars}
        dead={dead}
        excludedForLastWords={excludedForLastWords}
        discussionTurnPlayerId={discussionTurn?.playerId}
        currentPlayerId={playerId}
        phase={phase}
        roundIndex={roundIndex}
        selectablePlayerIds={tableSelectableIds}
        chosenPlayerId={tableChosenId}
        onSelectPlayer={tableOnSelect}
        detectiveCheckPlayerId={detectiveResult != null && myChoice?.id ? myChoice.id : null}
        detectiveCheckIsMafia={detectiveResult?.isMafia}
        voteCounts={voteCounts}
      />
    </div>
  );
}

/** Круглый стол: аватарки по кругу, выбор по клику на аватар, визуал проверки комиссара */
function GameTable({
  playerIds,
  playerNames,
  playerAvatars,
  dead,
  excludedForLastWords,
  discussionTurnPlayerId,
  currentPlayerId,
  phase,
  roundIndex,
  selectablePlayerIds = [],
  chosenPlayerId = null,
  onSelectPlayer = null,
  detectiveCheckPlayerId = null,
  detectiveCheckIsMafia = null,
  voteCounts = {},
}) {
  const voteLabel = (n) => {
    if (n === 1) return '1 голос';
    if (n >= 2 && n <= 4) return `${n} голоса`;
    return `${n} голосов`;
  };
  const wrapRef = useRef(null);
  const lastWidthRef = useRef(0);
  const [radiusPx, setRadiusPx] = useState(0);
  const n = Math.max(playerIds.length, 1);
  const radiusPct = Math.max(50, Math.min(56, 58 - n * 0.8));
  const phaseLabel = phase === 'night' ? 'Ночь' : phase === 'day' ? 'День' : phase === 'voting' ? 'Голосование' : phase === 'ended' ? 'Конец' : (phase === 'roles' || phase === 'roles_done') ? 'Роли' : '';

  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const update = () => {
      const width = el.offsetWidth || 0;
      if (width === lastWidthRef.current) return;
      lastWidthRef.current = width;
      setRadiusPx((radiusPct / 100) * (width / 2));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [radiusPct, playerIds.length]);

  const selectableSet = new Set(selectablePlayerIds || []);
  const isSelectable = (id) => selectableSet.has(id) && typeof onSelectPlayer === 'function';

  return (
    <div className={`game-table-wrap game-table-wrap--${phase || 'lobby'}`} ref={wrapRef}>
      <div className="game-table">
        <div className="game-table-rim" aria-hidden />
        <div className="game-table-surface" aria-hidden />
        <div className="game-table-center">
          <span className="game-table-center-phase">{phaseLabel}</span>
          {(roundIndex && phase !== 'ended') && <span className="game-table-center-round">{roundIndex}</span>}
        </div>
        <div className="game-table-seats">
          {playerIds.map((id, i) => {
            const isDead = dead.includes(id);
            const isExcluded = excludedForLastWords?.playerId === id;
            const isSpeaking = discussionTurnPlayerId === id;
            const isYou = currentPlayerId === id;
            const selectable = isSelectable(id);
            const chosen = chosenPlayerId === id;
            const showDetectiveCheck = detectiveCheckPlayerId === id;
            const votesForSeat = voteCounts[id];
            const showVoteCount = votesForSeat != null && votesForSeat > 0;
            const angleRad = ((360 / n) * i - 90) * (Math.PI / 180);
            const xPx = radiusPx * Math.cos(angleRad);
            const yPx = -radiusPx * Math.sin(angleRad);
            const SeatWrapper = selectable ? 'button' : 'div';
            const seatProps = selectable
              ? {
                  type: 'button',
                  onClick: (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelectPlayer(id, playerNames[id] || id);
                  },
                  'aria-label': `Выбрать ${playerNames[id] || id}`,
                }
              : {};
            return (
              <SeatWrapper
                key={id}
                className={`game-table-seat ${isDead ? 'game-table-seat--dead' : ''} ${isExcluded ? 'game-table-seat--excluded' : ''} ${isSpeaking ? 'game-table-seat--speaking' : ''} ${isYou ? 'game-table-seat--you' : ''} ${selectable ? 'game-table-seat--selectable' : ''} ${chosen ? 'game-table-seat--chosen' : ''}`}
                style={{ transform: `translate(-50%, -50%) translate(${xPx}px, ${yPx}px)` }}
                {...seatProps}
              >
                <div className="game-table-seat-inner">
                  <span className="game-table-seat-num" aria-hidden>{i + 1}</span>
                  <span className="game-table-seat-avatar">{getAvatarEmoji(playerAvatars[id] || 'fox')}</span>
                  <span className="game-table-seat-name">{playerNames[id] || id}</span>
                  {showDetectiveCheck && (
                    <span className={`game-table-seat-check game-table-seat-check--${detectiveCheckIsMafia ? 'mafia' : 'civilian'}`} role="status">
                      <span className="game-table-seat-check-icon">{detectiveCheckIsMafia ? '🎩' : '✓'}</span>
                      <span className="game-table-seat-check-text">
                        {detectiveCheckIsMafia ? 'Мафиози' : 'Мирный. Не попал — думай лучше.'}
                      </span>
                    </span>
                  )}
                  {showVoteCount && (
                    <span className="game-table-seat-votes" role="status" title={`За этого игрока проголосовало: ${votesForSeat}`}>
                      <span className="game-table-seat-votes-num">{votesForSeat}</span>
                      <span className="game-table-seat-votes-label">{voteLabel(votesForSeat)}</span>
                    </span>
                  )}
                  {isDead && <span className="game-table-seat-gone" aria-label="выбыл"><span className="game-table-seat-gone-icon">✕</span></span>}
                </div>
              </SeatWrapper>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function VeteranChoice({ chosen, chosenName, onProtect, onSkip }) {
  return (
    <div className="night-choice night-choice--enter night-choice--veteran">
      <h3 className="night-choice-title">Включить защиту на эту ночь?</h3>
      {chosen ? (
        <div className="choice-confirm">
          <span className="choice-confirm-icon">✓</span>
          <span>Вы выбрали: <strong>{chosenName}</strong></span>
        </div>
      ) : (
        <p className="night-choice-hint">Один раз за игру. Этой ночью вас не убьют.</p>
      )}
      <div className="player-list player-list--choice">
        <button
          type="button"
          className="btn choice-btn night-choice-btn"
          onClick={() => !chosen && onProtect()}
          disabled={chosen}
        >
          Включить защиту
        </button>
        <button
          type="button"
          className="btn choice-btn night-choice-btn"
          onClick={() => !chosen && onSkip()}
          disabled={chosen}
        >
          Пропустить
        </button>
      </div>
    </div>
  );
}
