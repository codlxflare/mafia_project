import { AVATAR_IDS, getAvatarEmoji } from '../avatars';

export default function Lobby({ roomCode, room, playerId, onSetAvatar, isCreator, onStartGame, onRoomSettings, speakHost, setSpeakHost }) {
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

      <p className="lobby-mode-hint" title="5: мафия, доктор, детектив, 2 мирных. 6: + дон. 7: 2 мафии, доктор, детектив, 3 мирных. 8+: + ветеран, остальные мирные.">
        5–12 игроков. Роли: мафия, дон (6+), доктор, детектив, ветеран (8+), мирные.
      </p>
      {!canStart && <p className="need">Нужно минимум 4 человека</p>}
      {isCreator && canStart && (
        <button className="btn primary start" onClick={onStartGame}>
          Начать игру
        </button>
      )}

      {isCreator && (
        <label className="tts-toggle">
          <input
            type="checkbox"
            checked={speakHost}
            onChange={(e) => setSpeakHost(e.target.checked)}
          />
          <span>Озвучивать ведущего (ИИ-голос, колонка)</span>
        </label>
      )}
    </div>
  );
}
