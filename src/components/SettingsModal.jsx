import React, { useState, useEffect } from 'react'
import {
  ArrowLeft, Upload, Trash2, Check, Image as ImageIcon,
  AlertTriangle, Edit2, Info, Key, ShieldCheck, CheckCircle2,
  Smartphone, Palette, Type, Download, Shield, Plus, Lock, MapPin, Building2,
  User, LogOut, Calendar, Folder, FolderOpen, ClipboardList, AlertCircle, FileText,
  GitMerge, ChevronDown, ChevronUp, Layers, HelpCircle, CheckCircle, RefreshCw, Copy, Sparkles, X
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import {
  db, getSetting, setSetting, getAllProjects, deleteProject,
  exportProjectData, importProjectData, mergeProjectData, updateUserProfile
} from '../db/database'
import { Field, INPUT, Spinner } from './NewProjectModal'
import EditProjectModal from './EditProjectModal'
import LicenseActivationModal from './LicenseActivationModal'
import {
  getLicensedProjectUuids,
  getCachedLicenses
} from '../services/licenseService'
import { THEME_PRESETS, applyThemeColor, DEFAULT_THEME_COLOR, PIN_COLOR_PRESETS, applyPinColor, DEFAULT_PIN_COLOR } from '../utils/theme'
import { FONT_OPTIONS, applyAppFont, DEFAULT_FONT_ID } from '../utils/font'

export default function SettingsModal() {
  const {
    closeSettings,
    openNewProject,
    companyName,
    companyLogo,
    themeColor,
    appFont,
    pinColor,
    dateFormat,
    exportedPdfCount,
    setCompanyName,
    setCompanyLogo,
    setThemeColor,
    setAppFont,
    setPinColor,
    setDateFormat,
    currentProjectUuid,
    navigateToDashboard,
    openPrivacyModal,
    currentUser,
    setCurrentUser,
    openAuthModal,
    logout,
    showChecklist,
    setShowChecklist,
  } = useAppStore()

  const [name,          setName]          = useState(companyName)
  const [logo,          setLogo]          = useState(companyLogo)
  const [selectedColor, setSelectedColor] = useState(themeColor || DEFAULT_THEME_COLOR)
  const [savedActiveThemeColor, setSavedActiveThemeColor] = useState(themeColor || DEFAULT_THEME_COLOR)
  const [selectedFont,  setSelectedFont]  = useState(appFont || DEFAULT_FONT_ID)
  const [selectedPinColor, setSelectedPinColor] = useState(pinColor || DEFAULT_PIN_COLOR)
  const [savedActivePinColor, setSavedActivePinColor] = useState(pinColor || DEFAULT_PIN_COLOR)
  const [selectedDateFormat, setSelectedDateFormat] = useState(() => {
    try {
      return dateFormat || localStorage.getItem('sitepunch_date_format') || 'YYYY-MM-DD'
    } catch {
      return 'YYYY-MM-DD'
    }
  })
  const [saving,        setSaving]        = useState(false)
  const [saved,         setSaved]         = useState(false)
  const [projects,      setProjects]      = useState([])
  const [loadingPrj,    setLoadingPrj]    = useState(true)
  const [deletingId,    setDeletingId]    = useState(null)
  const [exportingId,   setExportingId]   = useState(null)
  const [importing,     setImporting]     = useState(false)
  const [merging,       setMerging]       = useState(false)
  const [mergeModalData, setMergeModalData] = useState(null)
  const [importConflictData, setImportConflictData] = useState(null)
  const [showImportNotes, setShowImportNotes] = useState(true)
  const [editingProject, setEditingProject] = useState(null)
  const [activeTab,     setActiveTab]     = useState('general') // 'general' | 'projects' | 'about'
  const [activatingProject, setActivatingProject] = useState(null)
  const [licensedProjectSet, setLicensedProjectSet] = useState(() => getLicensedProjectUuids())
  const [activeLicenses,   setActiveLicenses]   = useState(() => getCachedLicenses())

  function reloadLicenses() {
    setLicensedProjectSet(getLicensedProjectUuids())
    setActiveLicenses(getCachedLicenses())
  }

  // User profile states - separate First Name and Last Name
  const [firstName,    setFirstName]    = useState(() => {
    if (currentUser?.firstName) return currentUser.firstName
    if (currentUser?.name) {
      const parts = currentUser.name.trim().split(/\s+/)
      return parts[0] || ''
    }
    return ''
  })
  const [lastName,     setLastName]     = useState(() => {
    if (currentUser?.lastName) return currentUser.lastName
    if (currentUser?.name) {
      const parts = currentUser.name.trim().split(/\s+/)
      return parts.slice(1).join(' ') || ''
    }
    return ''
  })
  const [userOrg,      setUserOrg]      = useState(currentUser?.organization || companyName || '')
  const [userRole,     setUserRole]     = useState(currentUser?.role || 'Project Manager')
  const [userEmail,    setUserEmail]    = useState(currentUser?.email || '')

  useEffect(() => {
    async function loadSavedProfile() {
      if (currentUser) {
        if (currentUser.firstName || currentUser.lastName) {
          setFirstName(currentUser.firstName || '')
          setLastName(currentUser.lastName || '')
        } else if (currentUser.name) {
          const parts = currentUser.name.trim().split(/\s+/)
          setFirstName(parts[0] || '')
          setLastName(parts.slice(1).join(' ') || '')
        }
        setUserOrg(currentUser.organization || companyName || '')
        setUserRole(currentUser.role || 'Project Manager')
        setUserEmail(currentUser.email || '')
      } else {
        try {
          const uFirstName = await getSetting('userFirstName', '')
          const uLastName  = await getSetting('userLastName', '')
          const uName      = await getSetting('userName', '')
          if (uFirstName || uLastName) {
            setFirstName(uFirstName || '')
            setLastName(uLastName || '')
          } else if (uName) {
            const parts = uName.trim().split(/\s+/)
            setFirstName(parts[0] || '')
            setLastName(parts.slice(1).join(' ') || '')
          }
          const uOrg = await getSetting('userOrg', '')
          const uRole = await getSetting('userRole', '')
          const uEmail = await getSetting('userEmail', '')
          if (uOrg) setUserOrg(uOrg)
          else if (companyName) setUserOrg(companyName)
          if (uRole) setUserRole(uRole)
          if (uEmail) setUserEmail(uEmail)
        } catch {}
      }
    }
    loadSavedProfile()
  }, [currentUser, companyName])

  // Load project list with report count and stats
  async function loadProjects() {
    setLoadingPrj(true)
    try {
      const [all, allPhases, allFps, allItems] = await Promise.all([
        getAllProjects(),
        db.phases.toArray().catch(() => []),
        db.floorPlans.toArray().catch(() => []),
        db.punchItems.toArray().catch(() => []),
      ])
      const enhanced = all.map(p => {
        const projPhases = allPhases.filter(ph => ph.projectUuid === p.uuid)
        const projFps = allFps.filter(fp => fp.projectUuid === p.uuid)
        const projFpUuids = new Set(projFps.map(f => f.uuid))
        const projItems = allItems.filter(it => it.projectUuid === p.uuid || projFpUuids.has(it.floorPlanUuid))
        const reportCount = projPhases.length > 0 ? projPhases.length : (projFps.length > 0 ? 1 : 0)
        return {
          ...p,
          reportCount,
          totalItems: projItems.length > 0 ? projItems.length : (p.totalItems || 0),
        }
      })
      setProjects(enhanced)
      reloadLicenses()
    } catch (err) {
      console.error('Failed to load projects:', err)
    } finally {
      setLoadingPrj(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'projects' || activeTab === 'about') {
      loadProjects()
    }
  }, [activeTab])

  // Sync state if store updates
  useEffect(() => {
    setName(companyName)
    setLogo(companyLogo)
    setSelectedColor(themeColor || DEFAULT_THEME_COLOR)
    setSavedActiveThemeColor(themeColor || DEFAULT_THEME_COLOR)
    setSelectedFont(appFont || DEFAULT_FONT_ID)
    setSelectedPinColor(pinColor || DEFAULT_PIN_COLOR)
    setSavedActivePinColor(pinColor || DEFAULT_PIN_COLOR)
  }, [companyName, companyLogo, themeColor, appFont, pinColor])

  // Preserve saved active theme on modal unmount
  useEffect(() => {
    return () => {
      applyThemeColor(themeColor || DEFAULT_THEME_COLOR)
    }
  }, [themeColor])

  // Logo upload handler
  function handleLogoUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      alert('Logo file size must be less than 2MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = ev => setLogo(ev.target.result)
    reader.readAsDataURL(file)
  }

  function handleColorSelect(hex) {
    setSelectedColor(hex)
    // Do not apply to whole website until settings are saved; preview is limited to sample accent badge
  }

  function handlePinColorSelect(hex) {
    setSelectedPinColor(hex)
    applyPinColor(hex)
  }

  function handleFontSelect(fontId) {
    setSelectedFont(fontId)
    applyAppFont(fontId)
  }

  // Save general organization settings
  async function handleSave() {
    setSaving(true)
    setSaved(false)
    try {
      const orgName = name.trim()
      const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ')

      await Promise.all([
        setSetting('companyName',   orgName),
        setSetting('companyLogo',   logo),
        setSetting('themeColor',    selectedColor),
        setSetting('appFont',       selectedFont),
        setSetting('pinColor',      selectedPinColor),
        setSetting('dateFormat',    selectedDateFormat),
        setSetting('userFirstName', firstName.trim()),
        setSetting('userLastName',  lastName.trim()),
        setSetting('userName',      fullName),
        setSetting('userRole',      userRole.trim()),
        setSetting('userEmail',     userEmail.trim()),
        setSetting('userProfile', {
          firstName:    firstName.trim(),
          lastName:     lastName.trim(),
          name:         fullName,
          organization: orgName,
          role:         userRole.trim(),
          email:        userEmail.trim(),
        }),
      ])
      if (orgName) setCompanyName(orgName)
      setCompanyLogo(logo)
      setThemeColor(selectedColor)
      setAppFont(selectedFont)
      setPinColor(selectedPinColor)
      setDateFormat(selectedDateFormat)
      setSavedActiveThemeColor(selectedColor)
      setSavedActivePinColor(selectedPinColor)
      applyThemeColor(selectedColor)
      applyAppFont(selectedFont)
      applyPinColor(selectedPinColor)
      setCurrentUser({
        ...(currentUser || {}),
        firstName:    firstName.trim(),
        lastName:     lastName.trim(),
        name:         fullName,
        organization: orgName,
        role:         userRole.trim(),
        email:        userEmail.trim(),
      })
      try {
        localStorage.setItem('sitepunch_date_format', selectedDateFormat)
      } catch {}

      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      console.error('Failed to save settings:', err)
      alert('Failed to save settings. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // Delete project confirmation
  async function handleDeleteProject(p) {
    if (!window.confirm(`Delete project "${p.name}"?\n\nThis will permanently remove the project, all its observation reports, key plans, and photos from this device.`)) {
      return
    }
    setDeletingId(p.uuid)
    try {
      await deleteProject(p.uuid)
      await loadProjects()
      if (currentProjectUuid === p.uuid) {
        navigateToDashboard()
      }
    } catch (err) {
      console.error('Failed to delete project:', err)
      alert('Failed to delete project. Please try again.')
    } finally {
      setDeletingId(null)
    }
  }

  // Export full project to JSON file
  async function handleExportProject(p) {
    setExportingId(p.uuid)
    try {
      const data = await exportProjectData(p.uuid)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const sanitized = (p.name || 'project').replace(/[^a-z0-9_-]/gi, '_')
      a.href = url
      a.download = `${sanitized}-backup-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to export project:', err)
      alert('Failed to export project. Please try again.')
    } finally {
      setExportingId(null)
    }
  }

  // Import project from JSON file
  async function handleImportProject(e) {
    const file = e.target.files[0]
    if (!file) return
    e.target.value = ''
    setImporting(true)
    try {
      const text = await file.text()
      const data = JSON.parse(text)

      if (!data || !data.project || !data.project.name) {
        alert('Invalid project backup file format.')
        setImporting(false)
        return
      }

      // Check if project UUID or name already exists
      const existing = (await db.projects.where('uuid').equals(data.project.uuid).first()) ||
                       (await db.projects.filter(p => p.name && data.project.name && p.name.trim().toLowerCase() === data.project.name.trim().toLowerCase()).first())

      if (existing) {
        setImporting(false)
        setImportConflictData({
          fileData: data,
          fileName: file.name,
          existingProject: existing
        })
        return
      }

      await executeImport(data, false)
    } catch (err) {
      console.error('Failed to import project:', err)
      alert(`Import failed: ${err.message || 'Unknown error'}`)
      setImporting(false)
    }
  }

  // Execute import as fresh or as duplicate copy
  async function executeImport(data, asNewCopy) {
    setImporting(true)
    try {
      const importedProj = await importProjectData(data, null, asNewCopy)
      await loadProjects()
      reloadLicenses()
      setImportConflictData(null)
      alert(
        `Project "${importedProj.name}" successfully imported!\n\n` +
        `• ${data.phases?.length || 0} Reports\n` +
        `• ${data.floorPlans?.length || 0} Key Plans\n` +
        `• ${data.items?.length || 0} Punch Items\n` +
        (importedProj.isLicensed ? `• License Preserved (Exports Unlocked)` : '')
      )
    } catch (err) {
      console.error('Import execution failed:', err)
      alert(`Import failed: ${err.message || 'Unknown error'}`)
    } finally {
      setImporting(false)
    }
  }

  // Initiate project merge from JSON file
  async function handleInitiateMerge(e, preselectedTargetUuid = null) {
    const file = e.target.files[0]
    if (!file) return
    e.target.value = ''
    try {
      const text = await file.text()
      const data = JSON.parse(text)

      if (!data || !data.project || !data.project.name) {
        alert('Invalid project backup file format.')
        return
      }

      if (projects.length === 0) {
        alert('No existing projects found to merge into. Please use "Import Project" instead.')
        return
      }

      // Auto-detect matching project by UUID or matching name
      let targetUuid = preselectedTargetUuid
      if (!targetUuid) {
        const matching = projects.find(
          p => p.uuid === data.project.uuid ||
               (p.name && data.project.name && p.name.trim().toLowerCase() === data.project.name.trim().toLowerCase())
        )
        targetUuid = matching ? matching.uuid : (currentProjectUuid || projects[0]?.uuid || null)
      }

      setMergeModalData({
        fileData: data,
        fileName: file.name,
        targetProjectUuid: targetUuid
      })
    } catch (err) {
      console.error('Failed to parse file for merging:', err)
      alert(`Could not read project file: ${err.message || 'Invalid format'}`)
    }
  }

  // Execute project merge
  async function handleConfirmMerge(targetUuid, fileData) {
    if (!targetUuid || !fileData) return
    setMerging(true)
    try {
      const stats = await mergeProjectData(targetUuid, fileData)
      await loadProjects()
      reloadLicenses()
      setMergeModalData(null)
      setImportConflictData(null)
      alert(
        `Project "${stats.targetProjectName}" merged successfully!\n\n` +
        `• Reports: ${stats.reportsAdded} added (${stats.reportsMatched} merged)\n` +
        `• Key Plans: ${stats.keyPlansAdded} added (${stats.keyPlansMatched} preserved)\n` +
        `• Observations: ${stats.itemsAdded} new pins added, ${stats.itemsUpdated} updated\n` +
        `• Photos: ${stats.photosAdded} photos merged\n` +
        (stats.licensePreserved ? `• Unlimited Export License Preserved\n` : '')
      )
    } catch (err) {
      console.error('Merge failed:', err)
      alert(`Merge failed: ${err.message || 'Unknown error'}`)
    } finally {
      setMerging(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col h-full w-full overflow-hidden select-none">
      {/* Header */}
      <header
        className="sitepunch-header bg-brand-800 text-white shadow-lg flex-shrink-0"
        style={{
          background: 'var(--brand-header, #1e40af)',
          paddingTop: 'calc(14px + env(safe-area-inset-top, 0px))',
          paddingBottom: '14px',
          paddingLeft: 'calc(1rem + env(safe-area-inset-left, 0px))',
          paddingRight: 'calc(1rem + env(safe-area-inset-right, 0px))',
        }}
      >
        <div className="flex items-center justify-between min-h-[46px] max-w-4xl mx-auto w-full">
          <div className="flex items-center gap-3">
            <button
              onClick={closeSettings}
              className="liquid-glass-btn min-w-[40px] min-h-[40px] p-2 -ml-1 rounded-xl text-white transition-all flex items-center justify-center flex-shrink-0 cursor-pointer"
              aria-label="Back"
              title="Back"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex flex-col justify-center">
              <h1 className="text-xl font-bold tracking-tight leading-tight">Settings</h1>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div
        className="bg-white border-b border-gray-200 px-4 flex-shrink-0 overflow-x-auto scrollbar-hide"
        style={{
          paddingLeft: 'calc(1rem + env(safe-area-inset-left, 0px))',
          paddingRight: 'calc(1rem + env(safe-area-inset-right, 0px))',
        }}
      >
        <div className="max-w-4xl mx-auto flex gap-6 text-sm font-semibold flex-nowrap min-w-max">
          <button
            onClick={() => setActiveTab('general')}
            className={`py-3.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'general'
                ? 'border-brand-700 text-brand-700 font-bold'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            style={activeTab === 'general' ? { borderColor: 'var(--brand-button, #1d4ed8)', color: 'var(--brand-button, #1d4ed8)' } : {}}
          >
            Organization
          </button>
          <button
            onClick={() => setActiveTab('projects')}
            className={`py-3.5 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'projects'
                ? 'border-brand-700 text-brand-700 font-bold'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            style={activeTab === 'projects' ? { borderColor: 'var(--brand-button, #1d4ed8)', color: 'var(--brand-button, #1d4ed8)' } : {}}
          >
            <span>Manage Projects</span>
            {projects.length > 0 && (
              <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full font-bold">
                {projects.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('about')}
            className={`py-3.5 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'about'
                ? 'border-brand-700 text-brand-700 font-bold'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            style={activeTab === 'about' ? { borderColor: 'var(--brand-button, #1d4ed8)', color: 'var(--brand-button, #1d4ed8)' } : {}}
          >
            <span>About</span>
          </button>
        </div>
      </div>

      {/* Main Content Body */}
      <main
        className="flex-1 overflow-y-auto p-4 sm:p-6 pb-28"
        style={{
          paddingLeft: 'calc(1rem + env(safe-area-inset-left, 0px))',
          paddingRight: 'calc(1rem + env(safe-area-inset-right, 0px))',
        }}
      >
        {/* TAB 1: General Organization Settings */}
        {activeTab === 'general' && (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* User Information Card */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-gray-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100 flex-wrap gap-2">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-xs"
                    style={{ background: savedActiveThemeColor }}
                  >
                    <User size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">User Information</h3>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {/* Row 1: First Name & Last Name */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
                      First Name
                    </label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={e => setFirstName(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm bg-white font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-xs"
                      placeholder="e.g. Ankit"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
                      Last Name
                    </label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={e => setLastName(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm bg-white font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-xs"
                      placeholder="e.g. Darda"
                    />
                  </div>
                </div>

                {/* Row 2: Title & Email */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
                      Title
                    </label>
                    <input
                      type="text"
                      value={userRole}
                      onChange={e => setUserRole(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm bg-white font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-xs"
                      placeholder="e.g. Architect, Inspector"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
                      Email
                    </label>
                    <input
                      type="email"
                      value={userEmail}
                      onChange={e => setUserEmail(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm bg-white font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-xs"
                      placeholder="e.g. ankit@example.com"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Unified Branding & Visual Styling Group */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-gray-200 shadow-sm space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100 flex-wrap gap-2">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-xs"
                    style={{ background: savedActiveThemeColor }}
                  >
                    <Palette size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">Branding &amp; Visual Styling</h3>
                  </div>
                </div>
              </div>

              {/* 1. Organization Identity */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Building2 size={14} className="text-gray-400" />
                  <span>Organization Identity</span>
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                  <Field label="Organization Name">
                    <input
                      className={INPUT}
                      placeholder="e.g. Acme Architecture &amp; Construction"
                      value={name}
                      onChange={e => setName(e.target.value)}
                    />
                  </Field>

                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
                      Organization Logo
                    </label>
                    <div className="flex items-center gap-3">
                      {logo ? (
                        <div className="relative w-14 h-14 rounded-xl border border-gray-200 bg-gray-50 p-1 flex items-center justify-center flex-shrink-0 shadow-2xs">
                          <img src={logo} alt="Company Logo" className="max-w-full max-h-full object-contain rounded-lg" />
                          <button
                            type="button"
                            onClick={() => setLogo(null)}
                            className="absolute -top-1.5 -right-1.5 bg-red-600 text-white rounded-full p-0.5 hover:bg-red-700 shadow-xs"
                            title="Remove logo"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ) : (
                        <div className="w-14 h-14 rounded-xl border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center text-gray-400 flex-shrink-0">
                          <ImageIcon size={22} />
                        </div>
                      )}
                      <label className="cursor-pointer px-3.5 py-2 border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-2xs transition-colors">
                        <Upload size={14} />
                        <span>{logo ? 'Replace Logo' : 'Upload Logo'}</span>
                        <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2 & 3. Theme Accent Color & Key Plan Pin Color (Side by Side) */}
              <div className="pt-2 border-t border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Theme Accent Color */}
                <div className="space-y-3 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide flex items-center gap-1.5">
                      <Palette size={14} className="text-gray-400" />
                      <span>Theme Accent Color</span>
                    </h4>
                    <div className="flex items-center gap-1.5 text-xs text-gray-600 font-semibold">
                      <span className="text-[11px] text-gray-400">Sample:</span>
                      <div
                        className="px-2.5 py-0.5 rounded-full text-white text-[10px] font-bold shadow-xs"
                        style={{ background: selectedColor }}
                      >
                        Accent
                      </div>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                      Select Theme Color
                    </label>
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 w-full">
                      <label
                        className="relative w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-xs border border-gray-200 cursor-pointer overflow-hidden transition-transform active:scale-95 hover:border-gray-400"
                        style={{ background: selectedColor }}
                        title="Click to pick custom theme color"
                      >
                        <input
                          type="color"
                          value={selectedColor}
                          onChange={e => handleColorSelect(e.target.value)}
                          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                        />
                        <Check size={16} className="text-white drop-shadow-sm pointer-events-none" />
                      </label>
                      <select
                        value={
                          THEME_PRESETS.some(p => p.hex.toLowerCase() === selectedColor.toLowerCase())
                            ? selectedColor.toLowerCase()
                            : 'custom'
                        }
                        onChange={e => {
                          const val = e.target.value
                          if (val !== 'custom') {
                            handleColorSelect(val)
                          }
                        }}
                        className="flex-1 min-w-0 w-full truncate border border-gray-200 rounded-xl px-3 sm:px-3.5 py-2.5 text-xs sm:text-sm bg-white font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-xs cursor-pointer"
                      >
                        {THEME_PRESETS.map(preset => (
                          <option key={preset.id} value={preset.hex.toLowerCase()}>
                            {preset.name} ({preset.hex})
                          </option>
                        ))}
                        <option value="custom">Custom Color ({selectedColor})</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Key Plan Pin Color */}
                <div className="space-y-3 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide flex items-center gap-1.5">
                      <MapPin size={14} className="text-gray-400" />
                      <span>Key Plan Pin Color</span>
                    </h4>
                    <div className="flex items-center gap-1.5 text-xs text-gray-600 font-semibold">
                      <span className="text-[11px] text-gray-400">Sample:</span>
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-xs border border-white"
                        style={{ background: selectedPinColor }}
                      >
                        1
                      </div>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                      Select Pin Color
                    </label>
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 w-full">
                      <label
                        className="relative w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-xs border border-gray-200 cursor-pointer overflow-hidden transition-transform active:scale-95 hover:border-gray-400"
                        style={{ background: selectedPinColor }}
                        title="Click to pick custom pin color"
                      >
                        <input
                          type="color"
                          value={selectedPinColor}
                          onChange={e => handlePinColorSelect(e.target.value)}
                          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                        />
                        <span className="text-white font-black text-sm drop-shadow-sm pointer-events-none">#1</span>
                      </label>
                      <select
                        value={
                          PIN_COLOR_PRESETS.some(p => p.hex.toLowerCase() === selectedPinColor.toLowerCase())
                            ? selectedPinColor.toLowerCase()
                            : 'custom'
                        }
                        onChange={e => {
                          const val = e.target.value
                          if (val !== 'custom') {
                            handlePinColorSelect(val)
                          }
                        }}
                        className="flex-1 min-w-0 w-full truncate border border-gray-200 rounded-xl px-3 sm:px-3.5 py-2.5 text-xs sm:text-sm bg-white font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-xs cursor-pointer"
                      >
                        {PIN_COLOR_PRESETS.map(preset => (
                          <option key={preset.id} value={preset.hex.toLowerCase()}>
                            {preset.name} ({preset.hex})
                          </option>
                        ))}
                        <option value="custom">Custom Color ({selectedPinColor})</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* 4. Text Font Style & Date Format Inline */}
              <div className="pt-2 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                    <Type size={14} className="text-gray-400" />
                    <span>Text Font Style</span>
                  </label>
                  <select
                    value={selectedFont}
                    onChange={e => handleFontSelect(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm bg-white font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-xs cursor-pointer"
                  >
                    {FONT_OPTIONS.map(font => (
                      <option key={font.id} value={font.id}>
                        {font.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                    <Calendar size={14} className="text-gray-400" />
                    <span>Date Format</span>
                  </label>
                  <select
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm bg-white font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-xs cursor-pointer"
                    value={selectedDateFormat}
                    onChange={e => setSelectedDateFormat(e.target.value)}
                  >
                    <option value="YYYY-MM-DD">YYYY-MM-DD (e.g. 2026-11-09)</option>
                    <option value="MM/DD/YYYY">MM/DD/YYYY (e.g. 11/09/2026)</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY (e.g. 09/11/2026)</option>
                    <option value="MMM D, YYYY">MMM D, YYYY (e.g. Nov 9, 2026)</option>
                    <option value="D MMM YYYY">D MMM YYYY (e.g. 9 Nov 2026)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Manage Projects */}
        {activeTab === 'projects' && (
          <div className="max-w-4xl mx-auto space-y-4">
            {/* Quick Stats Banner - Styled matching front page */}
            {projects.length > 0 && (
              <div className="liquid-glass-surface rounded-2xl p-3 sm:p-4 shadow-sm">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
                  <div className="p-2.5 sm:p-3 bg-white/60 backdrop-blur-md rounded-xl border border-white/80 text-center shadow-2xs">
                    <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500 font-semibold">
                      <Folder size={14} className="text-amber-600 fill-amber-400/25 stroke-[2.2]" />
                      <span className="truncate">Projects</span>
                    </div>
                    <p className="text-lg sm:text-2xl font-bold text-gray-900 mt-1">{projects.length}</p>
                  </div>

                  <div className="p-2.5 sm:p-3 bg-white/60 backdrop-blur-md rounded-xl border border-white/80 text-center shadow-2xs">
                    <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500 font-semibold">
                      <ClipboardList size={14} className="text-purple-700 stroke-[2.2]" />
                      <span className="truncate">Reports</span>
                    </div>
                    <p className="text-lg sm:text-2xl font-bold text-gray-900 mt-1">
                      {projects.reduce((acc, p) => acc + (p.reportCount || 0), 0)}
                    </p>
                  </div>

                  <div className="p-2.5 sm:p-3 bg-white/60 backdrop-blur-md rounded-xl border border-white/80 text-center shadow-2xs">
                    <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500 font-semibold">
                      <AlertCircle size={14} className="stroke-[2.2]" style={{ color: 'var(--punch-pin-color, #a40e26)' }} />
                      <span className="truncate">Observations</span>
                    </div>
                    <p className="text-lg sm:text-2xl font-bold text-gray-900 mt-1">
                      {projects.reduce((acc, p) => acc + (p.totalItems || 0), 0)}
                    </p>
                  </div>

                  <div className="p-2.5 sm:p-3 bg-white/60 backdrop-blur-md rounded-xl border border-white/80 text-center shadow-2xs">
                    <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500 font-semibold">
                      <FileText size={14} className="text-purple-600 stroke-[2.2]" />
                      <span className="truncate">PDF Exports</span>
                    </div>
                    <p className="text-lg sm:text-2xl font-bold text-gray-900 mt-1">
                      {exportedPdfCount || 0}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Stored Projects Header & Action Buttons */}
            <div className="flex items-center justify-between flex-wrap gap-3 pt-1">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Stored Projects ({projects.length})</h3>
                <p className="text-xs text-gray-400">
                  Export, import, merge, or activate licenses for projects
                </p>
              </div>

              {/* Action Buttons: Import & New Project */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Import Project Button */}
                <label
                  className="cursor-pointer px-3.5 py-2 bg-brand-700 hover:bg-brand-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
                  style={{ background: 'var(--brand-button, #a40e26)' }}
                >
                  {importing ? <Spinner /> : <Download size={14} />}
                  <span>Import Project</span>
                  <input
                    type="file"
                    accept=".json"
                    className="hidden"
                    disabled={importing || merging}
                    onChange={handleImportProject}
                  />
                </label>

                {/* New Project Button */}
                <button
                  type="button"
                  onClick={() => {
                    closeSettings()
                    openNewProject()
                  }}
                  className="cursor-pointer px-3.5 py-2 bg-brand-700 hover:bg-brand-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
                  style={{ background: 'var(--brand-button, #a40e26)' }}
                  title="Create a new project"
                >
                  <Plus size={14} />
                  <span>New Project</span>
                </button>
              </div>
            </div>

            {loadingPrj ? (
              <div className="flex justify-center py-12">
                <div className="w-7 h-7 border-3 border-brand-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : projects.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-xs">
                No projects found on this device.
              </div>
            ) : (
              <div className="space-y-3">
                {projects.map(p => {
                  const isCurrent = currentProjectUuid === p.uuid
                  const isDeleting = deletingId === p.uuid
                  const isExporting = exportingId === p.uuid
                  const isProjectUnlocked = p.isLicensed || Boolean(p.licenseKey) || licensedProjectSet.has(p.uuid)
                  const isClosed = p.status === 'Closed'

                  return (
                    <div
                      key={p.uuid}
                      className={`p-3.5 sm:p-4.5 rounded-2xl border border-l-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all duration-200 overflow-hidden ${
                        isClosed
                          ? 'bg-white/80 border-gray-200/90 opacity-80 border-l-gray-400 shadow-xs'
                          : 'hover:-translate-y-0.5'
                      }`}
                      style={
                        !isClosed
                          ? {
                              borderLeftColor: '#f59e0b',
                              borderColor: 'rgba(251, 191, 36, 0.45)',
                              background: 'linear-gradient(135deg, rgba(255, 251, 235, 0.9) 0%, #ffffff 45%, rgba(254, 243, 199, 0.75) 100%)',
                              boxShadow: '0 4px 18px -2px rgba(245, 158, 11, 0.14), 0 2px 6px rgba(0, 0, 0, 0.04)',
                            }
                          : {}
                      }
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <div
                            className={`w-7 h-7 rounded-lg border flex items-center justify-center flex-shrink-0 shadow-2xs ${
                              isClosed
                                ? 'bg-gray-100 border-gray-200 text-gray-500'
                                : 'bg-amber-50 border-amber-200/70 text-amber-600'
                            }`}
                          >
                            <Folder size={15} className={isClosed ? 'stroke-[2.2]' : 'fill-amber-400/25 stroke-[2.2]'} />
                          </div>
                          <p className={`text-sm font-bold truncate ${isClosed ? 'text-gray-700' : 'text-gray-900'}`}>
                            {p.name}
                          </p>
                          {isCurrent && (
                            <span className="text-[10px] bg-brand-700 text-white font-semibold px-2 py-0.5 rounded-full flex-shrink-0">
                              Active Project
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500 mt-1.5 ml-9.5 flex-wrap">
                          {p.number && (
                            <>
                              <span className="font-mono">#{p.number}</span>
                              <span>•</span>
                            </>
                          )}
                          <span>
                            {p.reportCount != null
                              ? `${p.reportCount} ${p.reportCount === 1 ? 'report' : 'reports'}`
                              : '0 reports'}
                          </span>
                          <span>•</span>
                          <span
                            className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border shadow-2xs transition-colors"
                            style={
                              isClosed
                                ? {
                                    background: '#f1f5f9',
                                    color: '#475569',
                                    borderColor: '#cbd5e1',
                                  }
                                : {
                                    background: '#fef3c7',
                                    color: '#92400e',
                                    borderColor: '#fde68a',
                                  }
                            }
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${isClosed ? 'bg-gray-400' : 'bg-amber-500'}`} />
                            {p.status || 'Active'}
                          </span>
                        </div>
                      </div>

                      {/* Actions Container: cleanly separated on mobile, aligned right */}
                      <div className="flex items-center justify-end gap-2 pt-2.5 sm:pt-0 border-t border-amber-200/40 sm:border-0 flex-wrap sm:flex-nowrap">
                        {/* License Status / Activate Key Button (aligned right on mobile) */}
                        <div className="flex-shrink-0 ml-auto sm:ml-0">
                          {isProjectUnlocked ? (
                            <span className="px-2.5 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold rounded-xl flex items-center gap-1.5 whitespace-nowrap shadow-2xs">
                              <CheckCircle2 size={13} className="text-emerald-600 flex-shrink-0" />
                              <span>Export Unlocked</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setActivatingProject(p)}
                              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 active:scale-95 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-sm cursor-pointer whitespace-nowrap"
                              title={`Activate WordPress license key for ${p.name}`}
                            >
                              <Key size={13} className="text-white flex-shrink-0" />
                              <span>Activate License</span>
                            </button>
                          )}
                        </div>

                        {/* Export, Merge, Edit, Delete Buttons */}
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => handleExportProject(p)}
                            disabled={isExporting}
                            className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-brand-700 text-xs font-semibold rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                            title="Export project data, key plans, and photos to JSON"
                          >
                            {isExporting ? (
                              <div className="w-3.5 h-3.5 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Upload size={13} />
                            )}
                            <span>Export</span>
                          </button>
                          <label
                            className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                            title={`Merge an external backup into ${p.name}`}
                          >
                            <GitMerge size={13} />
                            <span>Merge</span>
                            <input
                              type="file"
                              accept=".json"
                              className="hidden"
                              disabled={merging}
                              onChange={(e) => handleInitiateMerge(e, p.uuid)}
                            />
                          </label>
                          <button
                            onClick={() => setEditingProject(p)}
                            className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                            title="Edit project details"
                          >
                            <Edit2 size={13} />
                            <span>Edit</span>
                          </button>
                          <button
                            onClick={() => handleDeleteProject(p)}
                            disabled={isDeleting}
                            className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                            title="Delete project from device"
                          >
                            {isDeleting ? (
                              <div className="w-3.5 h-3.5 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Trash2 size={13} />
                            )}
                            <span>Delete</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Project Import & Merge Guidelines & Conditions Card (Below Stored Projects Cards) */}
            <div className="bg-gradient-to-br from-blue-50/80 via-white to-indigo-50/60 rounded-2xl border border-blue-200/80 p-4 sm:p-5 shadow-2xs space-y-3.5 mt-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-brand-600 text-white rounded-xl shadow-xs flex-shrink-0">
                    <Info size={17} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gray-900 leading-tight">
                      Project Import &amp; Merge Guidelines
                    </h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Conditions, duplicate handling, and conflict resolution rules
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowImportNotes(!showImportNotes)}
                  className="px-2.5 py-1 text-xs font-semibold text-brand-700 hover:text-brand-800 bg-white hover:bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <span>{showImportNotes ? 'Hide Guidelines' : 'Show Guidelines'}</span>
                  {showImportNotes ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>

              {showImportNotes && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1 text-xs text-gray-600">
                  {/* Card 1: Import Conditions */}
                  <div className="bg-white/90 backdrop-blur-xs p-3.5 sm:p-4 rounded-xl border border-blue-100 shadow-2xs space-y-2.5">
                    <div className="flex items-center gap-2 text-brand-800 font-bold text-xs pb-1.5 border-b border-gray-100">
                      <Download size={15} className="text-brand-600 flex-shrink-0" />
                      <span>Project Import Conditions &amp; Behavior</span>
                    </div>

                    <ul className="space-y-2 text-[11px] leading-relaxed">
                      <li className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand-500 mt-1.5 flex-shrink-0" />
                        <span>
                          <strong className="text-gray-900 font-semibold">Fresh Project Import:</strong> If the project does not exist on this device, it imports as a complete standalone project with all inspection reports, key plans, observation pins, photos, and license status intact.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand-500 mt-1.5 flex-shrink-0" />
                        <span>
                          <strong className="text-gray-900 font-semibold">Duplicate Project Handling:</strong> If a project with the same name or internal ID already exists, SitePunch prompts you with three safe options:
                        </span>
                      </li>
                      <div className="ml-3.5 pl-2 border-l-2 border-blue-200 space-y-1.5 text-[11px] text-gray-500">
                        <p><strong className="text-emerald-700">1. Merge with Existing:</strong> Non-destructively unites reports, drawings, pins, and photos into the local project.</p>
                        <p><strong className="text-blue-700">2. Import as Copy:</strong> Creates a separate duplicate named <em>[Name] (Imported)</em> so original data is untouched.</p>
                        <p><strong className="text-amber-700">3. Overwrite / Replace:</strong> Replaces local project with the file backup (ideal for full device restore).</p>
                      </div>
                      <li className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand-500 mt-1.5 flex-shrink-0" />
                        <span>
                          <strong className="text-gray-900 font-semibold">Security &amp; License Retention:</strong> Input data is sanitized against XSS script attacks. Active WordPress project licenses transfer automatically with the file without repurchase.
                        </span>
                      </li>
                    </ul>
                  </div>

                  {/* Card 2: Merge Conditions */}
                  <div className="bg-white/90 backdrop-blur-xs p-3.5 sm:p-4 rounded-xl border border-emerald-100 shadow-2xs space-y-2.5">
                    <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs pb-1.5 border-b border-gray-100">
                      <GitMerge size={15} className="text-emerald-600 flex-shrink-0" />
                      <span>Project Merge Conditions &amp; Conflict Rules</span>
                    </div>

                    <ul className="space-y-2 text-[11px] leading-relaxed">
                      <li className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0" />
                        <span>
                          <strong className="text-gray-900 font-semibold">Project Matching:</strong> Merges an incoming backup into the selected local project by matching name or internal ID.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0" />
                        <span>
                          <strong className="text-gray-900 font-semibold">Inspection Reports &amp; Key Plans:</strong> Reports with matching titles combine observations; new reports are appended in sequence. Existing drawings are preserved while new drawings are added.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0" />
                        <span>
                          <strong className="text-gray-900 font-semibold">Observations &amp; Pins:</strong> Unique observations are appended as new pins. Matching pins update only newer notes/status. All pins automatically resequence continuously (<em>#1, #2, #3...</em>) drawing-by-drawing.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0" />
                        <span>
                          <strong className="text-gray-900 font-semibold">Photos &amp; License Preservation:</strong> Unique annotated photos are consolidated under each pin, with duplicate photos skipped. If either version is licensed, the merged project remains fully unlocked for unlimited exports.
                        </span>
                      </li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: About & Licenses */}
        {activeTab === 'about' && (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* WordPress License System Overview */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-brand-50 text-brand-700 rounded-xl">
                    <Key size={20} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gray-900">Project License System</h4>
                    <p className="text-xs text-gray-400">One-time license key per project via WordPress Store</p>
                  </div>
                </div>
                <span className="text-xs font-bold px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  LMFWC Ready
                </span>
              </div>

              {/* Architecture Info Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">License Model</p>
                  <p className="font-bold text-gray-800 text-base mt-0.5">Per-Project Lifetime License</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Each license unlocks unlimited PDF &amp; CSV report exports for that specific project. No subscription or device fees.
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Device Portability</p>
                  <p className="font-bold text-emerald-700 text-base mt-0.5">100% Offline &amp; Portable</p>
                  <p className="text-xs text-emerald-600 font-medium mt-1">
                    When you export and import the project onto your iPad, iPhone, or PC, the license transfers automatically.
                  </p>
                </div>
              </div>

              {/* Active Licenses List */}
              <div className="space-y-2 pt-2 border-t border-gray-150">
                <div className="flex items-center justify-between">
                  <h5 className="font-bold text-gray-800 text-xs uppercase tracking-wide">
                    Active Project Licenses on this Device ({activeLicenses.length})
                  </h5>
                </div>

                {activeLicenses.length === 0 ? (
                  <div className="p-4 bg-gray-50 border border-dashed border-gray-200 rounded-xl text-center text-xs text-gray-500">
                    No license keys activated on this device yet. Enter your license key on any project card in the Manage Projects tab to unlock full report exports.
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden bg-gray-50/50">
                    {activeLicenses.map((lic, idx) => (
                      <div key={idx} className="p-3.5 text-xs flex items-center justify-between gap-3 hover:bg-white transition-colors">
                        <div className="space-y-0.5">
                          <p className="font-bold text-gray-900">{lic.projectName || 'Site Project'}</p>
                          <p className="text-[11px] text-brand-700 font-mono font-semibold">
                            Key: {lic.licenseKey}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            Active
                          </span>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {lic.activatedAt ? new Date(lic.activatedAt).toLocaleDateString() : 'Activated'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Getting Started Checklist Card */}
            <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 shadow-sm">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className="p-2 rounded-xl text-white shadow-2xs"
                    style={{ background: 'var(--brand-button, #a40e26)' }}
                  >
                    <Sparkles size={18} />
                  </div>
                  <h4 className="text-sm font-bold text-gray-900">Getting Started Checklist</h4>
                </div>

                <button
                  type="button"
                  onClick={() => setShowChecklist(!showChecklist)}
                  className="sitepunch-btn-primary px-4 py-2 rounded-xl text-xs font-bold text-white shadow-xs flex items-center justify-center gap-1.5 cursor-pointer flex-shrink-0 transition-all hover:opacity-95"
                  style={{ background: 'var(--brand-button, #a40e26)' }}
                >
                  {showChecklist ? (
                    <>
                      <X size={14} />
                      <span>Hide Checklist</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} />
                      <span>Reveal Checklist</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* About Card */}
            <div className="bg-brand-900 text-white rounded-2xl p-6 shadow-md relative overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-base font-bold tracking-tight">Site Visit Assistant</h4>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-brand-200">
                  v2.6.0
                </span>
              </div>
              <p className="text-xs text-brand-100 leading-relaxed max-w-xl">
                Simply on-site reports for Architects and Contractors. Modern offline-first Progressive Web Application designed to pin observations, mark up photos with drawing tools, and generate branded PDF reports directly on site.
              </p>
              <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-2 gap-3 text-xs text-brand-200">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={15} className="text-emerald-400 flex-shrink-0" />
                  <span>Data Stays on Your Device</span>
                </div>
                <div className="flex items-center gap-2">
                  <ShieldCheck size={15} className="text-emerald-400 flex-shrink-0" />
                  <span>100% Offline and Portable</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── Docked Bottom Save Bar for Organization ── */}
      {activeTab === 'general' && (
        <div
          className="flex-shrink-0 bg-white border-t border-gray-200 p-4 shadow-xl z-20"
          style={{
            paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
            paddingLeft: 'calc(1rem + env(safe-area-inset-left, 0px))',
            paddingRight: 'calc(1rem + env(safe-area-inset-right, 0px))',
          }}
        >
          <div className="max-w-4xl mx-auto w-full">
            <button
              onClick={handleSave}
              disabled={saving}
              className="sitepunch-btn-primary w-full bg-brand-700 hover:bg-brand-800 disabled:opacity-60 text-white py-3.5 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2 shadow-md"
              style={{ background: 'var(--brand-button, #1d4ed8)' }}
            >
              {saved  ? <><Check size={18}/> Saved Successfully!</> :
               saving ? <Spinner /> :
               'Save Settings'}
            </button>
          </div>
        </div>
      )}

      {/* Edit Project Modal */}
      {editingProject && (
        <EditProjectModal
          project={editingProject}
          onClose={() => setEditingProject(null)}
          onSaved={() => {
            loadProjects()
            setEditingProject(null)
          }}
        />
      )}

      {/* Project License Activation Modal */}
      {activatingProject && (
        <LicenseActivationModal
          project={activatingProject}
          onSuccess={() => {
            loadProjects()
            reloadLicenses()
            setActivatingProject(null)
          }}
          onClose={() => setActivatingProject(null)}
        />
      )}

      {/* Merge Project Modal */}
      {mergeModalData && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-gray-100 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-gray-150">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
                  <GitMerge size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Merge Project Backup</h3>
                  <p className="text-xs text-gray-500">Unite incoming backup into a local project</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMergeModalData(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {/* Source Backup File Info */}
            <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-500 uppercase text-[10px]">Source Backup File</span>
                <span className="text-[11px] font-mono text-gray-600 truncate max-w-[200px]">{mergeModalData.fileName}</span>
              </div>
              <p className="text-sm font-bold text-gray-900">
                {mergeModalData.fileData.project?.name || 'Unnamed Project'}
              </p>
              <div className="flex items-center gap-2 text-gray-500 flex-wrap pt-0.5">
                <span>{mergeModalData.fileData.phases?.length || 0} Reports</span>
                <span>•</span>
                <span>{mergeModalData.fileData.floorPlans?.length || 0} Key Plans</span>
                <span>•</span>
                <span>{mergeModalData.fileData.items?.length || 0} Punch Items</span>
                <span>•</span>
                <span>{mergeModalData.fileData.photos?.length || 0} Photos</span>
              </div>
            </div>

            {/* Target Project Dropdown */}
            <div className="space-y-1.5 text-xs">
              <label className="font-bold text-gray-800 block">
                Select Target Project on this Device:
              </label>
              <select
                value={mergeModalData.targetProjectUuid || ''}
                onChange={(e) => setMergeModalData({ ...mergeModalData, targetProjectUuid: e.target.value })}
                className="w-full p-2.5 rounded-xl border border-gray-300 bg-white font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {projects.map(p => (
                  <option key={p.uuid} value={p.uuid}>
                    {p.name} {p.number ? `(#${p.number})` : ''} - {p.reportCount || 0} reports
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-gray-400">
                Data from the backup file will be non-destructively merged into this project.
              </p>
            </div>

            {/* Merge Guarantees / Rules */}
            <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs space-y-1.5">
              <p className="font-bold text-emerald-900 text-xs flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-emerald-700" />
                Merge Guarantees &amp; Conflict Resolution:
              </p>
              <ul className="space-y-1 text-[11px] text-emerald-800">
                <li>✓ <strong>Non-Destructive:</strong> No existing local reports or drawings are deleted.</li>
                <li>✓ <strong>Smart Union:</strong> Matching reports combine observations; new reports are appended.</li>
                <li>✓ <strong>Observation Resequencing:</strong> Pins are numbered continuously (#1, #2, #3...) across drawings.</li>
                <li>✓ <strong>Photo Merging:</strong> All unique photos and markups are preserved.</li>
                <li>✓ <strong>License Safety:</strong> If either copy is licensed, unlimited exports remain unlocked.</li>
              </ul>
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setMergeModalData(null)}
                disabled={merging}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-semibold text-xs hover:bg-gray-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleConfirmMerge(mergeModalData.targetProjectUuid, mergeModalData.fileData)}
                disabled={merging || !mergeModalData.targetProjectUuid}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
              >
                {merging ? <Spinner /> : <GitMerge size={14} />}
                <span>{merging ? 'Merging Data...' : 'Confirm & Merge Projects'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Duplicate / Conflict Modal */}
      {importConflictData && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-gray-100 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-2.5 pb-3 border-b border-gray-150">
              <div className="p-2 bg-amber-100 text-amber-800 rounded-xl">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Project Already Exists</h3>
                <p className="text-xs text-gray-500">Choose how to handle the incoming project</p>
              </div>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              A project named <strong className="text-gray-900 font-bold">"{importConflictData.existingProject.name}"</strong> already exists on this device. How would you like to proceed?
            </p>

            <div className="space-y-2.5 text-xs">
              {/* Option 1: Merge */}
              <button
                type="button"
                onClick={() => {
                  handleConfirmMerge(importConflictData.existingProject.uuid, importConflictData.fileData)
                }}
                disabled={merging}
                className="w-full text-left p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/60 hover:bg-emerald-50 hover:border-emerald-300 transition-all flex items-start gap-3 group cursor-pointer"
              >
                <div className="p-2 bg-emerald-600 text-white rounded-lg group-hover:scale-105 transition-transform flex-shrink-0">
                  <GitMerge size={16} />
                </div>
                <div>
                  <p className="font-bold text-emerald-950 text-xs">Merge with Existing Project (Recommended)</p>
                  <p className="text-[11px] text-emerald-800 mt-0.5">
                    Combines reports, drawings, pins, and photos without losing local changes. Retains license unlocks.
                  </p>
                </div>
              </button>

              {/* Option 2: Copy */}
              <button
                type="button"
                onClick={() => executeImport(importConflictData.fileData, true)}
                disabled={importing}
                className="w-full text-left p-3.5 rounded-xl border border-blue-200 bg-blue-50/60 hover:bg-blue-50 hover:border-blue-300 transition-all flex items-start gap-3 group cursor-pointer"
              >
                <div className="p-2 bg-brand-600 text-white rounded-lg group-hover:scale-105 transition-transform flex-shrink-0">
                  <Copy size={16} />
                </div>
                <div>
                  <p className="font-bold text-blue-950 text-xs">Import as New Duplicate Copy</p>
                  <p className="text-[11px] text-blue-800 mt-0.5">
                    Creates a separate duplicate named <em>"{importConflictData.fileData.project.name} (Imported)"</em> so existing project remains untouched.
                  </p>
                </div>
              </button>

              {/* Option 3: Overwrite */}
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Are you sure you want to completely overwrite "${importConflictData.existingProject.name}" with this backup? Local changes will be replaced.`)) {
                    executeImport(importConflictData.fileData, false)
                  }
                }}
                disabled={importing}
                className="w-full text-left p-3 rounded-xl border border-gray-200 bg-gray-50 hover:bg-red-50 hover:border-red-200 transition-all flex items-start gap-3 group cursor-pointer"
              >
                <div className="p-2 bg-gray-600 text-white rounded-lg group-hover:bg-red-600 transition-colors flex-shrink-0">
                  <RefreshCw size={16} />
                </div>
                <div>
                  <p className="font-bold text-gray-800 group-hover:text-red-900 text-xs">Overwrite / Replace Existing Project</p>
                  <p className="text-[11px] text-gray-500 group-hover:text-red-700 mt-0.5">
                    Replaces local project data completely with the imported file.
                  </p>
                </div>
              </button>
            </div>

            <div className="pt-2 text-right">
              <button
                type="button"
                onClick={() => setImportConflictData(null)}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-800 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
