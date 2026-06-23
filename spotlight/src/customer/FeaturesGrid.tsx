import React from 'react'
import { useVenue } from '../context/VenueContext'

const PRODUCTION_PHOTOS = [
  {
    url: 'https://images.unsplash.com/photo-1593784991095-a205069470b6?w=500&q=80',
    caption: 'The Midnight Improv',
  },
  {
    url: 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=500&q=80',
    caption: 'Stand-Up Saturday',
  },
  {
    url: 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=500&q=80',
    caption: 'Cocktail Hour',
  },
  {
    url: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=500&q=80',
    caption: 'Jazz & Wine',
  },
]

export default function FeaturesGrid() {
  const { state } = useVenue()

  return (
    <section
      className="section"
      style={{
        background: 'linear-gradient(to bottom, var(--cream), var(--cream-dark))',
      }}
    >
      <div className="container-xl">
        <div
          className="responsive-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 48,
            alignItems: 'start',
          }}
        >
          {/* Left — Feature Promise Cards */}
          <div>
            <div className="badge badge-burgundy" style={{ marginBottom: 12 }}>
              Our Promise
            </div>
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(26px, 3vw, 40px)',
                color: 'var(--taupe)',
                lineHeight: 1.1,
                marginBottom: 36,
              }}
            >
              Every Night,{' '}
              <em style={{ fontStyle: 'italic', color: 'var(--burgundy)' }}>
                Exceptional.
              </em>
            </h2>

            <div
              className="responsive-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 16,
              }}
            >
              {state.features.map((feature) => (
                <div
                  key={feature.id}
                  style={{
                    background: 'var(--off-white)',
                    borderRadius: 'var(--radius-xl)',
                    padding: '22px 20px',
                    border: '1.5px solid var(--warm-grey)',
                    boxShadow: '0 2px 12px var(--shadow-warm)',
                    transition: 'transform 0.2s var(--ease-smooth), box-shadow 0.2s',
                    cursor: 'default',
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLDivElement
                    el.style.transform = 'translateY(-4px)'
                    el.style.boxShadow = '0 12px 32px var(--shadow-warm)'
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLDivElement
                    el.style.transform = 'none'
                    el.style.boxShadow = '0 2px 12px var(--shadow-warm)'
                  }}
                >
                  {/* Icon */}
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      background: 'linear-gradient(135deg, var(--burgundy), var(--burgundy-light))',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 20,
                      marginBottom: 14,
                      boxShadow: '0 4px 12px var(--shadow-burgundy)',
                    }}
                  >
                    {feature.icon}
                  </div>
                  <h4
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: 'var(--taupe)',
                      marginBottom: 6,
                      lineHeight: 1.3,
                    }}
                  >
                    {feature.title}
                  </h4>
                  <p
                    style={{
                      fontSize: 13,
                      color: 'var(--text-secondary)',
                      lineHeight: 1.55,
                    }}
                  >
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Right — 2×2 Production Photos */}
          <div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
              }}
            >
              {PRODUCTION_PHOTOS.map((photo, i) => (
                <div
                  key={photo.url}
                  style={{
                    aspectRatio: '1 / 1',
                    borderRadius: i === 0 ? 'var(--radius-2xl)' : i === 3 ? 'var(--radius-2xl)' : 'var(--radius-xl)',
                    overflow: 'hidden',
                    position: 'relative',
                    boxShadow: '0 4px 20px var(--shadow-warm)',
                    cursor: 'pointer',
                  }}
                >
                  <img
                    src={photo.url}
                    alt={photo.caption}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                      transition: 'transform 0.5s var(--ease-smooth)',
                    }}
                    onMouseEnter={(e) =>
                      ((e.target as HTMLImageElement).style.transform = 'scale(1.06)')
                    }
                    onMouseLeave={(e) =>
                      ((e.target as HTMLImageElement).style.transform = 'scale(1)')
                    }
                  />
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background:
                        'linear-gradient(to top, rgba(26,16,8,0.65) 0%, transparent 55%)',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 12,
                      left: 14,
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {photo.caption}
                  </div>
                </div>
              ))}
            </div>

            {/* Tagline below photos */}
            <div
              style={{
                marginTop: 20,
                padding: '16px 20px',
                background: 'var(--off-white)',
                borderRadius: 'var(--radius-xl)',
                border: '1.5px solid var(--warm-grey)',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: 'var(--gold)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                  flexShrink: 0,
                }}
              >
                🏆
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--taupe)' }}>
                  "Best Live Entertainment Venue 2025"
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Time Out City Awards · Reader's Choice
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
