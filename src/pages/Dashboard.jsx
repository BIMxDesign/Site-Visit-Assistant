import React, { useState, useEffect } from 'react'
import {
  Plus, FolderOpen, Settings, Download, Trash2, Edit2,
  ChevronRight, AlertCircle, Filter, Check,
  FileImage, ClipboardList, Clock, CheckCircle, Shield, MapPin,
  Lock, Unlock, Camera, FileText
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { getAllProjects, deleteProject, db } from '../db/database'
import EditProjectModal from '../components/EditProjectModal'
import LicenseActivationModal from '../components/LicenseActivationModal'
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

export default function Dashboard() {
  const {
    openNewProject,
    openSettings,
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
    const name = proj?.name ? `"${proj.name}"` : 'this project'
    if (!window.confirm(`Delete ${name} and all its key plans, pins, and photos?\n\nThis cannot be undone.`)) return
    setDeleting(uuid)
    await deleteProject(uuid)
    await load()
    setDeleting(null)
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
                {companyName?.trim() || 'SitePunch'}
              </h1>
              <p className="text-brand-200 text-xs truncate leading-tight mt-0.5">Field Observation Report Tool</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
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
                    <FolderOpen size={14} className="text-brand-600" />
                    <span className="truncate">Projects</span>
                  </div>
                  <p className="text-lg sm:text-2xl font-bold text-gray-900 mt-1">{stats.totalProjects}</p>
                </div>

                <div className="p-2.5 sm:p-3 bg-white/60 backdrop-blur-md rounded-xl border border-white/80 text-center shadow-2xs">
                  <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500 font-semibold">
                    <ClipboardList size={14} className="text-blue-600" />
                    <span className="truncate">Reports</span>
                  </div>
                  <p className="text-lg sm:text-2xl font-bold text-gray-900 mt-1">{stats.totalReports}</p>
                </div>

                <div className="p-2.5 sm:p-3 bg-white/60 backdrop-blur-md rounded-xl border border-white/80 text-center shadow-2xs">
                  <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500 font-semibold">
                    <FileImage size={14} className="text-indigo-600" />
                    <span className="truncate">Key Plans</span>
                  </div>
                  <p className="text-lg sm:text-2xl font-bold text-gray-900 mt-1">{stats.totalDrawings}</p>
                </div>

                <div className="p-2.5 sm:p-3 bg-white/60 backdrop-blur-md rounded-xl border border-white/80 text-center shadow-2xs">
                  <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500 font-semibold">
                    <AlertCircle size={14} className="text-red-500" />
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

            {/* Projects List */}
            {projects.length === 0 ? (
              <EmptyState onNew={openNewProject} />
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-3 gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-brand-50 border border-brand-200/80 flex items-center justify-center text-brand-700 shadow-2xs flex-shrink-0">
                      <FolderOpen size={17} className="stroke-[2.2]" />
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <h2 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight truncate">
                        Projects
                      </h2>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-brand-50 text-brand-700 border border-brand-200/80">
                        {filteredProjects.length}
                      </span>
                    </div>
                    {filter !== 'All' && (
                      <button
                        onClick={() => setFilter('All')}
                        className="text-xs text-brand-700 hover:underline font-semibold flex-shrink-0 ml-1"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  {/* Filter button moved next to Projects */}
                  <div className="relative flex-shrink-0" id="project-filter-container">
                    <button
                      onClick={() => setShowFilter(f => !f)}
                      className={`liquid-pill px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer ${
                        filter !== 'All'
                          ? 'text-brand-700 font-bold'
                          : 'text-gray-700'
                      }`}
                      title="Filter projects by status"
                    >
                      <Filter size={14} className={filter !== 'All' ? 'text-brand-600' : 'text-gray-500'} />
                      <span>{filter === 'All' ? 'Filter' : filter}</span>
                    </button>
                    {showFilter && (
                      <div
                        className="liquid-glass-surface rounded-2xl p-1.5 shadow-2xl z-30"
                        style={{
                          position: 'absolute', right: 0, top: '120%', zIndex: 60,
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
            {filteredProjects.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center bg-white rounded-xl border border-gray-100 p-6">
                <FolderOpen size={36} className="text-gray-300 mb-2" />
                <p className="text-gray-600 font-semibold text-sm">No {filter} projects found</p>
                <button
                  onClick={() => setFilter('All')}
                  className="text-xs text-brand-700 font-semibold mt-2 hover:underline"
                >
                  Show all projects
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                {filteredProjects.map(p => (
                  <ProjectCard
                    key={p.uuid}
                    project={p}
                    isUnlocked={licensedProjectSet.has(p.uuid) || licensedProjectSet.has('ALL_REPORTS')}
                    onExport={() => handleExport(p)}
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

      {/* Project License Activation Modal */}
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
    </div>
  )
}

function ProjectCard({ project, isUnlocked, onExport, onClick, onEdit, onDelete, deleting }) {
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
              borderLeftColor: 'var(--brand-button, #1d4ed8)',
              borderColor: 'var(--brand-200, #bfdbfe)',
              background: 'linear-gradient(135deg, var(--brand-50, #eff6ff) 0%, #ffffff 45%, var(--brand-50, #eff6ff) 100%)',
              boxShadow: '0 4px 18px -2px rgba(var(--brand-button-rgb, 29, 78, 216), 0.12), 0 2px 6px rgba(0, 0, 0, 0.04)',
            }
          : {}
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
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
                      background: 'var(--brand-100, #dbeafe)',
                      color: 'var(--brand-800, #1e40af)',
                      borderColor: 'var(--brand-200, #bfdbfe)',
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
        <div className="inline-flex items-center gap-2 sm:gap-4 px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-xl bg-white/70 backdrop-blur-md border border-white/80 shadow-2xs min-w-0">
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
          {/* Lock / Unlock Icon with 'Export' label */}
          <div
            onClick={(e) => {
              e.stopPropagation()
              onExport?.(project)
            }}
            className={`text-center min-w-[28px] sm:min-w-[36px] px-1 sm:px-1.5 py-0.5 rounded-lg transition-all cursor-pointer active:scale-95 flex-shrink-0 ${
              isUnlocked
                ? 'text-emerald-600 hover:bg-emerald-50/80'
                : 'text-amber-600 hover:bg-amber-50/80'
            }`}
            title={isUnlocked ? 'Export Full Project (Unlocked)' : 'Export Project (Pay to Unlock Full Export)'}
          >
            <div className="flex items-center justify-center">
              {isUnlocked ? (
                <Unlock size={16} className="text-emerald-600" />
              ) : (
                <Lock size={16} className="text-amber-600" />
              )}
            </div>
            <p className={`text-[10px] sm:text-[11px] font-semibold mt-0.5 whitespace-nowrap ${
              isUnlocked ? 'text-emerald-700' : 'text-amber-700 font-bold'
            }`}>
              Export
            </p>
          </div>
        </div>

        <div className="flex items-center flex-shrink-0">
          <button
            onClick={onEdit}
            className="liquid-pill w-8 h-8 sm:w-9 sm:h-9 p-1.5 sm:p-2 rounded-xl text-gray-500 hover:text-brand-600 flex items-center justify-center cursor-pointer transition-colors"
            aria-label="Edit project"
            title="Edit project details"
          >
            <Edit2 size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, color = 'text-gray-800' }) {
  return (
    <div className="text-center min-w-[38px]">
      <p className={`text-lg font-bold leading-none ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 font-medium mt-0.5 whitespace-nowrap">{label}</p>
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
