import React, { useState, useEffect, useRef } from 'react'
import { Plus, MoreHorizontal } from 'lucide-react'
import { motion } from 'motion/react'
import { useVenue } from '../context/VenueContext'
import type { Product, ProductCategory } from '../types'

const CATEGORIES_INFO: Record<ProductCategory, { title: string; desc: string }> = {
  entrees: { title: 'Entrées', desc: 'Préludes gastronomiques et fraîcheur' },
  plats: { title: 'Plats', desc: 'Créations culinaires et signatures' },
  desserts: { title: 'Desserts', desc: 'Douceurs d\'exception et gourmandise' },
  vins: { title: 'Vins', desc: 'Cuvées d\'exception et accords' },
  boissons: { title: 'Boissons', desc: 'Cocktails raffinés et softs premium' }
}

export default function BestsellersSection() {
  const { state, dispatch } = useVenue()
  const [searchQuery, setSearchQuery] = useState('')
  const [onlyFavs, setOnlyFavs] = useState(false)
  const [timeLeft, setTimeLeft] = useState({ minutes: 40, seconds: 42, ms: 902 })

  // Listen to custom events from CategoryNav search bar
  useEffect(() => {
    const handleSearch = (e: Event) => {
      setSearchQuery((e as CustomEvent).detail || '')
    }
    const handleFavs = (e: Event) => {
      setOnlyFavs((e as CustomEvent).detail || false)
    }
    window.addEventListener('menu-search', handleSearch)
    window.addEventListener('menu-favs', handleFavs)
    return () => {
      window.removeEventListener('menu-search', handleSearch)
      window.removeEventListener('menu-favs', handleFavs)
    }
  }, [])

  // Millisecond-ticking countdown timer for the premium banner
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        let newMs = prev.ms - 94
        let newSec = prev.seconds
        let newMin = prev.minutes

        if (newMs < 0) {
          newMs = 1000 + newMs
          newSec -= 1
        }
        if (newSec < 0) {
          newSec = 59
          newMin -= 1
        }
        if (newMin < 0) {
          // Reset when finishes
          newMin = 40
          newSec = 42
          newMs = 902
        }
        return { minutes: newMin, seconds: newSec, ms: newMs }
      })
    }, 94)
    return () => clearInterval(timer)
  }, [])

  // Ref scroll handler for category headers
  const isScrollingRef = useRef(false)
  useEffect(() => {
    if (state.activeCategory !== 'all' && !isScrollingRef.current) {
      const section = document.getElementById(`cat-section-${state.activeCategory}`)
      if (section) {
        isScrollingRef.current = true
        section.scrollIntoView({ behavior: 'smooth', block: 'start' })
        // Allow user manual scroll spy to resume shortly after scroll ends
        setTimeout(() => {
          isScrollingRef.current = false
        }, 800)
      }
    }
  }, [state.activeCategory])

  // Set up ScrollSpy Intersection Observer
  useEffect(() => {
    const observerOptions = {
      root: null,
      rootMargin: '-100px 0px -60% 0px',
      threshold: 0.1
    }

    const handleIntersect = (entries: IntersectionObserverEntry[]) => {
      if (isScrollingRef.current) return
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const categoryId = entry.target.id.replace('cat-section-', '') as ProductCategory
          dispatch({ type: 'SET_ACTIVE_CATEGORY', category: categoryId })
        }
      })
    }

    const observer = new IntersectionObserver(handleIntersect, observerOptions)
    const sections = document.querySelectorAll('[id^="cat-section-"]')
    sections.forEach((section) => observer.observe(section))

    return () => {
      sections.forEach((section) => observer.unobserve(section))
    }
  }, [dispatch])

  // Filter products based on search inputs
  const getFilteredProducts = (category?: string) => {
    return state.products.filter((p) => {
      const matchesCategory = !category || p.category === category
      const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesFav = !onlyFavs || p.isBestseller // seed signature products act as favs
      return matchesCategory && matchesSearch && matchesFav
    })
  }

  const bestsellers = getFilteredProducts().filter((p) => p.isBestseller)
  const categories: ProductCategory[] = ['entrees', 'plats', 'desserts', 'vins', 'boissons']

  const formatTimeStr = () => {
    const min = String(timeLeft.minutes).padStart(2, '0')
    const sec = String(timeLeft.seconds).padStart(2, '0')
    const ms = String(timeLeft.ms).padStart(3, '0').slice(0, 3)
    return `${min}:${sec}.${ms}`
  }

  return (
    <div className="bg-white pb-20 pt-4 px-6">
      <div className="mx-auto max-w-5xl">
        
        {/* ── 1. PRODUCT GRID CAROUSEL (Horizontal scroll suggestion row) ── */}
        {!searchQuery && !onlyFavs && (
          <div className="mb-10">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold tracking-wider uppercase text-zinc-400">
                Nos Suggestions
              </h3>
              <span className="text-[11px] font-medium text-[#D4AF37]">Faites glisser →</span>
            </div>
            
            <div className="flex gap-5 overflow-x-auto pb-4 scrollbar-none snap-x">
              {bestsellers.map((product) => (
                <motion.div
                  key={product.id}
                  whileHover={{ y: -4 }}
                  className="w-[200px] shrink-0 snap-start rounded-[28px] bg-[#121212] p-3 text-white shadow-xl flex flex-col justify-between"
                  onClick={() => dispatch({ type: 'OPEN_MENU_SHEET', product })}
                >
                  <div>
                    {/* Top Image with floating action dot badge */}
                    <div className="relative h-[130px] w-full overflow-hidden rounded-2xl bg-zinc-900">
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          dispatch({ type: 'OPEN_MENU_SHEET', product })
                        }}
                        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white text-zinc-900 shadow-md transition hover:bg-zinc-100"
                      >
                        <MoreHorizontal size={14} />
                      </button>
                    </div>

                    {/* Details */}
                    <h4 className="mt-3 font-sans text-sm font-bold text-white truncate">
                      {product.name}
                    </h4>
                    <p className="mt-1 font-sans text-[10px] font-light text-zinc-400 line-clamp-2 leading-relaxed">
                      {product.description}
                    </p>
                  </div>

                  {/* Price Row */}
                  <div className="mt-4 flex items-center justify-between">
                    <span className="font-display text-sm font-semibold text-[#E5BA73]">
                      €{product.price.toFixed(2)}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        dispatch({ type: 'OPEN_MENU_SHEET', product })
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-black transition hover:scale-105 active:scale-95"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* ── 2. VERTICAL CATEGORY SECTIONS (McDonald's / Burger King inspired) ── */}
        <div className="space-y-10">
          {categories.map((catId) => {
            const catProducts = getFilteredProducts(catId)
            if (catProducts.length === 0) return null

            return (
              <div key={catId} id={`cat-section-${catId}`} className="scroll-mt-28">
                {/* Category Header */}
                <div className="mb-4 border-l-4 border-[#D4AF37] pl-3">
                  <h3 className="font-display text-lg font-bold text-zinc-950">
                    {CATEGORIES_INFO[catId].title}
                  </h3>
                  <p className="font-sans text-[11px] text-zinc-400">
                    {CATEGORIES_INFO[catId].desc}
                  </p>
                </div>

                {/* Grid of Compact 2-Column Cards */}
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                  {catProducts.map((product) => (
                    <motion.div
                      key={product.id}
                      whileTap={{ scale: 0.98 }}
                      className="flex flex-col justify-between rounded-2xl bg-zinc-950 border border-zinc-900 p-2.5 text-white shadow-md cursor-pointer"
                      onClick={() => dispatch({ type: 'OPEN_MENU_SHEET', product })}
                    >
                      <div>
                        {/* Image */}
                        <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-zinc-900">
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            className="h-full w-full object-cover"
                          />
                          {product.isBestseller && (
                            <span className="absolute left-1.5 top-1.5 rounded-full bg-[#D4AF37]/90 px-2 py-0.5 text-[8px] font-bold text-black uppercase tracking-wider">
                              Chef
                            </span>
                          )}
                        </div>

                        {/* Text details */}
                        <h4 className="mt-2 font-sans text-xs font-bold text-white leading-tight truncate">
                          {product.name}
                        </h4>
                        <p className="mt-0.5 font-sans text-[10px] text-zinc-400 line-clamp-2 leading-tight">
                          {product.description}
                        </p>
                      </div>

                      {/* Pricing + Fast Add */}
                      <div className="mt-3 flex items-center justify-between">
                        <span className="font-sans text-xs font-bold text-[#E5BA73]">
                          €{product.price.toFixed(2)}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            dispatch({ type: 'OPEN_MENU_SHEET', product })
                          }}
                          className="flex h-6 w-6 items-center justify-center rounded-full bg-[#D4AF37] text-black shadow-sm transition hover:scale-105 active:scale-95"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* ── 3. INTERACTIVE STATUS/PROMO BANNER ── */}
        <div className="mt-12 rounded-[28px] bg-[#121212] p-4 border border-zinc-800 shadow-xl flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            {/* Chef Portrait with active status dot */}
            <div className="relative h-12 w-12 shrink-0">
              <img
                src="https://images.unsplash.com/photo-1577219491135-ce391730fb2c?w=150&q=80"
                alt="Chef de Cuisine"
                className="h-full w-full rounded-full object-cover border border-[#D4AF37]"
              />
              <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-[#D4AF37] border-2 border-zinc-950 animate-ping" />
              <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-[#D4AF37] border-2 border-zinc-950" />
            </div>
            {/* Titles */}
            <div>
              <span className="block text-[9px] font-bold tracking-widest text-[#D4AF37] uppercase">
                Chef de Cuisine 🏛
              </span>
              <h4 className="text-sm font-bold text-white">
                Sélection Truffe
              </h4>
              <p className="text-[10px] font-light text-zinc-400">
                Menu de dégustation éphémère.
              </p>
            </div>
          </div>

          {/* Time Countdown & Golden button */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            <span className="font-mono text-xs font-semibold text-zinc-300">
              {formatTimeStr()} →
            </span>
            <button
              onClick={() => dispatch({ type: 'SET_CHECKOUT_OPEN', open: true })}
              className="rounded-full bg-[#D4AF37] hover:bg-[#E5BA73] text-black font-semibold px-4 py-1.5 text-[10px] uppercase tracking-wider shadow-md transition-all active:scale-95"
            >
              Commander
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
