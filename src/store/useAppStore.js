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
  newProjectReturnTo:   null,
  showPunchForm:        false,
  showPhotoAnnotator:   false,
  showPDFPreview:       false,
  showSettings:         false,
  settingsTab:          'general',
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
  themeColor: (() => {
    try {
      const saved = localStorage.getItem('sitepunch_theme_color')
      if (saved && saved !== '#1d4ed8') return saved
      return DEFAULT_THEME_COLOR
    } catch {
      return DEFAULT_THEME_COLOR
    }
  })(),
  appFont:     DEFAULT_FONT_ID,
  pinColor: (() => {
    try {
      const saved = localStorage.getItem('sitepunch_pin_color')
      if (saved && saved !== '#ef4444') return saved
      return DEFAULT_PIN_COLOR
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
  photoQuality: (() => {
    try {
      const saved = localStorage.getItem('sitepunch_photo_quality')
      if (saved === 'saver' || saved === 'balanced' || saved === 'original') return saved
      return 'balanced'
    } catch {
      return 'balanced'
    }
  })(),
  exportedPdfCount: getExportedPdfCount(),
  showChecklist: (() => {
    try {
      const saved = localStorage.getItem('sitepunch_show_checklist')
      return saved !== null ? saved === 'true' : true
    } catch {
      return true
    }
  })(),

  // ── Setters ───────────────────────────────────────────────
  setShowChecklist:          show => {
    set({ showChecklist: show })
    try {
      localStorage.setItem('sitepunch_show_checklist', String(show))
    } catch {}
  },
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

  openNewProject:    (opts) => set({
    showNewProject: true,
    newProjectReturnTo: opts?.returnTo === 'manage-projects' ? 'manage-projects' : null,
  }),
  closeNewProject:   () => set({ showNewProject: false, newProjectReturnTo: null }),

  openPunchForm:     (pin = null) => set({ showPunchForm: true,  pendingPin: pin }),
  closePunchForm:    ()           => set({ showPunchForm: false, pendingPin: null, currentPunchItemUuid: null }),

  openPhotoAnnotator:  () => set({ showPhotoAnnotator: true }),
  closePhotoAnnotator: () => set({ showPhotoAnnotator: false }),

  openPDFPreview:    () => set({ showPDFPreview: true }),
  closePDFPreview:   () => set({ showPDFPreview: false }),

  openSettings:    (opts) => set({
    showSettings: true,
    settingsTab: typeof opts === 'string' ? opts : (opts?.tab || 'general'),
  }),
  closeSettings:   () => set({ showSettings: false, settingsTab: 'general' }),

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
  setPhotoQuality: quality => {
    const valid = (quality === 'saver' || quality === 'balanced' || quality === 'original') ? quality : 'balanced'
    set({ photoQuality: valid })
    try {
      localStorage.setItem('sitepunch_photo_quality', valid)
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
  navigateToFloorPlan: (projectUuid, fpUuid, phaseUuid = undefined) => set(state => {
    // If called with only 1 argument (fpUuid), infer projectUuid from current state
    if (fpUuid === undefined && typeof projectUuid === 'string') {
      return {
        currentFloorPlanUuid: projectUuid,
        activeTab: 'floorplan'
      }
    }
    return {
      currentProjectUuid: projectUuid || state.currentProjectUuid,
      currentFloorPlanUuid: fpUuid,
      currentPhaseUuid: phaseUuid !== undefined ? phaseUuid : state.currentPhaseUuid,
      activeTab: 'floorplan'
    }
  }),
  navigateToDashboard: () => set({
    activeTab: 'dashboard',
    currentProjectUuid: null,
    currentPhaseUuid: null,
    currentFloorPlanUuid: null
  }),
  navigateToProjects: () => set({
    activeTab: 'projects',
    currentProjectUuid: null,
    currentPhaseUuid: null,
    currentFloorPlanUuid: null
  }),
}))
