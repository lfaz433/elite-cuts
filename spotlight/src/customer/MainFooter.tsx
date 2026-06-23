import React, { useState } from 'react'
import { Instagram, Twitter, Facebook, Youtube, Mail, ArrowRight } from 'lucide-react'

export default function MainFooter() {
  const [newsletterEmail, setNewsletterEmail] = useState('')
  const [subscribed, setSubscribed] = useState(false)

  const handleSubscribe = () => {
    if (!newsletterEmail.trim()) return
    setSubscribed(true)
  }

  return (
    <footer
      style={{
        background: 'var(--dark-surface)',
        color: 'rgba(255,255,255,0.7)',
        padding: '64px 0 32px',
      }}
    >
      <div className="container-xl">
        {/* Top section — logo + newsletter */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.5fr 1fr 1fr 1.2fr',
            gap: 48,
            marginBottom: 56,
          }}
        >
          {/* Column 1 — Brand */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  background: 'var(--burgundy)',
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 16,
                }}
              >
                🎭
              </div>
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 18,
                    color: '#fff',
                    lineHeight: 1.1,
                  }}
                >
                  Spotlight
                </div>
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                    color: 'rgba(255,255,255,0.35)',
                  }}
                >
                  Theater & Bar
                </div>
              </div>
            </div>
            <p
              style={{
                fontSize: 14,
                lineHeight: 1.65,
                color: 'rgba(255,255,255,0.5)',
                marginBottom: 24,
                maxWidth: 260,
              }}
            >
              The city's premier destination for live performance, craft cocktails, and unforgettable evenings. Every night is opening night.
            </p>
            {/* Social icons */}
            <div style={{ display: 'flex', gap: 10 }}>
              {[
                { icon: Instagram, label: 'Instagram' },
                { icon: Twitter, label: 'Twitter' },
                { icon: Facebook, label: 'Facebook' },
                { icon: Youtube, label: 'YouTube' },
              ].map(({ icon: Icon, label }) => (
                <button
                  key={label}
                  aria-label={label}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: 'rgba(255,255,255,0.55)',
                    transition: 'all 0.2s var(--ease-smooth)',
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget
                    el.style.background = 'var(--burgundy)'
                    el.style.borderColor = 'var(--burgundy)'
                    el.style.color = '#fff'
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget
                    el.style.background = 'rgba(255,255,255,0.07)'
                    el.style.borderColor = 'rgba(255,255,255,0.1)'
                    el.style.color = 'rgba(255,255,255,0.55)'
                  }}
                >
                  <Icon size={15} />
                </button>
              ))}
            </div>
          </div>

          {/* Column 2 — Shows */}
          <div>
            <h5
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.35)',
                marginBottom: 20,
              }}
            >
              Shows & Events
            </h5>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                'What\'s On Tonight',
                'Weekend Shows',
                'Comedy Nights',
                'Improv Showcase',
                'Karaoke Events',
                'Private Events',
                'Gift Vouchers',
              ].map((item) => (
                <li key={item}>
                  <a
                    href="#"
                    style={{
                      color: 'rgba(255,255,255,0.5)',
                      textDecoration: 'none',
                      fontSize: 14,
                      transition: 'color 0.15s',
                      display: 'block',
                    }}
                    onMouseEnter={(e) => ((e.target as HTMLAnchorElement).style.color = '#fff')}
                    onMouseLeave={(e) =>
                      ((e.target as HTMLAnchorElement).style.color = 'rgba(255,255,255,0.5)')
                    }
                  >
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3 — Info */}
          <div>
            <h5
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.35)',
                marginBottom: 20,
              }}
            >
              The Venue
            </h5>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                'About Us',
                'Our Story',
                'The Menu',
                'Cocktail Bar',
                'VIP Membership',
                'Accessibility',
                'Contact',
              ].map((item) => (
                <li key={item}>
                  <a
                    href="#"
                    style={{
                      color: 'rgba(255,255,255,0.5)',
                      textDecoration: 'none',
                      fontSize: 14,
                      transition: 'color 0.15s',
                      display: 'block',
                    }}
                    onMouseEnter={(e) => ((e.target as HTMLAnchorElement).style.color = '#fff')}
                    onMouseLeave={(e) =>
                      ((e.target as HTMLAnchorElement).style.color = 'rgba(255,255,255,0.5)')
                    }
                  >
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 4 — Newsletter */}
          <div>
            <h5
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.35)',
                marginBottom: 20,
              }}
            >
              Stay in the Spotlight
            </h5>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', marginBottom: 20, lineHeight: 1.6 }}>
              Weekly show listings, cocktail recipes, and exclusive early access to limited events.
            </p>
            {subscribed ? (
              <div
                style={{
                  padding: '16px',
                  background: 'rgba(22,163,74,0.12)',
                  border: '1px solid rgba(22,163,74,0.3)',
                  borderRadius: 'var(--radius-lg)',
                  color: '#4ade80',
                  fontSize: 14,
                  fontWeight: 500,
                }}
              >
                🎉 You're subscribed! See you in your inbox.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={newsletterEmail}
                  onChange={(e) => setNewsletterEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubscribe()}
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 'var(--radius-md)',
                    padding: '12px 16px',
                    color: '#fff',
                    fontSize: 14,
                    outline: 'none',
                    fontFamily: 'var(--font-body)',
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={(e) =>
                    ((e.target as HTMLInputElement).style.borderColor = 'rgba(162,26,43,0.7)')
                  }
                  onBlur={(e) =>
                    ((e.target as HTMLInputElement).style.borderColor = 'rgba(255,255,255,0.12)')
                  }
                />
                <button
                  className="btn btn-primary"
                  onClick={handleSubscribe}
                  style={{ width: '100%' }}
                >
                  Subscribe <ArrowRight size={14} />
                </button>
              </div>
            )}
            {/* Address */}
            <div
              style={{
                marginTop: 28,
                padding: '14px 16px',
                background: 'rgba(255,255,255,0.04)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid rgba(255,255,255,0.07)',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>
                📍 Find Us
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
                12 Grand Canal Quay<br />
                Dublin 2, D02 P820<br />
                <br />
                <strong style={{ color: 'rgba(255,255,255,0.6)' }}>Open Daily:</strong> 5PM – 2AM
              </div>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', marginBottom: 24 }} />

        {/* Bottom bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>
            © 2025 Spotlight Theater & Bar Ltd. All rights reserved.
          </p>
          <div style={{ display: 'flex', gap: 20 }}>
            {['Privacy Policy', 'Terms of Service', 'Cookie Preferences'].map((link) => (
              <a
                key={link}
                href="#"
                style={{
                  fontSize: 13,
                  color: 'rgba(255,255,255,0.3)',
                  textDecoration: 'none',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={(e) => ((e.target as HTMLAnchorElement).style.color = 'rgba(255,255,255,0.7)')}
                onMouseLeave={(e) =>
                  ((e.target as HTMLAnchorElement).style.color = 'rgba(255,255,255,0.3)')
                }
              >
                {link}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
