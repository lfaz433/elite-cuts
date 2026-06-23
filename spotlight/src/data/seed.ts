import type {
  Product,
  ModifierGroup,
  Table,
  Seat,
  Show,
  HeroContent,
  FeatureCard,
} from '../types'

// ============================================================
// MODIFIER GROUPS
// ============================================================

export const MODIFIER_GROUPS: ModifierGroup[] = [
  {
    id: 'mg-ice',
    name: 'Ice Preference',
    type: 'select',
    required: false,
    options: [
      { id: 'ice-full', label: 'Full Ice', supplement: 0 },
      { id: 'ice-half', label: 'Half Ice', supplement: 0 },
      { id: 'ice-none', label: 'No Ice', supplement: 0 },
      { id: 'ice-extra', label: 'Extra Ice', supplement: 0 },
    ],
    defaultValue: 'ice-full',
  },
  {
    id: 'mg-garnish',
    name: 'Extra Garnish',
    type: 'toggle',
    required: false,
    options: [{ id: 'garnish-yes', label: 'Extra Garnish', supplement: 1.5 }],
    defaultValue: false,
  },
  {
    id: 'mg-olives',
    name: 'Olives',
    type: 'counter',
    required: false,
    options: [{ id: 'olive-count', label: 'Olives', supplement: 0.5 }],
    min: 0,
    max: 10,
    defaultValue: 0,
  },
  {
    id: 'mg-spice',
    name: 'Spice Level',
    type: 'select',
    required: false,
    options: [
      { id: 'spice-mild', label: 'Mild', supplement: 0 },
      { id: 'spice-medium', label: 'Medium', supplement: 0 },
      { id: 'spice-hot', label: 'Hot 🌶', supplement: 0 },
    ],
    defaultValue: 'spice-mild',
  },
  {
    id: 'mg-cheese',
    name: 'Extra Cheese',
    type: 'counter',
    required: false,
    options: [{ id: 'cheese-extra', label: 'Extra Cheese', supplement: 1.5 }],
    min: 0,
    max: 3,
    defaultValue: 0,
  },
  {
    id: 'mg-dietary',
    name: 'Dietary Options',
    type: 'select',
    required: false,
    options: [
      { id: 'diet-none', label: 'Standard', supplement: 0 },
      { id: 'diet-vegan', label: 'Vegan', supplement: 0 },
      { id: 'diet-gf', label: 'Gluten-Free', supplement: 1.0 },
    ],
    defaultValue: 'diet-none',
  },
  {
    id: 'mg-seat',
    name: 'Seat Preference',
    type: 'select',
    required: false,
    options: [
      { id: 'seat-any', label: 'Any Available', supplement: 0 },
      { id: 'seat-front', label: 'Front Row', supplement: 5.0 },
      { id: 'seat-aisle', label: 'Aisle Seat', supplement: 2.0 },
    ],
    defaultValue: 'seat-any',
  },
]

// ============================================================
// PRODUCTS
// ============================================================

export const PRODUCTS: Product[] = [
  {
    id: 'p-aperol',
    name: 'Spotlight Aperol Spritz',
    description: 'Our signature spritz with premium Aperol, Prosecco DOC, and a touch of elderflower — garnished with a dramatic orange twist.',
    price: 12.5,
    category: 'boissons',
    imageUrl: 'https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?w=400&q=80',
    rating: 4.9,
    reviewCount: 312,
    isBestseller: true,
    isPopular: true,
    modifierGroupIds: ['mg-ice', 'mg-garnish'],
    tags: ['Sparkling', 'Classic', 'Staff Pick'],
  },
  {
    id: 'p-negroni',
    name: 'Curtain Call Negroni',
    description: 'Equal parts Gin, Campari & sweet vermouth. Stirred perfectly and served over a single, theatrical ice sphere.',
    price: 14.0,
    category: 'vins',
    imageUrl: 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=400&q=80',
    rating: 4.8,
    reviewCount: 201,
    isPopular: true,
    modifierGroupIds: ['mg-ice', 'mg-garnish'],
    tags: ['Bitter', 'Bold', 'Classic'],
  },
  {
    id: 'p-martini',
    name: 'Standing Ovation Martini',
    description: 'Ultra-cold Grey Goose vodka, dry vermouth, and a whisper of olive brine. Served in our chilled crystal coupe.',
    price: 15.5,
    category: 'vins',
    imageUrl: 'https://images.unsplash.com/photo-1575023782549-62ca0d244b39?w=400&q=80',
    rating: 4.9,
    reviewCount: 178,
    modifierGroupIds: ['mg-ice', 'mg-olives'],
    tags: ['Elegant', 'Dry', 'Premium'],
  },
  {
    id: 'p-spicy-marg',
    name: 'Jalapeño Midnight Margarita',
    description: 'Casa Noble Blanco, fresh jalapeño, lime, and agave. Rimmed with volcanic salt. Fiercely seductive.',
    price: 13.5,
    category: 'boissons',
    imageUrl: 'https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=400&q=80',
    rating: 4.7,
    reviewCount: 154,
    modifierGroupIds: ['mg-ice', 'mg-spice'],
    tags: ['Spicy', 'Citrus', 'Trending'],
  },
  {
    id: 'p-charcuterie',
    name: 'Grand Platter Charcuterie Board',
    description: 'Curated selection of 5 premium aged cheeses, Ibérico ham, truffle salami, house cornichons, and artisan crackers.',
    price: 28.0,
    category: 'entrees',
    imageUrl: 'https://images.unsplash.com/photo-1626200921949-5c7d91ce6d34?w=400&q=80',
    rating: 4.9,
    reviewCount: 267,
    isBestseller: true,
    modifierGroupIds: ['mg-dietary', 'mg-cheese'],
    tags: ['Sharing', 'Chef Choice', 'Bestseller'],
  },
  {
    id: 'p-bruschetta',
    name: 'Heirloom Tomato Bruschetta',
    description: 'Toasted sourdough topped with heirloom tomatoes, stracciatella, Sicilian capers, and aged balsamic reduction.',
    price: 14.0,
    category: 'entrees',
    imageUrl: 'https://images.unsplash.com/photo-1572695157366-5e585ab2b69f?w=400&q=80',
    rating: 4.6,
    reviewCount: 89,
    modifierGroupIds: ['mg-dietary', 'mg-spice'],
    tags: ['Vegetarian', 'Light', 'Fresh'],
  },
  {
    id: 'p-comedy-ticket',
    name: 'Comedy Night — General Admission',
    description: 'An evening of world-class stand-up comedy from rotating headline acts. Includes one complimentary welcome drink on arrival.',
    price: 38.0,
    category: 'plats',
    imageUrl: 'https://images.unsplash.com/photo-1603190287605-e6ade32fa852?w=400&q=80',
    rating: 4.9,
    reviewCount: 423,
    isBestseller: true,
    isPopular: true,
    modifierGroupIds: ['mg-seat'],
    tags: ['Includes Drink', 'Live', 'Bestseller'],
  },
  {
    id: 'p-improv-ticket',
    name: 'Improv Showcase — Premium Seat',
    description: 'Front-section seating for our critically-acclaimed improv ensemble. Immersive, unscripted, electric. No two shows alike.',
    price: 52.0,
    category: 'plats',
    imageUrl: 'https://images.unsplash.com/photo-1518929458119-e5bf444c30f4?w=400&q=80',
    rating: 4.8,
    reviewCount: 211,
    modifierGroupIds: ['mg-seat'],
    tags: ['Premium', 'Front Row', 'Limited'],
  },
  {
    id: 'p-karaoke',
    name: 'Karaoke Booth — 2 Hours',
    description: 'Private booth for up to 8 guests. Premium AV system, 50,000-song library, and a dedicated drinks menu delivered directly to your booth.',
    price: 65.0,
    category: 'desserts',
    imageUrl: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=400&q=80',
    rating: 4.8,
    reviewCount: 334,
    isBestseller: true,
    isPopular: true,
    modifierGroupIds: [],
    tags: ['Private', 'Group', 'Popular'],
  },
  {
    id: 'p-hamper-gold',
    name: 'Spotlight Gold Hamper',
    description: 'Curated gift set: Champagne Billecart-Salmon, truffle oil, artisan chocolate, and a pair of Spotlight show tickets.',
    price: 95.0,
    category: 'desserts',
    imageUrl: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=400&q=80',
    rating: 5.0,
    reviewCount: 47,
    modifierGroupIds: [],
    tags: ['Gift', 'Luxury', 'Includes Tickets'],
  },
]

// ============================================================
// TABLES
// ============================================================

export const TABLES: Table[] = [
  { id: 't-01', number: '01', status: 'available', capacity: 2, area: 'Bar' },
  { id: 't-02', number: '02', status: 'occupied', capacity: 4, area: 'Main Floor' },
  { id: 't-03', number: '03', status: 'available', capacity: 2, area: 'Bar' },
  { id: 't-04', number: '04', status: 'reserved', capacity: 6, area: 'Mezzanine' },
  { id: 't-05', number: '05', status: 'available', capacity: 4, area: 'Main Floor' },
  { id: 't-06', number: '06', status: 'occupied', capacity: 2, area: 'Main Floor' },
  { id: 't-07', number: '07', status: 'available', capacity: 4, area: 'Main Floor' },
  { id: 't-08', number: '08', status: 'occupied', capacity: 8, area: 'VIP Lounge' },
]

// ============================================================
// SHOWS
// ============================================================

export const SHOWS: Show[] = [
  {
    id: 'show-1',
    title: 'The Midnight Improv Hour',
    genre: 'Improvisation',
    description: 'Our flagship improv ensemble takes requests from the audience and builds extraordinary scenes from nothing. Unpredictable, hilarious, and deeply human.',
    startTime: new Date(Date.now() + 3600000).toISOString(),
    durationMins: 90,
    cast: ['Alex Thornton', 'Priya Nair', 'Sam Okafor', 'Elena Vasquez'],
    imageUrl: 'https://images.unsplash.com/photo-1518929458119-e5bf444c30f4?w=600&q=80',
    premiumPrice: 52,
    standardPrice: 38,
    galleryPrice: 28,
    totalSeats: 80,
    soldSeats: 47,
    isLive: true,
  },
  {
    id: 'show-2',
    title: 'Stand-Up Saturdays: Vol. XII',
    genre: 'Stand-Up Comedy',
    description: 'Three headline comedians. One electric night. Our most popular monthly showcase returns with an all-new lineup guaranteed to leave you breathless.',
    startTime: new Date(Date.now() + 86400000 * 2).toISOString(),
    durationMins: 120,
    cast: ['Marcus Cole', 'Diane Obi', 'The Reverend Laughs'],
    imageUrl: 'https://images.unsplash.com/photo-1603190287605-e6ade32fa852?w=600&q=80',
    premiumPrice: 45,
    standardPrice: 35,
    galleryPrice: 25,
    totalSeats: 80,
    soldSeats: 32,
    isLive: false,
  },
  {
    id: 'show-3',
    title: 'Karaoke Championship Night',
    genre: 'Interactive',
    description: 'Compete for the Spotlight Golden Mic. Audience votes decide the winner. Open bar included. Glory awaits.',
    startTime: new Date(Date.now() + 86400000 * 3).toISOString(),
    durationMins: 180,
    cast: ['Open to All'],
    imageUrl: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=600&q=80',
    premiumPrice: 40,
    standardPrice: 30,
    galleryPrice: 20,
    totalSeats: 80,
    soldSeats: 15,
    isLive: false,
  },
]

// ============================================================
// SEATS (80 seats — Rows A-H)
// ============================================================

function generateSeats(): Seat[] {
  const seats: Seat[] = []
  const stalls = ['A', 'B', 'C', 'D', 'E', 'F']
  const balcony = ['G', 'H']

  stalls.forEach((row, rowIdx) => {
    const cols = 10
    for (let n = 1; n <= cols; n++) {
      const tier = rowIdx <= 1 ? 'premium' : rowIdx <= 3 ? 'standard' : 'gallery'
      const price = tier === 'premium' ? 52 : tier === 'standard' ? 38 : 28
      const statusRand = Math.random()
      const status: Seat['status'] =
        statusRand < 0.35 ? 'booked' :
        statusRand < 0.42 ? 'reserved' : 'available'
      seats.push({
        id: `seat-${row}${n}`,
        row,
        number: n,
        zone: 'stalls',
        status,
        tier,
        price,
        x: 80 + (n - 1) * 52,
        y: 80 + rowIdx * 44,
      })
    }
  })

  balcony.forEach((row, rowIdx) => {
    const cols = 10
    for (let n = 1; n <= cols; n++) {
      const statusRand = Math.random()
      const status: Seat['status'] =
        statusRand < 0.2 ? 'booked' : 'available'
      seats.push({
        id: `seat-${row}${n}`,
        row,
        number: n,
        zone: 'balcony',
        status,
        tier: 'gallery',
        price: 28,
        x: 80 + (n - 1) * 52,
        y: 380 + rowIdx * 44,
      })
    }
  })

  return seats
}

export const SEATS: Seat[] = generateSeats()

// ============================================================
// HERO CONTENT
// ============================================================

export const HERO_CONTENT: HeroContent = {
  headline: 'Decadent\nPerformance\nBliss.',
  subheadline: 'Where theatre meets the finest cocktail culture.',
  specialOffer: 'Tonight: Improv Hour + Welcome Drink — just €52',
  ctaLabel: 'Book Your Night',
}

// ============================================================
// FEATURE CARDS
// ============================================================

export const FEATURES: FeatureCard[] = [
  {
    id: 'f-1',
    icon: '🎭',
    title: 'Live Performance Daily',
    description: 'World-class acts every evening. Comedy, improv, jazz and karaoke.',
  },
  {
    id: 'f-2',
    icon: '🍸',
    title: 'Expert Mixology',
    description: 'Award-winning bartenders crafting cocktails with premium spirits.',
  },
  {
    id: 'f-3',
    icon: '⚡',
    title: 'Fast Table Service',
    description: 'Order directly from your seat. Drinks arrive before the curtain rises.',
  },
  {
    id: 'f-4',
    icon: '👑',
    title: 'Premium Seating',
    description: 'Velvet seats, perfect acoustics, and unobstructed stage views.',
  },
]
