import React from 'react'
import { Clock, ChefHat, Utensils, CreditCard, ArrowRight, AlertCircle } from 'lucide-react'
import { useVenue } from '../context/VenueContext'
import type { Order, OrderStatus } from '../types'

const COLUMNS: { id: OrderStatus; label: string; icon: React.ReactNode; color: string }[] = [
  {
    id: 'pending',
    label: 'Pending',
    icon: <Clock size={14} />,
    color: '#d97706',
  },
  {
    id: 'preparing',
    label: 'Preparing',
    icon: <ChefHat size={14} />,
    color: '#2563eb',
  },
  {
    id: 'served',
    label: 'Served',
    icon: <Utensils size={14} />,
    color: '#16a34a',
  },
  {
    id: 'paid',
    label: 'Paid',
    icon: <CreditCard size={14} />,
    color: '#7c3aed',
  },
]

const STATUS_NEXT: Record<OrderStatus, OrderStatus | null> = {
  pending: 'preparing',
  preparing: 'served',
  served: 'paid',
  paid: null,
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Start Preparing',
  preparing: 'Mark Served',
  served: 'Mark Paid',
  paid: 'Completed',
}

function formatTime(isoString: string) {
  const diff = Date.now() - new Date(isoString).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`
}

function OrderCard({ order }: { order: Order }) {
  const { dispatch } = useVenue()
  const nextStatus = STATUS_NEXT[order.status]
  const isPending = order.status === 'pending'

  return (
    <div
      className="kanban-card"
      style={{
        borderLeft: `3px solid ${COLUMNS.find((c) => c.id === order.status)?.color ?? '#ccc'}`,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <div
            style={{
              background: 'var(--burgundy)',
              color: '#fff',
              fontSize: 11,
              fontWeight: 700,
              padding: '3px 10px',
              borderRadius: 'var(--radius-pill)',
            }}
          >
            TABLE {order.tableNumber}
          </div>
          {isPending && (
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#ef4444',
                animation: 'pulse-glow 1s ease-in-out infinite',
              }}
            />
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {formatTime(order.placedAt)}
        </div>
      </div>

      {/* Items */}
      <div style={{ marginBottom: 12 }}>
        {order.items.map((item) => (
          <div
            key={item.id}
            style={{
              padding: '8px 0',
              borderBottom: '1px solid var(--warm-grey)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 4,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--taupe)' }}>
                {item.quantity}× {item.product.name}
              </span>
              <span style={{ fontSize: 13, color: 'var(--taupe)' }}>
                €{item.lineTotal.toFixed(2)}
              </span>
            </div>
            {/* Modifiers highlighted */}
            {item.modifiers
              .filter((m) => m.toggled || (m.count && m.count > 0) || m.selectedOption)
              .map((m) => (
                <div
                  key={m.groupId}
                  style={{
                    display: 'inline-block',
                    marginRight: 6,
                    marginTop: 2,
                    background: 'var(--cream-dark)',
                    color: 'var(--taupe-light)',
                    fontSize: 10,
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-pill)',
                  }}
                >
                  {m.groupName}:{' '}
                  {m.toggled
                    ? '✓'
                    : m.count != null
                    ? `×${m.count}`
                    : m.selectedOption?.label}
                </div>
              ))}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--taupe)' }}>
            €{order.totalAmount.toFixed(2)}
          </div>
          {order.loyaltyDiscount && (
            <div style={{ fontSize: 10, color: '#16a34a' }}>
              🎟 {(order.loyaltyDiscount * 100).toFixed(0)}% discount applied
            </div>
          )}
        </div>
        {nextStatus && (
          <button
            className="btn btn-sm"
            style={{
              background: COLUMNS.find((c) => c.id === nextStatus)?.color ?? 'var(--burgundy)',
              color: '#fff',
              borderRadius: 'var(--radius-pill)',
              border: 'none',
              padding: '7px 14px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
            onClick={() =>
              dispatch({ type: 'UPDATE_ORDER_STATUS', orderId: order.id, status: nextStatus })
            }
          >
            {STATUS_LABEL[order.status]} <ArrowRight size={12} />
          </button>
        )}
      </div>
    </div>
  )
}

export default function OrderDesk() {
  const { state } = useVenue()

  const pendingCount = state.orders.filter((o) => o.status === 'pending').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Sub header */}
      <div
        style={{
          padding: '20px 28px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <div>
          <h1
            style={{
              color: '#fff',
              fontFamily: 'var(--font-display)',
              fontSize: 26,
              marginBottom: 4,
            }}
          >
            Order Desk
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>
            Live kitchen & bar queue — {state.orders.length} total orders
          </p>
        </div>
        {pendingCount > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(239,68,68,0.15)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 'var(--radius-pill)',
              padding: '6px 14px',
              color: '#f87171',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <AlertCircle size={14} />
            {pendingCount} new order{pendingCount > 1 ? 's' : ''}
          </div>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
          {/* Revenue quick stat */}
          {['pending', 'preparing', 'served'].map((s) => {
            const revenue = state.orders
              .filter((o) => o.status === s)
              .reduce((sum, o) => sum + o.totalAmount, 0)
            return (
              <div
                key={s}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '8px 16px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>
                  €{revenue.toFixed(0)}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    color: 'rgba(255,255,255,0.3)',
                    marginTop: 2,
                  }}
                >
                  {s}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Kanban columns */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          gap: 16,
          padding: '20px 28px',
          overflowX: 'auto',
        }}
      >
        {COLUMNS.map((col) => {
          const orders = state.orders.filter((o) => o.status === col.id)
          return (
            <div key={col.id} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Column header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 14px',
                  background: `${col.color}18`,
                  border: `1.5px solid ${col.color}30`,
                  borderRadius: 'var(--radius-pill)',
                  marginBottom: 4,
                }}
              >
                <span style={{ color: col.color }}>{col.icon}</span>
                <span
                  style={{ color: col.color, fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}
                >
                  {col.label.toUpperCase()}
                </span>
                <span
                  style={{
                    marginLeft: 'auto',
                    background: col.color,
                    color: '#fff',
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    fontSize: 10,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {orders.length}
                </span>
              </div>

              {/* Cards */}
              <div className="kanban-col">
                {orders.length === 0 ? (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '32px 16px',
                      color: 'rgba(61,46,38,0.3)',
                      fontSize: 13,
                    }}
                  >
                    No orders here
                  </div>
                ) : (
                  orders.map((order) => <OrderCard key={order.id} order={order} />)
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
