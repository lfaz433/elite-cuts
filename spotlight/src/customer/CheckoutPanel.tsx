import React, { useState, useEffect } from 'react'
import { X, Minus, Plus, ArrowRight, MapPin, Phone, User, Clock, CheckCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { QRCodeSVG } from 'qrcode.react'
import { useVenue } from '../context/VenueContext'

export default function CheckoutPanel() {
  const { state, dispatch, cartTotal } = useVenue()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [applyDiscount, setApplyDiscount] = useState(false)
  const [step, setStep] = useState<'cart' | 'details' | 'tracker'>('cart')
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null)

  const discount = applyDiscount ? 0.1 : 0
  const finalTotal = cartTotal * (1 - discount)
  const isDineIn = state.orderType === 'dine_in'
  const tableNumber = state.tables.find((t) => t.id === state.activeTableId)?.number ?? '07'

  const activeOrder = placedOrderId ? state.orders.find(o => o.id === placedOrderId) : null

  // Reset checkout state when opened
  useEffect(() => {
    if (state.isCheckoutOpen && !placedOrderId) {
      setStep('cart')
    }
  }, [state.isCheckoutOpen, placedOrderId])

  const handlePlaceOrder = () => {
    dispatch({
      type: 'PLACE_ORDER',
      guestEmail: email,
      customerName: name,
      customerPhone: phone,
      customerAddress: address,
      loyaltyDiscount: applyDiscount ? 0.1 : undefined,
    })
    // Simulate finding the order we just placed
    setTimeout(() => {
      // In a real app we'd get the ID back from the dispatch or backend
      const newestOrder = state.orders[0] // wait, state is from closure, might be old.
      // We can just rely on the tracker using the latest order, but for safety let's use a generated ID in context.
      // For this prototype, we'll just set step to tracker and use state.orders[0] in the render since it's unshifted.
    }, 50)
    setStep('tracker')
  }

  // Get the latest order for the tracker
  const latestOrder = state.orders[0]

  if (!state.isCheckoutOpen) return null

  return (
    <>
      <div
        className="overlay"
        style={{ zIndex: 58 }}
        onClick={() => dispatch({ type: 'SET_CHECKOUT_OPEN', open: false })}
      />

      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="bottom-sheet"
        style={{
          zIndex: 59,
          maxHeight: '92vh',
          background: 'var(--cream)',
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)',
          borderTopLeftRadius: '24px',
          borderTopRightRadius: '24px',
          boxShadow: '0 -10px 40px rgba(0,0,0,0.1)',
        }}
      >
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0 0' }}>
          <div style={{ width: 40, height: 4, borderRadius: 99, background: 'var(--warm-grey-dark)' }} />
        </div>

        {/* Header */}
        <div style={{ padding: '16px 24px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--burgundy)' }}>
              {step === 'cart' ? 'Votre Commande' : step === 'details' ? 'Détails' : 'Suivi de Commande'}
            </h2>
            {step !== 'tracker' && (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {isDineIn ? `Sur place (Table ${tableNumber})` : 'À emporter / Livraison'}
              </p>
            )}
          </div>
          <button
            onClick={() => dispatch({ type: 'SET_CHECKOUT_OPEN', open: false })}
            style={{
              width: 36, height: 36, borderRadius: '50%', background: 'var(--warm-grey)',
              border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
            }}
          >
            <X size={18} color="var(--taupe)" />
          </button>
        </div>

        <div style={{ padding: '0 24px 24px', overflowY: 'auto', maxHeight: 'calc(92vh - 100px)' }}>
          <AnimatePresence mode="wait">
            {step === 'cart' && (
              <motion.div key="cart" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                {state.cart.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
                    <p style={{ fontSize: 18 }}>Votre panier est vide.</p>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
                      {state.cart.map((item) => (
                        <div key={item.id} style={{ display: 'flex', gap: 16, padding: '16px', background: 'var(--off-white)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--warm-grey)' }}>
                          <img src={item.product.imageUrl} alt={item.product.name} style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'cover' }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--taupe)', marginBottom: 4 }}>{item.product.name}</div>
                            {item.modifiers.filter(m => m.toggled || (m.count && m.count > 0) || m.selectedOption).map(m => (
                              <div key={m.groupId} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                {m.groupName}: {m.toggled ? '✓' : m.count ? `×${m.count}` : m.selectedOption?.label}
                                {m.supplement > 0 && ` +€${m.supplement.toFixed(2)}`}
                              </div>
                            ))}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                            <div className="stepper" style={{ background: 'var(--cream)', border: '1px solid var(--warm-grey)' }}>
                              <button className="stepper-btn" onClick={() => dispatch({ type: 'UPDATE_CART_ITEM', id: item.id, quantity: item.quantity - 1 })}><Minus size={12} /></button>
                              <span className="stepper-val">{item.quantity}</span>
                              <button className="stepper-btn" onClick={() => dispatch({ type: 'UPDATE_CART_ITEM', id: item.id, quantity: item.quantity + 1 })}><Plus size={12} /></button>
                            </div>
                            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--taupe)' }}>€{item.lineTotal.toFixed(2)}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div style={{ background: 'var(--off-white)', padding: 20, borderRadius: 'var(--radius-lg)', border: '1px solid var(--warm-grey)', marginBottom: 24 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 600 }}>
                        <span>Total</span>
                        <span>€{cartTotal.toFixed(2)}</span>
                      </div>
                    </div>

                    <button className="btn btn-gold btn-lg" style={{ width: '100%', fontSize: 16 }} onClick={() => setStep('details')}>
                      Continuer <ArrowRight size={18} />
                    </button>
                  </>
                )}
              </motion.div>
            )}

            {step === 'details' && (
              <motion.div key="details" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                {!isDineIn && (
                  <div style={{ background: 'var(--off-white)', padding: 20, borderRadius: 'var(--radius-lg)', border: '1px solid var(--warm-grey)', marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                      <label className="label">Nom complet *</label>
                      <div style={{ position: 'relative' }}>
                        <User size={18} color="var(--text-muted)" style={{ position: 'absolute', left: 14, top: 14 }} />
                        <input className="input" style={{ paddingLeft: 42 }} placeholder="Jean Dupont" value={name} onChange={(e) => setName(e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label className="label">Téléphone *</label>
                      <div style={{ position: 'relative' }}>
                        <Phone size={18} color="var(--text-muted)" style={{ position: 'absolute', left: 14, top: 14 }} />
                        <input className="input" type="tel" style={{ paddingLeft: 42 }} placeholder="06 12 34 56 78" value={phone} onChange={(e) => setPhone(e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label className="label">Adresse Courriel (Requis) *</label>
                      <div style={{ position: 'relative' }}>
                        <User size={18} color="var(--text-muted)" style={{ position: 'absolute', left: 14, top: 14 }} />
                        <input className="input" type="email" style={{ paddingLeft: 42 }} placeholder="jean.dupont@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                      </div>
                    </div>

                    {/* Localisation Picker */}
                    <div>
                      <label className="label">Quartier de Grenoble *</label>
                      <select 
                        className="input" 
                        value={address.split(' - ')[0] || ''} 
                        onChange={(e) => {
                          const val = e.target.value;
                          const rest = address.includes(' - ') ? address.split(' - ')[1] : '';
                          setAddress(val + (rest ? ` - ${rest}` : ''));
                        }}
                        style={{ marginBottom: 12 }}
                      >
                        <option value="">Sélectionnez votre zone...</option>
                        <option value="Grenoble Centre">Grenoble Centre (Alsace-Lorraine / Chavant)</option>
                        <option value="Meylan">Meylan / La Tronche</option>
                        <option value="Saint-Martin-d'Hères">Saint-Martin-d'Hères / Universités</option>
                        <option value="Echirolles">Échirolles / Grand'Place</option>
                        <option value="Fontaine">Fontaine / Sassenage</option>
                      </select>

                      <label className="label">Adresse de livraison complète *</label>
                      <div style={{ position: 'relative' }}>
                        <MapPin size={18} color="var(--text-muted)" style={{ position: 'absolute', left: 14, top: 14 }} />
                        <input 
                          className="input" 
                          style={{ paddingLeft: 42 }} 
                          placeholder="12 Rue de la République, Code porte, Étage" 
                          value={address.includes(' - ') ? address.split(' - ')[1] : address} 
                          onChange={(e) => {
                            const prefix = address.includes(' - ') ? address.split(' - ')[0] : 'Grenoble Centre';
                            setAddress(`${prefix} - ${e.target.value}`);
                          }} 
                        />
                      </div>

                      {/* Mock Map Pin Picker */}
                      <div style={{
                        marginTop: 12,
                        height: 120,
                        borderRadius: 16,
                        overflow: 'hidden',
                        position: 'relative',
                        background: '#1c1c1e',
                        border: '1px solid rgba(255,255,255,0.08)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <div style={{
                          position: 'absolute',
                          inset: 0,
                          backgroundImage: 'radial-gradient(rgba(212,175,55,0.15) 1px, transparent 1px)',
                          backgroundSize: '16px 16px',
                          opacity: 0.4
                        }} />
                        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                          <path d="M 0,40 L 300,90 M 120,0 L 120,120 M 0,80 Q 80,40 160,120" stroke="rgba(255,255,255,0.1)" strokeWidth="3" fill="none" />
                        </svg>
                        <div style={{
                          position: 'relative',
                          zIndex: 2,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center'
                        }}>
                          <MapPin className="animate-bounce" size={24} color="var(--gold)" style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.5))' }} />
                          <div style={{
                            fontSize: 9,
                            fontWeight: 700,
                            color: '#fff',
                            background: '#121212',
                            padding: '3px 8px',
                            borderRadius: 4,
                            marginTop: 4,
                            boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
                            border: '1.5px solid var(--gold)'
                          }}>
                            {address || 'Grenoble'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ background: 'var(--off-white)', padding: 20, borderRadius: 'var(--radius-lg)', border: '1px solid var(--warm-grey)', marginBottom: 24 }}>
                  <label className="label" style={{ marginBottom: 16, display: 'block' }}>Méthode de Paiement</label>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ 
                      padding: 16, 
                      borderRadius: 'var(--radius-md)', 
                      border: '1px solid var(--warm-grey)', 
                      background: 'rgba(0,0,0,0.02)', 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      opacity: 0.6,
                      cursor: 'not-allowed'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid var(--warm-grey-dark)' }} />
                        <span style={{ fontSize: 15, color: 'var(--taupe)' }}>Paiement par carte</span>
                      </div>
                      <span className="badge" style={{ background: 'var(--warm-grey)', color: 'var(--taupe)' }}>Indisponible</span>
                    </div>

                    <div style={{ 
                      padding: 16, 
                      borderRadius: 'var(--radius-md)', 
                      border: '2px solid var(--burgundy)', 
                      background: 'var(--cream)', 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      cursor: 'pointer'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 18, height: 18, borderRadius: '50%', border: '5px solid var(--burgundy)' }} />
                        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--burgundy)' }}>Paiement au comptoir</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  <button className="btn btn-secondary" onClick={() => setStep('cart')} style={{ padding: '16px 24px' }}>Retour</button>
                  <button 
                    className="btn btn-gold" 
                    style={{ 
                      flex: 1, 
                      fontSize: 16, 
                      opacity: (isDineIn || (name.trim() && phone.trim() && email.trim() && address.trim())) ? 1 : 0.5,
                      cursor: (isDineIn || (name.trim() && phone.trim() && email.trim() && address.trim())) ? 'pointer' : 'not-allowed'
                    }} 
                    onClick={handlePlaceOrder}
                    disabled={!isDineIn && !(name.trim() && phone.trim() && email.trim() && address.trim())}
                  >
                    Confirmer · €{finalTotal.toFixed(2)}
                  </button>
                </div>
              </motion.div>
            )}

            {step === 'tracker' && latestOrder && (
              <motion.div key="tracker" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                <div style={{ textAlign: 'center', background: 'var(--off-white)', borderRadius: 'var(--radius-xl)', padding: '32px 24px', border: '1px solid var(--warm-grey)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 32, color: 'var(--burgundy)', marginBottom: 8 }}>
                    Commande #{latestOrder.id.slice(-4)}
                  </h3>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: 32 }}>
                    {latestOrder.orderType === 'dine_in' ? `Table ${latestOrder.tableNumber}` : 'À Emporter'}
                  </p>

                  {/* Uber Eats Style Tracker Bar */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', marginBottom: 40, padding: '0 20px' }}>
                    <div style={{ position: 'absolute', top: 12, left: 30, right: 30, height: 4, background: 'var(--warm-grey)', zIndex: 1 }} />
                    
                    <div style={{ position: 'absolute', top: 12, left: 30, width: latestOrder.status === 'pending' ? '0%' : latestOrder.status === 'preparing' ? '50%' : '100%', height: 4, background: 'var(--gold)', zIndex: 2, transition: 'width 0.8s ease' }} />

                    {['pending', 'preparing', 'served'].map((statusOption, idx) => {
                      const isActive = 
                        latestOrder.status === statusOption || 
                        (latestOrder.status === 'preparing' && idx === 0) ||
                        (latestOrder.status === 'served');
                      return (
                        <div key={statusOption} style={{ position: 'relative', zIndex: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: isActive ? 'var(--gold)' : 'var(--warm-grey)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.5s', border: '4px solid var(--off-white)' }}>
                            {isActive ? <CheckCircle size={14} /> : <Clock size={14} />}
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 600, color: isActive ? 'var(--taupe)' : 'var(--text-muted)', textTransform: 'uppercase' }}>
                            {statusOption === 'pending' ? 'Reçue' : statusOption === 'preparing' ? 'En Cuisine' : 'Prête'}
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  {/* QR Code */}
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
                    <div style={{ padding: 16, background: '#fff', borderRadius: 16, border: '1px solid var(--warm-grey)', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
                      <QRCodeSVG value={`https://ledoubleface.fr/order/${latestOrder.id}`} size={160} fgColor="var(--burgundy)" />
                    </div>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    Présentez ce code au serveur lors du retrait.
                  </p>

                  <button className="btn btn-secondary" style={{ width: '100%', marginTop: 32 }} onClick={() => dispatch({ type: 'SET_CHECKOUT_OPEN', open: false })}>
                    Fermer
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </>
  )
}
