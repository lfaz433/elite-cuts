import React, { useState } from 'react'
import { X, Ticket } from 'lucide-react'
import { useVenue } from '../context/VenueContext'
import type { Seat } from '../types'

const SEAT_COLORS = {
  available: { fill: '#e8ddd3', stroke: '#cfc0b0', text: '#6b5245' },
  selected: { fill: '#a21a2b', stroke: '#7a1320', text: '#ffffff' },
  booked: { fill: '#d1c5be', stroke: '#b8a99e', text: '#9d8d84' },
  reserved: { fill: '#f0e9e2', stroke: '#e2c97e', text: '#9d7c2e' },
}

const TIER_LABELS: Record<string, string> = {
  premium: '💎 Premium — Front Stalls',
  standard: '⭐ Standard — Mid Stalls',
  gallery: '🎭 Gallery — Rear/Balcony',
}

export default function SeatingMap() {
  const { state, dispatch } = useVenue()
  const [hoveredSeat, setHoveredSeat] = useState<Seat | null>(null)
  const [showId, setShowId] = useState(state.shows[0]?.id ?? null)
  const [bookingEmail, setBookingEmail] = useState('')
  const [bookingDone, setBookingDone] = useState(false)

  const activeShow = state.shows.find((s) => s.id === showId)

  const selectedSeats = state.seats.filter((s) => state.selectedSeatIds.includes(s.id))

  const totalPrice = selectedSeats.reduce((sum, s) => {
    if (!activeShow) return sum
    return (
      sum +
      (s.tier === 'premium'
        ? activeShow.premiumPrice
        : s.tier === 'standard'
        ? activeShow.standardPrice
        : activeShow.galleryPrice)
    )
  }, 0)

  const handleSeatClick = (seat: Seat) => {
    if (seat.status === 'booked' || seat.status === 'reserved') return
    if (state.selectedSeatIds.includes(seat.id)) {
      dispatch({ type: 'DESELECT_SEAT', seatId: seat.id })
    } else {
      dispatch({ type: 'SELECT_SEAT', seatId: seat.id })
    }
  }

  const handleBook = () => {
    if (!activeShow || selectedSeats.length === 0 || !bookingEmail.trim()) return
    dispatch({
      type: 'BOOK_SEATS',
      seatIds: selectedSeats.map((s) => s.id),
      email: bookingEmail,
      showId: activeShow.id,
      amount: totalPrice,
    })
    setBookingDone(true)
  }

  // Group seats by row for SVG layout
  const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

  return (
    <section className="section" style={{ background: 'var(--cream-dark)' }}>
      <div className="container-xl">
        {/* Header */}
        <div style={{ marginBottom: 32, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <div className="badge badge-burgundy" style={{ marginBottom: 10 }}>
              🎭 Interactive Seating Map
            </div>
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(26px, 3vw, 40px)',
                color: 'var(--taupe)',
              }}
            >
              Choose Your Seat
            </h2>
          </div>

          {/* Show selector */}
          <div>
            <label className="label" style={{ textAlign: 'right' }}>
              Select Show
            </label>
            <select
              className="input"
              value={showId ?? ''}
              onChange={(e) => {
                setShowId(e.target.value)
                setBookingDone(false)
              }}
              style={{ maxWidth: 320 }}
            >
              {state.shows.map((show) => (
                <option key={show.id} value={show.id}>
                  {show.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 32 }}>
          {/* SVG Seating Map */}
          <div
            style={{
              background: 'var(--off-white)',
              borderRadius: 'var(--radius-2xl)',
              border: '1.5px solid var(--warm-grey)',
              padding: '32px 24px',
              overflow: 'auto',
            }}
          >
            {/* Stage */}
            <div
              style={{
                width: '80%',
                margin: '0 auto 32px',
                padding: '14px',
                background: 'linear-gradient(180deg, var(--burgundy) 0%, var(--burgundy-dark) 100%)',
                borderRadius: '0 0 40px 40px',
                textAlign: 'center',
                color: '#fff',
                fontWeight: 700,
                fontSize: 13,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                boxShadow: '0 8px 24px rgba(162,26,43,0.4)',
              }}
            >
              🎭 STAGE
            </div>

            {/* Seat grid */}
            <svg
              viewBox="0 0 660 480"
              style={{ width: '100%', maxWidth: 660 }}
            >
              {/* Zone labels */}
              <text x="14" y="45" fontSize="9" fill="var(--text-muted)" fontFamily="var(--font-body)" fontWeight="700" textAnchor="start" letterSpacing="2">STALLS</text>
              <text x="14" y="385" fontSize="9" fill="var(--text-muted)" fontFamily="var(--font-body)" fontWeight="700" textAnchor="start" letterSpacing="2">BALCONY</text>

              {/* Balcony separator */}
              <line x1="0" y1="360" x2="660" y2="360" stroke="var(--warm-grey-dark)" strokeWidth="1" strokeDasharray="6 4" />

              {rows.map((row, rowIdx) => {
                const seatsInRow = state.seats.filter((s) => s.row === row)
                const isBalcony = row === 'G' || row === 'H'
                const yOffset = isBalcony ? 370 : 40

                return (
                  <g key={row}>
                    {/* Row label */}
                    <text
                      x={30}
                      y={yOffset + rowIdx * 44 - (isBalcony ? 370 - 40 : 0) + (isBalcony ? (rowIdx - 6) * 44 : rowIdx * 44) + 16}
                      fontSize="11"
                      fill="var(--text-muted)"
                      fontFamily="var(--font-body)"
                      fontWeight="600"
                      textAnchor="middle"
                    >
                      {row}
                    </text>

                    {seatsInRow.map((seat) => {
                      const seatStatus = state.selectedSeatIds.includes(seat.id)
                        ? 'selected'
                        : seat.status
                      const colors = SEAT_COLORS[seatStatus as keyof typeof SEAT_COLORS] ?? SEAT_COLORS.available
                      const cx = 60 + (seat.number - 1) * 58 + 16
                      const cy = isBalcony
                        ? 370 + (rowIdx - 6) * 44 + 16
                        : 40 + rowIdx * 44 + 16

                      return (
                        <g
                          key={seat.id}
                          className="seat"
                          onClick={() => handleSeatClick(seat)}
                          onMouseEnter={() => setHoveredSeat(seat)}
                          onMouseLeave={() => setHoveredSeat(null)}
                          style={{
                            cursor:
                              seat.status === 'booked' || seat.status === 'reserved'
                                ? 'not-allowed'
                                : 'pointer',
                          }}
                        >
                          {/* Seat back */}
                          <rect
                            x={cx - 14}
                            y={cy - 16}
                            width={28}
                            height={4}
                            rx={2}
                            fill={colors.fill}
                            stroke={colors.stroke}
                            strokeWidth="1.5"
                          />
                          {/* Seat cushion */}
                          <rect
                            x={cx - 14}
                            y={cy - 10}
                            width={28}
                            height={20}
                            rx={5}
                            fill={colors.fill}
                            stroke={colors.stroke}
                            strokeWidth="1.5"
                          />
                          {/* Seat number */}
                          {seatStatus === 'selected' && (
                            <text
                              x={cx}
                              y={cy + 4}
                              fontSize="8"
                              fill={colors.text}
                              textAnchor="middle"
                              fontWeight="700"
                              fontFamily="var(--font-body)"
                            >
                              ✓
                            </text>
                          )}
                          {/* Hover tooltip anchor */}
                          <title>
                            {`Row ${seat.row} · Seat ${seat.number} · ${seat.tier} · ${
                              seat.status === 'booked'
                                ? 'Booked'
                                : seat.status === 'reserved'
                                ? 'Reserved'
                                : `€${activeShow
                                    ? seat.tier === 'premium'
                                      ? activeShow.premiumPrice
                                      : seat.tier === 'standard'
                                      ? activeShow.standardPrice
                                      : activeShow.galleryPrice
                                    : seat.price
                                  }`
                            }`}
                          </title>
                        </g>
                      )
                    })}
                  </g>
                )
              })}
            </svg>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
              {Object.entries(SEAT_COLORS).map(([status, colors]) => (
                <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div
                    style={{
                      width: 16,
                      height: 12,
                      borderRadius: 3,
                      background: colors.fill,
                      border: `1.5px solid ${colors.stroke}`,
                    }}
                  />
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                    {status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Sidebar — Selection & Booking */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Show info */}
            {activeShow && (
              <div
                style={{
                  background: 'var(--off-white)',
                  borderRadius: 'var(--radius-xl)',
                  border: '1.5px solid var(--warm-grey)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: 120,
                    position: 'relative',
                    background: 'var(--dark-surface)',
                  }}
                >
                  <img
                    src={activeShow.imageUrl}
                    alt={activeShow.title}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'linear-gradient(to top, rgba(26,16,8,0.8), transparent)',
                    }}
                  />
                  {activeShow.isLive && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 10,
                        right: 10,
                        background: '#ef4444',
                        color: '#fff',
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '3px 10px',
                        borderRadius: 'var(--radius-pill)',
                        letterSpacing: '0.08em',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: '#fff',
                          animation: 'pulse-glow 1s infinite',
                        }}
                      />
                      LIVE
                    </div>
                  )}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 10,
                      left: 12,
                      color: '#fff',
                      fontFamily: 'var(--font-display)',
                      fontSize: 15,
                    }}
                  >
                    {activeShow.title}
                  </div>
                </div>
                <div style={{ padding: '14px 16px' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
                    🎭 {activeShow.genre} · {activeShow.durationMins} mins
                  </div>
                  {/* Pricing tiers */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[
                      { tier: 'premium', label: '💎 Premium', price: activeShow.premiumPrice },
                      { tier: 'standard', label: '⭐ Standard', price: activeShow.standardPrice },
                      { tier: 'gallery', label: '🎭 Gallery', price: activeShow.galleryPrice },
                    ].map((t) => (
                      <div
                        key={t.tier}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: 13,
                          padding: '6px 0',
                          borderBottom: '1px solid var(--warm-grey)',
                        }}
                      >
                        <span style={{ color: 'var(--text-secondary)' }}>{t.label}</span>
                        <span style={{ fontWeight: 700, color: 'var(--taupe)' }}>€{t.price}</span>
                      </div>
                    ))}
                  </div>
                  {/* Capacity bar */}
                  <div style={{ marginTop: 12 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        marginBottom: 6,
                      }}
                    >
                      <span>Availability</span>
                      <span>
                        {activeShow.totalSeats - activeShow.soldSeats} of {activeShow.totalSeats} left
                      </span>
                    </div>
                    <div className="progress">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${(activeShow.soldSeats / activeShow.totalSeats) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Selected seats */}
            <div
              style={{
                background: 'var(--off-white)',
                borderRadius: 'var(--radius-xl)',
                border: '1.5px solid var(--warm-grey)',
                padding: '18px',
              }}
            >
              <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--taupe)', marginBottom: 12 }}>
                <Ticket size={14} style={{ display: 'inline', marginRight: 6 }} />
                Your Selection ({selectedSeats.length})
              </h4>

              {selectedSeats.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  Click seats on the map to select them
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selectedSeats.map((seat) => (
                    <div
                      key={seat.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: 13,
                      }}
                    >
                      <span style={{ color: 'var(--text-secondary)' }}>
                        Row {seat.row} · Seat {seat.number}{' '}
                        <span
                          style={{
                            fontSize: 10,
                            background: 'var(--cream-dark)',
                            padding: '2px 6px',
                            borderRadius: 4,
                            marginLeft: 4,
                          }}
                        >
                          {seat.tier}
                        </span>
                      </span>
                      <span style={{ fontWeight: 600, color: 'var(--burgundy)' }}>
                        €
                        {activeShow
                          ? seat.tier === 'premium'
                            ? activeShow.premiumPrice
                            : seat.tier === 'standard'
                            ? activeShow.standardPrice
                            : activeShow.galleryPrice
                          : seat.price}
                      </span>
                    </div>
                  ))}
                  <div className="divider" style={{ marginTop: 4 }} />
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontWeight: 700,
                      fontSize: 15,
                      color: 'var(--taupe)',
                    }}
                  >
                    <span>Total</span>
                    <span>€{totalPrice.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Booking form */}
            {selectedSeats.length > 0 && (
              <div
                style={{
                  background: 'var(--off-white)',
                  borderRadius: 'var(--radius-xl)',
                  border: '1.5px solid var(--warm-grey)',
                  padding: '18px',
                }}
              >
                {bookingDone ? (
                  <div style={{ textAlign: 'center', padding: '12px 0' }}>
                    <div style={{ fontSize: 36, marginBottom: 12 }}>🎉</div>
                    <div style={{ fontWeight: 700, color: 'var(--taupe)', marginBottom: 6 }}>
                      Tickets Booked!
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      Your tickets have been sent to {bookingEmail}
                    </div>
                  </div>
                ) : (
                  <>
                    <label className="label">Confirmation Email</label>
                    <input
                      className="input"
                      type="email"
                      placeholder="your@email.com"
                      value={bookingEmail}
                      onChange={(e) => setBookingEmail(e.target.value)}
                      style={{ marginBottom: 12 }}
                    />
                    <button
                      className="btn btn-primary"
                      style={{ width: '100%' }}
                      onClick={handleBook}
                      disabled={!bookingEmail.trim()}
                    >
                      Book {selectedSeats.length} Seat{selectedSeats.length > 1 ? 's' : ''} · €{totalPrice.toFixed(2)}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
