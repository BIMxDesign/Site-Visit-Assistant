import React from 'react'
import {
  OBSERVATION_STATUSES,
  OBSERVATION_STATUS_BADGES,
  normalizeObservationStatus,
} from '../utils/formatters'

/**
 * Interactive color-coded status pill for observation list cards.
 * Stops click propagation so users can update status inline without opening the detail modal.
 */
export default function ObservationStatusSelect({ status, onChange, size = 'sm' }) {
  const normalized = normalizeObservationStatus(status)
  const badgeCls = OBSERVATION_STATUS_BADGES[normalized] || OBSERVATION_STATUS_BADGES.Open
  const sizeCls =
    size === 'xs'
      ? 'text-[10px] leading-[15px] uppercase tracking-wider px-2 py-[1px]'
      : 'text-xs leading-4 px-2 py-[1px] shadow-2xs'

  return (
    <select
      value={normalized}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onChange={(e) => {
        e.stopPropagation()
        if (onChange) onChange(e.target.value)
      }}
      aria-label="Observation status"
      title="Change observation status"
      className={`observation-status-select rounded-full font-bold border flex-shrink-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-400 ${sizeCls} ${badgeCls}`}
    >
      {OBSERVATION_STATUSES.map((opt) => (
        <option key={opt} value={opt} className="bg-white text-gray-900 font-semibold">
          {opt}
        </option>
      ))}
    </select>
  )
}
