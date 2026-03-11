import { AVATAR_IDS, getAvatarEmoji } from '../avatars';

export default function Lobby({ roomCode, room, playerId, onSetAvatar, isCreator, onStartGame, onRoomSettings, speakHost, setSpeakHost, onUnlockAudio, onTestVoice, ttsError, setTtsError, keyCheck, onCheckKey }) {
  const playerIds = room?.playerIds || [];
  const playerNames = room?.playerNames || {};
  const playerAvatars = room?.playerAvatars || {};
  const count = playerIds.length;
  const canStart = count >= 4;
  const timerSec = room?.discussionTimerSec ?? 120;
  const turnSec = room?.discussionTurnSec ?? 60;
  const voiceStyle = room?.hostVoiceStyle ?? 'funny';
  const myAvatar = playerAvatars[playerId] || 'fox';

  return (
    <div className="screen lobby">
      <div className="room-code">
        <span className="label">Код комнаты</span>
        <span className="code">{roomCode}</span>
      </div>

      <div className="lobby-avatar-pick">
        <span className="lobby-avatar-pick-label">Ваш аватар</span>
        <div className="lobby-avatar-grid">
          {AVATAR_IDS.map((id) => (
            <button
              key={id}
              type="button"
              className={`lobby-avatar-btn ${myAvatar === id ? 'lobby-avatar-btn--chosen' : ''}`}
              onClick={() => onSetAvatar?.(id)}
              title={id}
            >
              {getAvatarEmoji(id)}
            </button>
          ))}
        </div>
      </div>

      <div className="players players--cards">
        <h3>За столом ({count})</h3>
        <ul className="players-table-preview">
          {playerIds.map((id) => (
            <li key={id} className={`player-card-preview ${id === playerId ? 'player-card-preview--you' : ''}`}>
              <span className="player-card-avatar">{getAvatarEmoji(playerAvatars[id] || 'fox')}</span>
              <span className="player-card-name">{playerNames[id] || id}</span>
            </li>
          ))}
        </ul>
      </div>

      {isCreator && (
        <div className="lobby-settings">
          <label>
            <span>Время обсуждения (мин)</span>
            <select
              value={Math.round(timerSec / 60)}
              onChange={(e) => onRoomSettings?.({ discussionTimerSec: Number(e.target.value) * 60 })}
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </label>
          <label>
            <span>Время на слово (сек)</span>
            <select
              value={turnSec}
              onChange={(e) => onRoomSettings?.({ discussionTurnSec: Number(e.target.value) })}
            >
              <option value={30}>30</option>
              <option value={45}>45</option>
              <option value={60}>60</option>
              <option value={90}>90</option>
              <option value={120}>120</option>
            </select>
          </label>
          <label>
            <span>Стиль ведущего</span>
            <select
              value={voiceStyle}
              onChange={(e) => onRoomSettings?.({ hostVoiceStyle: e.target.value })}
            >
              <option value="funny">С юмором</option>
              <option value="strict">Строгий</option>
            </select>
          </label>
        </div>
      )}

      <p className="lobby-mode-hint">Режим игры: состав ролей по числу игроков (5–12). 5 — мафия, доктор, детектив, мирные; 6 — мафия, дон, доктор, детектив, мирные; 7 — две мафии, доктор, детектив, мирные; 8+ — две мафии, дон, доктор, детектив, ветеран, мирные.</p>
      {!canStart && <p className="need">Нужно минимум 4 человека</p>}
      {isCreator && canStart && (
        <button className="btn primary start" onClick={onStartGame}>
          Начать игру
        </button>
      )}

      {isCreator && (
        <>
          <div className="key-check-row">
            <button type="button" className="btn secondary" onClick={onCheckKey} disabled={keyCheck?.checking}>
              {keyCheck?.checking ? 'Проверка…' : 'Проверить ключ TTS'}
            </button>
            {keyCheck && !keyCheck.checking && (
              keyCheck.ok
                ? <span className="key-check-ok">Ключ рабочий</span>
                : <span className="key-check-err">{keyCheck.error}</span>
            )}
          </div>
          <label className="tts-toggle">
            <input
              type="checkbox"
              checked={speakHost}
              onChange={(e) => {
                const checked = e.target.checked;
                if (checked) onUnlockAudio?.();
                setSpeakHost(checked);
                if (checked && onTestVoice) setTimeout(() => onTestVoice(), 0);
              }}
            />
            <span>Озвучивать ведущего (ИИ-голос, колонка)</span>
          </label>
          {speakHost && (
            <>
              <button type="button" className="btn secondary" onClick={onTestVoice}>
                Проверить озвучку
              </button>
              {ttsError && (
                <p className="tts-error">
                  {ttsError}
                  <button type="button" className="btn-link-inline" onClick={() => setTtsError(null)}> скрыть</button>
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
