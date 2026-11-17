import React, { useState, useEffect } from 'react'
import {
  Plus, FolderOpen, Folder, Settings, Download, Trash2, Edit2,
  ChevronRight, AlertCircle, Filter, Check, ArrowLeft,
  FileImage, ClipboardList, Clock, CheckCircle, Shield, MapPin,
  Lock, Unlock, Camera, FileText, Search, X, Home
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { getAllProjects, deleteProject, db } from '../db/database'
import EditProjectModal from '../components/EditProjectModal'
import LicenseActivationModal from '../components/LicenseActivationModal'
import DeleteProjectModal from '../components/DeleteProjectModal'
import Breadcrumbs from '../components/Breadcrumbs'
import { getLicensedProjectUuids } from '../services/licenseService'
import { formatFirstAndLastInitial } from '../utils/formatters'
import { getExportedPdfCount } from '../utils/exportCounter'

const STATUS_STYLES = {
  Active:    'bg-green-100 text-green-800 border border-green-200',
  Closed:    'bg-gray-200 text-gray-700 border border-gray-300 font-semibold',
}
const STATUS_ICON = {
  Active:    <Clock size={12} />,
  Closed:    <CheckCircle size={12} />,
}

export default function ProjectsView() {
  const {
    openNewProject,
    openSettings,
    navigateToDashboard,
    navigateToProject,
    openPDFPreview,
    setCurrentProject,
    companyLogo,
    companyName,
    currentUser,
  } = useAppStore()
  const [projects, setProjects] = useState([])
  const [loading, setLoading]   = useState(true)
  const [deleting, setDeleting] = useState(null)
  const [deletingProject, setDeletingProject] = useState(null)
  const [editingProject, setEditingProject] = useState(null)
  const [payingProject, setPayingProject] = useState(null)
  const [licensedProjectSet, setLicensedProjectSet] = useState(() => getLicensedProjectUuids())
  const [filter, setFilter] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [showFilter, setShowFilter] = useState(false)
  const [stats, setStats] = useState({
    totalProjects: 0,
    totalReports: 0,
    totalDrawings: 0,
    totalPins: 0,
    totalPhotos: 0,
    totalExportedPdfs: 0,
  })

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
      if (!e.target.closest('#projects-view-filter-container')) {
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
    .filter(p => {
      if (filter !== 'All' && p.status !== filter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchName = (p.name || '').toLowerCase().includes(q)
        const matchNum = (p.number || p.projectNumber || '').toLowerCase().includes(q)
        const matchAddr = (p.address || '').toLowerCase().includes(q)
        const matchClient = (p.client || '').toLowerCase().includes(q)
        return matchName || matchNum || matchAddr || matchClient
      }
      return true
    })
    .sort((a, b) => {
      if (filter === 'All') {
        const aActive = a.status === 'Active' ? 1 : 0
        const bActive = b.status === 'Active' ? 1 : 0
        if (aActive !== bActive) {
          return bActive - aActive
        }
      }
      const aTime = a.updatedAt || a.createdAt || 0
      const bTime = b.updatedAt || b.createdAt || 0
      return bTime - aTime
    })

  const userDisplayName = formatFirstAndLastInitial(currentUser?.firstName, currentUser?.lastName, currentUser?.name)

  return (
    <div className="flex flex-col h-full">
      {/* Header with Back button to Dashboard */}
      <header
        className="sitepunch-header bg-brand-800 text-white shadow-lg flex-shrink-0 relative z-50"
        style={{
          background: 'var(--brand-header, #1e40af)',
          paddingTop: 'calc(14px + env(safe-area-inset-top, 0px))',
          paddingBottom: '14px',
          paddingLeft: 'calc(1rem + env(safe-area-inset-left, 0px))',
          paddingRight: 'calc(1rem + env(safe-area-inset-right, 0px))',
        }}
      >
        <div className="flex items-center gap-2 min-h-[44px] max-w-4xl mx-auto w-full">
          {/* Yellow Box: Back Arrow Button like report page */}
          <button
            onClick={navigateToDashboard}
            className="liquid-glass-btn min-w-[40px] min-h-[40px] p-2 -ml-1 rounded-xl text-white transition-all flex items-center justify-center flex-shrink-0 cursor-pointer"
            title="Back to Dashboard"
          >
            <ArrowLeft size={20} />
          </button>

          {/* Red Box: 'Projects' title like report page and below that organization name */}
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <h1 className="font-extrabold text-base sm:text-lg leading-tight truncate text-white drop-shadow-xs">
              Projects
            </h1>
            <p className="text-white/85 text-xs sm:text-sm leading-tight mt-0.5 truncate font-medium">
              {companyName?.trim() || 'Site Visit Assistant'}
            </p>
          </div>

          {/* Green Box: Project Search Bar and Filter Button Styled Like Report Bar */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Search Bar */}
            <div className="relative flex items-center">
              <Search size={14} className="absolute left-3 text-white/70 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search projects..."
                className="liquid-glass-btn h-[40px] pl-8 pr-7 text-xs text-white placeholder-white/60 rounded-xl focus:outline-none focus:ring-1 focus:ring-white/80 w-28 sm:w-44 md:w-56 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 text-white/70 hover:text-white p-0.5 cursor-pointer"
                  title="Clear search"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Filter Button Styled Like Report Bar */}
            <div className="relative flex-shrink-0 z-50" id="projects-view-filter-container">
              <button
                type="button"
                onClick={() => setShowFilter(f => !f)}
                className={`liquid-glass-btn min-h-[40px] px-3 sm:px-3.5 rounded-xl transition-all flex items-center justify-center gap-1.5 text-white text-xs font-bold flex-shrink-0 cursor-pointer ${
                  filter !== 'All' ? 'bg-white/30 ring-1 ring-white/50' : ''
                }`}
                title="Filter projects by status"
              >
                <Filter size={14} className="text-white" />
                <span>{filter === 'All' ? 'Filter' : filter}</span>
              </button>
              {showFilter && (
                <div
                  className="bg-white/95 backdrop-blur-xl border border-gray-200/90 rounded-2xl p-1.5 shadow-2xl"
                  style={{
                    position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 9999,
                    minWidth: 140,
                  }}
                >
                  {['All', 'Active', 'Closed'].map(o => (
                    <button
                      key={o}
                      onClick={() => { setFilter(o); setShowFilter(false) }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between cursor-pointer transition-colors"
                      style={{
                        background: filter === o ? 'var(--brand-50, #eff6ff)' : 'transparent',
                        color:      filter === o ? 'var(--brand-color, #1d4ed8)' : '#374151',
                        fontWeight: filter === o ? 700 : 500,
                      }}
                    >
                      <span>{o}</span>
                      {filter === o && <Check size={14} className="text-brand-600 ml-2" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main
        className="flex-1 overflow-y-auto p-4 scrollbar-hide space-y-4"
        style={{
          paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))',
          paddingLeft: 'calc(1rem + env(safe-area-inset-left, 0px))',
          paddingRight: 'calc(1rem + env(safe-area-inset-right, 0px))',
        }}
      >
        <div className="max-w-4xl mx-auto w-full space-y-4">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Copied Statistics Card */}
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

            {/* Breadcrumb Navigation Path */}
            <Breadcrumbs
              items={[
                { label: 'Dashboard', icon: <Home size={13} />, onClick: navigateToDashboard },
                { label: 'Projects', active: true },
              ]}
            />

            {/* All Projects Section */}
            {projects.length === 0 ? (
              <EmptyProjectsState onNew={openNewProject} />
            ) : filteredProjects.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center bg-white rounded-xl border border-gray-100 p-6">
                <FolderOpen size={36} className="text-gray-300 mb-2" />
                <p className="text-gray-600 font-semibold text-sm">
                  {searchQuery ? `No projects matching "${searchQuery}"` : `No ${filter} projects found`}
                </p>
                {(filter !== 'All' || searchQuery) && (
                  <button
                    onClick={() => { setFilter('All'); setSearchQuery('') }}
                    className="text-xs text-brand-700 font-semibold mt-2 hover:underline cursor-pointer"
                  >
                    Clear search & filters
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                {filteredProjects.map(p => (
                  <ProjectCard
                    key={p.uuid}
                    project={p}
                    isUnlocked={licensedProjectSet.has(p.uuid) || licensedProjectSet.has('ALL_REPORTS') || p.isLicensed || Boolean(p.licenseKey)}
                    onExport={() => handleExport(p)}
                    onUnlock={() => setPayingProject(p)}
                    onClick={() => navigateToProject(p.uuid)}
                    onEdit={(e) => {
                      e.stopPropagation()
                      setEditingProject(p)
                    }}
                    onDelete={handleDelete}
                    deleting={deleting === p.uuid}
                  />
                ))}
              </div>
            )}
          </>
        )}
        </div>
      </main>

      {/* Floating Action Button */}
      <div
        className="fixed z-20"
        style={{
          bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))',
          right: 'max(1.5rem, calc((100vw - 56rem) / 2 + 1.5rem + env(safe-area-inset-right, 0px)))',
        }}
      >
        <button
          onClick={openNewProject}
          className="sitepunch-fab flex items-center gap-2 bg-brand-700 hover:bg-brand-800 active:scale-95 text-white px-5 py-3.5 rounded-full shadow-2xl transition-all font-semibold text-sm cursor-pointer"
          style={{ background: 'var(--brand-button, #a40e26)' }}
          title="Create a new project"
        >
          <Plus size={20} />
          <span>New Project</span>
        </button>
      </div>

      {/* Edit Project Modal */}
      {editingProject && (
        <EditProjectModal
          project={editingProject}
          onClose={() => setEditingProject(null)}
          onSaved={() => {
            load()
            setEditingProject(null)
          }}
        />
      )}

      {/* License Activation Modal */}
      {payingProject && (
        <LicenseActivationModal
          project={payingProject}
          onSuccess={() => {
            setLicensedProjectSet(getLicensedProjectUuids())
            setPayingProject(null)
            load()
          }}
          onClose={() => {
            setLicensedProjectSet(getLicensedProjectUuids())
            setPayingProject(null)
          }}
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
    </div>
  )
}

function ProjectCard({ project, isUnlocked, onExport, onUnlock, onClick, onEdit, onDelete, deleting }) {
  const drawingCount  = project.drawingCount  ?? 0
  const pinCount      = project.pinCount      ?? (project.totalItems || 0)
  const isClosed      = project.status === 'Closed'

  return (
    <div
      onClick={onClick}
      className={`rounded-2xl p-3.5 sm:p-4.5 cursor-pointer active:scale-[0.99] transition-all duration-200 group relative border overflow-hidden ${
        isClosed
          ? 'bg-white/80 border-gray-200/90 opacity-80 border-l-4 border-l-gray-400 shadow-xs'
          : 'border-l-4 hover:-translate-y-0.5'
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
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-200/70 flex items-center justify-center text-amber-600 flex-shrink-0 shadow-2xs">
              <Folder size={15} className="fill-amber-400/25 stroke-[2.2]" />
            </div>
            <h3 className={`font-semibold text-base truncate ${isClosed ? 'text-gray-700' : 'text-gray-900'}`}>{project.name}</h3>
            <span
              className="flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full border shadow-2xs transition-colors"
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
              {STATUS_ICON[project.status] || STATUS_ICON.Active} {project.status || 'Active'}
            </span>
          </div>

          {(project.number || project.address || project.client) && (
            <div className="flex items-center gap-x-3 gap-y-1 mt-1.5 flex-wrap text-xs text-gray-500">
              {project.number && (
                <span className="font-semibold text-gray-500">#{project.number}</span>
              )}
              {project.address && (
                <span className="flex items-center gap-1 text-gray-600 truncate max-w-sm">
                  <MapPin size={12} className="text-gray-400 flex-shrink-0" />
                  <span className="truncate">{project.address}</span>
                </span>
              )}
              {project.client && (
                <span className="text-gray-400 truncate">
                  {project.client}
                </span>
              )}
            </div>
          )}
        </div>

        <ChevronRight size={18} className="text-gray-300 group-hover:text-gray-500 group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-0.5" />
      </div>

      {/* Key Plan, Punch Count, and Lock/Unlock status counter */}
      <div className="flex items-center justify-between gap-2 mt-3 pt-0.5 min-w-0">
        <div
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-2 sm:gap-4 px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-xl bg-white/70 backdrop-blur-md border border-white/80 shadow-2xs min-w-0 cursor-default select-none"
        >
          <div className="text-center min-w-[28px] sm:min-w-[36px]">
            <p className="text-sm sm:text-base font-bold text-gray-900 leading-tight">{drawingCount}</p>
            <p className="text-[10px] sm:text-[11px] text-gray-500 font-semibold mt-0.5 whitespace-nowrap">Key Plans</p>
          </div>
          <div className="w-px h-5 sm:h-6 bg-gray-200/80 flex-shrink-0" />
          <div className="text-center min-w-[28px] sm:min-w-[36px]">
            <p className="text-sm sm:text-base font-bold text-gray-900 leading-tight">{pinCount}</p>
            <p className="text-[10px] sm:text-[11px] text-gray-500 font-semibold mt-0.5 whitespace-nowrap">Punch Items</p>
          </div>
          <div className="w-px h-5 sm:h-6 bg-gray-200/80 flex-shrink-0" />
          {/* Lock / Unlock Icon with 'Export' label: only link when locked */}
          {isUnlocked ? (
            <div
              className="text-center min-w-[28px] sm:min-w-[36px] px-1 sm:px-1.5 py-0.5 rounded-lg flex-shrink-0 text-emerald-600 cursor-default select-none"
              title="Export Unlocked"
            >
              <div className="flex items-center justify-center">
                <Unlock size={16} className="text-emerald-600" />
              </div>
              <p className="text-[10px] sm:text-[11px] font-semibold mt-0.5 whitespace-nowrap text-emerald-700">
                Export
              </p>
            </div>
          ) : (
            <div
              onClick={(e) => {
                e.stopPropagation()
                onUnlock ? onUnlock(project) : onExport?.(project)
              }}
              className="text-center min-w-[28px] sm:min-w-[36px] px-1 sm:px-1.5 py-0.5 rounded-lg transition-all cursor-pointer active:scale-95 flex-shrink-0 text-amber-600 hover:bg-amber-50/80"
              title="Activate License to Unlock Full Export"
            >
              <div className="flex items-center justify-center">
                <Lock size={16} className="text-amber-600" />
              </div>
              <p className="text-[10px] sm:text-[11px] font-semibold mt-0.5 whitespace-nowrap text-amber-700 font-bold">
                Export
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onEdit}
            className="liquid-pill w-8 h-8 sm:w-9 sm:h-9 p-1.5 sm:p-2 rounded-xl text-gray-500 hover:text-brand-600 flex items-center justify-center cursor-pointer transition-colors"
            aria-label="Edit project"
            title="Edit project details"
          >
            <Edit2 size={15} />
          </button>
          <button
            onClick={(e) => onDelete(e, project.uuid)}
            disabled={deleting}
            className="liquid-pill w-8 h-8 sm:w-9 sm:h-9 p-1.5 sm:p-2 rounded-xl text-gray-400 hover:text-red-600 flex items-center justify-center cursor-pointer transition-colors"
            aria-label="Delete project"
            title="Delete project"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}

function EmptyProjectsState({ onNew }) {
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
        style={{ background: 'var(--brand-button, #a40e26)' }}
      >
        Create First Project
      </button>
    </div>
  )
}
