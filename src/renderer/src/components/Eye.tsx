export type EyeMood = 'open' | 'sleepy' | 'blind' | 'happy'

/** Claptrap's big round optic. Original drawing: a ringed lens with a glowing iris. */
export function Eye({ mood = 'open', size = 120 }: { mood?: EyeMood; size?: number }) {
  const iris = mood === 'blind' ? '#e2402f' : '#3fe0f0'
  return (
    <svg className={`eye eye-${mood}`} width={size} height={size} viewBox="0 0 120 120" aria-hidden>
      <defs>
        <radialGradient id="lens" cx="45%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="25%" stopColor={iris} />
          <stop offset="100%" stopColor="#0b3d47" />
        </radialGradient>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#141110" strokeWidth="1.6" />
        </pattern>
        <clipPath id="lensClip">
          <circle cx="60" cy="60" r="30" />
        </clipPath>
      </defs>

      {/* housing */}
      <circle cx="60" cy="60" r="54" fill="#f5b700" stroke="#141110" strokeWidth="5" />
      {/* inked shadow crescent along the lower-right rim */}
      <path d="M98 22 A54 54 0 0 1 22 98 A46 46 0 0 0 98 22 Z" fill="url(#hatch)" opacity="0.4" />
      <circle cx="60" cy="60" r="40" fill="#3a3634" stroke="#141110" strokeWidth="4" />
      {[0, 90, 180, 270].map((a) => (
        <circle
          key={a}
          cx={60 + 47 * Math.cos((a * Math.PI) / 180 + Math.PI / 4)}
          cy={60 + 47 * Math.sin((a * Math.PI) / 180 + Math.PI / 4)}
          r="3"
          fill="#8a4b1f"
          stroke="#141110"
          strokeWidth="1.5"
        />
      ))}

      {/* lens */}
      <g clipPath="url(#lensClip)">
        <circle cx="60" cy="60" r="30" fill="url(#lens)" filter={mood === 'blind' ? undefined : 'url(#glow)'} />
        <circle className="eye-pupil" cx="60" cy="60" r="10" fill="#141110" />
        <circle cx="52" cy="51" r="5" fill="#fff" opacity="0.85" />
        {mood === 'sleepy' && <rect x="20" y="20" width="80" height="42" fill="#3a3634" stroke="#141110" strokeWidth="4" />}
        {mood === 'happy' && <path d="M24 74 Q60 44 96 74 L96 100 L24 100 Z" fill="#3a3634" stroke="#141110" strokeWidth="4" />}
      </g>
      <circle cx="60" cy="60" r="30" fill="none" stroke="#141110" strokeWidth="4" />
      {mood === 'blind' && (
        <g stroke="#141110" strokeWidth="6" strokeLinecap="round">
          <line x1="46" y1="46" x2="74" y2="74" />
          <line x1="74" y1="46" x2="46" y2="74" />
        </g>
      )}
    </svg>
  )
}
