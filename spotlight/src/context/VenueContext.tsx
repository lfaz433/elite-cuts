import React, { createContext, useContext, useReducer, useCallback } from 'react'
import type { VenueState, VenueAction, CartItem, Order } from '../types'
import {
  PRODUCTS,
  MODIFIER_GROUPS,
  TABLES,
  SEATS,
  SHOWS,
  HERO_CONTENT,
  FEATURES,
} from '../data/seed'

// ============================================================
// INITIAL STATE
// ============================================================

const initialState: VenueState = {
  heroContent: HERO_CONTENT,
  products: PRODUCTS,
  modifierGroups: MODIFIER_GROUPS,
  features: FEATURES,
  tables: TABLES,
  activeTableId: null,
  cart: [],
  orders: [
    // Pre-seeded order so admin desk has content on first load
    {
      id: 'ord-seed-1',
      orderType: 'dine_in',
      tableId: 't-02',
      tableNumber: '02',
      items: [
        {
          id: 'ci-seed-1',
          product: PRODUCTS[0],
          quantity: 2,
          modifiers: [
            {
              groupId: 'mg-ice',
              groupName: 'Ice Preference',
              selectedOption: { id: 'ice-none', label: 'No Ice', supplement: 0 },
              supplement: 0,
            },
          ],
          lineTotal: 25.0,
          addedAt: new Date(Date.now() - 300000).toISOString(),
        },
        {
          id: 'ci-seed-2',
          product: PRODUCTS[4],
          quantity: 1,
          modifiers: [],
          lineTotal: 28.0,
          addedAt: new Date(Date.now() - 300000).toISOString(),
        },
      ],
      status: 'preparing',
      totalAmount: 53.0,
      placedAt: new Date(Date.now() - 300000).toISOString(),
      updatedAt: new Date(Date.now() - 180000).toISOString(),
    },
    {
      id: 'ord-seed-2',
      orderType: 'dine_in',
      tableId: 't-06',
      tableNumber: '06',
      items: [
        {
          id: 'ci-seed-3',
          product: PRODUCTS[1],
          quantity: 1,
          modifiers: [
            {
              groupId: 'mg-garnish',
              groupName: 'Extra Garnish',
              toggled: true,
              supplement: 1.5,
            },
          ],
          lineTotal: 15.5,
          addedAt: new Date(Date.now() - 60000).toISOString(),
        },
      ],
      status: 'pending',
      totalAmount: 15.5,
      placedAt: new Date(Date.now() - 60000).toISOString(),
      updatedAt: new Date(Date.now() - 60000).toISOString(),
    },
  ],
  seats: SEATS,
  selectedSeatIds: [],
  activeShowId: null,
  shows: SHOWS,
  ticketSales: [],
  orderType: 'dine_in',
  activeMenuSheet: null,
  isCheckoutOpen: false,
  isMenuOnly: false,
  activeCategory: 'all',
  adminSection: 'orders',
}

// ============================================================
// REDUCER
// ============================================================

function venueReducer(state: VenueState, action: VenueAction): VenueState {
  switch (action.type) {
    case 'SET_ACTIVE_TABLE':
      return { ...state, activeTableId: action.tableId }

    case 'SET_ACTIVE_CATEGORY':
      return { ...state, activeCategory: action.category }

    case 'OPEN_MENU_SHEET':
      return { ...state, activeMenuSheet: action.product }

    case 'CLOSE_MENU_SHEET':
      return { ...state, activeMenuSheet: null }

    case 'ADD_TO_CART': {
      const existing = state.cart.find(
        (c) =>
          c.product.id === action.item.product.id &&
          JSON.stringify(c.modifiers) === JSON.stringify(action.item.modifiers)
      )
      if (existing) {
        return {
          ...state,
          cart: state.cart.map((c) =>
            c.id === existing.id
              ? {
                  ...c,
                  quantity: c.quantity + action.item.quantity,
                  lineTotal:
                    (c.quantity + action.item.quantity) *
                    (c.product.price +
                      c.modifiers.reduce((s, m) => s + m.supplement, 0)),
                }
              : c
          ),
        }
      }
      return { ...state, cart: [...state.cart, action.item] }
    }

    case 'UPDATE_CART_ITEM':
      return {
        ...state,
        cart: state.cart
          .map((c) =>
            c.id === action.id
              ? {
                  ...c,
                  quantity: action.quantity,
                  lineTotal:
                    action.quantity *
                    (c.product.price +
                      c.modifiers.reduce((s, m) => s + m.supplement, 0)),
                }
              : c
          )
          .filter((c) => c.quantity > 0),
      }

    case 'REMOVE_FROM_CART':
      return { ...state, cart: state.cart.filter((c) => c.id !== action.id) }

    case 'CLEAR_CART':
      return { ...state, cart: [] }

    case 'SET_ORDER_TYPE':
      return { ...state, orderType: action.orderType }

    case 'PLACE_ORDER': {
      if (state.cart.length === 0) return state
      
      const isDineIn = state.orderType === 'dine_in'
      const tableId = isDineIn ? (state.activeTableId ?? 't-07') : undefined
      const table = isDineIn ? state.tables.find((t) => t.id === tableId) : undefined
      
      const totalAmount =
        state.cart.reduce((s, c) => s + c.lineTotal, 0) *
        (1 - (action.loyaltyDiscount ?? 0))
        
      const newOrder: Order = {
        id: `ord-${Date.now()}`,
        orderType: state.orderType,
        tableId,
        tableNumber: table?.number ?? (isDineIn ? '07' : undefined),
        customerName: action.customerName,
        customerPhone: action.customerPhone,
        customerAddress: action.customerAddress,
        items: [...state.cart],
        status: 'pending',
        totalAmount,
        guestEmail: action.guestEmail,
        loyaltyDiscount: action.loyaltyDiscount,
        placedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      
      return {
        ...state,
        orders: [newOrder, ...state.orders],
        cart: [],
        isCheckoutOpen: false,
      }
    }

    case 'UPDATE_ORDER_STATUS':
      return {
        ...state,
        orders: state.orders.map((o) =>
          o.id === action.orderId
            ? { ...o, status: action.status, updatedAt: new Date().toISOString() }
            : o
        ),
      }

    case 'SET_CHECKOUT_OPEN':
      return { ...state, isCheckoutOpen: action.open }

    case 'SELECT_SEAT':
      if (state.selectedSeatIds.includes(action.seatId)) return state
      return {
        ...state,
        selectedSeatIds: [...state.selectedSeatIds, action.seatId],
        seats: state.seats.map((s) =>
          s.id === action.seatId ? { ...s, status: 'selected' } : s
        ),
      }

    case 'DESELECT_SEAT':
      return {
        ...state,
        selectedSeatIds: state.selectedSeatIds.filter((id) => id !== action.seatId),
        seats: state.seats.map((s) =>
          s.id === action.seatId ? { ...s, status: 'available' } : s
        ),
      }

    case 'SET_ACTIVE_SHOW':
      return { ...state, activeShowId: action.showId, selectedSeatIds: [] }

    case 'BOOK_SEATS': {
      const sale = {
        id: `sale-${Date.now()}`,
        showId: action.showId,
        seatIds: action.seatIds,
        guestEmail: action.email,
        amount: action.amount,
        purchasedAt: new Date().toISOString(),
      }
      return {
        ...state,
        ticketSales: [...state.ticketSales, sale],
        selectedSeatIds: [],
        seats: state.seats.map((s) =>
          action.seatIds.includes(s.id) ? { ...s, status: 'booked' } : s
        ),
        shows: state.shows.map((sh) =>
          sh.id === action.showId
            ? { ...sh, soldSeats: sh.soldSeats + action.seatIds.length }
            : sh
        ),
      }
    }

    case 'UPDATE_HERO':
      return { ...state, heroContent: { ...state.heroContent, ...action.content } }

    case 'UPDATE_PRODUCT':
      return {
        ...state,
        products: state.products.map((p) =>
          p.id === action.id ? { ...p, ...action.updates } : p
        ),
      }

    case 'ADD_PRODUCT':
      return { ...state, products: [...state.products, action.product] }

    case 'UPDATE_MODIFIER_GROUP':
      return {
        ...state,
        modifierGroups: state.modifierGroups.map((mg) =>
          mg.id === action.group.id ? action.group : mg
        ),
      }

    case 'ADD_MODIFIER_GROUP':
      return { ...state, modifierGroups: [...state.modifierGroups, action.group] }

    case 'UPDATE_TABLE_STATUS':
      return {
        ...state,
        tables: state.tables.map((t) =>
          t.id === action.tableId ? { ...t, status: action.status } : t
        ),
      }

    case 'ADD_TABLE':
      return { ...state, tables: [...state.tables, action.table] }

    case 'SET_TABLE_QR':
      return {
        ...state,
        tables: state.tables.map((t) =>
          t.id === action.tableId ? { ...t, qrUrl: action.qrUrl } : t
        ),
      }

    case 'CREATE_SHOW':
      return { ...state, shows: [action.show, ...state.shows] }

    case 'SET_ADMIN_SECTION':
      return { ...state, adminSection: action.section }

    case 'SET_MENU_ONLY':
      return { ...state, isMenuOnly: action.isMenuOnly }

    default:
      return state
  }
}

// ============================================================
// CONTEXT
// ============================================================

interface VenueContextValue {
  state: VenueState
  dispatch: React.Dispatch<VenueAction>
  // Convenience helpers
  cartTotal: number
  cartCount: number
  getModifierGroup: (id: string) => (typeof MODIFIER_GROUPS)[0] | undefined
}

const VenueContext = createContext<VenueContextValue | null>(null)

export function VenueProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(venueReducer, initialState)

  const cartTotal = state.cart.reduce((s, c) => s + c.lineTotal, 0)
  const cartCount = state.cart.reduce((s, c) => s + c.quantity, 0)
  const getModifierGroup = useCallback(
    (id: string) => state.modifierGroups.find((mg) => mg.id === id),
    [state.modifierGroups]
  )

  return (
    <VenueContext.Provider value={{ state, dispatch, cartTotal, cartCount, getModifierGroup }}>
      {children}
    </VenueContext.Provider>
  )
}

export function useVenue() {
  const ctx = useContext(VenueContext)
  if (!ctx) throw new Error('useVenue must be used inside VenueProvider')
  return ctx
}
