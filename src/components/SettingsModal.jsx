import React, { useState, useEffect, useCallback } from 'react'
import {
  ArrowLeft, Upload, Trash2, Check, Image as ImageIcon,
  AlertTriangle, Edit2, Info, Key, ShieldCheck, CheckCircle2,
  Smartphone, Palette, Type, Download, Shield, Plus, Lock, MapPin, Building2,
  User, LogOut, Calendar, Clock, Folder, FolderOpen, ClipboardList, AlertCircle, FileText,
  ChevronDown, ChevronUp, Layers, HelpCircle, CheckCircle, RefreshCw, Copy, Sparkles, X, Camera,
  ScrollText, FileDown, Archive, FileSpreadsheet, ChevronRight, Package,
  Cloud, CloudUpload, CloudDownload, Share2, Laptop, HardDrive, Wifi, WifiOff,
  Flame, Zap, Globe, Database, Eye, EyeOff, ExternalLink, GitMerge
} from 'lucide-react'
import { usePwa } from '../utils/pwa'
import {
  getFirebaseConfig,
  saveFirebaseConfig,
  isFirebaseConfigured,
  initFirebase,
  syncProjectToCloud,
} from '../services/firebase'
import {
  selectCloudSyncFolder,
  getConnectedCloudFolder,
  disconnectCloudFolder,
  isFileSystemAccessSupported,
  AUTO_BACKUP_FREQUENCIES,
  getAutoBackupConfig,
  setAutoBackupFrequency,
  executePeriodicAutoBackup,
  requestCloudFolderPermission,
} from '../utils/cloudFolder'
import { isZipFile, extractZipBackup } from '../utils/zipArchive'
import { useAppStore } from '../store/useAppStore'
import {
  db, getSetting, setSetting, getAllProjects, deleteProject,
  downloadProjectBackup, downloadAllProjectsBackup, getAllProjectsBackupBlob, importProjectData, mergeProjectData,
  getSafetyBackup, restoreSafetyBackup, exportProjectData, getPhases, getPunchItems, updateUserProfile,
  getExportLogs, getAllExportLogSummaries, getAllExportLogsFlat,
  importReportData,
  analyzeProjectMergeConflicts, executeCustomProjectMerge,
} from '../db/database'
import { Field, INPUT, Spinner } from './NewProjectModal'
import EditProjectModal from './EditProjectModal'
import LicenseActivationModal from './LicenseActivationModal'
import DeleteProjectModal from './DeleteProjectModal'
import ReportConflictModal from './ReportConflictModal'
import ObservationConflictModal from './ObservationConflictModal'
import {
  getLicensedProjectUuids,
  getCachedLicenses,
  getWordPressUrl,
  setWordPressUrl,
  getLmfwcConsumerKey,
  getLmfwcConsumerSecret,
  setLmfwcCredentials,
  clearLmfwcCredentials,
  testWordPressConnection,
  DEFAULT_WP_URL,
  DEFAULT_CONSUMER_KEY,
  DEFAULT_CONSUMER_SECRET,
} from '../services/licenseService'
import { THEME_PRESETS, applyThemeColor, DEFAULT_THEME_COLOR, PIN_COLOR_PRESETS, applyPinColor, DEFAULT_PIN_COLOR } from '../utils/theme'
import { FONT_OPTIONS, applyAppFont, DEFAULT_FONT_ID } from '../utils/font'
import {
  PHOTO_QUALITY_OPTIONS,
  DEFAULT_PHOTO_QUALITY,
  prepareLogoForQuality,
  readFileAsDataUrl,
} from '../utils/media'

export default function SettingsModal() {
  const {
    closeSettings,
    settingsTab,
    openNewProject,
    companyName,
    companyLogo,
    themeColor,
    appFont,
    pinColor,
    dateFormat,
    photoQuality,
    exportedPdfCount,
    setCompanyName,
    setCompanyLogo,
    setThemeColor,
    setAppFont,
    setPinColor,
    setDateFormat,
    setPhotoQuality,
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
  const [deletingProject, setDeletingProject] = useState(null)
  const [exportingId,   setExportingId]   = useState(null)
  const [importing,     setImporting]     = useState(false)
  const [importConflictData, setImportConflictData] = useState(null)
  const [reportConflictData, setReportConflictData] = useState(null)
  const [observationConflictReport, setObservationConflictReport] = useState(null)
  const [pendingMergeData, setPendingMergeData] = useState(null)
  const [copiedKeyUuid, setCopiedKeyUuid] = useState(null)
  const [showImportNotes, setShowImportNotes] = useState(true)
  const { canInstall, isInstalled, isOffline, isElectron, isPersistent, storageInfo, installApp } = usePwa()

  // Native Cloud Folder Connection (OneDrive / Google Drive / iCloud)
  const [cloudFolder, setCloudFolder] = useState(null)
  const [connectingCloudFolder, setConnectingCloudFolder] = useState(false)

  useEffect(() => {
    getConnectedCloudFolder().then(setCloudFolder)
  }, [])

  async function handleConnectCloudFolder() {
    setConnectingCloudFolder(true)
    try {
      const selected = await selectCloudSyncFolder()
      if (selected) {
        setCloudFolder(selected)
      }
    } catch (err) {
      alert(`Folder connection failed: ${err.message}`)
    } finally {
      setConnectingCloudFolder(false)
    }
  }

  async function handleDisconnectCloudFolder() {
    await disconnectCloudFolder()
    setCloudFolder(null)
  }

  // Automatic Periodic Cloud Backup state (Daily / Weekly / Monthly)
  const [autoBackupConfig, setAutoBackupConfig] = useState({
    frequency: 'off',
    lastTime: null,
    lastStatus: null,
    nextDueTime: null,
    isDue: false,
  })
  const [autoBackupLoading, setAutoBackupLoading] = useState(false)
  const [autoBackupFeedback, setAutoBackupFeedback] = useState('')

  const reloadAutoBackupConfig = useCallback(async () => {
    try {
      const cfg = await getAutoBackupConfig()
      setAutoBackupConfig(cfg)
    } catch {}
  }, [])

  useEffect(() => {
    reloadAutoBackupConfig()
    const handleUpdate = () => reloadAutoBackupConfig()
    window.addEventListener('sitepunch-auto-backup-updated', handleUpdate)
    return () => window.removeEventListener('sitepunch-auto-backup-updated', handleUpdate)
  }, [reloadAutoBackupConfig])

  async function handleSelectFrequency(freqId) {
    if (freqId !== 'off' && !cloudFolder) {
      try {
        const selected = await selectCloudSyncFolder()
        if (selected) {
          setCloudFolder(selected)
        } else {
          return
        }
      } catch (err) {
        alert(`Folder selection needed for automatic cloud backups: ${err.message}`)
        return
      }
    }

    await setAutoBackupFrequency(freqId)
    await reloadAutoBackupConfig()
    setAutoBackupFeedback(`Automatic periodic backup set to ${AUTO_BACKUP_FREQUENCIES[freqId]?.label || freqId}`)
    setTimeout(() => setAutoBackupFeedback(''), 4000)
  }

  async function handleRunAutoBackupNow() {
    if (!cloudFolder) {
      alert('Please connect your OneDrive or Google Drive folder first.')
      return
    }
    setAutoBackupLoading(true)
    setAutoBackupFeedback('')
    try {
      const res = await executePeriodicAutoBackup(getAllProjectsBackupBlob)
      if (res.status === 'success') {
        setAutoBackupFeedback(`✅ Successfully pushed backup to ${res.folderName}!`)
      } else if (res.status === 'needs_permission') {
        const granted = await requestCloudFolderPermission()
        if (granted) {
          const retry = await executePeriodicAutoBackup(getAllProjectsBackupBlob)
          if (retry.status === 'success') {
            setAutoBackupFeedback(`✅ Successfully pushed backup to ${retry.folderName}!`)
          }
        }
      } else {
        alert(`Auto-backup notice: ${res.message}`)
      }
      await reloadAutoBackupConfig()
    } catch (err) {
      alert(`Auto-backup failed: ${err.message}`)
    } finally {
      setAutoBackupLoading(false)
      setTimeout(() => setAutoBackupFeedback(''), 5000)
    }
  }

  // Firebase Live Sync Configuration state
  const [showFirebaseModal, setShowFirebaseModal] = useState(false)
  const [fbConfig, setFbConfig] = useState(() => getFirebaseConfig())
  const [fbApiKey, setFbApiKey] = useState(() => getFirebaseConfig()?.apiKey || '')
  const [fbProjectId, setFbProjectId] = useState(() => getFirebaseConfig()?.projectId || '')
  const [fbStorageBucket, setFbStorageBucket] = useState(() => getFirebaseConfig()?.storageBucket || '')
  const [fbRawJson, setFbRawJson] = useState('')
  const [fbSyncing, setFbSyncing] = useState(false)
  const [fbSyncMsg, setFbSyncMsg] = useState('')
  const [fbSyncError, setFbSyncError] = useState('')

  async function handleSaveFirebaseConfig(e) {
    if (e) e.preventDefault()
    setFbSyncError('')
    setFbSyncMsg('')

    let finalConfig = null
    if (fbRawJson.trim()) {
      try {
        let cleaned = fbRawJson.trim()
        if (cleaned.includes('{') && cleaned.includes('}')) {
          cleaned = cleaned.substring(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1)
        }
        cleaned = cleaned.replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":').replace(/'/g, '"')
        finalConfig = JSON.parse(cleaned)
      } catch {
        setFbSyncError('Could not parse the pasted JSON snippet. Please check formatting or fill in the API Key and Project ID fields directly.')
        return
      }
    } else {
      if (!fbApiKey.trim() || !fbProjectId.trim()) {
        setFbSyncError('Please provide at least the Firebase API Key and Project ID.')
        return
      }
      finalConfig = {
        apiKey: fbApiKey.trim(),
        projectId: fbProjectId.trim(),
        authDomain: `${fbProjectId.trim()}.firebaseapp.com`,
        storageBucket: fbStorageBucket.trim() || `${fbProjectId.trim()}.appspot.com`,
      }
    }

    try {
      saveFirebaseConfig(finalConfig)
      setFbConfig(finalConfig)
      initFirebase()
      setFbSyncMsg('Firebase configuration saved successfully! Cloud sync is now active.')
      setShowFirebaseModal(false)
    } catch (err) {
      setFbSyncError(`Failed to initialize Firebase: ${err.message}`)
    }
  }

  async function handleDisconnectFirebase() {
    if (!window.confirm('Disconnect Firebase cloud sync? Your local data will remain safe on this device.')) return
    saveFirebaseConfig(null)
    setFbConfig(null)
    setFbApiKey('')
    setFbProjectId('')
    setFbStorageBucket('')
    setFbRawJson('')
    setFbSyncMsg('Firebase disconnected.')
    setTimeout(() => setFbSyncMsg(''), 3000)
  }

  async function handleSyncAllProjectsToFirebase() {
    if (!isFirebaseConfigured()) {
      setShowFirebaseModal(true)
      return
    }
    setFbSyncing(true)
    setFbSyncMsg('')
    setFbSyncError('')
    try {
      const allProjects = await getAllProjects()
      const [allPhases, allFps, allItems] = await Promise.all([
        db.phases.toArray(),
        db.floorPlans.toArray(),
        db.punchItems.toArray(),
      ])

      let syncedCount = 0
      for (const proj of allProjects) {
        const projPhases = allPhases.filter(ph => ph.projectUuid === proj.uuid)
        const projFps = allFps.filter(fp => fp.projectUuid === proj.uuid)
        const projFpUuids = new Set(projFps.map(f => f.uuid))
        const projItems = allItems.filter(it => it.projectUuid === proj.uuid || projFpUuids.has(it.floorPlanUuid))

        await syncProjectToCloud(proj, {
          phases: projPhases,
          floorPlans: projFps,
          punchItems: projItems,
        })
        syncedCount++
      }

      setFbSyncMsg(`Successfully synced ${syncedCount} project(s) to Firebase Cloud!`)
      setTimeout(() => setFbSyncMsg(''), 4000)
    } catch (err) {
      setFbSyncError(`Sync notice: ${err.message || 'Make sure your Firebase project is active.'}`)
    } finally {
      setFbSyncing(false)
    }
  }
  const [editingProject, setEditingProject] = useState(null)
  const [activeTab,     setActiveTab]     = useState(settingsTab || 'general') // 'general' | 'projects' | 'logs' | 'about'
  const [activatingProject, setActivatingProject] = useState(null)
  const [licensedProjectSet, setLicensedProjectSet] = useState(() => getLicensedProjectUuids())
  const [activeLicenses,   setActiveLicenses]   = useState(() => getCachedLicenses())

  // --- Export Logs state (Logs tab) ---
  const [logSummaries,  setLogSummaries]  = useState({})  // { [projectUuid]: { pdf, zip, csv, total } }
  const [allLogs,       setAllLogs]       = useState([])  // flat list, last 12 months, newest first
  const [loadingLogs,   setLoadingLogs]   = useState(false)
  const [logFilter,     setLogFilter]     = useState('all') // 'all' | 'pdf' | 'image' | 'csv'

  function reloadLicenses() {
    setLicensedProjectSet(getLicensedProjectUuids())
    setActiveLicenses(getCachedLicenses())
  }

  // --- WordPress Store Connection state (About tab) ---
  const [wpUrl, setWpUrl] = useState(() => getWordPressUrl())
  const [wpConsumerKey, setWpConsumerKey] = useState(() => getLmfwcConsumerKey())
  const [wpConsumerSecret, setWpConsumerSecret] = useState(() => getLmfwcConsumerSecret())
  const [showWpSecret, setShowWpSecret] = useState(false)
  const [wpTesting, setWpTesting] = useState(false)
  const [wpTestResult, setWpTestResult] = useState(null)
  const [wpSaveSuccess, setWpSaveSuccess] = useState(false)
  const [showWpTroubleshoot, setShowWpTroubleshoot] = useState(false)

  async function handleTestWpConnection() {
    setWpTesting(true)
    setWpTestResult(null)
    try {
      const res = await testWordPressConnection(wpUrl, wpConsumerKey, wpConsumerSecret)
      setWpTestResult(res)
    } catch (err) {
      setWpTestResult({
        success: false,
        message: err.message || 'Failed to connect to WordPress server.',
      })
    } finally {
      setWpTesting(false)
    }
  }

  function handleSaveWpCredentials() {
    setWordPressUrl(wpUrl)
    setLmfwcCredentials(wpConsumerKey, wpConsumerSecret)
    setWpSaveSuccess(true)
    setTimeout(() => setWpSaveSuccess(false), 3000)
  }

  function handleResetWpDefaults() {
    clearLmfwcCredentials()
    setWordPressUrl(DEFAULT_WP_URL)
    setWpUrl(DEFAULT_WP_URL)
    setWpConsumerKey(DEFAULT_CONSUMER_KEY)
    setWpConsumerSecret(DEFAULT_CONSUMER_SECRET)
    setWpTestResult({
      success: true,
      message: 'Reset WordPress store connection and API credentials to default values.',
    })
  }

  async function handleSelectPhotoQuality(qualityId) {
    setPhotoQuality(qualityId)
    try {
      await setSetting('photoQuality', qualityId)
    } catch (err) {
      console.error('Failed to save photo quality setting:', err)
    }
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
    if (activeTab === 'logs') {
      loadLogsTab()
    }
  }, [activeTab])

  async function loadLogsTab() {
    setLoadingLogs(true)
    try {
      const [logs, summaries] = await Promise.all([
        getAllExportLogsFlat(500),
        getAllExportLogSummaries(),
      ])
      setAllLogs(logs)
      setLogSummaries(summaries)
      if (projects.length === 0) {
        loadProjects()
      }
    } catch (err) {
      console.error('Failed to load export logs:', err)
    } finally {
      setLoadingLogs(false)
    }
  }

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
  async function handleLogoUpload(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      alert('Logo file size must be less than 5MB.')
      return
    }
    try {
      const rawDataUrl = await readFileAsDataUrl(file)
      const processedLogo = await prepareLogoForQuality(rawDataUrl, photoQuality || DEFAULT_PHOTO_QUALITY)
      setLogo(processedLogo)
    } catch {
      alert('Failed to read logo file.')
    }
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

  // Open safeguarded delete confirmation modal
  function handleDeleteProject(p) {
    setDeletingProject(p)
  }

  async function confirmDeleteProject(p) {
    setDeletingId(p.uuid)
    try {
      await deleteProject(p.uuid)
      await loadProjects()
      setDeletingProject(null)
      if (currentProjectUuid === p.uuid) {
        navigateToDashboard()
      }
    } finally {
      setDeletingId(null)
    }
  }

  // Export full project to JSON file
  async function handleExportProject(p) {
    setExportingId(p.uuid)
    try {
      await downloadProjectBackup(p)
    } catch (err) {
      console.error('Failed to export project:', err)
      alert('Failed to export project. Please try again.')
    } finally {
      setExportingId(null)
    }
  }

  const [backingUpAll, setBackingUpAll] = useState(false)

  // Backup all projects to Google Drive / iCloud / Local File
  async function handleBackupAllToCloud() {
    if (!projects.length) {
      alert('No projects available to backup.')
      return
    }
    setBackingUpAll(true)
    try {
      const res = await downloadAllProjectsBackup()
      if (res?.aborted) return
      if (res?.method === 'direct-folder') {
        alert(`✅ Full Cloud Backup successfully saved directly into your "${res.folderName}" folder!\n\nOneDrive / Google Drive will automatically sync it to the cloud.`)
      } else if (res?.method === 'save-picker') {
        alert(`✅ Full Cloud Backup successfully saved directly into your selected folder!`)
      } else {
        alert(`Full Cloud Backup successfully exported for ${res?.count || projects.length} project(s)!\n\nSaved to your selected location to safeguard your data.`)
      }
    } catch (err) {
      console.error('Full cloud backup failed:', err)
      alert(`Backup failed: ${err.message || String(err)}`)
    } finally {
      setBackingUpAll(false)
    }
  }

  // Import project or full cloud archive from ZIP package or JSON file
  async function handleImportProject(e) {
    const file = e.target.files[0]
    if (!file) return
    e.target.value = ''
    setImporting(true)
    try {
      let data
      if (await isZipFile(file)) {
        data = await extractZipBackup(file)
      } else {
        const text = await file.text()
        data = JSON.parse(text)
      }

      // Handle Full Multi-Project Cloud Backup Package
      if (data.projects && Array.isArray(data.projects) && data.projects.length > 0) {
        let restoredCount = 0
        for (const pItem of data.projects) {
          try {
            await importProjectData(pItem, null, false)
            restoredCount++
          } catch (itemErr) {
            console.warn('Failed restoring one project in archive:', itemErr)
          }
        }
        await loadProjects()
        reloadLicenses()
        setImporting(false)
        alert(
          `Full Cloud Backup Restored!\n\n` +
          `• ${restoredCount} project(s) successfully imported from backup.\n` +
          `• All drawing blueprints, observation pins, photos, and licenses are restored.`
        )
        return
      }

      // Handle Individual Site Visit Report Backup (.json)
      if (data.type === 'individual_report' || (data.phase && !data.phases && !data.projects)) {
        const res = await importReportData(data, null, 'auto')
        if (res && res.conflict) {
          setReportConflictData(res)
          setImporting(false)
          return
        }

        await loadProjects()
        reloadLicenses()
        setImporting(false)
        alert(
          `Site Visit Report "${res.phase?.name || data.phase?.name}" Successfully Imported!\n\n` +
          `• Added to Project: "${res.targetProject?.name || res.project?.name || data.project?.name}"\n` +
          `• ${res.planCount || 0} Key Plans\n` +
          `• ${res.itemCount || 0} Observations\n` +
          `• ${res.photoCount || 0} Photos\n` +
          (res.isLicensed ? '• Active License Preserved (Exports Unlocked)' : '')
        )
        return
      }

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
        const localPhases = await getPhases(existing.uuid).catch(() => [])
        const localItems = await getPunchItems(existing.uuid).catch(() => [])
        setImportConflictData({
          fileData: data,
          fileName: file.name,
          existingProject: existing,
          localReportCount: localPhases.length,
          localItemCount: localItems.length,
          incomingReportCount: data.phases?.length || 0,
          incomingItemCount: data.items?.length || 0,
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

  // Initiate merge with observation conflict inspection
  async function handleInitiateMerge(targetUuid, data) {
    setImporting(true)
    try {
      const conflictAnalysis = await analyzeProjectMergeConflicts(targetUuid, data)
      if (conflictAnalysis.conflictingItems && conflictAnalysis.conflictingItems.length > 0) {
        setPendingMergeData({ targetUuid, fileData: data })
        setObservationConflictReport(conflictAnalysis)
        setImportConflictData(null)
      } else {
        // No conflicting observations, proceed directly with merge
        await executeMerge(targetUuid, data)
      }
    } catch (err) {
      console.error('Failed to analyze merge conflicts:', err)
      await executeMerge(targetUuid, data)
    } finally {
      setImporting(false)
    }
  }

  // Apply user's granular decisions from ObservationConflictModal
  async function handleApplyObservationDecisions(decisions) {
    if (!pendingMergeData) return
    setImporting(true)
    try {
      const stats = await executeCustomProjectMerge(
        pendingMergeData.targetUuid,
        pendingMergeData.fileData,
        decisions
      )
      await loadProjects()
      reloadLicenses()
      setObservationConflictReport(null)
      setPendingMergeData(null)
      alert(
        `Project Successfully Merged (Zero Data Loss)!\n\n` +
        `• Target: "${stats.targetProjectName}"\n` +
        `• Reports: ${stats.reportsMatched} matched, ${stats.reportsAdded} new added\n` +
        `• Key Plans: ${stats.keyPlansMatched} matched, ${stats.keyPlansAdded} new added\n` +
        `• Observations Kept on Device: ${stats.itemsKeptDevice || 0}\n` +
        `• Observations Updated with Incoming: ${stats.itemsUpdated || 0}\n` +
        ((stats.itemsDuplicated || 0) > 0 ? `• Observations Kept Both (Duplicated): ${stats.itemsDuplicated}\n` : '') +
        `• New Observations Added: ${stats.itemsAdded || 0}\n` +
        `• Photos Merged: ${stats.photosAdded || 0}\n` +
        (stats.licensePreserved ? `• Active License Preserved` : '')
      )
    } catch (err) {
      console.error('Custom merge execution failed:', err)
      alert(`Merge failed: ${err.message || 'Unknown error'}`)
    } finally {
      setImporting(false)
    }
  }

  // Execute intelligent non-destructive merge (Zero Data Loss)
  async function executeMerge(targetUuid, data) {
    setImporting(true)
    try {
      const stats = await mergeProjectData(targetUuid, data)
      await loadProjects()
      reloadLicenses()
      setImportConflictData(null)
      alert(
        `Project Successfully Merged (Zero Data Loss)!\n\n` +
        `• Target: "${stats.targetProjectName}"\n` +
        `• Reports: ${stats.reportsMatched} matched, ${stats.reportsAdded} new added\n` +
        `• Key Plans: ${stats.keyPlansMatched} matched, ${stats.keyPlansAdded} new added\n` +
        `• Observations: ${stats.itemsUpdated} updated, ${stats.itemsAdded} new added\n` +
        `• Photos: ${stats.photosAdded} photos merged\n` +
        (stats.licensePreserved ? `• Active License Preserved` : '')
      )
    } catch (err) {
      console.error('Merge execution failed:', err)
      alert(`Merge failed: ${err.message || 'Unknown error'}`)
    } finally {
      setImporting(false)
    }
  }

  // Execute clean overwrite with automatic safety snapshot (Zero Data Loss)
  async function executeOverwrite(data, targetUuid) {
    setImporting(true)
    try {
      const importedProj = await importProjectData(data, null, false, targetUuid)
      await loadProjects()
      reloadLicenses()
      setImportConflictData(null)
      alert(
        `Project "${importedProj.name}" successfully replaced!\n\n` +
        `• ${data.phases?.length || 0} Reports\n` +
        `• ${data.floorPlans?.length || 0} Key Plans\n` +
        `• ${data.items?.length || 0} Punch Items\n` +
        `• Safety restore snapshot automatically created\n` +
        (importedProj.isLicensed ? `• License Preserved (Exports Unlocked)` : '')
      )
    } catch (err) {
      console.error('Overwrite failed:', err)
      alert(`Overwrite failed: ${err.message || 'Unknown error'}`)
    } finally {
      setImporting(false)
    }
  }

  // Handle resolving individual report conflict: Merge & Compare Observations
  const handleResolveReportConflictMerge = async () => {
    if (!reportConflictData) return
    setImporting(true)
    try {
      const pkg = reportConflictData.reportPackage
      const targetUuid = reportConflictData.existingProject.uuid
      const projectPayload = {
        project: reportConflictData.existingProject,
        phases: [pkg.phase],
        floorPlans: pkg.floorPlans || [],
        items: pkg.items || [],
        photos: pkg.photos || [],
        licenses: pkg.licenses || []
      }
      const conflictAnalysis = await analyzeProjectMergeConflicts(targetUuid, projectPayload)
      if (conflictAnalysis.conflictingItems && conflictAnalysis.conflictingItems.length > 0) {
        setPendingMergeData({ targetUuid, fileData: projectPayload })
        setObservationConflictReport(conflictAnalysis)
        setReportConflictData(null)
      } else {
        const stats = await executeCustomProjectMerge(targetUuid, projectPayload, {})
        await loadProjects()
        reloadLicenses()
        setReportConflictData(null)
        alert(
          `Site Visit Report "${pkg.phase?.name}" merged successfully!\n\n` +
          `• Target: "${stats.targetProjectName}"\n` +
          `• Key Plans Added: ${stats.keyPlansAdded}\n` +
          `• Observations Added: ${stats.itemsAdded}\n` +
          `• Photos Merged: ${stats.photosAdded}`
        )
      }
    } catch (err) {
      console.error('Report merge failed:', err)
      alert(`Report merge failed: ${err.message || 'Unknown error'}`)
    } finally {
      setImporting(false)
    }
  }

  // Handle resolving individual report conflict: Overwrite
  const handleResolveReportConflictOverwrite = async () => {
    if (!reportConflictData) return
    setImporting(true)
    try {
      const res = await importReportData(reportConflictData.reportPackage, reportConflictData.existingProject.uuid, 'overwrite')
      await loadProjects()
      reloadLicenses()
      setReportConflictData(null)
      alert(
        `Site Visit Report "${res.phase?.name}" replaced successfully!\n\n` +
        `• Project: "${res.targetProject?.name || res.project?.name}"\n` +
        `• ${res.planCount || 0} Key Plans\n` +
        `• ${res.itemCount || 0} Observations\n` +
        `• Safety restore snapshot automatically created\n` +
        (res.isLicensed ? '• Active License Preserved (Exports Unlocked)' : '')
      )
    } catch (err) {
      alert(`Overwrite failed: ${err.message || 'Unknown error'}`)
    } finally {
      setImporting(false)
    }
  }

  // Handle resolving individual report conflict: Duplicate
  const handleResolveReportConflictDuplicate = async () => {
    if (!reportConflictData) return
    setImporting(true)
    try {
      const res = await importReportData(reportConflictData.reportPackage, reportConflictData.existingProject.uuid, 'duplicate')
      await loadProjects()
      reloadLicenses()
      setReportConflictData(null)
      alert(
        `Site Visit Report "${res.phase?.name}" imported as duplicate copy!\n\n` +
        `• Project: "${res.targetProject?.name || res.project?.name}"\n` +
        `• ${res.planCount || 0} Key Plans\n` +
        `• ${res.itemCount || 0} Observations\n` +
        (res.isLicensed ? '• Active License Preserved (Exports Unlocked)' : '')
      )
    } catch (err) {
      alert(`Duplicate import failed: ${err.message || 'Unknown error'}`)
    } finally {
      setImporting(false)
    }
  }

  // Copy an unlocked project's license key to the clipboard
  async function handleCopyLicenseKey(projectUuid, licenseKey) {
    if (!licenseKey) return
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(licenseKey)
      } else {
        const ta = document.createElement('textarea')
        ta.value = licenseKey
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      setCopiedKeyUuid(projectUuid)
      setTimeout(() => {
        setCopiedKeyUuid(prev => (prev === projectUuid ? null : prev))
      }, 1800)
    } catch (err) {
      console.warn('Copy license key failed:', err)
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
          <button
            onClick={() => setActiveTab('logs')}
            className={`py-3.5 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'logs'
                ? 'border-brand-700 text-brand-700 font-bold'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            style={activeTab === 'logs' ? { borderColor: 'var(--brand-button, #1d4ed8)', color: 'var(--brand-button, #1d4ed8)' } : {}}
          >
            <span>Logs</span>
            {Object.values(logSummaries).reduce((s, v) => s + (v.total || 0), 0) > 0 && (
              <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full font-bold">
                {Object.values(logSummaries).reduce((s, v) => s + (v.total || 0), 0)}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Main Content Body */}
      <main
        className="flex-1 overflow-y-auto p-4 sm:p-6 pb-20"
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

            {/* Photo Quality Preference Card */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-gray-200/90 shadow-xs space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'var(--brand-tint-10, rgba(164, 14, 38, 0.1))', color: 'var(--brand-button, #a40e26)' }}
                  >
                    <Camera size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">Photo Quality</h3>
                    <p className="text-xs text-gray-500">
                      Applies to observation photos, key plans, company logos, and PDF/ZIP exports
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {PHOTO_QUALITY_OPTIONS.map(opt => {
                  const activeQuality = photoQuality || DEFAULT_PHOTO_QUALITY
                  const isSelected = activeQuality === opt.id
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleSelectPhotoQuality(opt.id)}
                      aria-pressed={isSelected}
                      className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                        isSelected
                          ? 'shadow-xs'
                          : 'border-gray-200 bg-gray-50/60 hover:bg-white hover:border-gray-300'
                      }`}
                      style={
                        isSelected
                          ? {
                              borderColor: 'var(--brand-button, #a40e26)',
                              background: 'var(--brand-tint-10, rgba(164, 14, 38, 0.06))',
                              boxShadow: '0 0 0 1px var(--brand-button, #a40e26)',
                            }
                          : undefined
                      }
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-bold text-gray-900">{opt.label}</span>
                            {opt.badge && (
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                                  opt.id === 'balanced'
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                    : 'bg-gray-200/80 text-gray-600'
                                }`}
                              >
                                {opt.badge}
                              </span>
                            )}
                          </div>
                          {isSelected && (
                            <span
                              className="w-4.5 h-4.5 rounded-full text-white flex items-center justify-center flex-shrink-0"
                              style={{ background: 'var(--brand-button, #a40e26)' }}
                            >
                              <Check size={11} strokeWidth={3} />
                            </span>
                          )}
                        </div>
                        <p
                          className={`text-[11px] font-semibold ${
                            opt.id === 'balanced' ? 'text-emerald-700' : 'text-gray-700'
                          }`}
                        >
                          {opt.sizeHint}
                        </p>
                      </div>
                      <p className="text-[11px] text-gray-500 leading-snug">
                        {opt.description}
                      </p>
                    </button>
                  )
                })}
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

            {/* Cloud Backup & Sync Card (Google Drive, iCloud Drive, Files) */}
            <div className="bg-gradient-to-r from-blue-50/90 via-indigo-50/80 to-purple-50/70 rounded-2xl p-4 sm:p-5 border border-blue-200/80 shadow-xs space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs flex-shrink-0">
                    <Cloud size={19} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gray-900 leading-tight">
                      Cloud Backup &amp; Device Sync
                    </h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Save to Google Drive, iCloud, or OneDrive to safeguard against app deletion
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleBackupAllToCloud}
                    disabled={backingUpAll || projects.length === 0}
                    className="sitepunch-btn-primary px-3.5 py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
                    title="Package all projects and save directly into your OneDrive or Google Drive folder"
                  >
                    {backingUpAll ? <Spinner /> : <CloudUpload size={14} />}
                    <span>Backup All to Cloud</span>
                  </button>

                  <label
                    className="cursor-pointer px-3.5 py-2 bg-white hover:bg-blue-50 text-blue-700 border border-blue-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors"
                  >
                    {importing ? <Spinner /> : <CloudDownload size={14} />}
                    <span>Restore from Cloud</span>
                    <input
                      type="file"
                      accept=".zip,.sitevisit,.punch,.json,application/json,application/zip"
                      className="hidden"
                      disabled={importing}
                      onChange={handleImportProject}
                    />
                  </label>
                </div>
              </div>

              {/* Direct OneDrive / Google Drive Folder Connection */}
              {isFileSystemAccessSupported() ? (
                cloudFolder ? (
                  <div className="bg-white/90 backdrop-blur-xs border border-emerald-300 rounded-xl p-3 flex flex-col gap-2 shadow-2xs">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 text-xs text-emerald-950 font-semibold min-w-0">
                        <FolderOpen size={16} className="text-emerald-600 flex-shrink-0" />
                        <span className="truncate">Connected Cloud Folder: <strong className="font-bold underline text-emerald-800">{cloudFolder.name}</strong></span>
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold flex-shrink-0">Direct Sync Active</span>
                      </div>
                      <div className="flex items-center gap-2.5 text-xs">
                        <button
                          type="button"
                          onClick={handleConnectCloudFolder}
                          className="text-emerald-800 hover:text-emerald-950 font-semibold underline cursor-pointer"
                        >
                          Change
                        </button>
                        <button
                          type="button"
                          onClick={handleDisconnectCloudFolder}
                          className="text-red-600 hover:text-red-800 font-semibold underline cursor-pointer"
                        >
                          Disconnect
                        </button>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-emerald-200/80 flex items-center justify-between gap-2 flex-wrap text-[11px] text-emerald-900 font-medium">
                      <span>📁 Format: <strong>Separated Photos &amp; Database (.zip package / folder)</strong></span>
                      <span className="text-emerald-700 font-semibold">🔒 Photos kept outside personal photo gallery</span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white/80 backdrop-blur-xs border border-blue-200 rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap shadow-2xs">
                    <div className="flex items-center gap-2 text-xs text-gray-700 min-w-0">
                      <Folder size={16} className="text-blue-600 flex-shrink-0" />
                      <div>
                        <p className="font-bold text-gray-900 leading-tight">Connect OneDrive or Google Drive Folder</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">Select your OneDrive or Google Drive folder once; backups will write directly into it with separated photos and database.</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleConnectCloudFolder}
                      disabled={connectingCloudFolder}
                      className="px-3.5 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-900 rounded-xl text-xs font-bold transition-colors cursor-pointer flex-shrink-0 flex items-center gap-1.5"
                    >
                      {connectingCloudFolder ? <Spinner /> : <FolderOpen size={13} />}
                      <span>Select Folder</span>
                    </button>
                  </div>
                )
              ) : (
                <div className="bg-white/80 backdrop-blur-xs border border-blue-200 rounded-xl p-3 flex items-center gap-2.5 text-xs text-gray-700 shadow-2xs">
                  <Folder size={16} className="text-blue-600 flex-shrink-0" />
                  <div>
                    <p className="font-bold text-gray-900 leading-tight">OneDrive, iCloud &amp; Google Drive Export</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      On mobile, tap <strong>Export</strong> to save your project's ZIP archive and photos directly into your OneDrive or iCloud Drive folder via the Files app.
                    </p>
                  </div>
                </div>
              )}

              {/* Automatic Periodic Backup (Daily / Weekly / Monthly) */}
              <div className="bg-white/90 backdrop-blur-xs border border-blue-200/90 rounded-xl p-3.5 space-y-2.5 shadow-2xs">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Clock size={16} className="text-blue-600 flex-shrink-0" />
                    <div>
                      <h5 className="font-bold text-gray-900 text-xs leading-tight">
                        Automatic Periodic Cloud Backup
                      </h5>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        Automatically push complete backup files into your connected cloud drive
                      </p>
                    </div>
                  </div>

                  {autoBackupConfig.frequency !== 'off' && cloudFolder && (
                    <button
                      type="button"
                      onClick={handleRunAutoBackupNow}
                      disabled={autoBackupLoading}
                      className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
                      title="Trigger an immediate automatic backup push right now"
                    >
                      {autoBackupLoading ? <Spinner /> : <RefreshCw size={11} className={autoBackupLoading ? 'animate-spin' : ''} />}
                      <span>Push Backup Now</span>
                    </button>
                  )}
                </div>

                {/* Frequency Selector Buttons: Off, Daily, Weekly, Monthly */}
                <div className="grid grid-cols-4 gap-1.5 pt-1">
                  {Object.values(AUTO_BACKUP_FREQUENCIES).map(f => {
                    const isSelected = autoBackupConfig.frequency === f.id
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => handleSelectFrequency(f.id)}
                        className={`py-2 px-2 rounded-xl text-xs font-bold transition-all text-center flex flex-col items-center justify-center cursor-pointer border ${
                          isSelected
                            ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                            : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200'
                        }`}
                      >
                        <span className="leading-tight">{f.label.split(' ')[0]}</span>
                        <span className={`text-[10px] font-normal leading-tight mt-0.5 ${isSelected ? 'text-blue-100' : 'text-gray-400'}`}>
                          {f.id === 'off' ? 'Manual' : f.description}
                        </span>
                      </button>
                    )
                  })}
                </div>

                {/* Status Indicator & Next Scheduled Time */}
                {autoBackupConfig.frequency !== 'off' ? (
                  <div className="pt-1 text-[11px] text-gray-600 flex items-center justify-between gap-2 flex-wrap border-t border-gray-100">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span>
                        Auto-pushing <strong>{autoBackupConfig.frequency}</strong> to{' '}
                        <strong className="text-gray-900">{cloudFolder?.name || 'OneDrive / Google Drive'}</strong>
                      </span>
                    </div>

                    <div className="text-gray-400 text-[10px]">
                      {autoBackupConfig.lastTime ? (
                        <span>Last pushed: {new Date(autoBackupConfig.lastTime).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      ) : (
                        <span className="text-blue-600 font-medium">Scheduled to run automatically</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-400 italic pt-0.5">
                    Select Daily, Weekly, or Monthly to enable background cloud backup pushes.
                  </p>
                )}

                {autoBackupFeedback && (
                  <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-[11px] font-semibold flex items-center gap-1.5 animate-fade-in">
                    <CheckCircle size={13} className="text-emerald-600 flex-shrink-0" />
                    <span>{autoBackupFeedback}</span>
                  </div>
                )}
              </div>

              <div className="bg-white/80 backdrop-blur-xs rounded-xl p-3 border border-blue-100 text-[11px] text-gray-600 flex items-start gap-2 leading-relaxed">
                <ShieldCheck size={15} className="text-emerald-600 mt-0.5 flex-shrink-0" />
                <span>
                  <strong>Safe Offline Architecture:</strong> Because Site Visit Assistant stores inspection blueprints and photos directly on your device, exporting a backup file to Google Drive, OneDrive, or iCloud ensures 100% data recovery if your app is ever uninstalled.
                </span>
              </div>
            </div>

            {/* Firebase Live Cloud Sync Card (Realtime 2-Way Sync across Phone & Desktop) */}
            <div className="bg-gradient-to-r from-amber-50/90 via-orange-50/80 to-amber-50/70 rounded-2xl p-4 sm:p-5 border border-amber-200/80 shadow-xs space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-xs flex-shrink-0">
                    <Flame size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-gray-900 leading-tight">
                        Firebase Realtime Cloud Sync
                      </h4>
                      {isFirebaseConfigured() ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full flex items-center gap-1">
                          <CheckCircle2 size={11} className="text-emerald-600" />
                          Connected • 5 GB Quota
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-200 rounded-full">
                          5 GB Free Cloud Available
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Live two-way sync between your Phone, Tablet, and Desktop PC with 5 GB free storage
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {isFirebaseConfigured() ? (
                    <>
                      <button
                        type="button"
                        onClick={handleSyncAllProjectsToFirebase}
                        disabled={fbSyncing || projects.length === 0}
                        className="sitepunch-btn-primary px-3.5 py-2 bg-amber-700 hover:bg-amber-800 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
                        title="Synchronize all local projects and blueprints to Firebase Cloud"
                      >
                        {fbSyncing ? <Spinner /> : <RefreshCw size={13} className={fbSyncing ? 'animate-spin' : ''} />}
                        <span>Sync Projects to Cloud</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowFirebaseModal(true)}
                        className="px-3 py-2 bg-white hover:bg-amber-50 text-amber-900 border border-amber-300 rounded-xl text-xs font-medium shadow-2xs transition-colors cursor-pointer"
                        title="Manage Firebase project keys"
                      >
                        Configure
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowFirebaseModal(true)}
                      className="sitepunch-btn-primary px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
                    >
                      <Zap size={14} />
                      <span>Connect Firebase Project</span>
                    </button>
                  )}
                </div>
              </div>

              {fbSyncMsg && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl font-medium flex items-center gap-2 animate-fade-in">
                  <CheckCircle size={14} className="text-emerald-600 flex-shrink-0" />
                  <span>{fbSyncMsg}</span>
                </div>
              )}

              {fbSyncError && (
                <div className="p-2.5 bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl font-medium flex items-center gap-2 animate-fade-in">
                  <AlertCircle size={14} className="text-red-600 flex-shrink-0" />
                  <span>{fbSyncError}</span>
                </div>
              )}

              <div className="bg-white/80 backdrop-blur-xs rounded-xl p-3 border border-amber-100 text-[11px] text-gray-600 flex items-start gap-2 leading-relaxed">
                <Flame size={15} className="text-amber-600 mt-0.5 flex-shrink-0" />
                <span>
                  <strong>Automatic Two-Way Synchronization:</strong> Once connected, changes you make on-site are automatically uploaded, and your office desktop PC updates automatically in real-time. Includes 5 GB free photo storage with zero monthly fees.
                </span>
              </div>
            </div>

            {/* Stored Projects Header & Action Buttons */}
            <div className="flex items-center justify-between flex-wrap gap-3 pt-1">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Stored Projects ({projects.length})</h3>
                <p className="text-xs text-gray-400">
                  Export, import, or activate licenses for projects
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
                    accept=".zip,.sitevisit,.punch,.json,application/json,application/zip"
                    className="hidden"
                    disabled={importing}
                    onChange={handleImportProject}
                  />
                </label>

                {/* New Project Button */}
                <button
                  type="button"
                  onClick={() => {
                    closeSettings()
                    openNewProject({ returnTo: 'manage-projects' })
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
                  const cachedLic = activeLicenses.find(l => l.projectUuid === p.uuid || l.reportUuid === p.uuid)
                  const licenseKey = p.licenseKey || cachedLic?.licenseKey || ''
                  const licensedAt = p.licensedAt || cachedLic?.activatedAt || null
                  const isProjectUnlocked = p.isLicensed || Boolean(licenseKey) || licensedProjectSet.has(p.uuid)
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
                        {isProjectUnlocked && (licenseKey || licensedAt) && (
                          <div className="flex items-center gap-2 text-[11px] text-gray-600 mt-1.5 ml-9.5 flex-wrap">
                            {licenseKey && (
                              <button
                                type="button"
                                onClick={() => handleCopyLicenseKey(p.uuid, licenseKey)}
                                className={`inline-flex items-center gap-1.5 font-mono font-semibold px-2 py-0.5 rounded-md border transition-colors cursor-pointer ${
                                  copiedKeyUuid === p.uuid
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                    : 'text-brand-700 bg-white/80 hover:bg-white border-brand-200/60'
                                }`}
                                title="Click to copy license key"
                              >
                                <span>Key: {licenseKey}</span>
                                {copiedKeyUuid === p.uuid ? (
                                  <>
                                    <Check size={11} className="text-emerald-600 flex-shrink-0" />
                                    <span className="font-sans text-[10px] font-bold">Copied</span>
                                  </>
                                ) : (
                                  <Copy size={11} className="text-gray-400 flex-shrink-0" />
                                )}
                              </button>
                            )}
                            {licensedAt && (
                              <span className="text-gray-500 font-medium">
                                Activated {new Date(licensedAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        )}
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

                        {/* Export, Edit, Delete Buttons */}
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

            {/* Project Import & Export Guidelines Card (Below Stored Projects Cards) */}
            <div className="bg-gradient-to-br from-blue-50/80 via-white to-indigo-50/60 rounded-2xl border border-blue-200/80 p-4 sm:p-5 shadow-2xs space-y-3.5 mt-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-brand-600 text-white rounded-xl shadow-xs flex-shrink-0">
                    <Info size={17} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gray-900 leading-tight">
                      Project Import &amp; Export Guidelines
                    </h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Backup behavior, duplicate handling, and license retention rules
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
                <div className="pt-1 text-xs text-gray-600">
                  <div className="bg-white/90 backdrop-blur-xs p-3.5 sm:p-4 rounded-xl border border-blue-100 shadow-2xs space-y-2.5">
                    <div className="flex items-center gap-2 text-brand-800 font-bold text-xs pb-1.5 border-b border-gray-100">
                      <Download size={15} className="text-brand-600 flex-shrink-0" />
                      <span>Project Import &amp; Export Conditions</span>
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
                          <strong className="text-gray-900 font-semibold">Duplicate Project Handling:</strong> If a project with the same name or internal ID already exists, Site Visit Assistant prompts you with two safe options:
                        </span>
                      </li>
                      <div className="ml-3.5 pl-2 border-l-2 border-blue-200 space-y-1.5 text-[11px] text-gray-500">
                        <p><strong className="text-blue-700">1. Import as Copy:</strong> Creates a separate duplicate named <em>[Name] (Imported)</em> so original data is untouched.</p>
                        <p><strong className="text-amber-700">2. Overwrite / Replace:</strong> Replaces local project with the file backup (ideal for full device restore).</p>
                      </div>
                      <li className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand-500 mt-1.5 flex-shrink-0" />
                        <span>
                          <strong className="text-gray-900 font-semibold">Security &amp; License Retention:</strong> Input data is sanitized against XSS script attacks. Active WordPress project licenses transfer automatically with the file without repurchase.
                        </span>
                      </li>
                    </ul>
                  </div>
                </div>
              )}
            </div>

          </div>
        )}

        {/* TAB: Logs — PDF / Image / CSV export history */}
        {activeTab === 'logs' && (
          <div className="max-w-4xl mx-auto space-y-4">

            {/* Quick Stats Banner — matching front page style */}
            {!loadingLogs && (
              <div className="liquid-glass-surface rounded-2xl p-3 sm:p-4 shadow-sm">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
                  <div className="p-2.5 sm:p-3 bg-white/60 backdrop-blur-md rounded-xl border border-white/80 text-center shadow-2xs">
                    <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500 font-semibold">
                      <FileDown size={14} className="text-red-600 stroke-[2.2]" />
                      <span className="truncate">PDF Exports</span>
                    </div>
                    <p className="text-lg sm:text-2xl font-bold text-gray-900 mt-1">
                      {Object.values(logSummaries).reduce((s, v) => s + (v.pdf || 0), 0)}
                    </p>
                  </div>

                  <div className="p-2.5 sm:p-3 bg-white/60 backdrop-blur-md rounded-xl border border-white/80 text-center shadow-2xs">
                    <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500 font-semibold">
                      <Archive size={14} className="text-blue-600 stroke-[2.2]" />
                      <span className="truncate">Image Exports</span>
                    </div>
                    <p className="text-lg sm:text-2xl font-bold text-gray-900 mt-1">
                      {Object.values(logSummaries).reduce((s, v) => s + (v.zip || 0), 0)}
                    </p>
                  </div>

                  <div className="p-2.5 sm:p-3 bg-white/60 backdrop-blur-md rounded-xl border border-white/80 text-center shadow-2xs">
                    <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500 font-semibold">
                      <FileSpreadsheet size={14} className="text-emerald-600 stroke-[2.2]" />
                      <span className="truncate">CSV Exports</span>
                    </div>
                    <p className="text-lg sm:text-2xl font-bold text-gray-900 mt-1">
                      {Object.values(logSummaries).reduce((s, v) => s + (v.csv || 0), 0)}
                    </p>
                  </div>

                  <div className="p-2.5 sm:p-3 bg-white/60 backdrop-blur-md rounded-xl border border-white/80 text-center shadow-2xs">
                    <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500 font-semibold">
                      <Folder size={14} className="text-amber-600 fill-amber-400/25 stroke-[2.2]" />
                      <span className="truncate">Project Exports</span>
                    </div>
                    <p className="text-lg sm:text-2xl font-bold text-gray-900 mt-1">
                      {Object.values(logSummaries).reduce((s, v) => s + (v.project || 0), 0)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Export History — single card, flat list */}
            <div className="bg-white rounded-2xl border border-gray-200/90 shadow-xs overflow-hidden">

              {/* Card header with filter + refresh */}
              <div className="flex items-center justify-between flex-wrap gap-3 px-4 py-3.5 border-b border-gray-100">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'var(--brand-tint-10, rgba(164,14,38,0.08))', color: 'var(--brand-button, #a40e26)' }}
                  >
                    <ScrollText size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">Export History</h3>
                    <p className="text-[11px] text-gray-400">Last 12 months · PDF, image, and CSV exports per report</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[
                    { id: 'all',     label: 'All' },
                    { id: 'pdf',     label: 'PDF' },
                    { id: 'image',   label: 'Images' },
                    { id: 'csv',     label: 'CSV' },
                    { id: 'project', label: 'Projects' },
                  ].map(f => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setLogFilter(f.id)}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-colors cursor-pointer ${
                        logFilter === f.id
                          ? 'text-white border-transparent'
                          : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                      }`}
                      style={logFilter === f.id ? { background: 'var(--brand-button, #a40e26)', borderColor: 'var(--brand-button, #a40e26)' } : {}}
                    >
                      {f.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={loadLogsTab}
                    className="p-1.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                    title="Refresh"
                  >
                    <RefreshCw size={13} />
                  </button>
                </div>
              </div>

              {/* Loading */}
              {loadingLogs && (
                <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
                  <Spinner />
                  <span className="text-sm">Loading…</span>
                </div>
              )}

              {/* Empty state */}
              {!loadingLogs && allLogs.length === 0 && (
                <div className="py-14 flex flex-col items-center gap-3 text-center px-6">
                  <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center">
                    <ScrollText size={22} className="text-gray-300" />
                  </div>
                  <p className="text-sm font-semibold text-gray-600">No exports in the last 12 months</p>
                  <p className="text-xs text-gray-400">PDF, image, and CSV archive exports will appear here after your first download.</p>
                </div>
              )}

              {/* Flat log list */}
              {!loadingLogs && allLogs.length > 0 && (() => {
                const filtered = allLogs.filter(log => {
                  if (logFilter === 'pdf')     return log.type === 'pdf'
                  if (logFilter === 'image')   return log.type === 'zip'
                  if (logFilter === 'csv')     return log.type === 'csv'
                  if (logFilter === 'project') return log.type === 'project'
                  return true // 'all'
                })

                if (filtered.length === 0) {
                  return (
                    <p className="text-xs text-gray-400 text-center py-10">
                      No {logFilter === 'image' ? 'image' : logFilter === 'project' ? 'project' : logFilter.toUpperCase()} exports in the last 12 months.
                    </p>
                  )
                }

                return (
                  <div className="divide-y divide-gray-100">
                    {filtered.map((log, i) => {
                      const isToday = new Date(log.exportedAt).toDateString() === new Date().toDateString()
                      const dateStr = isToday
                        ? `Today, ${new Date(log.exportedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                        : new Date(log.exportedAt).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })

                      const isPdf = log.type === 'pdf'
                      const isCsv = log.type === 'csv'
                      const isProject = log.type === 'project'
                      const typeMeta = isPdf
                        ? { icon: <FileDown size={12} />, color: 'text-red-600 bg-red-50 border-red-100', label: 'PDF' }
                        : isCsv
                        ? { icon: <FileSpreadsheet size={12} />, color: 'text-emerald-600 bg-emerald-50 border-emerald-100', label: 'CSV' }
                        : isProject
                        ? { icon: <Folder size={12} />, color: 'text-amber-700 bg-amber-50 border-amber-200/80', label: 'Project' }
                        : { icon: <Archive size={12} />, color: 'text-blue-600 bg-blue-50 border-blue-100', label: 'Images' }

                      return (
                        <div
                          key={log.id || i}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/60 transition-colors"
                        >
                          {/* Type badge */}
                          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md border flex-shrink-0 ${typeMeta.color}`}>
                            {typeMeta.icon}
                            {typeMeta.label}
                          </span>

                          {/* Project + report names */}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-gray-900 truncate leading-tight">
                              {log.projectName || '—'}
                            </p>
                            <p className="text-[11px] text-gray-500 truncate leading-tight mt-0.5">
                              {log.reportName && log.reportName !== log.projectName
                                ? log.reportName
                                : (log.filename || '—')}
                            </p>
                          </div>

                          {/* Date + page count */}
                          <div className="flex-shrink-0 text-right">
                            <p className="text-[11px] text-gray-400 whitespace-nowrap">{dateStr}</p>
                            {log.pageCount && (
                              <p className="text-[10px] text-gray-300">{log.pageCount}p</p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}

              {/* Footer count */}
              {!loadingLogs && allLogs.length > 0 && (
                <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/60">
                  <p className="text-[11px] text-gray-400">
                    {allLogs.filter(log => {
                      if (logFilter === 'pdf')     return log.type === 'pdf'
                      if (logFilter === 'image')   return log.type === 'zip'
                      if (logFilter === 'csv')     return log.type === 'csv'
                      if (logFilter === 'project') return log.type === 'project'
                      return true
                    }).length} export{allLogs.filter(log => {
                      if (logFilter === 'pdf')     return log.type === 'pdf'
                      if (logFilter === 'image')   return log.type === 'zip'
                      if (logFilter === 'csv')     return log.type === 'csv'
                      if (logFilter === 'project') return log.type === 'project'
                      return true
                    }).length !== 1 ? 's' : ''} shown · last 12 months
                  </p>
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
            </div>

            {/* WordPress Store & WooCommerce REST API Connection Card */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100 flex-wrap gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-brand-50 text-brand-700 rounded-xl">
                    <Globe size={20} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gray-900">WordPress Store Connection &amp; API Keys</h4>
                    <p className="text-xs text-gray-400">WooCommerce REST API &amp; License Manager (LMFWC) settings</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={wpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1 bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
                  >
                    <span>Visit Store</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>

              {/* Form Fields */}
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1 flex items-center justify-between">
                    <span>WordPress Store URL</span>
                    <span className="text-[10px] text-gray-400 font-normal">e.g. https://www.bimxdesign.com</span>
                  </label>
                  <input
                    type="url"
                    value={wpUrl}
                    onChange={e => {
                      setWpUrl(e.target.value)
                      setWpTestResult(null)
                    }}
                    placeholder="https://www.bimxdesign.com"
                    className="w-full bg-white border border-gray-300 rounded-xl px-3.5 py-2.5 text-xs text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-700 mb-1 block">
                      WooCommerce Consumer Key (<span className="font-mono text-gray-500">ck_...</span>)
                    </label>
                    <input
                      type="text"
                      value={wpConsumerKey}
                      onChange={e => {
                        setWpConsumerKey(e.target.value)
                        setWpTestResult(null)
                      }}
                      placeholder="ck_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      className="w-full bg-white border border-gray-300 rounded-xl px-3.5 py-2.5 text-xs text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-gray-700 mb-1 block">
                      WooCommerce Consumer Secret (<span className="font-mono text-gray-500">cs_...</span>)
                    </label>
                    <div className="relative">
                      <input
                        type={showWpSecret ? 'text' : 'password'}
                        value={wpConsumerSecret}
                        onChange={e => {
                          setWpConsumerSecret(e.target.value)
                          setWpTestResult(null)
                        }}
                        placeholder="cs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                        className="w-full bg-white border border-gray-300 rounded-xl px-3.5 py-2.5 pr-10 text-xs text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                      />
                      <button
                        type="button"
                        onClick={() => setShowWpSecret(!showWpSecret)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                        title={showWpSecret ? 'Hide Secret' : 'Show Secret'}
                      >
                        {showWpSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Test Result Banner */}
              {wpTestResult && (
                <div
                  className={`p-4 rounded-xl border text-xs whitespace-pre-line leading-relaxed ${
                    wpTestResult.success
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {wpTestResult.success ? (
                      <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                    )}
                    <span className="flex-1 font-medium">{wpTestResult.message}</span>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2 border-t border-gray-100 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleTestWpConnection}
                    disabled={wpTesting}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-700 text-xs font-semibold rounded-xl flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    {wpTesting ? <Spinner /> : <RefreshCw size={13} />}
                    <span>{wpTesting ? 'Testing Connection…' : 'Test Store Connection'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleResetWpDefaults}
                    className="px-3 py-2 text-gray-400 hover:text-gray-600 text-xs font-medium transition-colors cursor-pointer"
                    title="Reset to default store settings"
                  >
                    Reset Defaults
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleSaveWpCredentials}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white text-xs font-bold rounded-xl flex items-center gap-2 transition-all shadow-xs cursor-pointer"
                  style={{ background: 'var(--brand-button, #a40e26)' }}
                >
                  {wpSaveSuccess ? <Check size={14} /> : null}
                  <span>{wpSaveSuccess ? 'Credentials Saved!' : 'Save Store Credentials'}</span>
                </button>
              </div>

              {/* Step-by-Step Troubleshooting Guide for 401 & REST API */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowWpTroubleshoot(!showWpTroubleshoot)}
                  className="w-full flex items-center justify-between p-3.5 bg-gray-50 hover:bg-gray-100/80 rounded-xl text-left border border-gray-200/70 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2 text-xs font-bold text-gray-800">
                    <HelpCircle size={15} className="text-brand-600" />
                    <span>How to fix "WordPress API authorization failed (401)"</span>
                  </div>
                  {showWpTroubleshoot ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                </button>

                {showWpTroubleshoot && (
                  <div className="mt-2 p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3 text-xs text-gray-600 leading-relaxed animate-fade-in">
                    <p className="font-semibold text-gray-800">
                      If your WooCommerce key permissions are already set to "Read/Write" and you still get HTTP 401, check these critical WordPress requirements:
                    </p>
                    <ol className="list-decimal pl-4 space-y-2 text-[11.5px]">
                      <li>
                        <strong className="text-gray-800">Key User Role MUST be Administrator:</strong> In WordPress Admin &gt; WooCommerce &gt; Settings &gt; Advanced &gt; REST API, edit your API key. Confirm the <code className="bg-gray-200 px-1 py-0.5 rounded text-gray-800">User</code> assigned to the key is an <strong>Administrator</strong>. If the user is set to a "Shop Manager", "Customer", or "Editor", WooCommerce blocks plugin licensing endpoints and throws 401.
                      </li>
                      <li>
                        <strong className="text-gray-800">Key Permissions:</strong> The key permissions must be set to <strong>Read/Write</strong>. Keys set to "Read" will fail on activation.
                      </li>
                      <li>
                        <strong className="text-gray-800">Save Consumer Key &amp; Secret:</strong> Copy the Consumer Key (<code className="bg-gray-200 px-1 py-0.5 rounded text-gray-800">ck_...</code>) and Consumer Secret (<code className="bg-gray-200 px-1 py-0.5 rounded text-gray-800">cs_...</code>) from WooCommerce into the fields above and click <strong>Save Store Credentials</strong>.
                      </li>
                      <li>
                        <strong className="text-gray-800">LMFWC Client Activation (Recommended):</strong> In WordPress Admin &gt; WooCommerce &gt; Settings &gt; License Manager (or LMFWC menu), check if "Allow client/public activation" or "Client API" is enabled. When enabled, client apps can activate keys directly without exposing admin credentials.
                      </li>
                      <li>
                        <strong className="text-gray-800">Apache / FastCGI Authorization Header:</strong> Some shared web hosts (cPanel, LiteSpeed, FastCGI) strip the HTTP <code className="bg-gray-200 px-1 py-0.5 rounded text-gray-800">Authorization</code> header before it reaches WordPress. Site Visit Assistant automatically sends query parameters to bypass this, but enabling client activation in LMFWC is the cleanest solution.
                      </li>
                      <li>
                        <strong className="text-gray-800">Offline / Test Keys:</strong> You can always test or work on-site without internet by entering <code className="bg-gray-200 px-1 py-0.5 rounded text-gray-800 font-mono">OFFLINE-KEY</code> or <code className="bg-gray-200 px-1 py-0.5 rounded text-gray-800 font-mono">TEST-KEY</code> in the license activation modal.
                      </li>
                    </ol>
                  </div>
                )}
              </div>
            </div>

            {/* PWA / Desktop App System Card */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100 flex-wrap gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-brand-50 text-brand-700 rounded-xl">
                    <Laptop size={20} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gray-900">Application Platform &amp; Offline Status</h4>
                    <p className="text-xs text-gray-400">Desktop (Mac &amp; Windows) &amp; Progressive Web App (PWA)</p>
                  </div>
                </div>
                {isInstalled || isElectron ? (
                  <span className="text-xs font-bold px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full flex items-center gap-1.5">
                    <CheckCircle2 size={13} className="text-emerald-500" />
                    {isElectron ? 'Native Desktop App' : 'Installed Desktop App'}
                  </span>
                ) : canInstall ? (
                  <button
                    type="button"
                    onClick={installApp}
                    className="sitepunch-btn-primary px-3 py-1.5 rounded-xl text-xs font-bold text-white shadow-xs flex items-center gap-1.5 cursor-pointer hover:opacity-95"
                    style={{ background: 'var(--brand-button, #a40e26)' }}
                  >
                    <Download size={13} />
                    <span>Install App on Mac / Windows</span>
                  </button>
                ) : (
                  <span className="text-xs font-medium px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
                    Web &amp; PWA Ready
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-100">
                  <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Offline Persistence</p>
                  <p className="font-bold text-gray-800 text-sm mt-1 flex items-center gap-1.5">
                    <ShieldCheck size={15} className="text-emerald-600" />
                    <span>{isPersistent ? 'Protected Storage' : 'Standard Storage'}</span>
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">
                    Projects &amp; drawings are protected from browser cleanup.
                  </p>
                </div>

                <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-100">
                  <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Local Cache Storage</p>
                  <p className="font-bold text-gray-800 text-sm mt-1 flex items-center gap-1.5">
                    <HardDrive size={15} className="text-brand-600" />
                    <span>{storageInfo ? `${storageInfo.usageMB} MB Local` : 'Offline Ready'}</span>
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">
                    Stores reports, pins, and high-res photos locally on device.
                  </p>
                </div>

                <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-100">
                  <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Network Connection</p>
                  <p className={`font-bold text-sm mt-1 flex items-center gap-1.5 ${isOffline ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {isOffline ? (
                      <>
                        <WifiOff size={15} />
                        <span>Working Offline</span>
                      </>
                    ) : (
                      <>
                        <Wifi size={15} />
                        <span>Online &amp; Synced</span>
                      </>
                    )}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">
                    {isOffline ? 'Full access to your reports without internet.' : 'Ready for cloud backup & exports.'}
                  </p>
                </div>
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
          className="flex-shrink-0 bg-white border-t border-gray-200 px-4 pt-3 pb-3 shadow-xl z-20"
          style={{
            paddingBottom: 'max(12px, env(safe-area-inset-bottom, 0px))',
            paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
            paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))',
          }}
        >
          <div className="max-w-4xl mx-auto w-full">
            <button
              onClick={handleSave}
              disabled={saving}
              className="sitepunch-btn-primary w-full bg-brand-700 hover:bg-brand-800 disabled:opacity-60 text-white py-3.5 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2 shadow-md cursor-pointer"
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

      {/* Safeguarded Delete Project Modal */}
      {deletingProject && (
        <DeleteProjectModal
          project={deletingProject}
          onClose={() => setDeletingProject(null)}
          onConfirmDelete={confirmDeleteProject}
        />
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
                <p className="text-xs text-gray-500">Choose how to handle the incoming project without data loss</p>
              </div>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              A project named <strong className="text-gray-900 font-bold">"{importConflictData.existingProject.name}"</strong> already exists on this device.
            </p>

            {/* Comparison Overview */}
            <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-gray-50 border border-gray-200/80 text-[11px]">
              <div className="space-y-0.5">
                <span className="font-semibold text-gray-500 uppercase tracking-wider text-[10px]">On This Device</span>
                <p className="font-bold text-gray-900">
                  {importConflictData.localReportCount ?? '—'} Reports • {importConflictData.localItemCount ?? '—'} Observations
                </p>
              </div>
              <div className="space-y-0.5 border-l border-gray-200 pl-2.5">
                <span className="font-semibold text-gray-500 uppercase tracking-wider text-[10px]">Incoming Backup</span>
                <p className="font-bold text-gray-900">
                  {importConflictData.incomingReportCount ?? '—'} Reports • {importConflictData.incomingItemCount ?? '—'} Observations
                </p>
              </div>
            </div>

            <div className="space-y-2.5 text-xs">
              {/* Option 1: Merge Data (Recommended - Zero Data Loss) */}
              <button
                type="button"
                onClick={() => handleInitiateMerge(importConflictData.existingProject.uuid, importConflictData.fileData)}
                disabled={importing}
                className="w-full text-left p-3.5 rounded-xl border-2 border-emerald-300 bg-emerald-50/70 hover:bg-emerald-50 hover:border-emerald-400 transition-all flex items-start gap-3 group cursor-pointer shadow-xs"
              >
                <div className="p-2 bg-emerald-600 text-white rounded-lg group-hover:scale-105 transition-transform flex-shrink-0">
                  <GitMerge size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-emerald-950 text-xs">Merge Data</p>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-200 text-emerald-800">
                      Recommended • Zero Data Loss
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-900 mt-1 leading-snug">
                    Safely combines reports, drawings, observations, and photos into your existing project. No local work is deleted or lost.
                  </p>
                </div>
              </button>

              {/* Option 2: Copy */}
              <button
                type="button"
                onClick={() => executeImport(importConflictData.fileData, true)}
                disabled={importing}
                className="w-full text-left p-3 rounded-xl border border-blue-200 bg-blue-50/50 hover:bg-blue-50 hover:border-blue-300 transition-all flex items-start gap-3 group cursor-pointer"
              >
                <div className="p-2 bg-brand-600 text-white rounded-lg group-hover:scale-105 transition-transform flex-shrink-0">
                  <Copy size={16} />
                </div>
                <div>
                  <p className="font-bold text-blue-950 text-xs">Import as New Duplicate Copy</p>
                  <p className="text-[11px] text-blue-800 mt-0.5">
                    Creates a separate duplicate named <em>"{importConflictData.fileData.project.name} (Imported)"</em> so existing project remains completely untouched.
                  </p>
                </div>
              </button>

              {/* Option 3: Overwrite */}
              <button
                type="button"
                onClick={() => executeOverwrite(importConflictData.fileData, importConflictData.existingProject.uuid)}
                disabled={importing}
                className="w-full text-left p-3 rounded-xl border border-gray-200 bg-gray-50 hover:bg-red-50 hover:border-red-200 transition-all flex items-start gap-3 group cursor-pointer"
              >
                <div className="p-2 bg-gray-500 text-white rounded-lg group-hover:bg-red-600 transition-colors flex-shrink-0">
                  <RefreshCw size={16} />
                </div>
                <div>
                  <p className="font-bold text-gray-800 group-hover:text-red-900 text-xs">Overwrite / Replace Existing Project</p>
                  <p className="text-[11px] text-gray-500 group-hover:text-red-700 mt-0.5">
                    Replaces local project data with this backup. An automatic safety restore snapshot will be created beforehand so nothing can be permanently lost.
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

      {/* Individual Site Visit Report Conflict Resolution Modal */}
      {reportConflictData && (
        <ReportConflictModal
          conflictData={reportConflictData}
          onMerge={handleResolveReportConflictMerge}
          onOverwrite={handleResolveReportConflictOverwrite}
          onDuplicate={handleResolveReportConflictDuplicate}
          onClose={() => setReportConflictData(null)}
          loading={importing}
        />
      )}

      {/* Observation Pin Comparison & Conflict Modal */}
      {observationConflictReport && (
        <ObservationConflictModal
          conflictReport={observationConflictReport}
          onApplyDecisions={handleApplyObservationDecisions}
          onCancel={() => {
            setObservationConflictReport(null)
            setPendingMergeData(null)
          }}
          loading={importing}
        />
      )}

      {/* Firebase Setup & Connection Modal */}
      {showFirebaseModal && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden border border-gray-100 slide-up max-h-[90vh] flex flex-col">
            <div className="p-5 text-white bg-amber-600 flex items-start justify-between">
              <div>
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center mb-2 shadow-xs">
                  <Flame size={22} className="text-white" />
                </div>
                <h3 className="font-bold text-base leading-tight">
                  Connect Free Firebase Project
                </h3>
                <p className="text-xs text-amber-100 mt-1">
                  Enables live multi-device two-way sync with 5 GB free cloud storage
                </p>
              </div>
              <button
                onClick={() => setShowFirebaseModal(false)}
                className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-full cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveFirebaseConfig} className="p-5 overflow-y-auto space-y-4 text-xs">
              {fbSyncError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl font-medium">
                  {fbSyncError}
                </div>
              )}

              <div className="bg-amber-50/60 p-3 rounded-xl border border-amber-200 text-[11px] text-amber-900 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <Info size={13} className="text-amber-700" />
                  How to get your free credentials in 2 minutes:
                </p>
                <ol className="list-decimal list-inside space-y-0.5 text-gray-700 ml-1">
                  <li>Go to <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" className="text-amber-800 font-bold underline">console.firebase.google.com</a> and click <em>Create Project</em>.</li>
                  <li>Click the Web icon (<strong>&lt;/&gt;</strong>) in your project to register an app.</li>
                  <li>Copy and paste the configuration keys or JSON snippet below.</li>
                </ol>
              </div>

              <div>
                <label className="font-bold text-gray-700 uppercase tracking-wide block mb-1">
                  Firebase API Key *
                </label>
                <input
                  type="text"
                  value={fbApiKey}
                  onChange={e => setFbApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-gray-50/50 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-gray-700 uppercase tracking-wide block mb-1">
                    Project ID *
                  </label>
                  <input
                    type="text"
                    value={fbProjectId}
                    onChange={e => setFbProjectId(e.target.value)}
                    placeholder="my-site-project-123"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-gray-50/50 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-gray-700 uppercase tracking-wide block mb-1">
                    Storage Bucket (Optional)
                  </label>
                  <input
                    type="text"
                    value={fbStorageBucket}
                    onChange={e => setFbStorageBucket(e.target.value)}
                    placeholder="my-site-project-123.appspot.com"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-gray-50/50 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-gray-700 uppercase tracking-wide block mb-1">
                  Or Paste Full Firebase Config Object (JSON)
                </label>
                <textarea
                  rows={3}
                  value={fbRawJson}
                  onChange={e => setFbRawJson(e.target.value)}
                  placeholder="const firebaseConfig = { apiKey: '...', projectId: '...' };"
                  className="w-full border border-gray-200 rounded-xl p-2.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-gray-50/50 font-mono"
                />
              </div>

              <div className="pt-2 flex items-center justify-between gap-2">
                {isFirebaseConfigured() ? (
                  <button
                    type="button"
                    onClick={handleDisconnectFirebase}
                    className="px-3 py-2 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl border border-red-200 transition-colors cursor-pointer"
                  >
                    Disconnect
                  </button>
                ) : <div />}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowFirebaseModal(false)}
                    className="px-3.5 py-2 text-xs font-semibold text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    Save &amp; Connect
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
