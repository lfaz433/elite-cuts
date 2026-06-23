import React, { useState } from 'react'
import { Plus, TrendingUp, Users, DollarSign } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { useVenue } from '../context/VenueContext'
import type { Show } from '../types'

export default function EventSuite() {
  const { state, dispatch } = useVenue()
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [form, setForm] = useState({
    title: '',
    genre: 'Stand-Up Comedy',
    description: '',
    cast: '',
    startDate: '',
    startTime: '20:00',
    durationMins: '90',
    premiumPrice: '52',
    standardPrice: '38',
    galleryPrice: '28',
    imageUrl: 'https://images.unsplash.com/photo-1603190287605-e6ade32fa852?w=600&q=80',
  })

  const totalRevenue = state.ticketSales.reduce((s, sale) => s + sale.amount, 0)
  const totalTickets = state.ticketSales.reduce((s, sale) => s + sale.seatIds.length, 0)

  const chartData = state.shows.map((show) => ({
    name: show.title.split(' ').slice(0, 2).join(' '),
    sold: show.soldSeats,
    remaining: show.totalSeats - show.soldSeats,
    revenue: state.ticketSales
      .filter((s) => s.showId === show.id)
      .reduce((sum, s) => sum + s.amount, 0),
  }))

  const handleCreateShow = () => {
    if (!form.title.trim() || !form.startDate) return
    const startTime = new Date(`${form.startDate}T${form.startTime}:00`).toISOString()
    const newShow: Show = {
      id: `show-${Date.now()}`,
      title: form.title,
      genre: form.genre,
      description: form.description || `A spectacular ${form.genre} experience at Spotlight Theater.`,
      startTime,
      durationMins: parseInt(form.durationMins, 10),
      cast: form.cast.split(',').map((c) => c.trim()).filter(Boolean),
      imageUrl: form.imageUrl,
      premiumPrice: parseFloat(form.premiumPrice),
      standardPrice: parseFloat(form.standardPrice),
      galleryPrice: parseFloat(form.galleryPrice),
      totalSeats: 80,
      soldSeats: 0,
      isLive: false,
    }
    dispatch({ type: 'CREATE_SHOW', show: newShow })
    setShowCreateForm(false)
    setForm({
      title: '',
      genre: 'Stand-Up Comedy',
      description: '',
      cast: '',
      startDate: '',
      startTime: '20:00',
      durationMins: '90',
      premiumPrice: '52',
      standardPrice: '38',
      galleryPrice: '28',
      imageUrl: 'https://images.unsplash.com/photo-1603190287605-e6ade32fa852?w=600&q=80',
    })
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div
        style={{
          padding: '20px 28px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}
      >
        <div>
          <h1 style={{ color: '#fff', fontFamily: 'var(--font-display)', fontSize: 26, marginBottom: 4 }}>
            Event Suite
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>
            {state.shows.length} shows scheduled · {totalTickets} tickets sold
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreateForm(!showCreateForm)}>
          <Plus size={14} /> Create Show
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--cream)', padding: '24px 28px' }}>
        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
          <KPICard
            icon={<TrendingUp size={18} color="var(--gold)" />}
            label="Total Revenue"
            value={`€${totalRevenue.toFixed(2)}`}
            sub="from ticket sales"
          />
          <KPICard
            icon={<Users size={18} color="#60a5fa" />}
            label="Tickets Sold"
            value={String(totalTickets)}
            sub="across all shows"
          />
          <KPICard
            icon={<DollarSign size={18} color="#34d399" />}
            label="Avg Ticket"
            value={totalTickets > 0 ? `€${(totalRevenue / totalTickets).toFixed(2)}` : '—'}
            sub="per seat"
          />
        </div>

        {/* Create Show Form */}
        {showCreateForm && (
          <div
            style={{
              background: 'var(--off-white)',
              borderRadius: 'var(--radius-xl)',
              border: '1.5px solid var(--burgundy)',
              padding: '24px',
              marginBottom: 28,
              boxShadow: '0 4px 20px var(--shadow-burgundy)',
            }}
          >
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--taupe)', marginBottom: 20 }}>
              Create New Show
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 14 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="label">Show Title *</label>
                <input
                  className="input"
                  placeholder="e.g. Jazz & Cocktails Evening"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Genre</label>
                <select
                  className="input"
                  value={form.genre}
                  onChange={(e) => setForm((f) => ({ ...f, genre: e.target.value }))}
                >
                  {['Stand-Up Comedy', 'Improvisation', 'Karaoke', 'Jazz', 'Theatre', 'Interactive', 'Other'].map(
                    (g) => (
                      <option key={g}>{g}</option>
                    )
                  )}
                </select>
              </div>
              <div>
                <label className="label">Date *</label>
                <input
                  className="input"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Time</label>
                <input
                  className="input"
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Duration (mins)</label>
                <input
                  className="input"
                  type="number"
                  value={form.durationMins}
                  onChange={(e) => setForm((f) => ({ ...f, durationMins: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Cast (comma-separated)</label>
                <input
                  className="input"
                  placeholder="Alex T., Priya N."
                  value={form.cast}
                  onChange={(e) => setForm((f) => ({ ...f, cast: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Image URL</label>
                <input
                  className="input"
                  placeholder="https://..."
                  value={form.imageUrl}
                  onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                />
              </div>
              {/* Pricing */}
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 10 }}>
                  Ticket Pricing
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  {[
                    { label: '💎 Premium (€)', key: 'premiumPrice' },
                    { label: '⭐ Standard (€)', key: 'standardPrice' },
                    { label: '🎭 Gallery (€)', key: 'galleryPrice' },
                  ].map(({ label, key }) => (
                    <div key={key}>
                      <label className="label">{label}</label>
                      <input
                        className="input"
                        type="number"
                        step="0.5"
                        value={form[key as keyof typeof form]}
                        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button className="btn btn-primary" onClick={handleCreateShow}>
                Create Show
              </button>
              <button className="btn btn-secondary" onClick={() => setShowCreateForm(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Capacity Chart */}
        {chartData.length > 0 && (
          <div
            style={{
              background: 'var(--off-white)',
              borderRadius: 'var(--radius-xl)',
              border: '1.5px solid var(--warm-grey)',
              padding: '20px',
              marginBottom: 24,
            }}
          >
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--taupe)', marginBottom: 16 }}>
              Ticket Sales vs. Capacity
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ left: -10 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--off-white)',
                    border: '1px solid var(--warm-grey)',
                    borderRadius: 12,
                    fontSize: 13,
                  }}
                />
                <Bar dataKey="sold" name="Tickets Sold" radius={[6, 6, 0, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill="var(--burgundy)" />
                  ))}
                </Bar>
                <Bar dataKey="remaining" name="Remaining" radius={[6, 6, 0, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill="var(--warm-grey-dark)" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Shows list */}
        <div
          style={{
            background: 'var(--off-white)',
            borderRadius: 'var(--radius-xl)',
            border: '1.5px solid var(--warm-grey)',
            overflow: 'hidden',
          }}
        >
          <table className="data-table">
            <thead>
              <tr>
                <th>Show</th>
                <th>Genre</th>
                <th>Date & Time</th>
                <th>Capacity</th>
                <th>Revenue</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {state.shows.map((show) => {
                const showRevenue = state.ticketSales
                  .filter((s) => s.showId === show.id)
                  .reduce((sum, s) => sum + s.amount, 0)
                const pct = Math.round((show.soldSeats / show.totalSeats) * 100)
                const startDate = new Date(show.startTime)
                return (
                  <tr key={show.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <img
                          src={show.imageUrl}
                          alt={show.title}
                          style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover' }}
                        />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{show.title}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {show.cast.slice(0, 2).join(', ')}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-cream">{show.genre}</span>
                    </td>
                    <td style={{ fontSize: 13 }}>
                      <div>{startDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                      <div style={{ color: 'var(--text-muted)' }}>
                        {startDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td style={{ minWidth: 140 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                        {show.soldSeats} / {show.totalSeats} ({pct}%)
                      </div>
                      <div className="progress">
                        <div
                          className="progress-fill"
                          style={{
                            width: `${pct}%`,
                            background:
                              pct > 80 ? '#dc2626' : pct > 50 ? '#d97706' : 'var(--burgundy)',
                          }}
                        />
                      </div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 700, color: 'var(--burgundy)' }}>
                        €{showRevenue.toFixed(2)}
                      </span>
                    </td>
                    <td>
                      {show.isLive ? (
                        <span className="badge badge-red" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
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
                        </span>
                      ) : (
                        <span className="badge badge-cream">Upcoming</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Ticket Sales Invoice Table */}
        {state.ticketSales.length > 0 && (
          <div
            style={{
              background: 'var(--off-white)',
              borderRadius: 'var(--radius-xl)',
              border: '1.5px solid var(--warm-grey)',
              overflow: 'hidden',
              marginTop: 20,
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--warm-grey)' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--taupe)' }}>
                Revenue Invoices
              </h3>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Sale ID</th>
                  <th>Show</th>
                  <th>Guest</th>
                  <th>Seats</th>
                  <th>Amount</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {state.ticketSales.map((sale) => {
                  const show = state.shows.find((s) => s.id === sale.showId)
                  return (
                    <tr key={sale.id}>
                      <td>
                        <code style={{ fontFamily: 'monospace', fontSize: 12, background: 'var(--cream-dark)', padding: '2px 6px', borderRadius: 4 }}>
                          {sale.id.slice(-8)}
                        </code>
                      </td>
                      <td style={{ fontSize: 13 }}>{show?.title ?? 'Unknown'}</td>
                      <td style={{ fontSize: 13 }}>{sale.guestEmail}</td>
                      <td>
                        <span className="badge badge-cream">{sale.seatIds.length} seats</span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 700, color: '#16a34a' }}>€{sale.amount.toFixed(2)}</span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {new Date(sale.purchasedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function KPICard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div
      style={{
        background: 'var(--off-white)',
        borderRadius: 'var(--radius-xl)',
        border: '1.5px solid var(--warm-grey)',
        padding: '20px 22px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          background: 'var(--cream-dark)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
          {label}
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: 'var(--taupe)', lineHeight: 1 }}>
          {value}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>
      </div>
    </div>
  )
}
