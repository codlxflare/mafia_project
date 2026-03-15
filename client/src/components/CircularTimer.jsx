/**
 * Круговой таймер (кольцо + секунды в центре). Используется для переголосования, хода обсуждения, последнего слова и т.д.
 * Не используется для общего таймера голосования.
 */
export default function CircularTimer({ totalSeconds, secondsLeft, size = 64, className = '', ariaLabel = 'Осталось секунд' }) {
  if (totalSeconds <= 0 || secondsLeft == null) return null;
  const sec = Math.max(0, Math.floor(Number(secondsLeft)));
  const ratio = Math.min(1, sec / totalSeconds);
  const circumference = 2 * Math.PI * 15.5;
  const strokeDashoffset = circumference - ratio * circumference;
  const isLastWords = typeof className === 'string' && className.includes('last-words');
  const effectiveSize = isLastWords ? 36 : size;

  return (
    <div
      className={[className || '', 'circular-timer'].filter(Boolean).join(' ')}
      style={{ width: effectiveSize, height: effectiveSize }}
      role="timer"
      aria-live="polite"
      aria-valuenow={sec}
      aria-valuemin={0}
      aria-valuemax={totalSeconds}
      aria-label={ariaLabel}
    >
      <svg className="circular-timer-ring" viewBox="0 0 36 36" aria-hidden>
        <path
          className="circular-timer-ring-bg"
          d="M18 2.5 a 15.5 15.5 0 0 1 0 31 a 15.5 15.5 0 0 1 0 -31"
          fill="none"
          strokeWidth="3"
        />
        <path
          className="circular-timer-ring-fill"
          d="M18 2.5 a 15.5 15.5 0 0 1 0 31 a 15.5 15.5 0 0 1 0 -31"
          fill="none"
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{ transition: 'stroke-dashoffset 1s linear' }}
        />
      </svg>
      <span className="circular-timer-value">{sec}</span>
    </div>
  );
}
