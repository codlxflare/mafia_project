import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import './App.css';
import Home from './screens/Home';
import Lobby from './screens/Lobby';
import Game from './screens/Game';

const SOCKET_URL = import.meta.env.DEV ? '' : (window.location.origin);
const log = (tag, ...args) => console.log('[Mafia:Client]', tag, ...args);

// Один сокет на всё приложение: в dev React Strict Mode размонтирует компонент до установки соединения,
// из-за чего cleanup вызывал disconnect() и ошибку "WebSocket is closed before the connection is established".
let sharedSocket = null;

function getSocket() {
  if (!sharedSocket) {
    sharedSocket = io(SOCKET_URL, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
  }
  return sharedSocket;
}

export default function App() {
  const [socket, setSocket] = useState(null);
  const [screen, setScreen] = useState('home'); // home | lobby | game
  const [roomCode, setRoomCode] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [isCreator, setIsCreator] = useState(false);
  const [room, setRoom] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [role, setRole] = useState(null);
  const [phase, setPhase] = useState(null);
  const [alive, setAlive] = useState([]);
  const [roundIndex, setRoundIndex] = useState(1);
  const [nightStep, setNightStep] = useState(null);
  const [nightTurn, setNightTurn] = useState(null);
  const [gameResult, setGameResult] = useState(null);
  const [discussionTimerSec, setDiscussionTimerSec] = useState(120);
  const [reactions, setReactions] = useState([]);
  const [excludedForLastWords, setExcludedForLastWords] = useState(null);
  const [voteCounts, setVoteCounts] = useState({});
  const [mafiaVotesSummary, setMafiaVotesSummary] = useState([]);
  const [mafiaTargetId, setMafiaTargetId] = useState(null);
  const [tieBreakSecondsLeft, setTieBreakSecondsLeft] = useState(null);
  const [hostAnnouncedDay, setHostAnnouncedDay] = useState(false);
  const [hostAnnouncedNightStep, setHostAnnouncedNightStep] = useState(null);
  const [speakHost, setSpeakHost] = useState(true);
  const [soundEffects, setSoundEffects] = useState(true);
  const [ttsError, setTtsError] = useState(null);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [keyCheck, setKeyCheck] = useState(null);
  const [connected, setConnected] = useState(true);
  const [homeError, setHomeError] = useState(null);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [joiningRoom, setJoiningRoom] = useState(false);
  const [startingGame, setStartingGame] = useState(false);
  const [copyToast, setCopyToast] = useState(false);
  const speakHostRef = useRef(false);
  const soundEffectsRef = useRef(true);
  const isCreatorRef = useRef(false);
  const roleRef = useRef(null);
  const nightTurnRef = useRef(null);
  const ttsQueueRef = useRef([]);
  const ttsPlayingRef = useRef(false);
  const ttsAudioRef = useRef(null);
  const ttsBlockedRef = useRef(false);
  const audioContextRef = useRef(null);
  const nightSyncRequestedRef = useRef(false);
  const audioUnlockHandledRef = useRef(false);
  useEffect(() => { speakHostRef.current = speakHost; }, [speakHost]);
  useEffect(() => { soundEffectsRef.current = soundEffects; }, [soundEffects]);
  useEffect(() => { isCreatorRef.current = isCreator; }, [isCreator]);
  useEffect(() => { roleRef.current = role; }, [role]);
  useEffect(() => { nightTurnRef.current = nightTurn; }, [nightTurn]);
  useEffect(() => {
    if (phase !== 'night') nightSyncRequestedRef.current = false;
  }, [phase]);
  useEffect(() => {
    if (phase !== 'voting') setVoteCounts({});
  }, [phase]);
  useEffect(() => {
    if (phase !== 'night') setMafiaTargetId(null);
  }, [phase]);
  useEffect(() => {
    if (phase !== 'voting') setTieBreakSecondsLeft(null);
  }, [phase]);
  useEffect(() => {
    if (tieBreakSecondsLeft == null || tieBreakSecondsLeft <= 0) return;
    const t = setInterval(() => setTieBreakSecondsLeft((s) => (s <= 0 ? null : s - 1)), 1000);
    return () => clearInterval(t);
  }, [tieBreakSecondsLeft]);
  useEffect(() => {
    if (!socket || screen !== 'game' || phase !== 'night' || nightSyncRequestedRef.current) return;
    nightSyncRequestedRef.current = true;
    socket.emit('get_night_state');
  }, [socket, screen, phase]);

  useEffect(() => {
    const s = getSocket();
    setSocket(s);
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onConnectError = () => setConnected(false);
    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('connect_error', onConnectError);
    setConnected(s.connected);
    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('connect_error', onConnectError);
    };
  }, []);

  const unlockAudio = useCallback(() => {
    if (typeof window === 'undefined') return;
    let ctx = audioContextRef.current;
    if (!ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) {
        ctx = new Ctx();
        audioContextRef.current = ctx;
      }
    }
    if (ctx?.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  }, []);

  // Очередь озвучки: только ИИ (OpenAI/ElevenLabs). Без браузерной озвучки; при ошибке — сообщение и кнопка «Включить озвучку».
  const processTtsQueue = useCallback(() => {
    if (ttsBlockedRef.current || ttsPlayingRef.current || ttsQueueRef.current.length === 0) return;
    const item = ttsQueueRef.current.shift();
    const text = typeof item === 'string' ? item : item?.text;
    const type = typeof item === 'object' && item && 'type' in item ? item.type : undefined;
    if (!text) {
      processTtsQueue();
      return;
    }
    setTtsError(null);
    ttsPlayingRef.current = true;

    const serverOnlyFail = (reason) => {
      setTtsError(reason || 'Озвучка недоступна. Нажмите «Включить озвучку».');
      ttsQueueRef.current.unshift(item);
      ttsPlayingRef.current = false;
      ttsBlockedRef.current = true;
    };

    const body = type != null ? { text, type } : { text };
    fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(async (r) => {
        const contentType = r.headers.get('Content-Type') || '';
        if (!r.ok) {
          const body = contentType.includes('json') ? await r.json().catch(() => ({})) : {};
          const serverMsg = body?.error || r.statusText;
          const hint = serverMsg && serverMsg !== 'Ошибка синтеза речи' ? serverMsg : 'ИИ-озвучка недоступна. Нажмите «Включить озвучку».';
          serverOnlyFail(hint);
          return;
        }
        if (!contentType.includes('audio')) {
          setTtsError(await r.text().catch(() => '') || 'Неверный ответ сервера');
          ttsPlayingRef.current = false;
          processTtsQueue();
          return;
        }
        return r.arrayBuffer();
      })
      .then((arrayBuffer) => {
        if (arrayBuffer == null) return;
        const ctx = audioContextRef.current;
        if (ctx) {
          ctx.decodeAudioData(arrayBuffer).then((decoded) => {
            const source = ctx.createBufferSource();
            source.buffer = decoded;
            source.connect(ctx.destination);
            source.onended = () => {
              ttsAudioRef.current = null;
              ttsPlayingRef.current = false;
              processTtsQueue();
            };
            ttsAudioRef.current = source;
            source.start(0);
          }).catch(() => serverOnlyFail('Ошибка декодирования. Нажмите «Включить озвучку».'));
          return;
        }
        const url = URL.createObjectURL(new Blob([arrayBuffer], { type: 'audio/mpeg' }));
        const audio = new Audio(url);
        ttsAudioRef.current = audio;
        audio.play().catch(() => serverOnlyFail('Нажмите «Включить озвучку» для воспроизведения.'));
        audio.onended = () => {
          URL.revokeObjectURL(url);
          ttsAudioRef.current = null;
          ttsPlayingRef.current = false;
          processTtsQueue();
        };
      })
      .catch((err) => {
        const isNetwork = /timeout|failed|network/i.test(err?.message || '') || err?.cause?.code === 'UND_ERR_CONNECT_TIMEOUT';
        serverOnlyFail(isNetwork ? 'Нет доступа к серверу озвучки. Нажмите «Включить озвучку».' : null);
      });
  }, []);

  const onEnableTts = useCallback(() => {
    unlockAudio();
    setAudioUnlocked(true);
    ttsBlockedRef.current = false;
    setTtsError(null);
    processTtsQueue();
  }, [unlockAudio, processTtsQueue]);

  useEffect(() => {
    if (audioUnlockHandledRef.current) return;
    const handleFirstInteraction = () => {
      if (audioUnlockHandledRef.current) return;
      audioUnlockHandledRef.current = true;
      onEnableTts();
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('touchstart', handleFirstInteraction);
      document.removeEventListener('pointerdown', handleFirstInteraction);
    };
    document.addEventListener('click', handleFirstInteraction, { passive: true });
    document.addEventListener('touchstart', handleFirstInteraction, { passive: true });
    document.addEventListener('pointerdown', handleFirstInteraction, { passive: true });
    return () => {
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('touchstart', handleFirstInteraction);
      document.removeEventListener('pointerdown', handleFirstInteraction);
    };
  }, [onEnableTts]);

  useEffect(() => {
    const ctx = audioContextRef.current;
    if (!ctx) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible' && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const playHostText = useCallback((text, isUserGesture = false) => {
    if (!text || typeof window === 'undefined') return;
    ttsQueueRef.current.push(text);
    processTtsQueue();
  }, [processTtsQueue]);

  const addHostLine = useCallback((payload) => {
    if (typeof window === 'undefined') return;
    if (!isCreatorRef.current) return;
    if (!speakHostRef.current) return;
    const text = payload && typeof payload === 'object' && typeof payload.text === 'string' ? payload.text : payload;
    const type = payload && typeof payload === 'object' ? payload.type : undefined;
    if (!text) return;
    ttsQueueRef.current.push(type != null ? { text, type } : text);
    processTtsQueue();
  }, [processTtsQueue]);

  const testVoice = useCallback(() => {
    setTtsError(null);
    unlockAudio();
    playHostText('Проверка озвучки. Если вы слышите это, ведущий будет озвучен.', true);
  }, [unlockAudio, playHostText]);

  const playPhaseSound = useCallback((phaseName) => {
    if (typeof window === 'undefined' || !soundEffectsRef.current || !phaseName) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const freq = { night: 220, day: 360, voting: 520, ended: 280 }[phaseName] || 440;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } catch (_) {}
  }, []);

  const playTurnSound = useCallback((kind) => {
    if (typeof window === 'undefined' || !soundEffectsRef.current) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const freq = kind === 'start' ? 440 : 660;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      const t = ctx.currentTime;
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
      osc.start(t);
      osc.stop(t + 0.2);
    } catch (_) {}
  }, []);

  const checkKey = useCallback(async () => {
    setKeyCheck({ checking: true });
    try {
      const r = await fetch('/api/tts/check');
      const data = await r.json();
      setKeyCheck(data.ok ? { ok: true } : { ok: false, error: data.error });
    } catch (e) {
      setKeyCheck({ ok: false, error: e.message || 'Ошибка запроса' });
    }
  }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on('host_says', addHostLine);
    socket.on('room_updated', setRoom);
    socket.on('game_started', (data) => {
      log('game_started');
      setStartingGame(false);
      setScreen('game');
      setRoundIndex(data?.roundIndex ?? 1);
      setNightStep(null);
      setNightTurn(null);
      setGameResult(null);
    });
    socket.on('phase', (p) => {
      log('phase', p);
      setPhase(p);
      if (p) playPhaseSound(p);
      if (p === 'lobby') setScreen('lobby');
      if (p !== 'night') {
        setNightStep(null);
        setNightTurn(null);
        setHostAnnouncedNightStep(null);
        setMafiaVotesSummary([]);
      }
      if (p === 'night' || p === 'ended') setReactions([]);
      if (p === 'night' || p === 'ended') setExcludedForLastWords(null);
      if (p === 'day') setHostAnnouncedDay(true);
      else setHostAnnouncedDay(false);
    });
    socket.on('host_announced', (step) => {
      if (step === 'day') setHostAnnouncedDay(true);
      if (step?.startsWith('night_')) setHostAnnouncedNightStep(step);
    });
    const onNightStep = (step) => {
      log('night_step', step);
      setNightStep(step);
    };
    socket.on('night_step', onNightStep);
    socket.on('night_turn', (data) => {
      const r = roleRef.current;
      const isMyStep =
        (data?.step === 'mafia' && (r === 'mafia' || r === 'don')) ||
        (data?.step === 'don_decides' && r === 'don') ||
        (data?.step === 'doctor' && r === 'doctor') ||
        (data?.step === 'detective' && r === 'detective') ||
        (data?.step === 'veteran' && r === 'veteran');
      log('night_turn', 'step=', data?.step, 'myRole=', r, 'isMyStep=', isMyStep);
      if (isMyStep && data) setNightTurn(data);
    });
    socket.on('night_turn_end', (data) => {
      log('night_turn_end', data?.step);
      if (nightTurnRef.current?.step === data?.step) setNightTurn(null);
      setHostAnnouncedNightStep(null);
      if (data?.step === 'mafia' || data?.step === 'don_decides') {
        setMafiaVotesSummary([]);
        setMafiaTargetId(null);
      }
    });
    socket.on('mafia_votes', (data) => setMafiaVotesSummary(data?.votesByTarget || []));
    socket.on('mafia_target_set', (data) => setMafiaTargetId(data?.targetId ?? null));
    socket.on('your_role', (role) => {
      log('your_role received');
      setRole(role);
    });
    socket.on('day_started', (data) => {
      setAlive(data.alive || []);
      if (data.roundIndex != null) setRoundIndex(data.roundIndex);
      if (data.discussionTimerSec != null) setDiscussionTimerSec(data.discussionTimerSec);
    });
    socket.on('round', (r) => setRoundIndex(r));
    socket.on('game_ended', (data) => {
      setPhase('ended');
      setGameResult(data || null);
    });
    socket.on('play_again_done', () => setScreen('lobby'));
    socket.on('player_excluded', (data) => setExcludedForLastWords(data || null));
    socket.on('vote_counts', (data) => setVoteCounts(data?.counts || {}));
    socket.on('vote_tie_break', (data) => {
      setVoteCounts({});
      setTieBreakSecondsLeft(data?.secondsLeft ?? 30);
    });
    socket.on('last_words_said', (payload) => setReactions((prev) => [...prev.slice(-29), { type: 'last_words', ...payload }]));
    socket.on('reaction', (payload) => setReactions((prev) => [...prev.slice(-29), { type: 'emoji', ...payload }]));
    return () => {
      socket.off('host_says', addHostLine);
      socket.off('room_updated');
      socket.off('game_started');
      socket.off('phase');
      socket.off('night_step', onNightStep);
      socket.off('night_turn');
      socket.off('night_turn_end');
      socket.off('mafia_votes');
      socket.off('mafia_target_set');
      socket.off('your_role');
      socket.off('day_started');
      socket.off('round');
      socket.off('game_ended');
      socket.off('play_again_done');
      socket.off('player_excluded');
      socket.off('vote_counts');
      socket.off('vote_tie_break');
      socket.off('last_words_said');
      socket.off('reaction');
      socket.off('host_announced');
    };
  }, [socket, addHostLine, playPhaseSound]);

  const createRoom = (name) => {
    if (!socket || creatingRoom) return;
    setHomeError(null);
    setCreatingRoom(true);
    setPlayerName(name || 'Ведущий');
    setIsCreator(true);
    socket.emit('create_room', name || 'Ведущий', (res) => {
      setCreatingRoom(false);
      if (res?.error) {
        setHomeError(res.error);
        return;
      }
      setRoomCode(res.code);
      setPlayerId(res.playerId);
      try {
        localStorage.setItem('mafia_last_room', res.code);
        localStorage.setItem('mafia_last_name', name || 'Ведущий');
      } catch (_) {}
      setScreen('lobby');
    });
  };

  const joinRoom = (code, name) => {
    if (!socket || joiningRoom) return;
    const trimmedCode = String(code).trim();
    const displayName = name?.trim() || 'Игрок';
    setHomeError(null);
    setJoiningRoom(true);
    setPlayerName(displayName);
    socket.emit('join_room', { code: trimmedCode, playerName: displayName }, (res) => {
      if (res?.error) {
        const isGameAlreadyStarted = res.error === 'Игра уже идёт' || (typeof res.error === 'string' && res.error.includes('Игра уже'));
        if (isGameAlreadyStarted) {
          setHomeError('Возвращаем в игру…');
          socket.emit('rejoin_room', { code: trimmedCode, playerName: displayName }, (rejoinRes) => {
            setJoiningRoom(false);
            if (rejoinRes?.error) {
              setHomeError(rejoinRes.error);
              return;
            }
            setHomeError(null);
            setRoomCode(trimmedCode);
            setPlayerId(rejoinRes.playerId);
            setIsCreator(!!rejoinRes.isCreator);
            try {
              localStorage.setItem('mafia_last_room', trimmedCode);
              localStorage.setItem('mafia_last_name', displayName);
            } catch (_) {}
            setScreen('game');
          });
          return;
        }
        setJoiningRoom(false);
        setHomeError(res.error);
        return;
      }
      setJoiningRoom(false);
      setRoomCode(trimmedCode);
      setPlayerId(res.playerId);
      try {
        localStorage.setItem('mafia_last_room', trimmedCode);
        localStorage.setItem('mafia_last_name', displayName);
      } catch (_) {}
      setScreen('lobby');
    });
  };

  const startGame = () => {
    if (startingGame) return;
    setStartingGame(true);
    socket?.emit('start_game');
  };

  const copyRoomCode = useCallback(() => {
    if (!roomCode) return;
    navigator.clipboard?.writeText(roomCode).then(() => {
      setCopyToast(true);
      setTimeout(() => setCopyToast(false), 2000);
    });
  }, [roomCode]);

  if (screen === 'home') {
    return (
      <>
        {!connected && (
          <div className="connection-overlay" role="alert">
            <p>Нет связи. Переподключение…</p>
          </div>
        )}
        <Home
          onCreateRoom={createRoom}
          onJoinRoom={joinRoom}
          homeError={homeError}
          creatingRoom={creatingRoom}
          joiningRoom={joiningRoom}
          initialJoinCode={typeof localStorage !== 'undefined' ? (localStorage.getItem('mafia_last_room') || '') : ''}
          initialJoinName={typeof localStorage !== 'undefined' ? (localStorage.getItem('mafia_last_name') || '') : ''}
        />
      </>
    );
  }
  const setRoomSettings = (opts) => {
    socket?.emit('room_settings', opts);
  };

  if (screen === 'lobby') {
    return (
      <>
        {!connected && (
          <div className="connection-overlay" role="alert">
            <p>Нет связи. Переподключение…</p>
          </div>
        )}
        <Lobby
          roomCode={roomCode}
          room={room}
          playerId={playerId}
          onSetAvatar={(id) => socket?.emit('set_avatar', id)}
          isCreator={isCreator}
          onStartGame={startGame}
          onRoomSettings={setRoomSettings}
          onCopyCode={copyRoomCode}
          copyToast={copyToast}
          startingGame={startingGame}
        />
      </>
    );
  }
  return (
    <>
      {!connected && (
        <div className="connection-overlay" role="alert">
          <p>Нет связи. Переподключение…</p>
        </div>
      )}
      <Game
      socket={socket}
      room={room}
      playerId={playerId}
      playerName={playerName}
      isCreator={isCreator}
      role={role}
      phase={phase}
      alive={alive}
      roundIndex={roundIndex}
      nightStep={nightStep}
      nightTurn={nightTurn}
      gameResult={gameResult}
      discussionTimerSec={discussionTimerSec}
      reactions={reactions}
      excludedForLastWords={excludedForLastWords}
      voteCounts={voteCounts}
      mafiaVotesSummary={mafiaVotesSummary}
      mafiaTargetId={mafiaTargetId}
      tieBreakSecondsLeft={tieBreakSecondsLeft}
      hostAnnouncedDay={hostAnnouncedDay}
      hostAnnouncedNightStep={hostAnnouncedNightStep}
      speakHost={speakHost}
      setSpeakHost={setSpeakHost}
      audioUnlocked={audioUnlocked}
      onEnableTts={onEnableTts}
      onTestVoice={testVoice}
      ttsError={ttsError}
      setTtsError={setTtsError}
      keyCheck={keyCheck}
      onCheckKey={checkKey}
      soundEffects={soundEffects}
      setSoundEffects={setSoundEffects}
      playTurnSound={playTurnSound}
    />
    </>
  );
}
