import React, { useState, useCallback } from 'react'
import { X, Plus, Minus } from 'lucide-react'
import { useVenue } from '../context/VenueContext'
import type { CartModifier, ModifierGroup } from '../types'

export default function MenuSheet() {
  const { state, dispatch, getModifierGroup } = useVenue()
  const product = state.activeMenuSheet
  const [quantity, setQuantity] = useState(1)
  const [modifiers, setModifiers] = useState<Record<string, CartModifier>>({})

  // Initialise modifiers from product on open
  React.useEffect(() => {
    if (!product) {
      setQuantity(1)
      setModifiers({})
      return
    }
    const init: Record<string, CartModifier> = {}
    product.modifierGroupIds.forEach((mgId) => {
      const mg = getModifierGroup(mgId)
      if (!mg) return
      if (mg.type === 'toggle') {
        init[mgId] = { groupId: mgId, groupName: mg.name, toggled: false, supplement: 0 }
      } else if (mg.type === 'counter') {
        init[mgId] = {
          groupId: mgId,
          groupName: mg.name,
          count: typeof mg.defaultValue === 'number' ? mg.defaultValue : 0,
          supplement: 0,
        }
      } else {
        const defaultOpt = mg.options.find((o) => o.id === mg.defaultValue) ?? mg.options[0]
        init[mgId] = {
          groupId: mgId,
          groupName: mg.name,
          selectedOption: defaultOpt,
          supplement: defaultOpt.supplement,
        }
      }
    })
    setModifiers(init)
  }, [product])

  const modifierSupplement = Object.values(modifiers).reduce((s, m) => {
    if (m.toggled) return s + m.supplement
    if (m.count != null && m.count > 0) {
      const mg = getModifierGroup(m.groupId)
      const pricePerUnit = mg?.options[0]?.supplement ?? 0
      return s + m.count * pricePerUnit
    }
    return s + (m.selectedOption?.supplement ?? 0)
  }, 0)

  const lineTotal = product ? (product.price + modifierSupplement) * quantity : 0

  const handleAddToCart = () => {
    if (!product) return
    dispatch({
      type: 'ADD_TO_CART',
      item: {
        id: `ci-${Date.now()}`,
        product,
        quantity,
        modifiers: Object.values(modifiers),
        lineTotal,
        addedAt: new Date().toISOString(),
      },
    })
    dispatch({ type: 'CLOSE_MENU_SHEET' })
  }

  if (!product) return null

  const modifierGroupList = product.modifierGroupIds
    .map((id) => getModifierGroup(id))
    .filter(Boolean) as ModifierGroup[]

  return (
    <>
      {/* Overlay */}
      <div
        className="overlay"
        style={{ zIndex: 48 }}
        onClick={() => dispatch({ type: 'CLOSE_MENU_SHEET' })}
      />

      {/* Bottom sheet */}
      <div className="bottom-sheet" style={{ zIndex: 49, paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
          <div
            style={{
              width: 40,
              height: 4,
              borderRadius: 99,
              background: 'var(--warm-grey-dark)',
            }}
          />
        </div>

        {/* Product image */}
        <div
          style={{
            height: 220,
            overflow: 'hidden',
            position: 'relative',
            margin: '16px 20px 0',
            borderRadius: 'var(--radius-xl)',
            background: 'var(--dark-surface)',
          }}
        >
          <img
            src={product.imageUrl}
            alt={product.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(to top, rgba(26,16,8,0.7), transparent 60%)',
            }}
          />
          {/* Close button */}
          <button
            onClick={() => dispatch({ type: 'CLOSE_MENU_SHEET' })}
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'rgba(26,16,8,0.7)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.15)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
            }}
          >
            <X size={16} />
          </button>
          {/* Tags */}
          <div
            style={{
              position: 'absolute',
              bottom: 14,
              left: 16,
              display: 'flex',
              gap: 6,
            }}
          >
            {product.tags.map((t) => (
              <span
                key={t}
                style={{
                  background: 'rgba(255,255,255,0.15)',
                  backdropFilter: 'blur(8px)',
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '3px 10px',
                  borderRadius: 'var(--radius-pill)',
                  border: '1px solid rgba(255,255,255,0.2)',
                }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: '20px 24px' }}>
          {/* Name + price */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 16,
              marginBottom: 8,
            }}
          >
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 24,
                color: 'var(--taupe)',
                lineHeight: 1.2,
              }}
            >
              {product.name}
            </h2>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 22,
                color: 'var(--burgundy)',
                flexShrink: 0,
              }}
            >
              €{product.price.toFixed(2)}
            </div>
          </div>

          {/* Rating */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <span className="stars">{'★'.repeat(Math.round(product.rating))}</span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {product.rating} · {product.reviewCount} reviews
            </span>
          </div>

          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.65, marginBottom: 24 }}>
            {product.description}
          </p>

          {/* Divider */}
          <div className="divider" style={{ marginBottom: 20 }} />

          {/* Modifier Groups */}
          {modifierGroupList.map((mg) => {
            const mod = modifiers[mg.id]
            return (
              <div key={mg.id} style={{ marginBottom: 24 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 12,
                  }}
                >
                  <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--taupe)' }}>
                    {mg.name}
                  </h4>
                  {mg.required && (
                    <span className="badge badge-burgundy" style={{ fontSize: 9 }}>
                      Required
                    </span>
                  )}
                </div>

                {mg.type === 'toggle' && (
                  <div className="toggle-wrap" style={{ borderBottom: 'none' }}>
                    <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                      {mg.options[0].label}
                      {mg.options[0].supplement > 0 && (
                        <span style={{ color: 'var(--burgundy)', marginLeft: 6 }}>
                          +€{mg.options[0].supplement.toFixed(2)}
                        </span>
                      )}
                    </span>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={mod?.toggled ?? false}
                        onChange={(e) =>
                          setModifiers((prev) => ({
                            ...prev,
                            [mg.id]: {
                              ...prev[mg.id],
                              toggled: e.target.checked,
                              supplement: e.target.checked ? mg.options[0].supplement : 0,
                            },
                          }))
                        }
                      />
                      <span className="toggle-slider" />
                    </label>
                  </div>
                )}

                {mg.type === 'counter' && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                      {mg.options[0].label}
                      {mg.options[0].supplement > 0 && (
                        <span style={{ color: 'var(--burgundy)', marginLeft: 6 }}>
                          +€{mg.options[0].supplement.toFixed(2)} each
                        </span>
                      )}
                    </span>
                    <div className="stepper">
                      <button
                        className="stepper-btn"
                        onClick={() =>
                          setModifiers((prev) => ({
                            ...prev,
                            [mg.id]: {
                              ...prev[mg.id],
                              count: Math.max(mg.min ?? 0, (prev[mg.id]?.count ?? 0) - 1),
                            },
                          }))
                        }
                      >
                        <Minus size={12} />
                      </button>
                      <span className="stepper-val">{mod?.count ?? 0}</span>
                      <button
                        className="stepper-btn"
                        onClick={() =>
                          setModifiers((prev) => ({
                            ...prev,
                            [mg.id]: {
                              ...prev[mg.id],
                              count: Math.min(mg.max ?? 99, (prev[mg.id]?.count ?? 0) + 1),
                            },
                          }))
                        }
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                )}

                {mg.type === 'select' && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {mg.options.map((opt) => {
                      const isSelected = mod?.selectedOption?.id === opt.id
                      return (
                        <button
                          key={opt.id}
                          onClick={() =>
                            setModifiers((prev) => ({
                              ...prev,
                              [mg.id]: {
                                ...prev[mg.id],
                                selectedOption: opt,
                                supplement: opt.supplement,
                              },
                            }))
                          }
                          style={{
                            padding: '8px 16px',
                            borderRadius: 'var(--radius-pill)',
                            border: isSelected
                              ? '2px solid var(--burgundy)'
                              : '1.5px solid var(--warm-grey-dark)',
                            background: isSelected ? 'rgba(162,26,43,0.08)' : 'var(--off-white)',
                            color: isSelected ? 'var(--burgundy)' : 'var(--taupe-light)',
                            fontSize: 13,
                            fontWeight: isSelected ? 700 : 500,
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                          }}
                        >
                          {opt.label}
                          {opt.supplement > 0 && ` +€${opt.supplement.toFixed(2)}`}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}

          {/* Divider */}
          <div className="divider" style={{ marginBottom: 20 }} />

          {/* Quantity + Add to Cart */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Quantity
              </span>
              <div className="stepper">
                <button
                  className="stepper-btn"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                >
                  <Minus size={14} />
                </button>
                <span className="stepper-val">{quantity}</span>
                <button className="stepper-btn" onClick={() => setQuantity((q) => q + 1)}>
                  <Plus size={14} />
                </button>
              </div>
            </div>

            <button
              className="btn btn-primary btn-lg"
              onClick={handleAddToCart}
              style={{ flex: 1 }}
            >
              Add to Order · €{lineTotal.toFixed(2)}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
