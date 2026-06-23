import React, { useState, useRef } from 'react'
import { Plus, Download, QrCode, Check } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useVenue } from '../context/VenueContext'
import type { Table, TableStatus } from '../types'

export default function TableManager() {
  const { state, dispatch } = useVenue()
  const [showAddForm, setShowAddForm] = useState(false)
  const [newTable, setNewTable] = useState({ number: '', capacity: '4', area: 'Main Floor' })
  const [qrTableId, setQrTableId] = useState<string | null>(null)
  const qrRef = useRef<SVGSVGElement>(null)

  const handleAddTable = () => {
    if (!newTable.number.trim()) return
    const table: Table = {
      id: `t-${Date.now()}`,
      number: newTable.number.padStart(2, '0'),
      status: 'available',
      capacity: parseInt(newTable.capacity, 10),
      area: newTable.area,
    }
    dispatch({ type: 'ADD_TABLE', table })
    setNewTable({ number: '', capacity: '4', area: 'Main Floor' })
    setShowAddForm(false)
  }

  const handleDownloadQR = (tableId: string, tableNumber: string) => {
    const svg = document.getElementById(`qr-${tableId}`)
    if (!svg) return
    const svgData = new XMLSerializer().serializeToString(svg)
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `spotlight-table-${tableNumber}-qr.svg`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const statusColors: Record<TableStatus, { bg: string; border: string; text: string }> = {
    available: { bg: 'rgba(22,163,74,0.1)', border: 'rgba(22,163,74,0.3)', text: '#16a34a' },
    occupied: { bg: 'rgba(220,38,38,0.1)', border: 'rgba(220,38,38,0.3)', text: '#dc2626' },
    reserved: { bg: 'rgba(217,119,6,0.1)', border: 'rgba(217,119,6,0.3)', text: '#d97706' },
  }

  const STATUS_CYCLE: Record<TableStatus, TableStatus> = {
    available: 'occupied',
    occupied: 'reserved',
    reserved: 'available',
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div
        style={{
          padding: '20px 28px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1
              style={{
                color: '#fff',
                fontFamily: 'var(--font-display)',
                fontSize: 26,
                marginBottom: 4,
              }}
            >
              Table & QR Manager
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>
              {state.tables.filter((t) => t.status === 'available').length} of {state.tables.length} tables available
            </p>
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setShowAddForm(!showAddForm)}
          >
            <Plus size={14} /> Add Table
          </button>
        </div>

        {/* Add table form */}
        {showAddForm && (
          <div
            style={{
              marginTop: 16,
              background: 'rgba(255,255,255,0.06)',
              borderRadius: 'var(--radius-xl)',
              padding: '16px',
              display: 'grid',
              gridTemplateColumns: 'auto auto 2fr auto',
              gap: 12,
              alignItems: 'end',
            }}
          >
            <div>
              <label className="label" style={{ color: 'rgba(255,255,255,0.5)' }}>Table #</label>
              <input
                className="input"
                style={{ background: 'rgba(255,255,255,0.08)', color: '#fff', borderColor: 'rgba(255,255,255,0.15)', width: 80 }}
                placeholder="09"
                value={newTable.number}
                onChange={(e) => setNewTable((f) => ({ ...f, number: e.target.value }))}
              />
            </div>
            <div>
              <label className="label" style={{ color: 'rgba(255,255,255,0.5)' }}>Capacity</label>
              <select
                className="input"
                style={{ background: 'rgba(255,255,255,0.08)', color: '#fff', borderColor: 'rgba(255,255,255,0.15)', width: 100 }}
                value={newTable.capacity}
                onChange={(e) => setNewTable((f) => ({ ...f, capacity: e.target.value }))}
              >
                {[2, 4, 6, 8, 10, 12].map((n) => (
                  <option key={n} value={n}>
                    {n} guests
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" style={{ color: 'rgba(255,255,255,0.5)' }}>Area</label>
              <input
                className="input"
                style={{ background: 'rgba(255,255,255,0.08)', color: '#fff', borderColor: 'rgba(255,255,255,0.15)' }}
                placeholder="Main Floor, Bar, VIP..."
                value={newTable.area}
                onChange={(e) => setNewTable((f) => ({ ...f, area: e.target.value }))}
              />
            </div>
            <button className="btn btn-primary btn-sm" onClick={handleAddTable}>
              <Check size={14} /> Create
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--cream)', padding: '24px 28px' }}>
        {/* Quick stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
          {(['available', 'occupied', 'reserved'] as TableStatus[]).map((status) => {
            const count = state.tables.filter((t) => t.status === status).length
            const colors = statusColors[status]
            return (
              <div
                key={status}
                style={{
                  background: colors.bg,
                  border: `1.5px solid ${colors.border}`,
                  borderRadius: 'var(--radius-xl)',
                  padding: '18px 20px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 32, fontWeight: 700, color: colors.text, marginBottom: 4 }}>
                  {count}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    textTransform: 'capitalize',
                    fontWeight: 600,
                    color: colors.text,
                    opacity: 0.7,
                    letterSpacing: '0.06em',
                  }}
                >
                  {status}
                </div>
              </div>
            )
          })}
        </div>

        {/* Table grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 16,
          }}
        >
          {state.tables.map((table) => {
            const colors = statusColors[table.status]
            const qrValue = `https://spotlight-theater.io/menu?table=${table.number}`
            const isShowingQR = qrTableId === table.id

            return (
              <div
                key={table.id}
                style={{
                  background: 'var(--off-white)',
                  borderRadius: 'var(--radius-xl)',
                  border: `1.5px solid ${isShowingQR ? 'var(--gold)' : 'var(--warm-grey)'}`,
                  overflow: 'hidden',
                  boxShadow: '0 2px 12px var(--shadow-warm)',
                  transition: 'all 0.2s',
                }}
              >
                {/* Card header */}
                <div
                  style={{
                    padding: '16px 18px 12px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--taupe)', lineHeight: 1 }}>
                      {table.number}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      {table.area} · {table.capacity} guests
                    </div>
                  </div>
                  {/* Status badge — clickable to cycle */}
                  <button
                    onClick={() =>
                      dispatch({
                        type: 'UPDATE_TABLE_STATUS',
                        tableId: table.id,
                        status: STATUS_CYCLE[table.status],
                      })
                    }
                    style={{
                      background: colors.bg,
                      border: `1px solid ${colors.border}`,
                      color: colors.text,
                      borderRadius: 'var(--radius-pill)',
                      padding: '4px 12px',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {table.status}
                  </button>
                </div>

                {/* QR section */}
                {isShowingQR ? (
                  <div style={{ padding: '12px 18px 18px', textAlign: 'center' }}>
                    <div style={{ display: 'inline-block', padding: 12, background: '#fff', borderRadius: 12, border: '1px solid var(--warm-grey)', marginBottom: 12 }}>
                      <QRCodeSVG
                        id={`qr-${table.id}`}
                        value={qrValue}
                        size={140}
                        fgColor="#3d2e26"
                        bgColor="#ffffff"
                        level="H"
                      />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, wordBreak: 'break-all' }}>
                      {qrValue}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="btn btn-primary btn-sm"
                        style={{ flex: 1 }}
                        onClick={() => handleDownloadQR(table.id, table.number)}
                      >
                        <Download size={12} /> Download
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setQrTableId(null)}
                      >
                        Close
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '0 18px 16px' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ width: '100%' }}
                      onClick={() => setQrTableId(table.id)}
                    >
                      <QrCode size={13} /> Show QR Code
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
