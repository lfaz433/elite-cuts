import React, { useEffect } from 'react'
import { Home, Search, Heart, User, Plus } from 'lucide-react'
import Header from './Header'
import HeroSection from './HeroSection'
import CategoryNav from './CategoryNav'
import BestsellersSection from './BestsellersSection'
import FeaturesGrid from './FeaturesGrid'
import SeatingMap from './SeatingMap'
import MagicalTicket from './MagicalTicket'
import FooterBanner from './FooterBanner'
import MainFooter from './MainFooter'
import MenuSheet from './MenuSheet'
import CheckoutPanel from './CheckoutPanel'
import { useVenue } from '../context/VenueContext'

export default function CustomerApp() {
  const { state, dispatch, cartCount } = useVenue()

  useEffect(() => {
    // When a customer scans a table QR code, it includes ?table=t-xx in the URL
    const params = new URLSearchParams(window.location.search)
    const tableId = params.get('table')
    if (tableId) {
      dispatch({ type: 'SET_ACTIVE_TABLE', tableId })
      dispatch({ type: 'SET_ORDER_TYPE', orderType: 'dine_in' })
      dispatch({ type: 'SET_MENU_ONLY', isMenuOnly: true })
    }
  }, [dispatch])

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' })
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  return (
    <div className="bg-black min-h-screen text-white pb-24 font-sans select-none">
      {/* Premium Transparent Header */}
      <Header onCartOpen={() => dispatch({ type: 'SET_CHECKOUT_OPEN', open: true })} />

      {/* Main Scroll Content */}
      <main className={state.isMenuOnly ? 'pt-16' : ''}>
        {!state.isMenuOnly && <HeroSection />}

        {/* Sliding White Menu Container - rolls over dark hero section */}
        <div className={`relative z-10 bg-white text-zinc-900 pb-20 ${
          state.isMenuOnly 
            ? 'pt-4 rounded-t-none' 
            : '-mt-10 rounded-t-[32px] shadow-2xl'
        }`}>
          <CategoryNav />
          <BestsellersSection />
        </div>

        {/* Premium extra details - shown only if not menu-only */}
        {!state.isMenuOnly && (
          <div className="bg-black text-white px-6 py-12 space-y-12">
            <FeaturesGrid />
            <SeatingMap />
            <MagicalTicket />
            <FooterBanner />
          </div>
        )}
        
        <MainFooter />
      </main>

      {/* Overlays & Sheets */}
      <MenuSheet />
      <CheckoutPanel />

      {/* Fixed Bottom Tab Bar - Dark Hybrid layout */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-zinc-950/95 border-t border-zinc-900 px-4 py-2.5 flex items-center justify-around text-zinc-400 backdrop-blur-md pb-[calc(env(safe-area-inset-bottom)+8px)]">
        {/* Item 1 - Home */}
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="flex flex-col items-center justify-center gap-1 transition hover:text-white"
        >
          <Home size={20} />
          <span className="text-[10px] tracking-wide font-medium">Home</span>
        </button>

        {/* Item 2 - Category (Catory) */}
        <button
          onClick={() => scrollToSection('cat-section-entrees')}
          className="flex flex-col items-center justify-center gap-1 transition hover:text-white"
        >
          <Search size={20} />
          <span className="text-[10px] tracking-wide font-medium">Catory</span>
        </button>

        {/* Item 3 - Central Enlarged FAB in golden ring */}
        <div className="relative -mt-6">
          <button
            onClick={() => dispatch({ type: 'SET_CHECKOUT_OPEN', open: true })}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-950 border-2 border-[#D4AF37] text-white shadow-xl hover:scale-105 active:scale-95 transition-all"
            style={{ boxShadow: '0 0 15px rgba(212, 175, 55, 0.4)' }}
          >
            <Plus size={24} className="text-[#D4AF37]" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white border border-zinc-950 animate-bounce">
                {cartCount}
              </span>
            )}
          </button>
        </div>

        {/* Item 4 - Favorites (Favorors) */}
        <button
          onClick={() => {
            // Trigger favorites toggle via window events
            const isFilterOn = !(window as any).favsOnlyFilter
            ;(window as any).favsOnlyFilter = isFilterOn
            window.dispatchEvent(new CustomEvent('menu-favs', { detail: isFilterOn }))
            scrollToSection('cat-section-entrees')
          }}
          className="flex flex-col items-center justify-center gap-1 transition hover:text-white"
        >
          <Heart size={20} />
          <span className="text-[10px] tracking-wide font-medium">Favorors</span>
        </button>

        {/* Item 5 - Save/Profile */}
        <button
          onClick={() => dispatch({ type: 'SET_CHECKOUT_OPEN', open: true })}
          className="flex flex-col items-center justify-center gap-1 transition hover:text-white"
        >
          <User size={20} />
          <span className="text-[10px] tracking-wide font-medium">Save</span>
        </button>
      </nav>
    </div>
  )
}
