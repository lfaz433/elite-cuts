import React, { useState } from 'react'
import { useVenue } from '../context/VenueContext'

export default function MagicalTicket() {
  const [email, setEmail] = useState('')
  const [unlocked, setUnlocked] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleUnlock = () => {
    if (!email.trim()) return
    setIsLoading(true)
    setTimeout(() => {
      setIsLoading(false)
      setUnlocked(true)
    }, 1200)
  }

  return (
    <section className="section" style={{ padding: '56px 0' }}>
      <div className="container-lg">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 0,
            borderRadius: 'var(--radius-2xl)',
            overflow: 'hidden',
            boxShadow: '0 20px 60px rgba(61,46,38,0.2)',
          }}
        >
          {/* Left — Text Panel */}
          <div
            style={{
              background: 'var(--off-white)',
              padding: '52px 48px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              borderRight: '1px dashed var(--gold)',
              position: 'relative',
            }}
          >
            {/* Notches on divider */}
            <div
              style={{
                position: 'absolute',
                right: -16,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'var(--cream)',
                border: '1px dashed var(--gold)',
                zIndex: 10,
              }}
            />

            <div className="badge badge-gold" style={{ marginBottom: 16, alignSelf: 'flex-start' }}>
              🎟 New Member Exclusive
            </div>
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(28px, 3vw, 44px)',
                color: 'var(--taupe)',
                lineHeight: 1.1,
                marginBottom: 16,
              }}
            >
              Unlock{' '}
              <span className="shimmer-text" style={{ fontFamily: 'var(--font-display)' }}>
                10% Off
              </span>{' '}
              Your First Drink
            </h2>
            <p
              style={{
                color: 'var(--text-secondary)',
                fontSize: 15,
                lineHeight: 1.65,
                marginBottom: 32,
              }}
            >
              Create your Spotlight account and receive a magical golden ticket redeemable on your first cocktail, platter, or show ticket. Your night of decadence starts here.
            </p>

            {unlocked ? (
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(201,168,76,0.12), rgba(201,168,76,0.06))',
                  border: '1.5px solid var(--gold)',
                  borderRadius: 'var(--radius-xl)',
                  padding: '20px 24px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                }}
              >
                <div style={{ fontSize: 36 }}>🎉</div>
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--taupe)', marginBottom: 4 }}>
                    You're on the list!
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    Check your inbox — your golden ticket is on its way to{' '}
                    <strong>{email}</strong>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  className="input"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                  style={{ flex: 1 }}
                />
                <button
                  className="btn btn-gold"
                  onClick={handleUnlock}
                  disabled={isLoading}
                  style={{ flexShrink: 0, opacity: isLoading ? 0.7 : 1 }}
                >
                  {isLoading ? '✨' : 'Unlock Now'}
                </button>
              </div>
            )}

            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>
              No spam. Unsubscribe anytime. One ticket per new account.
            </p>
          </div>

          {/* Right — Golden Ticket Graphic */}
          <div
            style={{
              background: 'linear-gradient(135deg, #1a1008 0%, #2e1a0e 50%, #1a1008 100%)',
              padding: '48px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Background starfield */}
            {Array.from({ length: 20 }, (_, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  width: 2,
                  height: 2,
                  borderRadius: '50%',
                  background: 'rgba(201,168,76,0.4)',
                  top: `${Math.random() * 100}%`,
                  left: `${Math.random() * 100}%`,
                  animation: `pulse-glow ${1.5 + Math.random() * 2}s ease-in-out infinite`,
                  animationDelay: `${Math.random() * 2}s`,
                }}
              />
            ))}

            {/* The golden ticket SVG */}
            <div
              className="animate-float"
              style={{
                width: '100%',
                maxWidth: 320,
                position: 'relative',
                zIndex: 2,
              }}
            >
              {/* Ticket container */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #c9a84c, #e2c97e, #c9a84c)',
                  borderRadius: 20,
                  padding: '28px 32px',
                  position: 'relative',
                  boxShadow: '0 20px 50px rgba(201,168,76,0.4), 0 0 0 1px rgba(255,255,255,0.2)',
                }}
              >
                {/* Perforations top */}
                <div
                  style={{
                    position: 'absolute',
                    top: -1,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    gap: 8,
                  }}
                >
                  {Array.from({ length: 8 }, (_, i) => (
                    <div
                      key={i}
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: '#1a1008',
                        marginTop: -5,
                      }}
                    />
                  ))}
                </div>

                {/* Venue name */}
                <div
                  style={{
                    textAlign: 'center',
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                    color: 'rgba(61,46,38,0.6)',
                    marginBottom: 12,
                  }}
                >
                  The Spotlight Theater & Bar
                </div>

                {/* Big ticket text */}
                <div
                  style={{
                    textAlign: 'center',
                    fontFamily: 'var(--font-display)',
                    fontSize: 48,
                    color: 'var(--taupe)',
                    lineHeight: 1,
                    marginBottom: 8,
                  }}
                >
                  10%
                </div>
                <div
                  style={{
                    textAlign: 'center',
                    fontFamily: 'var(--font-display)',
                    fontSize: 22,
                    color: 'var(--taupe)',
                    lineHeight: 1,
                    marginBottom: 16,
                  }}
                >
                  OFF
                </div>

                {/* Horizontal dashed divider */}
                <div
                  style={{
                    borderTop: '2px dashed rgba(61,46,38,0.2)',
                    marginBottom: 16,
                  }}
                />

                {/* Details */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 12,
                    fontSize: 11,
                    color: 'rgba(61,46,38,0.65)',
                    fontWeight: 600,
                  }}
                >
                  <div>
                    <div style={{ opacity: 0.5, marginBottom: 2, letterSpacing: '0.1em' }}>VALID FOR</div>
                    <div>1 Drink Order</div>
                  </div>
                  <div>
                    <div style={{ opacity: 0.5, marginBottom: 2, letterSpacing: '0.1em' }}>EXPIRES</div>
                    <div>First Visit</div>
                  </div>
                  <div>
                    <div style={{ opacity: 0.5, marginBottom: 2, letterSpacing: '0.1em' }}>CODE</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 13 }}>SPOT-FIRST-10</div>
                  </div>
                  <div>
                    <div style={{ opacity: 0.5, marginBottom: 2, letterSpacing: '0.1em' }}>STATUS</div>
                    <div style={{ color: '#16a34a' }}>✓ Active</div>
                  </div>
                </div>

                {/* Barcode */}
                <div style={{ marginTop: 18, textAlign: 'center' }}>
                  <svg width="180" height="40" viewBox="0 0 180 40" style={{ opacity: 0.3 }}>
                    {Array.from({ length: 45 }, (_, i) => (
                      <rect
                        key={i}
                        x={i * 4}
                        y={0}
                        width={i % 3 === 0 ? 3 : i % 5 === 0 ? 1 : 2}
                        height={40}
                        fill="var(--taupe)"
                      />
                    ))}
                  </svg>
                  <div
                    style={{
                      fontSize: 9,
                      fontFamily: 'monospace',
                      color: 'rgba(61,46,38,0.4)',
                      letterSpacing: '0.2em',
                      marginTop: 4,
                    }}
                  >
                    4201-8845-0076-3391
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
