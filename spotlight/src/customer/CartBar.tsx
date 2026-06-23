import React from 'react'
import { ShoppingBag, ArrowRight, Trash2 } from 'lucide-react'
import { useVenue } from '../context/VenueContext'

interface CartBarProps {
  onCheckout: () => void
}

export default function CartBar({ onCheckout }: CartBarProps) {
  const { state, dispatch, cartTotal, cartCount } = useVenue()

  if (cartCount === 0) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 35,
        background: 'var(--taupe)',
        borderRadius: 'var(--radius-2xl)',
        padding: '14px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        boxShadow: '0 20px 60px rgba(26,16,8,0.4)',
        border: '1px solid rgba(255,255,255,0.1)',
        minWidth: 320,
        maxWidth: 600,
        animation: 'fade-up 0.3s var(--ease-spring)',
      }}
    >
      {/* Cart icon + count */}
      <div
        style={{
          position: 'relative',
          width: 42,
          height: 42,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <ShoppingBag size={18} color="#fff" />
        <span
          style={{
            position: 'absolute',
            top: -5,
            right: -5,
            background: 'var(--gold)',
            color: 'var(--taupe)',
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
          {cartCount}
        </span>
      </div>

      {/* Items summary */}
      <div style={{ flex: 1 }}>
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>
          {cartCount} item{cartCount > 1 ? 's' : ''} in your order
        </div>
        <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>
          {state.cart
            .slice(0, 2)
            .map((c) => c.product.name)
            .join(', ')}
          {state.cart.length > 2 ? `, +${state.cart.length - 2} more` : ''}
        </div>
      </div>

      {/* Total */}
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 20,
          color: 'var(--gold-light)',
          flexShrink: 0,
        }}
      >
        €{cartTotal.toFixed(2)}
      </div>

      {/* Clear */}
      <button
        onClick={() => dispatch({ type: 'CLEAR_CART' })}
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.08)',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(255,255,255,0.4)',
          flexShrink: 0,
          transition: 'all 0.15s',
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget
          el.style.background = 'rgba(220,38,38,0.3)'
          el.style.color = '#f87171'
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget
          el.style.background = 'rgba(255,255,255,0.08)'
          el.style.color = 'rgba(255,255,255,0.4)'
        }}
      >
        <Trash2 size={14} />
      </button>

      {/* Checkout CTA */}
      <button
        className="btn btn-gold btn-sm"
        onClick={onCheckout}
        style={{ flexShrink: 0 }}
      >
        Checkout <ArrowRight size={14} />
      </button>
    </div>
  )
}
