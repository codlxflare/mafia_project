import { useState } from 'react';

export default function Home({ onCreateRoom, onJoinRoom, homeError, creatingRoom, joiningRoom, initialJoinCode = '', initialJoinName = '' }) {
  const [mode, setMode] = useState(null); // 'create' | 'join'
  const [createName, setCreateName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [joinName, setJoinName] = useState('');

  if (mode === null) {
    return (
      <div className="screen home">
        <div className="hero">
          <h1>Мафия</h1>
          <p className="tagline">ИИ-ведущий ведёт игру. Вы только играете.</p>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={() => setMode('create')}>
            Создать комнату
          </button>
          <button
            className="btn secondary"
            onClick={() => {
              setJoinCode(initialJoinCode || '');
              setJoinName(initialJoinName || '');
              setMode('join');
            }}
          >
            Войти по коду
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'create') {
    return (
      <div className="screen home">
        <h2>Создать комнату</h2>
        <p className="hint">Имя будет видно всем в комнате</p>
        <p className="home-notification-hint">Если ведущего не слышно — включите звук уведомлений на телефоне.</p>
        <div className="home-form">
          <input
            type="text"
            placeholder="Ваше имя"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            maxLength={20}
          />
          {homeError && <p className="home-error" role="alert">{homeError}</p>}
          <button
            className="btn primary"
            onClick={() => {
              document.activeElement?.blur?.();
              onCreateRoom(createName.trim() || 'Ведущий');
            }}
            disabled={creatingRoom}
          >
            {creatingRoom ? 'Подключение…' : 'Создать'}
          </button>
          <button className="btn link" onClick={() => setMode(null)} disabled={creatingRoom}>
            Назад
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen home">
      <h2>Войти по коду</h2>
      <p className="hint">6 цифр от создателя комнаты</p>
      <div className="home-form">
        <input
          type="text"
          inputMode="numeric"
          placeholder="Код 000000"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          maxLength={6}
        />
        <input
          type="text"
          placeholder="Ваше имя"
          value={joinName}
          onChange={(e) => setJoinName(e.target.value)}
          maxLength={20}
        />
        {homeError && <p className="home-error" role="alert">{homeError}</p>}
        <button
          className="btn primary"
          onClick={() => {
            document.activeElement?.blur?.();
            onJoinRoom(joinCode, joinName.trim() || 'Игрок');
          }}
          disabled={joiningRoom}
        >
          {joiningRoom ? 'Вход…' : 'Войти'}
        </button>
        <button className="btn link" onClick={() => setMode(null)} disabled={joiningRoom}>
          Назад
        </button>
      </div>
    </div>
  );
}
