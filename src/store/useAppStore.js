import { create } from 'zustand'
import { applyThemeColor, DEFAULT_THEME_COLOR, applyPinColor, DEFAULT_PIN_COLOR } from '../utils/theme'
import { applyAppFont, DEFAULT_FONT_ID } from '../utils/font'
import { getExportedPdfCount, incrementExportedPdfCount } from '../utils/exportCounter'

export const useAppStore = create((set, get) => ({
  // ── UI State ──────────────────────────────────────────────
  activeTab: 'dashboard',          // dashboard | project | floorplan
  currentProjectUuid: null,
  currentPhaseUuid: null,
  currentFloorPlanUuid: null,
  currentPunchItemUuid: null,

  // Modals
  showNewProject:       false,
  showPunchForm:        false,
  showPhotoAnnotator:   false,
  showPDFPreview:       false,
  showSettings:         false,
  showFloorPlanManager: false,
  showAuthModal:        false,
  showPrivacyModal:     false,

  // User / Authentication
  currentUser: (() => {
    try {
      const saved = localStorage.getItem('sitepunch_current_user')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })(),

  // Pending new pin (before punch form is saved)
  pendingPin: null,   // { x, y, floorPlanUuid }

  // Company / branding settings
  companyName: '',
  companyLogo: null,  // base64 data URL
  themeColor:  DEFAULT_THEME_COLOR,
  appFont:     DEFAULT_FONT_ID,
  pinColor: (() => {
    try {
      return localStorage.getItem('sitepunch_pin_color') || DEFAULT_PIN_COLOR
    } catch {
      return DEFAULT_PIN_COLOR
    }
  })(),
  timezone: (() => {
    try {
      return localStorage.getItem('sitepunch_timezone') || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago'
    } catch {
      return 'America/Chicago'
    }
  })(),
  dateFormat: (() => {
    try {
      return localStorage.getItem('sitepunch_date_format') || 'YYYY-MM-DD'
    } catch {
      return 'YYYY-MM-DD'
    }
  })(),
  exportedPdfCount: getExportedPdfCount(),

  // ── Setters ───────────────────────────────────────────────
  setActiveTab:              tab  => set({ activeTab: tab }),
  setCurrentProject:         uuid => set({ currentProjectUuid: uuid }),
  setCurrentPhase:           uuid => set({ currentPhaseUuid: uuid }),
  setCurrentFloorPlan:       uuid => set({ currentFloorPlanUuid: uuid }),
  setCurrentPunchItem:       uuid => set({ currentPunchItemUuid: uuid }),

  openPrivacyModal:  () => set({ showPrivacyModal: true }),
  closePrivacyModal: () => set({ showPrivacyModal: false }),

  openAuthModal:     () => set({ showAuthModal: true }),
  closeAuthModal:    () => set({ showAuthModal: false }),

  setCurrentUser: user => {
    set({ currentUser: user })
    if (user) {
      try {
        localStorage.setItem('sitepunch_current_user', JSON.stringify(user))
      } catch {}
    } else {
      try {
        localStorage.removeItem('sitepunch_current_user')
      } catch {}
    }
  },

  logout: () => {
    set({ currentUser: null, activeTab: 'dashboard' })
    try {
      localStorage.removeItem('sitepunch_current_user')
    } catch {}
  },

  openNewProject:    () => set({ showNewProject: true }),
  closeNewProject:   () => set({ showNewProject: false }),

  openPunchForm:     (pin = null) => set({ showPunchForm: true,  pendingPin: pin }),
  closePunchForm:    ()           => set({ showPunchForm: false, pendingPin: null, currentPunchItemUuid: null }),

  openPhotoAnnotator:  () => set({ showPhotoAnnotator: true }),
  closePhotoAnnotator: () => set({ showPhotoAnnotator: false }),

  openPDFPreview:    () => set({ showPDFPreview: true }),
  closePDFPreview:   () => set({ showPDFPreview: false }),

  openSettings:    () => set({ showSettings: true }),
  closeSettings:   () => set({ showSettings: false }),

  openFloorPlanManager:  () => set({ showFloorPlanManager: true }),
  closeFloorPlanManager: () => set({ showFloorPlanManager: false }),

  setCompanyName: name => set({ companyName: name }),
  setCompanyLogo: logo => set({ companyLogo: logo }),
  setThemeColor:  color => {
    set({ themeColor: color })
    applyThemeColor(color)
  },
  setAppFont: fontId => {
    set({ appFont: fontId })
    applyAppFont(fontId)
  },
  setPinColor: color => {
    set({ pinColor: color })
    applyPinColor(color)
    try {
      localStorage.setItem('sitepunch_pin_color', color)
    } catch {}
  },
  setTimezone: tz => {
    set({ timezone: tz })
    try {
      localStorage.setItem('sitepunch_timezone', tz)
    } catch {}
  },
  setDateFormat: fmt => {
    set({ dateFormat: fmt })
    try {
      localStorage.setItem('sitepunch_date_format', fmt)
    } catch {}
  },
  incrementExportedPdfCount: () => {
    const next = incrementExportedPdfCount()
    set({ exportedPdfCount: next })
    return next
  },

  // Navigate to a project
  navigateToProject: (uuid, phaseUuid = null) => set({
    currentProjectUuid: uuid,
    currentPhaseUuid: phaseUuid,
    currentFloorPlanUuid: null,
    activeTab: 'project'
  }),
  navigateToFloorPlan: (projectUuid, fpUuid, phaseUuid = undefined) => set(state => ({
    currentProjectUuid: projectUuid,
    currentFloorPlanUuid: fpUuid,
    currentPhaseUuid: phaseUuid !== undefined ? phaseUuid : state.currentPhaseUuid,
    activeTab: 'floorplan'
  })),
  navigateToDashboard: () => set({
    activeTab: 'dashboard',
    currentProjectUuid: null,
    currentPhaseUuid: null,
    currentFloorPlanUuid: null
  }),
}))
