import React, { useState } from 'react'
import { Edit3, Plus, Save, X, Sliders, Trash } from 'lucide-react'
import { useVenue } from '../context/VenueContext'
import type { ModifierGroup, ModifierType, ProductCategory, Product } from '../types'

type CMSTab = 'hero' | 'products' | 'modifiers'

export default function ContentCMS() {
  const { state, dispatch } = useVenue()
  const [tab, setTab] = useState<CMSTab>('hero')
  const [saved, setSaved] = useState<string | null>(null)

  // Hero form state
  const [heroForm, setHeroForm] = useState({ ...state.heroContent })

  // Product editing
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [showNewProduct, setShowNewProduct] = useState(false)
  const [productForm, setProductForm] = useState<Partial<Product>>({})
  
  // Inline modifiers for new product
  const [inlineModifiers, setInlineModifiers] = useState<Array<{ name: string; type: ModifierType; supplement: number; optionsText?: string; min?: number; max?: number }>>([])
  const [activateCustomization, setActivateCustomization] = useState(false)

  // Modifier editing
  const [showNewMG, setShowNewMG] = useState(false)
  const [newMGForm, setNewMGForm] = useState<{
    name: string
    type: ModifierType
    optionLabel: string
    optionSupplement: number
  }>({ name: '', type: 'toggle', optionLabel: '', optionSupplement: 0 })

  const showSaved = (label: string) => {
    setSaved(label)
    setTimeout(() => setSaved(null), 2000)
  }

  const handleHeroSave = () => {
    dispatch({ type: 'UPDATE_HERO', content: heroForm })
    showSaved('Hero content')
  }

  const handleProductSave = (id: string) => {
    dispatch({ type: 'UPDATE_PRODUCT', id, updates: productForm })
    setEditingProductId(null)
    showSaved('Product')
  }

  const handleCreateProduct = () => {
    if (!productForm.name || !productForm.price) return

    // 1. Create modifier groups from inline definitions if checked
    const newModifierGroupIds: string[] = []
    if (activateCustomization) {
      inlineModifiers.forEach(mod => {
        const groupId = `mg-${Date.now()}-${Math.floor(Math.random() * 1000)}`
        newModifierGroupIds.push(groupId)

        let optionsList = []
        if (mod.type === 'select') {
          // Parse optionsText e.g. "Full Ice:0, No Ice:0.5"
          const text = mod.optionsText || 'Standard:0'
          optionsList = text.split(',').map((part: string) => {
            const [lbl, supp] = part.split(':')
            return {
              id: `opt-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
              label: (lbl || 'Option').trim(),
              supplement: parseFloat(supp) || 0
            }
          })
        } else {
          // Counter has single option with count limit
          optionsList = [{
            id: `opt-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
            label: mod.name || 'Extra',
            supplement: mod.supplement || 0
          }]
        }

        const group: ModifierGroup = {
          id: groupId,
          name: mod.name || 'Option',
          type: mod.type,
          required: false,
          options: optionsList,
          min: mod.type === 'counter' ? (mod.min ?? 0) : undefined,
          max: mod.type === 'counter' ? (mod.max ?? 10) : undefined,
          defaultValue: mod.type === 'counter' ? 0 : (mod.type === 'select' ? optionsList[0]?.id : false)
        }
        dispatch({ type: 'ADD_MODIFIER_GROUP', group })
      })
    }

    // 2. Create the product
    const newProduct: Product = {
      id: `p-${Date.now()}`,
      name: productForm.name,
      description: productForm.description || '',
      price: productForm.price,
      category: productForm.category || 'plats',
      imageUrl: productForm.imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=80',
      rating: 5.0,
      reviewCount: 0,
      modifierGroupIds: newModifierGroupIds,
      tags: [],
    }

    dispatch({ type: 'ADD_PRODUCT', product: newProduct })
    setShowNewProduct(false)
    setProductForm({})
    setInlineModifiers([])
    setActivateCustomization(false)
    showSaved('Product')
  }

  const handleAddModifierGroup = () => {
    if (!newMGForm.name.trim()) return
    const group: ModifierGroup = {
      id: `mg-${Date.now()}`,
      name: newMGForm.name,
      type: newMGForm.type,
      required: false,
      options: [
        {
          id: `opt-${Date.now()}`,
          label: newMGForm.optionLabel || newMGForm.name,
          supplement: newMGForm.optionSupplement,
        },
      ],
    }
    dispatch({ type: 'ADD_MODIFIER_GROUP', group })
    setShowNewMG(false)
    setNewMGForm({ name: '', type: 'toggle', optionLabel: '', optionSupplement: 0 })
    showSaved('Modifier group')
  }

  const TABS: { id: CMSTab; label: string; icon: React.ReactNode }[] = [
    { id: 'hero', label: 'Hero & Branding', icon: <Edit3 size={14} /> },
    { id: 'products', label: 'Products & Pricing', icon: <Sliders size={14} /> },
    { id: 'modifiers', label: 'Modifier Schemas', icon: <Plus size={14} /> },
  ]

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '20px 28px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <h1 style={{ color: '#fff', fontFamily: 'var(--font-display)', fontSize: 26, marginBottom: 4 }}>
          Content CMS
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, marginBottom: 16 }}>
          Manage what customers see — live edits sync instantly
        </p>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4 }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-body)',
                borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
                background: tab === t.id ? 'var(--cream)' : 'transparent',
                color: tab === t.id ? 'var(--taupe)' : 'rgba(255,255,255,0.4)',
                transition: 'all 0.15s',
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Saved toast */}
      {saved && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#16a34a', color: '#fff', padding: '10px 20px', borderRadius: 'var(--radius-pill)', fontSize: 14, fontWeight: 600, zIndex: 200, boxShadow: '0 4px 20px rgba(22,163,74,0.4)', animation: 'fade-up 0.3s var(--ease-smooth)' }}>
          ✓ {saved} saved
        </div>
      )}

      {/* Tab Content */}
      <div style={{ flex: 1, background: 'var(--cream)', overflowY: 'auto', padding: '28px' }}>
        
        {/* ── HERO TAB ── */}
        {tab === 'hero' && (
          <div style={{ maxWidth: 680 }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--taupe)', marginBottom: 24 }}>Hero Section</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label className="label">Main Headline</label>
                <textarea className="input" rows={3} value={heroForm.headline} onChange={(e) => setHeroForm((f) => ({ ...f, headline: e.target.value }))} style={{ fontFamily: 'var(--font-display)', fontSize: 18, resize: 'vertical' }} />
              </div>
              <div>
                <label className="label">Sub-headline</label>
                <input className="input" value={heroForm.subheadline} onChange={(e) => setHeroForm((f) => ({ ...f, subheadline: e.target.value }))} />
              </div>
              <button className="btn btn-primary" onClick={handleHeroSave} style={{ alignSelf: 'flex-start' }}>
                <Save size={14} /> Save Hero Content
              </button>
            </div>
          </div>
        )}

        {/* ── PRODUCTS TAB ── */}
        {tab === 'products' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--taupe)' }}>Products & Pricing</h3>
              <button className="btn btn-primary btn-sm" onClick={() => setShowNewProduct(true)}>
                <Plus size={14} /> Ajouter un Produit
              </button>
            </div>

            {/* New Product Form */}
            {showNewProduct && (
              <div style={{ background: 'var(--off-white)', borderRadius: 'var(--radius-xl)', padding: '24px', marginBottom: 24, border: '1px solid var(--burgundy)', boxShadow: '0 8px 30px rgba(0,0,0,0.05)' }}>
                <h4 style={{ fontSize: 18, fontWeight: 700, color: 'var(--taupe)', marginBottom: 20 }}>Nouveau Produit</h4>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                  <div>
                    <label className="label">Nom du produit</label>
                    <input className="input" placeholder="Ex: Salade César" value={productForm.name || ''} onChange={(e) => setProductForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Prix (€)</label>
                    <input className="input" type="number" placeholder="12.50" value={productForm.price || ''} onChange={(e) => setProductForm(f => ({ ...f, price: parseFloat(e.target.value) }))} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="label">Description</label>
                    <textarea className="input" rows={2} value={productForm.description || ''} onChange={(e) => setProductForm(f => ({ ...f, description: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Catégorie</label>
                    <select className="input" value={productForm.category || 'plats'} onChange={(e) => setProductForm(f => ({ ...f, category: e.target.value as ProductCategory }))}>
                      <option value="entrees">Entrées</option>
                      <option value="plats">Plats</option>
                      <option value="desserts">Desserts</option>
                      <option value="boissons">Boissons</option>
                      <option value="vins">Vins</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">URL de l'image (Optionnel)</label>
                    <input className="input" placeholder="https://..." value={productForm.imageUrl || ''} onChange={(e) => setProductForm(f => ({ ...f, imageUrl: e.target.value }))} />
                  </div>
                </div>

                {/* Checkbox to activate customization */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                  <input
                    type="checkbox"
                    id="activate-custom"
                    checked={activateCustomization}
                    onChange={(e) => {
                      setActivateCustomization(e.target.checked)
                      if (e.target.checked && inlineModifiers.length === 0) {
                        setInlineModifiers([{ name: 'Glace', type: 'select', supplement: 0, optionsText: 'Full Ice:0, Half Ice:0, No Ice:0', min: 0, max: 10 }])
                      }
                    }}
                    style={{ width: 18, height: 18, cursor: 'pointer' }}
                  />
                  <label htmlFor="activate-custom" style={{ fontSize: 14, fontWeight: 600, color: 'var(--taupe)', cursor: 'pointer' }}>
                    Activer les options de personnalisation (Custom Modifiers)
                  </label>
                </div>

                {/* Inline Custom Options */}
                {activateCustomization && (
                  <div style={{ background: 'var(--cream)', borderRadius: 'var(--radius-lg)', padding: '16px', border: '1px dashed var(--warm-grey-dark)', marginBottom: 20 }}>
                    <h5 style={{ fontSize: 14, fontWeight: 700, color: 'var(--taupe)', marginBottom: 12 }}>Configuration des Options</h5>
                    
                    {inlineModifiers.map((mod, idx) => (
                      <div key={idx} style={{ background: 'var(--off-white)', padding: 12, borderRadius: 'var(--radius-md)', border: '1px solid var(--warm-grey)', marginBottom: 12 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 10 }}>
                          <div>
                            <label className="label">Nom du champ (ex: Glace)</label>
                            <input className="input" value={mod.name} onChange={(e) => {
                              const newMods = [...inlineModifiers];
                              newMods[idx].name = e.target.value;
                              setInlineModifiers(newMods);
                            }} />
                          </div>
                          <div>
                            <label className="label">Type de modificateur</label>
                            <select className="input" value={mod.type} onChange={(e) => {
                              const newMods = [...inlineModifiers];
                              newMods[idx].type = e.target.value as ModifierType;
                              setInlineModifiers(newMods);
                            }}>
                              <option value="select">Sélection (Default Option)</option>
                              <option value="counter">Compteur (+ et -)</option>
                            </select>
                          </div>
                        </div>

                        {mod.type === 'select' ? (
                          <div>
                            <label className="label">Valeurs possibles (Format: Label:Prix, séparés par virgules)</label>
                            <input 
                              className="input" 
                              placeholder="Ex: Full Ice:0, Half Ice:0, No Ice:0" 
                              value={mod.optionsText || ''} 
                              onChange={(e) => {
                                const newMods = [...inlineModifiers];
                                newMods[idx].optionsText = e.target.value;
                                setInlineModifiers(newMods);
                              }} 
                            />
                          </div>
                        ) : (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                            <div>
                              <label className="label">Min</label>
                              <input className="input" type="number" value={mod.min ?? 0} onChange={(e) => {
                                const newMods = [...inlineModifiers];
                                newMods[idx].min = parseInt(e.target.value) || 0;
                                setInlineModifiers(newMods);
                              }} />
                            </div>
                            <div>
                              <label className="label">Max</label>
                              <input className="input" type="number" value={mod.max ?? 10} onChange={(e) => {
                                const newMods = [...inlineModifiers];
                                newMods[idx].max = parseInt(e.target.value) || 10;
                                setInlineModifiers(newMods);
                              }} />
                            </div>
                            <div>
                              <label className="label">Prix Supp. (€)</label>
                              <input className="input" type="number" step="0.5" value={mod.supplement} onChange={(e) => {
                                const newMods = [...inlineModifiers];
                                newMods[idx].supplement = parseFloat(e.target.value) || 0;
                                setInlineModifiers(newMods);
                              }} />
                            </div>
                          </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => setInlineModifiers(inlineModifiers.filter((_, i) => i !== idx))} style={{ color: '#dc2626', borderColor: '#dc2626' }}>
                            <Trash size={12} style={{ marginRight: 4 }} /> Supprimer l'option
                          </button>
                        </div>
                      </div>
                    ))}

                    <button className="btn btn-secondary btn-sm" onClick={() => setInlineModifiers([...inlineModifiers, { name: '', type: 'select', supplement: 0, optionsText: 'Option 1:0, Option 2:1.5', min: 0, max: 10 }])}>
                      <Plus size={12} /> + Ajouter un modificateur
                    </button>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 12 }}>
                  <button className="btn btn-primary" onClick={handleCreateProduct}>Créer le Produit</button>
                  <button className="btn btn-secondary" onClick={() => setShowNewProduct(false)}>Annuler</button>
                </div>
              </div>
            )}

            <table className="data-table" style={{ background: 'var(--off-white)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {state.products.map((product) =>
                  editingProductId === product.id ? (
                    <tr key={product.id}>
                      <td colSpan={4}>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr', gap: 12, padding: '8px 0' }}>
                          <div>
                            <label className="label">Name</label>
                            <input className="input" value={productForm.name ?? product.name} onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))} />
                          </div>
                          <div>
                            <label className="label">Price (€)</label>
                            <input className="input" type="number" step="0.5" value={productForm.price ?? product.price} onChange={(e) => setProductForm((f) => ({ ...f, price: parseFloat(e.target.value) }))} />
                          </div>
                          <div>
                            <label className="label">Image URL</label>
                            <input className="input" value={productForm.imageUrl ?? product.imageUrl} onChange={(e) => setProductForm((f) => ({ ...f, imageUrl: e.target.value }))} />
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <button className="btn btn-primary btn-sm" onClick={() => handleProductSave(product.id)}><Save size={12} /> Save</button>
                          <button className="btn btn-secondary btn-sm" onClick={() => setEditingProductId(null)}><X size={12} /> Cancel</button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={product.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <img src={product.imageUrl} alt={product.name} style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover' }} />
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{product.name}</div>
                        </div>
                      </td>
                      <td><span className="badge badge-cream" style={{ textTransform: 'capitalize' }}>{product.category}</span></td>
                      <td><span style={{ fontWeight: 700, color: 'var(--burgundy)' }}>€{product.price.toFixed(2)}</span></td>
                      <td>
                        <button className="btn btn-secondary btn-sm" onClick={() => { setEditingProductId(product.id); setProductForm({ name: product.name, price: product.price, imageUrl: product.imageUrl, description: product.description }); }}><Edit3 size={12} /> Edit</button>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── MODIFIERS TAB ── */}
        {tab === 'modifiers' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--taupe)' }}>Modifier Schemas</h3>
              <button className="btn btn-primary btn-sm" onClick={() => setShowNewMG(true)}><Plus size={14} /> New Modifier Group</button>
            </div>

            {showNewMG && (
              <div style={{ background: 'var(--off-white)', borderRadius: 'var(--radius-xl)', border: '1.5px solid var(--burgundy)', padding: '20px', marginBottom: 20 }}>
                <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--taupe)', marginBottom: 16 }}>New Modifier Group</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                  <div><label className="label">Group Name</label><input className="input" placeholder="e.g. Ice Preference" value={newMGForm.name} onChange={(e) => setNewMGForm((f) => ({ ...f, name: e.target.value }))} /></div>
                  <div>
                    <label className="label">Type</label>
                    <select className="input" value={newMGForm.type} onChange={(e) => setNewMGForm((f) => ({ ...f, type: e.target.value as ModifierType }))}>
                      <option value="toggle">Toggle (on/off)</option>
                      <option value="counter">Counter (0–10)</option>
                      <option value="select">Select (choose one)</option>
                    </select>
                  </div>
                  <div><label className="label">First Option Label</label><input className="input" placeholder="e.g. No Ice" value={newMGForm.optionLabel} onChange={(e) => setNewMGForm((f) => ({ ...f, optionLabel: e.target.value }))} /></div>
                  <div><label className="label">Supplement Price (€)</label><input className="input" type="number" step="0.5" value={newMGForm.optionSupplement} onChange={(e) => setNewMGForm((f) => ({ ...f, optionSupplement: parseFloat(e.target.value) || 0 }))} /></div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <button className="btn btn-primary btn-sm" onClick={handleAddModifierGroup}><Save size={12} /> Create Group</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setShowNewMG(false)}><X size={12} /> Cancel</button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {state.modifierGroups.map((mg) => (
                <div key={mg.id} style={{ background: 'var(--off-white)', borderRadius: 'var(--radius-xl)', border: '1.5px solid var(--warm-grey)', padding: '16px 20px', display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--taupe)' }}>{mg.name}</span>
                      <span className="badge badge-cream" style={{ textTransform: 'capitalize' }}>{mg.type}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {mg.options.map((opt) => (
                        <div key={opt.id} style={{ background: 'var(--cream-dark)', borderRadius: 'var(--radius-pill)', padding: '4px 12px', fontSize: 12, color: 'var(--text-secondary)' }}>
                          {opt.label} {opt.supplement > 0 && <span style={{ color: 'var(--burgundy)', marginLeft: 4 }}>+€{opt.supplement}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
