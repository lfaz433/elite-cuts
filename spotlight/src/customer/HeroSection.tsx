import React from 'react'
import { motion } from 'motion/react'
import { MoreHorizontal } from 'lucide-react'

export default function HeroSection() {
  return (
    <section className="relative h-[85vh] min-h-[560px] w-full overflow-hidden bg-black">
      {/* Background Image with Vignette/Shadow Overlays */}
      <div className="absolute inset-0 z-0">
        <img
          src="https://images.unsplash.com/photo-1600891964599-f61ba0e24092?q=80&w=1200&auto=format&fit=crop"
          alt="Premium Luxury Dish"
          className="h-full w-full object-cover brightness-[0.4] contrast-[1.1]"
        />
        {/* Dark radial vignette for that luxury contrast */}
        <div className="absolute inset-0 bg-radial-[circle_at_center,rgba(0,0,0,0.2)_0%,rgba(0,0,0,0.9)_90%]" />
        {/* Soft bottom transition gradient */}
        <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-black to-transparent" />
      </div>

      {/* Main Content Area */}
      <div className="relative z-10 mx-auto flex h-full max-w-5xl flex-col justify-end px-6 pb-20 pt-28">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="max-w-md text-left"
        >
          {/* Accent Label */}
          <span className="font-sans text-[10px] font-bold uppercase tracking-[0.25em] text-[#D4AF37]">
            Premium
          </span>

          {/* Heading - Serif style */}
          <h1 className="mt-2 font-display text-[44px] font-semibold leading-[1.05] tracking-tight text-white sm:text-5xl">
            Menu <br />
            <span className="text-[#E5BA73]">Recipine</span>
          </h1>

          {/* Description */}
          <p className="mt-4 font-sans text-xs font-light leading-relaxed text-zinc-400">
            Une table d'exception à Grenoble. Des produits frais, <br />
            une cuisine théâtrale et raffinée.
          </p>

          {/* Slider dots indicator row */}
          <div className="mt-8 flex items-center space-x-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37]" />
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
          </div>
        </motion.div>

        {/* Floating Context Button (Three-dot overlay) */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="absolute bottom-20 right-6 flex h-12 w-12 items-center justify-center rounded-full bg-white text-black shadow-xl transition-all"
        >
          <MoreHorizontal size={20} />
        </motion.button>
      </div>
    </section>
  )
}
