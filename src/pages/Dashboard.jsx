import React, { useState, useEffect } from 'react'
import {
  Plus, FolderOpen, Folder, Settings, Download, Trash2, Edit2,
  ChevronRight, AlertCircle, Filter, Check,
  FileImage, ClipboardList, Clock, CheckCircle, Shield, MapPin,
  Lock, Unlock, Camera, FileText, Calendar, WifiOff
} from 'lucide-react'
import { usePwa } from '../utils/pwa'
import { useAppStore } from '../store/useAppStore'
import { getAllProjects, deleteProject, db } from '../db/database'
import EditProjectModal from '../components/EditProjectModal'
import LicenseActivationModal from '../components/LicenseActivationModal'
import DeleteProjectModal from '../components/DeleteProjectModal'
import WelcomeChecklist from '../components/WelcomeChecklist'
import { getLicensedProjectUuids } from '../services/licenseService'
import { formatFirstAndLastInitial, formatDatePattern } from '../utils/formatters'
import { getExportedPdfCount } from '../utils/exportCounter'

function formatRelativeOrDate(timestamp) {
  if (!timestamp) return ''
  const diff = Date.now() - timestamp
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  try {
    return formatDatePattern(new Date(timestamp).toISOString().slice(0, 10))
  } catch {
    return ''
  }
}

const STATUS_STYLES = {
  Active:    'bg-green-100 text-green-800 border border-green-200',
  Closed:    'bg-gray-200 text-gray-700 border border-gray-300 font-semibold',
}
const STATUS_ICON = {
  Active:    <Clock size={12} />,
  Closed:    <CheckCircle size={12} />,
}

export default function Dashboard() {
  const {
    openNewProject,
    openSettings,
    navigateToProjects,
    navigateToProject,
    openPDFPreview,
    setCurrentProject,
    companyLogo,
    companyName,
    currentUser,
    showChecklist,
    setShowChecklist,
  } = useAppStore()
  const [projects, setProjects] = useState([])
  const [recentProjects, setRecentProjects] = useState([])
  const [recentReports, setRecentReports] = useState([])
  const [loading, setLoading]   = useState(true)
  const [deleting, setDeleting] = useState(null)
  const [deletingProject, setDeletingProject] = useState(null)
  const [editingProject, setEditingProject] = useState(null)
  const [payingProject, setPayingProject] = useState(null)
  const [licensedProjectSet, setLicensedProjectSet] = useState(() => getLicensedProjectUuids())
  const [filter, setFilter] = useState('All')
  const [showFilter, setShowFilter] = useState(false)
  const [showAdminModal, setShowAdminModal] = useState(false)
  const [stats, setStats] = useState({
    totalProjects: 0,
    totalReports: 0,
    totalDrawings: 0,
    totalPins: 0,
    totalPhotos: 0,
    totalExportedPdfs: 0,
  })

  const { canInstall, isOffline, installApp } = usePwa()

  const handleExport = (proj) => {
    setCurrentProject(proj.uuid)
    openPDFPreview()
  }

  const load = async () => {
    try {
      setLicensedProjectSet(getLicensedProjectUuids())
      const [p, allPhases, allFps, allItems] = await Promise.all([
        getAllProjects(),
        db.phases.toArray(),
        db.floorPlans.toArray(),
        db.punchItems.toArray(),
      ])

      const augmented = p.map(proj => {
        const projPhases = allPhases.filter(ph => ph.projectUuid === proj.uuid)
        const projFps = allFps.filter(fp => fp.projectUuid === proj.uuid)
        const projFpUuids = new Set(projFps.map(f => f.uuid))
        const projItems = allItems.filter(it => it.projectUuid === proj.uuid || projFpUuids.has(it.floorPlanUuid))

        const pinCount = projItems.length > 0 ? projItems.length : (proj.totalItems || 0)
        const status = proj.status === 'In Review' ? 'Active' : (proj.status || 'Active')

        return {
          ...proj,
          status,
          reportCount: projPhases.length > 0 ? projPhases.length : (projFps.length > 0 ? 1 : 0),
          drawingCount: projFps.length,
          pinCount,
        }
      })

      setProjects(augmented)

      // Compute recent projects (top 4 by most recent activity)
      const sortedProjs = [...augmented].sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
      setRecentProjects(sortedProjs.slice(0, 4))

      // Compute recent reports across projects (top 4 by activity / visitDate)
      const projectMap = new Map(augmented.map(proj => [proj.uuid, proj]))
      const augmentedReports = allPhases
        .map(ph => {
          const parentProj = projectMap.get(ph.projectUuid)
          if (!parentProj) return null
          const phaseFps = allFps.filter(fp => fp.phaseUuid === ph.uuid || (!fp.phaseUuid && ph.isDefault))
          const phaseFpUuids = new Set(phaseFps.map(f => f.uuid))
          const phasePins = allItems.filter(i => (i.phaseUuid === ph.uuid) || phaseFpUuids.has(i.floorPlanUuid))
          const time = ph.updatedAt || ph.createdAt || (ph.visitDate ? new Date(ph.visitDate).getTime() : 0) || (parentProj.updatedAt || parentProj.createdAt || 0)
          return {
            ...ph,
            projectName: parentProj.name,
            projectNumber: parentProj.projectNumber,
            drawingCount: phaseFps.length,
            pinCount: phasePins.length,
            sortTime: time,
          }
        })
        .filter(Boolean)
        .sort((a, b) => b.sortTime - a.sortTime)

      setRecentReports(augmentedReports.slice(0, 4))

      const [totalPhotos, totalExportedPdfs] = await Promise.all([
        db.photos.count().catch(() => 0),
        Promise.resolve(getExportedPdfCount()),
      ])

      setStats({
        totalProjects: p.length,
        totalReports: allPhases.length,
        totalDrawings: allFps.length,
        totalPins: allItems.length,
        totalPhotos,
        totalExportedPdfs,
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (!showFilter) return
    const handleClickOutside = (e) => {
      if (!e.target.closest('#project-filter-container')) {
        setShowFilter(false)
      }
    }
    window.addEventListener('click', handleClickOutside)
    return () => window.removeEventListener('click', handleClickOutside)
  }, [showFilter])

  async function handleDelete(e, uuid) {
    e.stopPropagation()
    const proj = projects.find(p => p.uuid === uuid)
    if (proj) setDeletingProject(proj)
  }

  async function confirmDeleteProject(proj) {
    setDeleting(proj.uuid)
    try {
      await deleteProject(proj.uuid)
      await load()
      setDeletingProject(null)
    } finally {
      setDeleting(null)
    }
  }

  // Active projects kept at the top by default unless user changes thru filters
  const filteredProjects = projects
    .filter(p => filter === 'All' || p.status === filter)
    .sort((a, b) => {
      if (filter === 'All') {
        const aActive = a.status === 'Active' ? 1 : 0
        const bActive = b.status === 'Active' ? 1 : 0
        if (aActive !== bActive) {
          return bActive - aActive // Active (1) comes before Closed (0)
        }
      }
      const aTime = a.updatedAt || a.createdAt || 0
      const bTime = b.updatedAt || b.createdAt || 0
      return bTime - aTime
    })

  const userDisplayName = formatFirstAndLastInitial(currentUser?.firstName, currentUser?.lastName, currentUser?.name)

  return (
    <div className="flex flex-col h-full">
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
        <div className="flex items-center justify-between min-h-[46px]">
          <div className="flex items-center gap-3.5 min-w-0">
            {companyLogo && (
              <img
                src={companyLogo}
                alt="Logo"
                className="h-11 w-auto max-w-[160px] object-contain rounded-lg bg-white/10 p-1 flex-shrink-0 border border-white/20 shadow-sm block"
              />
            )}
            <div className="flex flex-col justify-center min-w-0">
              <h1 className="text-xl font-bold tracking-tight leading-tight truncate">
                {companyName?.trim() || 'Site Visit Assistant'}
              </h1>
              <p className="text-brand-200 text-xs truncate leading-tight mt-0.5">Simply on-site reports for Architects and Contractors</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {isOffline && (
              <span
                className="px-2.5 py-1 rounded-xl bg-amber-500/20 text-amber-200 border border-amber-400/40 text-[11px] font-semibold flex items-center gap-1.5 backdrop-blur-md shadow-2xs"
                title="Operating in offline mode. All your observations and reports are safely stored on this device."
              >
                <WifiOff size={13} className="text-amber-300 animate-pulse" />
                <span className="hidden sm:inline">Offline</span>
              </span>
            )}
            {canInstall && (
              <button
                onClick={installApp}
                className="liquid-glass-btn px-2.5 py-1.5 rounded-xl text-white hover:text-white transition-all flex items-center gap-1.5 text-xs font-bold shadow-xs cursor-pointer border border-white/30 hover:border-white/60"
                title="Install Site Visit Assistant application on Mac or Windows"
              >
                <Download size={14} className="text-white" />
                <span className="hidden sm:inline">Install App</span>
              </button>
            )}
            {userDisplayName && (
              <span className="text-white/95 font-semibold text-xs sm:text-sm tracking-tight truncate max-w-[150px] sm:max-w-[220px] select-none pr-1">
                {userDisplayName}
              </span>
            )}
            <button
              onClick={openSettings}
              className="liquid-glass-btn min-w-[44px] min-h-[44px] p-2.5 rounded-xl text-white hover:text-white transition-all flex items-center justify-center flex-shrink-0 my-auto cursor-pointer"
              aria-label="Settings"
              title="Settings"
            >
              <Settings size={20} className="block" />
            </button>
          </div>
        </div>
      </header>

      {/* Body */}
      <main
        className="flex-1 overflow-y-auto p-4 scrollbar-hide space-y-4"
        style={{
          paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))',
          paddingLeft: 'calc(1rem + env(safe-area-inset-left, 0px))',
          paddingRight: 'calc(1rem + env(safe-area-inset-right, 0px))',
        }}
      >
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Dashboard Statistics */}
            <div className="liquid-glass-surface rounded-2xl p-3 sm:p-4 shadow-sm">
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-2.5">
                <div className="p-2.5 sm:p-3 bg-white/60 backdrop-blur-md rounded-xl border border-white/80 text-center shadow-2xs">
                  <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500 font-semibold">
                    <Folder size={14} className="text-amber-600 fill-amber-400/25 stroke-[2.2]" />
                    <span className="truncate">Projects</span>
                  </div>
                  <p className="text-lg sm:text-2xl font-bold text-gray-900 mt-1">{stats.totalProjects}</p>
                </div>

                <div className="p-2.5 sm:p-3 bg-white/60 backdrop-blur-md rounded-xl border border-white/80 text-center shadow-2xs">
                  <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500 font-semibold">
                    <ClipboardList size={14} className="text-purple-700 stroke-[2.2]" />
                    <span className="truncate">Site Visits</span>
                  </div>
                  <p className="text-lg sm:text-2xl font-bold text-gray-900 mt-1">{stats.totalReports}</p>
                </div>

                <div className="p-2.5 sm:p-3 bg-white/60 backdrop-blur-md rounded-xl border border-white/80 text-center shadow-2xs">
                  <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500 font-semibold">
                    <FileImage size={14} className="stroke-[2.2]" style={{ color: 'var(--punch-pin-color, #a40e26)' }} />
                    <span className="truncate">Key Plans</span>
                  </div>
                  <p className="text-lg sm:text-2xl font-bold text-gray-900 mt-1">{stats.totalDrawings}</p>
                </div>

                <div className="p-2.5 sm:p-3 bg-white/60 backdrop-blur-md rounded-xl border border-white/80 text-center shadow-2xs">
                  <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500 font-semibold">
                    <AlertCircle size={14} className="stroke-[2.2]" style={{ color: 'var(--punch-pin-color, #a40e26)' }} />
                    <span className="truncate">Punch Pins</span>
                  </div>
                  <p className="text-lg sm:text-2xl font-bold text-gray-900 mt-1">
                    {stats.totalPins}
                  </p>
                </div>

                <div className="p-2.5 sm:p-3 bg-white/60 backdrop-blur-md rounded-xl border border-white/80 text-center shadow-2xs">
                  <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500 font-semibold">
                    <Camera size={14} className="text-emerald-600" />
                    <span className="truncate">Photos</span>
                  </div>
                  <p className="text-lg sm:text-2xl font-bold text-gray-900 mt-1">
                    {stats.totalPhotos ?? 0}
                  </p>
                </div>

                <div className="p-2.5 sm:p-3 bg-white/60 backdrop-blur-md rounded-xl border border-white/80 text-center shadow-2xs">
                  <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500 font-semibold">
                    <FileText size={14} className="text-purple-600" />
                    <span className="truncate">PDF Exports</span>
                  </div>
                  <p className="text-lg sm:text-2xl font-bold text-gray-900 mt-1">
                    {stats.totalExportedPdfs ?? 0}
                  </p>
                </div>
              </div>
            </div>

            {/* Welcome (Getting Started Checklist) Card */}
            {showChecklist && (
              <WelcomeChecklist
                stats={stats}
                projects={projects}
                onClose={() => setShowChecklist(false)}
              />
            )}

            {/* Quick Access: Recent Projects & Recent Site Visits Side-by-Side on Large Screens */}
            {projects.length === 0 ? (
              <EmptyState onNew={openNewProject} />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 items-start">
                {/* Recent Projects Card */}
                <div className="liquid-glass-surface rounded-2xl p-4 sm:p-5 border border-white/60 shadow-xs flex flex-col min-w-0">
                  <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-200/60">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-200/70 flex items-center justify-center text-amber-600 flex-shrink-0 shadow-2xs">
                        <Folder size={15} className="fill-amber-400/25 stroke-[2.2]" />
                      </div>
                      <h2 className="text-sm sm:text-base font-bold text-gray-900 tracking-tight">
                        Recent Projects
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={navigateToProjects}
                      className="sitepunch-btn-primary inline-flex items-center gap-1.5 text-xs font-bold text-white px-3 sm:px-3.5 py-1.5 rounded-xl shadow-xs cursor-pointer transition-all hover:opacity-95 active:scale-95 flex-shrink-0"
                      style={{ background: 'var(--brand-button, #a40e26)' }}
                      title="See all projects in the application page"
                    >
                      <span>See All Projects</span>
                      <ChevronRight size={13} className="stroke-[2.5]" />
                    </button>
                  </div>

                  {recentProjects.length === 0 ? (
                    <p className="text-xs text-gray-400 py-3 text-center">No recent projects</p>
                  ) : (
                    <div className="space-y-2">
                      {recentProjects.map(proj => (
                        <div
                          key={proj.uuid}
                          onClick={() => navigateToProject(proj.uuid)}
                          className="group w-full px-3.5 py-2.5 rounded-xl bg-white/70 hover:bg-white border border-gray-200/80 hover:border-brand-300 transition-all cursor-pointer shadow-2xs hover:shadow-xs flex items-center justify-between gap-3"
                          role="button"
                          tabIndex={0}
                          title={`Open ${proj.name}`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-200/70 flex items-center justify-center text-amber-600 flex-shrink-0 shadow-2xs">
                              <Folder size={15} className="fill-amber-400/25 stroke-[2.2]" />
                            </div>
                            <span className="font-semibold text-xs sm:text-sm text-gray-900 group-hover:text-brand-700 truncate transition-colors">
                              {proj.name}
                            </span>
                            {proj.status && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 ${
                                proj.status === 'Active'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-gray-100 text-gray-600'
                              }`}>
                                {proj.status}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 text-[11px] text-gray-400">
                            {(proj.updatedAt || proj.createdAt) && (
                              <span>
                                {formatRelativeOrDate(proj.updatedAt || proj.createdAt)}
                              </span>
                            )}
                            <ChevronRight size={15} className="text-gray-400 group-hover:text-brand-600 group-hover:translate-x-0.5 transition-all" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recent Site Visits Card */}
                <div className="liquid-glass-surface rounded-2xl p-4 sm:p-5 border border-white/60 shadow-xs flex flex-col min-w-0">
                  <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-200/60">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-purple-50 border border-purple-200/70 flex items-center justify-center text-purple-700 flex-shrink-0 shadow-2xs">
                        <ClipboardList size={15} className="stroke-[2.2]" />
                      </div>
                      <h2 className="text-sm sm:text-base font-bold text-gray-900 tracking-tight">
                        Recent Site Visits
                      </h2>
                    </div>
                  </div>

                  {recentReports.length === 0 ? (
                    <p className="text-xs text-gray-400 py-3 text-center">No site visits recorded yet</p>
                  ) : (
                    <div className="space-y-2">
                      {recentReports.map(rep => (
                        <div
                          key={rep.uuid}
                          onClick={() => navigateToProject(rep.projectUuid, rep.uuid)}
                          className="group w-full px-3.5 py-2.5 rounded-xl bg-white/70 hover:bg-white border border-gray-200/80 hover:border-purple-300 transition-all cursor-pointer shadow-2xs hover:shadow-xs flex items-center justify-between gap-3"
                          role="button"
                          tabIndex={0}
                          title={`Open ${rep.name || 'Site Visit'} in ${rep.projectName}`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className="w-7 h-7 rounded-lg bg-purple-50 border border-purple-200/70 flex items-center justify-center text-purple-700 flex-shrink-0 shadow-2xs">
                              <ClipboardList size={15} className="stroke-[2.2]" />
                            </div>
                            <span className="font-semibold text-xs sm:text-sm text-gray-900 group-hover:text-purple-700 truncate transition-colors">
                              {rep.name || 'Site Visit'}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium truncate max-w-[120px] sm:max-w-[200px] flex-shrink-0">
                              {rep.projectName}
                            </span>
                            {rep.visitDate && (
                              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 font-medium flex-shrink-0">
                                <Calendar size={10} />
                                {formatDatePattern(rep.visitDate)}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 text-[11px] text-gray-400">
                            {rep.sortTime && (
                              <span>
                                {formatRelativeOrDate(rep.sortTime)}
                              </span>
                            )}
                            <ChevronRight size={15} className="text-gray-400 group-hover:text-purple-600 group-hover:translate-x-0.5 transition-all" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* FAB */}
      <div
        className="fixed z-20"
        style={{
          bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))',
          right: 'calc(1.5rem + env(safe-area-inset-right, 0px))',
        }}
      >
        <button
          onClick={openNewProject}
          className="sitepunch-fab flex items-center gap-2 bg-brand-700 hover:bg-brand-800 active:scale-95 text-white px-5 py-3.5 rounded-full shadow-2xl transition-all font-semibold text-sm cursor-pointer"
          style={{ background: 'var(--brand-button, #1d4ed8)' }}
          title="Create a new project"
        >
          <Plus size={20} />
          <span>New Project</span>
        </button>
      </div>

      {/* Safeguarded Delete Project Modal */}
      {deletingProject && (
        <DeleteProjectModal
          project={deletingProject}
          onClose={() => setDeletingProject(null)}
          onConfirmDelete={confirmDeleteProject}
        />
      )}
    </div>
  )
}

function EmptyState({ onNew }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-center px-6">
      <div className="w-20 h-20 bg-brand-50 rounded-full flex items-center justify-center mb-4">
        <FolderOpen size={36} className="text-brand-400" />
      </div>
      <h3 className="text-lg font-semibold text-gray-700">No Projects Yet</h3>
      <p className="text-gray-400 text-sm mt-2 leading-relaxed">
        Create your first project to start adding punch list items to your key plans.
      </p>
      <button
        onClick={onNew}
        className="sitepunch-btn-primary mt-6 bg-brand-700 text-white px-6 py-3 rounded-full font-semibold text-sm shadow-md hover:bg-brand-800 transition-colors"
        style={{ background: 'var(--brand-button, #1d4ed8)' }}
      >
        Create First Project
      </button>
    </div>
  )
}
