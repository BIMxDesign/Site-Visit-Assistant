import React from 'react'
import { ChevronRight } from 'lucide-react'

export default function Breadcrumbs({ items = [], className = '', dark = false }) {
  if (!items || items.length === 0) return null

  return (
    <nav
      aria-label="Breadcrumb navigation"
      className={`${
        dark
          ? 'bg-gray-800/80 backdrop-blur-md border border-gray-700/80 text-gray-300'
          : 'liquid-glass-surface border border-white/70 text-gray-500 shadow-2xs'
      } rounded-xl px-3 sm:px-3.5 py-1.5 sm:py-2 flex items-center gap-1.5 text-xs font-medium overflow-x-auto no-scrollbar select-none ${className}`}
    >
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1 || item.active
        return (
          <React.Fragment key={idx}>
            {idx > 0 && (
              <ChevronRight
                size={12}
                className={`${dark ? 'text-gray-500' : 'text-gray-400'} flex-shrink-0`}
              />
            )}
            {isLast ? (
              <span
                className={`font-bold truncate flex items-center gap-1 flex-shrink-0 ${
                  dark ? 'text-white' : 'text-gray-900'
                }`}
              >
                {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
                <span className="truncate max-w-[160px] sm:max-w-xs">{item.label}</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={item.onClick}
                className={`flex items-center gap-1 transition-colors cursor-pointer flex-shrink-0 ${
                  dark
                    ? 'text-gray-300 hover:text-white hover:underline'
                    : 'text-gray-500 hover:text-brand-700 hover:underline'
                }`}
                title={`Go to ${item.label}`}
              >
                {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
                <span className="truncate max-w-[120px] sm:max-w-[200px]">{item.label}</span>
              </button>
            )}
          </React.Fragment>
        )
      })}
    </nav>
  )
}
