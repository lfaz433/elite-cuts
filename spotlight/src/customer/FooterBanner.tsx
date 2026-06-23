import React from 'react'

const PHRASES = [
  '🎭 Live Improv Every Night',
  '🍸 Award-Winning Cocktails',
  '🎤 Comedy. Karaoke. Joy.',
  '🎟 Book Your Night at Spotlight',
  '👑 Premium Seating. Unforgettable Shows.',
  '✨ Where Theatre Meets the Bar',
]

export default function FooterBanner() {
  const repeatedPhrases = [...PHRASES, ...PHRASES]

  return (
    <div
      style={{
        background: 'var(--burgundy)',
        padding: '18px 0',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Left fade */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 80,
          background: 'linear-gradient(to right, var(--burgundy), transparent)',
          zIndex: 2,
        }}
      />
      {/* Right fade */}
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 80,
          background: 'linear-gradient(to left, var(--burgundy), transparent)',
          zIndex: 2,
        }}
      />

      <div
        className="animate-marquee"
        style={{
          display: 'flex',
          gap: 0,
          whiteSpace: 'nowrap',
          width: 'max-content',
        }}
      >
        {repeatedPhrases.map((phrase, i) => (
          <span
            key={i}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0,
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: '0.04em',
              padding: '0 36px',
            }}
          >
            {phrase}
            <span
              style={{
                display: 'inline-block',
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.4)',
                marginLeft: 36,
              }}
            />
          </span>
        ))}
      </div>
    </div>
  )
}
