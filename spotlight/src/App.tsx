import React, { useState, useEffect } from 'react'
import { Eye, Settings, Activity } from 'lucide-react'
import { VenueProvider, useVenue } from './context/VenueContext'
import CustomerApp from './customer/CustomerApp'
import AdminApp from './admin/AdminApp'

type ViewMode = 'customer' | 'admin'

function MasterBar({ view, setView }: { view: ViewMode; setView: (v: ViewMode) => void }) {
  const { state, dispatch } = useVenue()
  const [urlTable, setUrlTable] = useState<string | null>(null)

  // Parse ?table= from URL and set active table
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tableParam = params.get('table')
    if (tableParam) {
      const found = state.tables.find((t) => t.number === tableParam)
      if (found) {
        dispatch({ type: 'SET_ACTIVE_TABLE', tableId: found.id })
        setUrlTable(tableParam)
      }
    }
  }, [])

  const pendingOrders = state.orders.filter((o) => o.status === 'pending').length

  return (
    <div className="master-bar">
      {/* Left — branding */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 16 }}>🎭</span>
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 13,
            color: 'rgba(255,255,255,0.8)',
            letterSpacing: '-0.01em',
          }}
        >
          Spotlight Venue OS
        </span>
        <span
          style={{
            fontSize: 10,
            background: 'rgba(22,163,74,0.2)',
            color: '#4ade80',
            padding: '2px 8px',
            borderRadius: 'var(--radius-pill)',
            fontWeight: 700,
            letterSpacing: '0.06em',
          }}
        >
          PROTOTYPE
        </span>
        {urlTable && (
          <span
            style={{
              fontSize: 10,
              background: 'rgba(201,168,76,0.2)',
              color: 'var(--gold-light)',
              padding: '2px 10px',
              borderRadius: 'var(--radius-pill)',
              fontWeight: 700,
              letterSpacing: '0.06em',
            }}
          >
            ?table={urlTable}
          </span>
        )}
      </div>

      {/* Center — view toggle */}
      <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
        <div className="master-toggle">
          <button
            className={`master-toggle-btn ${view === 'customer' ? 'active' : ''}`}
            onClick={() => setView('customer')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Eye size={12} />
            Customer View
          </button>
          <button
            className={`master-toggle-btn ${view === 'admin' ? 'active' : ''}`}
            onClick={() => setView('admin')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative' }}
          >
            <Settings size={12} />
            Admin Dashboard
            {pendingOrders > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  width: 14,
                  height: 14,
                  background: '#ef4444',
                  borderRadius: '50%',
                  fontSize: 8,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  border: '1.5px solid var(--dark-surface)',
                }}
              >
                {pendingOrders}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Right — state indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            color: 'rgba(255,255,255,0.4)',
          }}
        >
          <Activity size={12} color="#4ade80" />
          <span>State: {state.cart.length} cart · {state.orders.length} orders · {state.ticketSales.length} tickets</span>
        </div>

        {/* Demo table selector */}
        <select
          style={{
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.6)',
            borderRadius: 'var(--radius-pill)',
            padding: '4px 10px',
            fontSize: 11,
            fontFamily: 'var(--font-body)',
            cursor: 'pointer',
            outline: 'none',
          }}
          value={state.activeTableId ?? ''}
          onChange={(e) =>
            dispatch({ type: 'SET_ACTIVE_TABLE', tableId: e.target.value || null })
          }
        >
          <option value="">No Table</option>
          {state.tables.map((t) => (
            <option key={t.id} value={t.id}>
              Table {t.number} — {t.area}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

function AppContent() {
  const [view, setView] = useState<ViewMode>('customer')

  return (
    <>
      <MasterBar view={view} setView={setView} />
      <div className="with-master-bar">
        {view === 'customer' ? <CustomerApp /> : <AdminApp />}
      </div>
    </>
  )
}

export default function App() {
  return (
    <VenueProvider>
      <AppContent />
    </VenueProvider>
  )
}
