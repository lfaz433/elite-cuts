// ============================================================
// SPOTLIGHT THEATER & BAR — ALL TYPES
// ============================================================

export type OrderStatus = 'pending' | 'preparing' | 'served' | 'paid'
export type OrderType = 'dine_in' | 'takeout'
export type SeatZone = 'stalls' | 'balcony' | 'bar'
export type SeatStatus = 'available' | 'selected' | 'booked' | 'reserved'
export type ModifierType = 'toggle' | 'counter' | 'select'
export type TableStatus = 'available' | 'occupied' | 'reserved'
export type ProductCategory = 'entrees' | 'plats' | 'desserts' | 'boissons' | 'vins'

export interface Product {
  id: string
  name: string
  description: string
  price: number
  category: ProductCategory
  imageUrl: string
  rating: number
  reviewCount: number
  isPopular?: boolean
  isBestseller?: boolean
  modifierGroupIds: string[]
  tags: string[]
}

export interface ModifierOption {
  id: string
  label: string
  supplement: number // 0 = free
}

export interface ModifierGroup {
  id: string
  name: string
  type: ModifierType
  required: boolean
  options: ModifierOption[]
  defaultValue?: string | boolean | number
  min?: number
  max?: number
}

export interface CartModifier {
  groupId: string
  groupName: string
  selectedOption?: ModifierOption
  toggled?: boolean
  count?: number
  supplement: number
}

export interface CartItem {
  id: string // unique cart entry id
  product: Product
  quantity: number
  modifiers: CartModifier[]
  lineTotal: number
  addedAt: string
}

export interface Order {
  id: string
  orderType: OrderType
  // Dine-in fields
  tableId?: string
  tableNumber?: string
  // Takeout fields
  customerName?: string
  customerPhone?: string
  customerAddress?: string
  
  items: CartItem[]
  status: OrderStatus
  totalAmount: number
  guestEmail?: string
  loyaltyDiscount?: number
  placedAt: string
  updatedAt: string
  notes?: string
}

export interface Seat {
  id: string
  row: string
  number: number
  zone: SeatZone
  status: SeatStatus
  tier: 'premium' | 'standard' | 'gallery'
  price: number
  x: number
  y: number
}

export interface Show {
  id: string
  title: string
  genre: string
  description: string
  startTime: string // ISO
  durationMins: number
  cast: string[]
  imageUrl: string
  premiumPrice: number
  standardPrice: number
  galleryPrice: number
  totalSeats: number
  soldSeats: number
  isLive: boolean
}

export interface TicketSale {
  id: string
  showId: string
  seatIds: string[]
  guestEmail: string
  amount: number
  purchasedAt: string
}

export interface Table {
  id: string
  number: string
  status: TableStatus
  capacity: number
  area: string
  qrUrl?: string
}

export interface HeroContent {
  headline: string
  subheadline: string
  specialOffer: string
  ctaLabel: string
}

export interface FeatureCard {
  id: string
  icon: string
  title: string
  description: string
}

export interface VenueState {
  // CMS
  heroContent: HeroContent
  products: Product[]
  modifierGroups: ModifierGroup[]
  features: FeatureCard[]

  // Tables
  tables: Table[]
  activeTableId: string | null

  // Cart
  cart: CartItem[]

  // Orders (shared state — customer→admin)
  orders: Order[]

  // Seating
  seats: Seat[]
  selectedSeatIds: string[]
  activeShowId: string | null

  // Shows
  shows: Show[]
  ticketSales: TicketSale[]

  // UI
  orderType: OrderType
  activeMenuSheet: Product | null
  isCheckoutOpen: boolean
  isMenuOnly: boolean
  activeCategory: ProductCategory | 'all'
  adminSection: 'orders' | 'cms' | 'tables' | 'events'
}

export type VenueAction =
  | { type: 'SET_ACTIVE_TABLE'; tableId: string | null }
  | { type: 'SET_ACTIVE_CATEGORY'; category: ProductCategory | 'all' }
  | { type: 'OPEN_MENU_SHEET'; product: Product }
  | { type: 'CLOSE_MENU_SHEET' }
  | { type: 'ADD_TO_CART'; item: CartItem }
  | { type: 'UPDATE_CART_ITEM'; id: string; quantity: number }
  | { type: 'REMOVE_FROM_CART'; id: string }
  | { type: 'CLEAR_CART' }
  | { type: 'SET_ORDER_TYPE'; orderType: OrderType }
  | { 
      type: 'PLACE_ORDER'; 
      guestEmail?: string; 
      customerName?: string;
      customerPhone?: string;
      customerAddress?: string;
      loyaltyDiscount?: number 
    }
  | { type: 'UPDATE_ORDER_STATUS'; orderId: string; status: OrderStatus }
  | { type: 'SET_CHECKOUT_OPEN'; open: boolean }
  | { type: 'SELECT_SEAT'; seatId: string }
  | { type: 'DESELECT_SEAT'; seatId: string }
  | { type: 'SET_ACTIVE_SHOW'; showId: string | null }
  | { type: 'BOOK_SEATS'; seatIds: string[]; email: string; showId: string; amount: number }
  | { type: 'UPDATE_HERO'; content: Partial<HeroContent> }
  | { type: 'UPDATE_PRODUCT'; id: string; updates: Partial<Product> }
  | { type: 'ADD_PRODUCT'; product: Product }
  | { type: 'UPDATE_MODIFIER_GROUP'; group: ModifierGroup }
  | { type: 'ADD_MODIFIER_GROUP'; group: ModifierGroup }
  | { type: 'UPDATE_TABLE_STATUS'; tableId: string; status: TableStatus }
  | { type: 'ADD_TABLE'; table: Table }
  | { type: 'SET_TABLE_QR'; tableId: string; qrUrl: string }
  | { type: 'CREATE_SHOW'; show: Show }
  | { type: 'SET_ADMIN_SECTION'; section: VenueState['adminSection'] }
  | { type: 'SET_MENU_ONLY'; isMenuOnly: boolean }
