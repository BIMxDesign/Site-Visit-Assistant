import React, { useEffect } from 'react'
import { useAppStore } from './store/useAppStore'
import { getSetting, setSetting } from './db/database'
import { DEFAULT_THEME_COLOR, DEFAULT_PIN_COLOR } from './utils/theme'
import Dashboard from './pages/Dashboard'
import ProjectsView from './pages/ProjectsView'
import ProjectDetail from './pages/ProjectDetail'
import FloorPlanView from './pages/FloorPlanView'
import NewProjectModal from './components/NewProjectModal'
import PunchItemForm from './components/PunchItemForm'
import SettingsModal from './components/SettingsModal'
import PDFPreview from './components/PDFPreview'
import PrivacyModal from './components/PrivacyModal'
import ConsentBanner from './components/ConsentBanner'
import AuthModal from './components/AuthModal'

export default function App() {
  const {
    activeTab,
    showNewProject,
    showPunchForm,
    showSettings,
    showPDFPreview,
    showPrivacyModal,
    showAuthModal,
    closeAuthModal,
    setCompanyName,
    setCompanyLogo,
    setThemeColor,
    setAppFont,
    setPinColor,
    setTimezone,
    setDateFormat,
  } = useAppStore()

  // Load persisted settings on mount
  useEffect(() => {
    async function load() {
      const name  = await getSetting('companyName', '')
      const logo  = await getSetting('companyLogo', null)
      let color = await getSetting('themeColor', DEFAULT_THEME_COLOR)
      if (!color || color === '#1d4ed8') {
        color = DEFAULT_THEME_COLOR
        await setSetting('themeColor', DEFAULT_THEME_COLOR)
      }
      const font  = await getSetting('appFont', 'sans')
      let pin   = await getSetting('pinColor', DEFAULT_PIN_COLOR)
      if (!pin || pin === '#ef4444') {
        pin = DEFAULT_PIN_COLOR
        await setSetting('pinColor', DEFAULT_PIN_COLOR)
      }
      const tz    = await getSetting('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago')
      const fmt   = await getSetting('dateFormat', 'YYYY-MM-DD')
      setCompanyName(name)
      setCompanyLogo(logo)
      setThemeColor(color)
      setAppFont(font)
      setPinColor(pin)
      setTimezone(tz)
      setDateFormat(fmt)
    }
    load()
  }, [])

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
      {/* WCAG 2.1 AA Accessibility: Skip to Main Content */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:text-brand-700 focus:font-bold focus:shadow-xl focus:rounded-xl focus:ring-2 focus:ring-brand-500"
      >
        Skip to main content
      </a>

      {/* Page router */}
      <div id="main-content" tabIndex="-1" className="flex-1 flex flex-col min-h-0 focus:outline-none">
        {activeTab === 'dashboard'  && <Dashboard />}
        {activeTab === 'projects'   && <ProjectsView />}
        {activeTab === 'project'    && <ProjectDetail />}
        {activeTab === 'floorplan'  && <FloorPlanView />}
      </div>

      {/* Global modals */}
      {showNewProject && <NewProjectModal />}
      {showPunchForm  && <PunchItemForm />}
      {showSettings   && <SettingsModal />}
      {showPDFPreview && <PDFPreview />}
      {showPrivacyModal && <PrivacyModal />}
      {showAuthModal && <AuthModal onClose={closeAuthModal} />}

      {/* Privacy & Cookie Consent Banner */}
      <ConsentBanner />
    </div>
  )
}
