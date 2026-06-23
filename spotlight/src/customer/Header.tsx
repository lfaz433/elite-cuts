import React from 'react'
import { Menu, Search, ShoppingBag } from 'lucide-react'
import { useVenue } from '../context/VenueContext'

interface HeaderProps {
  onCartOpen?: () => void
}

export default function Header({ onCartOpen }: HeaderProps) {
  const { state, cartCount } = useVenue()

  const table = state.activeTableId
    ? state.tables.find((t) => t.id === state.activeTableId)
    : null

  return (
    <header className="absolute top-0 left-0 right-0 z-30 bg-transparent px-4 py-3">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        {/* Left - Hamburger Menu */}
        <button className="flex h-10 w-10 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-md transition hover:bg-black/50">
          <Menu size={20} />
        </button>

        {/* Center - Capsule Search Bar */}
        <div className="flex flex-1 max-w-[280px] items-center gap-2 rounded-full bg-white px-4 py-2 shadow-lg">
          <Search size={16} className="text-zinc-400 shrink-0" />
          <input
            type="text"
            readOnly
            placeholder="User center"
            className="w-full bg-transparent font-sans text-xs font-medium text-zinc-700 placeholder-zinc-400 outline-none cursor-pointer"
            onClick={onCartOpen}
          />
        </div>

        {/* Right - Shopping Bag Action */}
        <button
          onClick={onCartOpen}
          className="relative flex h-10 w-10 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-md transition hover:bg-black/50"
        >
          <ShoppingBag size={18} />
          {cartCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#D4AF37] text-[10px] font-bold text-black border-2 border-black animate-pulse">
              {cartCount}
            </span>
          )}
        </button>
      </div>

      {/* Table Badge Overlay if active */}
      {table && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40">
          <div className="flex items-center gap-1.5 rounded-full bg-[#D4AF37] px-4 py-1 text-[11px] font-bold text-black tracking-wider shadow-lg animate-bounce">
            <span>🍽</span>
            <span>TABLE {table.number}</span>
          </div>
        </div>
      )}
    </header>
  )
}
