import React from 'react'
import {
  Check, X, Sparkles, FolderPlus, ClipboardList,
  Layers, FileText
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

export default function WelcomeChecklist({ stats = {}, projects = [], onClose }) {
  const {
    openNewProject,
    navigateToProjects,
    navigateToProject,
    openPDFPreview,
  } = useAppStore()

  // Determine completion of each step
  const step1Done = Boolean((stats.totalProjects ?? 0) > 0 || projects.length > 0)
  const step2Done = Boolean((stats.totalReports ?? 0) > 0)
  const step3Done = Boolean((stats.totalDrawings ?? 0) > 0 && (stats.totalPins ?? 0) > 0)
  const step4Done = Boolean((stats.totalExportedPdfs ?? 0) > 0)

  const steps = [
    {
      id: 1,
      title: 'Create your first project',
      description: 'Set up a new property, address, and client details',
      completed: step1Done,
      icon: <FolderPlus size={15} />,
      actionText: 'New Project',
      onClick: () => openNewProject(),
    },
    {
      id: 2,
      title: 'Create Site Visit module',
      description: 'log Site Visits, dates, weather, and attendees',
      completed: step2Done,
      icon: <ClipboardList size={15} />,
      actionText: projects.length > 0 ? 'View Projects' : 'New Project',
      onClick: () => {
        if (projects.length > 0) {
          navigateToProjects()
        } else {
          openNewProject()
        }
      },
    },
    {
      id: 3,
      title: 'Add key plans and observation pins to the site visit',
      description: 'Upload Key plan drawings and pin site observations',
      completed: step3Done,
      icon: <Layers size={15} />,
      actionText: projects.length > 0 ? 'Open Project' : 'New Project',
      onClick: () => {
        if (projects.length > 0) {
          navigateToProject(projects[0].uuid)
        } else {
          openNewProject()
        }
      },
    },
    {
      id: 4,
      title: 'Generate Site Visit Report',
      description: 'Generate branded PDF/Excel/Word report with site photos and observation pins',
      completed: step4Done,
      icon: <FileText size={15} />,
      actionText: 'Generate Report',
      onClick: () => {
        if (projects.length > 0) {
          openPDFPreview()
        } else {
          openNewProject()
        }
      },
    },
  ]

  const completedCount = steps.filter(s => s.completed).length
  const progressPercent = Math.round((completedCount / steps.length) * 100)
  const allCompleted = completedCount === steps.length

  return (
    <div
      className="rounded-2xl p-4 sm:p-5 shadow-xs relative overflow-hidden transition-all backdrop-blur-xl border border-amber-300/70"
      style={{
        background: 'linear-gradient(135deg, rgba(254, 252, 232, 0.82), rgba(254, 249, 195, 0.68))',
        borderLeft: '4px solid #f59e0b',
      }}
    >
      {/* Top Header Row with Title, Progress, and Close Button */}
      <div className="flex items-start justify-between gap-3 pb-3 border-b border-amber-200/80">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-amber-900 bg-amber-400/70 shadow-2xs flex-shrink-0 font-bold"
            >
              <Sparkles size={14} className="text-amber-950" />
            </div>
            <h3 className="text-sm sm:text-base font-bold text-gray-900 tracking-tight">
              Getting Started Checklist
            </h3>
            <span
              className="text-[11px] font-bold px-2 py-0.5 rounded-full shadow-2xs"
              style={{
                background: allCompleted ? '#ecfdf5' : '#fef3c7',
                color: allCompleted ? '#059669' : '#92400e',
                border: allCompleted ? '1px solid #a7f3d0' : '1px solid #fde68a',
              }}
            >
              {completedCount} of {steps.length} completed
            </span>
          </div>
          <p className="text-xs text-amber-950/80 mt-1 font-medium">
            {allCompleted
              ? 'Awesome! You’ve set up your project workflow and generated your first report.'
              : 'Follow these quick steps to set up your punch list workflow.'}
          </p>

          {/* Progress Bar */}
          <div className="w-full bg-amber-200/60 rounded-full h-1.5 mt-2.5 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progressPercent}%`,
                background: allCompleted
                  ? '#10b981'
                  : 'linear-gradient(90deg, #f59e0b, #d97706)',
              }}
            />
          </div>
        </div>

        {/* Close button to hide checklist */}
        <button
          type="button"
          onClick={onClose}
          className="liquid-pill p-1.5 rounded-xl text-amber-800/70 hover:text-amber-950 hover:bg-amber-200/50 flex items-center justify-center cursor-pointer transition-colors flex-shrink-0"
          title="Hide checklist (can be restored from Settings > About)"
          aria-label="Hide checklist"
        >
          <X size={16} />
        </button>
      </div>

      {/* Checklist Steps Grid */}
      <div className="mt-3.5 space-y-2">
        {steps.map((step) => {
          return (
            <div
              key={step.id}
              className={`p-2.5 sm:p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                step.completed
                  ? 'bg-amber-50/50 border-amber-200/60'
                  : 'bg-white/85 border-amber-300/70 shadow-2xs'
              }`}
            >
              {/* Left Checkbox and Step Title */}
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {/* Checkbox */}
                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 transition-all ${
                    step.completed
                      ? 'text-white shadow-2xs bg-amber-500 border-amber-500'
                      : 'border-2 border-amber-400/80 bg-white'
                  }`}
                >
                  {step.completed && <Check size={14} strokeWidth={3} className="text-white" />}
                </div>

                {/* Step Details */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`text-xs sm:text-sm font-semibold truncate ${
                        step.completed ? 'text-gray-500 line-through' : 'text-gray-900 font-bold'
                      }`}
                    >
                      {step.title}
                    </span>
                    {step.completed && (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 flex-shrink-0">
                        Done
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-600 truncate mt-0.5 hidden sm:block">
                    {step.description}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
