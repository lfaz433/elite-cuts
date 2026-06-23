import React from 'react'
import { LayoutGrid, FileText, Table2, CalendarDays, Activity } from 'lucide-react'
import OrderDesk from './OrderDesk'
import ContentCMS from './ContentCMS'
import TableManager from './TableManager'
import EventSuite from './EventSuite'
import { useVenue } from '../context/VenueContext'

const NAV_ITEMS = [
  { id: 'orders' as const, label: 'Order Desk', icon: LayoutGrid, badge: true },
  { id: 'cms' as const, label: 'Content CMS', icon: FileText },
  { id: 'tables' as const, label: 'Tables & QR', icon: Table2 },
  { id: 'events' as const, label: 'Event Suite', icon: CalendarDays },
]

export default function AdminApp() {
  const { state, dispatch } = useVenue()
  const pendingOrders = state.orders.filter((o) => o.status === 'pending').length
  const totalRevenue = state.orders
    .filter((o) => o.status === 'paid')
    .reduce((s, o) => s + o.totalAmount, 0)

  const SECTION_COMPONENTS = {
    orders: <OrderDesk />,
    cms: <ContentCMS />,
    tables: <TableManager />,
    events: <EventSuite />,
  }

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        background: 'var(--dark-surface)',
        color: '#fff',
      }}
    >
      {/* Sidebar */}
      <div className="admin-sidebar">
        {/* Sidebar header */}
        <div
          style={{
            padding: '20px 20px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                background: 'var(--burgundy)',
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
                flexShrink: 0,
              }}
            >
              🎭
            </div>
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 14,
                  color: '#fff',
                  lineHeight: 1.1,
                }}
              >
                Spotlight
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: 'rgba(255,255,255,0.35)',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                }}
              >
                Admin Console
              </div>
            </div>
          </div>

          {/* Live indicator */}
          <div
            style={{
              marginTop: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(22,163,74,0.12)',
              border: '1px solid rgba(22,163,74,0.2)',
              borderRadius: 'var(--radius-pill)',
              padding: '5px 10px',
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#4ade80',
                animation: 'pulse-glow 1.5s ease-in-out infinite',
              }}
            />
            <span style={{ fontSize: 11, color: '#4ade80', fontWeight: 600 }}>
              Live — state synced
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '12px 0', overflowY: 'auto' }}>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = state.adminSection === item.id
            return (
              <button
                key={item.id}
                className={`admin-nav-item ${isActive ? 'active' : ''}`}
                onClick={() => dispatch({ type: 'SET_ADMIN_SECTION', section: item.id })}
                style={{ width: '100%', textAlign: 'left', border: 'none', fontFamily: 'var(--font-body)' }}
              >
                <Icon size={16} className="nav-icon" />
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.badge && pendingOrders > 0 && (
                  <span
                    style={{
                      background: '#ef4444',
                      color: '#fff',
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      fontSize: 10,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {pendingOrders}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Sidebar footer — quick stats */}
        <div
          style={{
            padding: '16px 20px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Tonight's Revenue
          </div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 28,
              color: 'var(--gold-light)',
              lineHeight: 1,
              marginBottom: 4,
            }}
          >
            €{(totalRevenue + state.ticketSales.reduce((s, t) => s + t.amount, 0)).toFixed(2)}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
            {state.orders.filter((o) => o.status === 'paid').length} orders paid ·{' '}
            {state.ticketSales.length} tickets
          </div>

          {/* Mini bar */}
          <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
            {(['pending', 'preparing', 'served', 'paid'] as const).map((s) => {
              const count = state.orders.filter((o) => o.status === s).length
              const colors = {
                pending: '#d97706',
                preparing: '#3b82f6',
                served: '#16a34a',
                paid: '#7c3aed',
              }
              return (
                <div
                  key={s}
                  title={`${count} ${s}`}
                  style={{
                    flex: 1,
                    height: 4,
                    borderRadius: 99,
                    background: count > 0 ? colors[s] : 'rgba(255,255,255,0.06)',
                    opacity: count > 0 ? 1 : 0.3,
                    cursor: 'help',
                  }}
                />
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            {(['pending', 'preparing', 'served', 'paid'] as const).map((s) => {
              const count = state.orders.filter((o) => o.status === s).length
              return (
                <div key={s} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>
                  {count}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {SECTION_COMPONENTS[state.adminSection]}
      </div>
    </div>
  )
}
