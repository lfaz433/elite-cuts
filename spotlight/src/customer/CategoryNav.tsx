import React, { useState } from 'react'
import { Search, Heart } from 'lucide-react'
import { motion } from 'motion/react'
import { useVenue } from '../context/VenueContext'
import type { ProductCategory } from '../types'

const CATEGORIES: { id: ProductCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'Tout' },
  { id: 'entrees', label: 'Entrées' },
  { id: 'plats', label: 'Plats' },
  { id: 'desserts', label: 'Desserts' },
  { id: 'vins', label: 'Vins' },
  { id: 'boissons', label: 'Boissons' },
]

export default function CategoryNav() {
  const { state, dispatch } = useVenue()
  const [query, setQuery] = useState('') as any
  const [favsOnly, setFavsOnly] = useState(false) as any

  // Handle local typing search filter
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setQuery(value)
    // We can dispatch or let BestsellersSection read from context. 
    // To make it easy and seamless, we can filter using context if we want, or we can register a custom search event.
    // For this prototype, we'll expose the value to a global search context or window for BestsellersSection to read,
    // or let it filter products directly. Let's store search value on window.searchFilter for ease, 
    // or dispatch to context if supported. Since context has a standard VenueState, let's use window.searchFilter.
    (window as any).searchFilter = value
    // Trigger a force re-render on bestsellers by raising a custom event
    window.dispatchEvent(new CustomEvent('menu-search', { detail: value }))
  }

  const handleToggleFavs = () => {
    const nextFavs = !favsOnly
    setFavsOnly(nextFavs)
    ;(window as any).favsOnlyFilter = nextFavs
    window.dispatchEvent(new CustomEvent('menu-favs', { detail: nextFavs }))
  }

  return (
    <section className="px-6 pt-6 bg-white">
      <div className="mx-auto max-w-5xl">
        
        {/* Order Type Choice Tab (Sur Place vs À Emporter) */}
        <div className="mb-6 flex rounded-full bg-zinc-100 p-1">
          <button
            onClick={() => dispatch({ type: 'SET_ORDER_TYPE', orderType: 'dine_in' })}
            className={`flex-1 rounded-full py-2.5 text-center text-xs font-semibold tracking-wider transition-all duration-300 ${
              state.orderType === 'dine_in'
                ? 'bg-black text-white shadow-md'
                : 'text-zinc-500 hover:text-black'
            }`}
          >
            🍽 Sur Place
          </button>
          <button
            onClick={() => dispatch({ type: 'SET_ORDER_TYPE', orderType: 'takeout' })}
            className={`flex-1 rounded-full py-2.5 text-center text-xs font-semibold tracking-wider transition-all duration-300 ${
              state.orderType === 'takeout'
                ? 'bg-black text-white shadow-md'
                : 'text-zinc-500 hover:text-black'
            }`}
          >
            🛍 À Emporter
          </button>
        </div>

        {/* Secondary Search & Favorites Bar */}
        <div className="flex items-center gap-3">
          {/* Capsule Search Bar */}
          <div className="relative flex flex-1 items-center gap-2 rounded-full bg-zinc-100 px-4 py-3 border border-zinc-200">
            <input
              type="text"
              placeholder="Rechercher dans le menu..."
              value={query}
              onChange={handleSearchChange}
              className="w-full bg-transparent font-sans text-xs text-zinc-800 placeholder-zinc-400 outline-none"
            />
            <Search size={16} className="text-zinc-400 absolute right-4" />
          </div>

          {/* Heart / Favorites action icon */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={handleToggleFavs}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors ${
              favsOnly
                ? 'bg-red-500 text-white border-red-500'
                : 'bg-zinc-100 border-zinc-200 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            <Heart size={18} fill={favsOnly ? 'currentColor' : 'none'} />
          </motion.button>
        </div>

        {/* Section Header Row & Category Tabs */}
        <div className="mt-8 flex items-baseline justify-between border-b border-zinc-100 pb-3">
          <h2 className="font-display text-2xl font-bold text-zinc-950">
            Menu
          </h2>

          {/* Categories Tab scrolling inline row */}
          <div className="flex gap-4 overflow-x-auto scrollbar-none pl-4">
            {CATEGORIES.map((cat) => {
              const isActive = state.activeCategory === cat.id
              return (
                <button
                  key={cat.id}
                  onClick={() => dispatch({ type: 'SET_ACTIVE_CATEGORY', category: cat.id })}
                  className="relative pb-1 text-xs font-semibold tracking-wider uppercase shrink-0 transition-colors"
                  style={{ color: isActive ? 'var(--gold)' : '#8e8e93' }}
                >
                  {cat.label}
                  {isActive && (
                    <motion.div
                      layoutId="activeCategoryLine"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#D4AF37]"
                    />
                  )}
                </button>
              )
            })}
          </div>
        </div>

      </div>
    </section>
  )
}
