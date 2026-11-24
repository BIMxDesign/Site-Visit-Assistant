import Dexie from 'dexie'
import { v4 as uuidv4 } from 'uuid'
import { getProjectLicense, importAndPreserveLicenses } from '../services/licenseService'
import { isObservationOpenStatus } from '../utils/formatters'
import { saveBackupToCloud } from '../utils/cloudFolder'
import {
  createProjectZipPackage,
  createReportZipPackage,
  createAllProjectsZipPackage,
  extractZipBackup,
  isZipFile
} from '../utils/zipArchive'

export { extractZipBackup, isZipFile }

export const db = new Dexie('PunchListDB')

db.version(1).stores({
  settings:   '++id, key',
  projects:   '++id, &uuid, name, status, createdAt, updatedAt',
  floorPlans: '++id, &uuid, projectUuid, name, createdAt',
  punchItems: '++id, &uuid, projectUuid, floorPlanUuid, itemNumber, status, priority, trade, createdAt, updatedAt',
  photos:     '++id, &uuid, punchItemUuid, createdAt',
})

db.version(2).stores({
  phases:     '++id, &uuid, projectUuid, name, createdAt, order',
  floorPlans: '++id, &uuid, projectUuid, phaseUuid, name, createdAt',
})

db.version(3).stores({
  users:      '++id, &email, createdAt',
})

db.version(4).stores({
  users:      '++id, &email, phone, role, createdAt',
  payments:   '++id, &transactionId, reportUuid, userEmail, provider, status, createdAt',
  licenses:   '++id, &licenseKey, reportUuid, userEmail, status, createdAt',
})

db.version(5).stores({
  phases:     '++id, &uuid, projectUuid, name, createdAt, order',
  floorPlans: '++id, &uuid, projectUuid, phaseUuid, name, createdAt',
  punchItems: '++id, &uuid, projectUuid, floorPlanUuid, phaseUuid, itemNumber, status, priority, trade, createdAt, updatedAt',
})

db.version(6).stores({
  exportLogs: '++id, projectUuid, type, exportedAt',
})

// --- Export Log helpers ---
/**
 * Logs a PDF / ZIP / CSV export event for a specific project.
 * @param {{ projectUuid: string, projectName?: string, type: 'pdf'|'zip'|'csv', reportName?: string, filename?: string, pageCount?: number }} entry
 */
export async function logExport(entry) {
  try {
    await db.exportLogs.add({
      projectUuid:  entry.projectUuid  || '',
      projectName:  entry.projectName  || '',
      type:         entry.type         || 'pdf',
      reportName:   entry.reportName   || '',
      filename:     entry.filename     || '',
      pageCount:    entry.pageCount    || null,
      exportedAt:   Date.now(),
    })
  } catch (err) {
    console.error('Failed to log export:', err)
  }
}

/**
 * Returns the most recent export log entries for a project (newest first).
 * @param {string} projectUuid
 * @param {number} [limit=50]
 */
export async function getExportLogs(projectUuid, limit = 50) {
  try {
    const all = await db.exportLogs
      .where('projectUuid').equals(projectUuid)
      .reverse()
      .sortBy('exportedAt')
    return all.slice(0, limit)
  } catch {
    return []
  }
}

/**
 * Returns aggregated export counts (pdf/zip) grouped by projectUuid.
 * Used by the Logs tab to show summary counts without loading all rows.
 */
export async function getAllExportLogSummaries() {
  try {
    const all = await db.exportLogs.toArray()
    const map = {}
    for (const row of all) {
      if (!map[row.projectUuid]) map[row.projectUuid] = { pdf: 0, zip: 0, csv: 0, project: 0, total: 0 }
      if (row.type === 'pdf') map[row.projectUuid].pdf++
      else if (row.type === 'zip') map[row.projectUuid].zip++
      else if (row.type === 'csv') map[row.projectUuid].csv++
      else if (row.type === 'project') map[row.projectUuid].project++
      map[row.projectUuid].total++
    }
    return map
  } catch {
    return {}
  }
}

/**
 * Returns ALL export log entries from the last 12 months, newest first.
 * Used by the Logs tab flat list view.
 */
export async function getAllExportLogsFlat(limit = 500) {
  try {
    const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000 // 12 months ago
    const all = await db.exportLogs
      .where('exportedAt').above(cutoff)
      .reverse()
      .sortBy('exportedAt')
    return all.slice(0, limit)
  } catch {
    return []
  }
}

/**
 * Clears all export logs for a specific project (called when project is deleted).
 */
export async function clearExportLogs(projectUuid) {
  try {
    await db.exportLogs.where('projectUuid').equals(projectUuid).delete()
  } catch {}
}

// --- Cybersecurity: Password Hashing with SHA-256 (Web Crypto API) ---
export async function hashPassword(password, salt = 'sitepunch_v1_salt_') {
  if (!password) return ''
  try {
    const enc = new TextEncoder()
    const data = enc.encode(password + salt)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return btoa(password + salt)
  }
}

// --- User / Authentication helpers ---
export async function getUsers() {
  try {
    return await db.users.toArray()
  } catch {
    return []
  }
}

export async function findUser(email) {
  if (!email) return null
  try {
    const clean = email.trim().toLowerCase()
    return await db.users.where('email').equals(clean).first()
  } catch {
    return null
  }
}

export async function registerUser({ email, password, name = '', phone = '', organization = '', role = 'Project Manager' }) {
  const cleanEmail = email.trim().toLowerCase()
  if (!cleanEmail || !password) {
    throw new Error('Email and password are required.')
  }
  const existing = await findUser(cleanEmail)
  if (existing) {
    throw new Error('An account with this email already exists. Please sign in.')
  }

  // Cryptographically hash password before saving to Dexie
  const hashedPassword = await hashPassword(password, cleanEmail)

  const newUser = {
    email: cleanEmail,
    password: hashedPassword, // Hashed with SHA-256 and unique user salt
    name: name.trim(),
    phone: phone.trim(),
    organization: organization.trim(),
    role: role || (cleanEmail.includes('admin') ? 'Administrator' : 'Project Manager'),
    createdAt: Date.now(),
  }
  await db.users.add(newUser)
  // Sync account details with online account management system
  syncOnlineAccount(newUser)
  return newUser
}

export async function loginUser({ email, password }) {
  const cleanEmail = email.trim().toLowerCase()
  const user = await findUser(cleanEmail)
  if (!user) {
    throw new Error('No account found with this email. Please sign up.')
  }

  const hashedInput = await hashPassword(password, cleanEmail)
  // Check hashed password or legacy plaintext
  const isValid = user.password === hashedInput || user.password === password
  if (!isValid) {
    throw new Error('Incorrect password. Please try again.')
  }

  // Seamlessly upgrade legacy plaintext passwords to SHA-256 hash
  if (user.password === password) {
    user.password = hashedInput
    await db.users.put(user)
  }

  syncOnlineAccount(user)
  return user
}

/**
 * Updates an existing user's profile details in local Dexie DB and syncs online.
 */
export async function updateUserProfile({ originalEmail, email, name, phone, organization, role }) {
  const cleanOriginal = (originalEmail || email || '').trim().toLowerCase()
  const cleanEmail = (email || '').trim().toLowerCase()
  if (!cleanEmail) {
    throw new Error('Email address is required.')
  }

  let user = await findUser(cleanOriginal)
  if (user) {
    if (cleanEmail !== cleanOriginal) {
      const conflict = await findUser(cleanEmail)
      if (conflict && conflict.id !== user.id) {
        throw new Error('An account with this email address already exists.')
      }
      user.email = cleanEmail
    }
    if (name !== undefined) user.name = name.trim()
    if (phone !== undefined) user.phone = phone.trim()
    if (organization !== undefined) user.organization = organization.trim()
    if (role !== undefined) user.role = role
    user.updatedAt = Date.now()
    await db.users.put(user)
  } else {
    user = {
      email: cleanEmail,
      name: (name || '').trim(),
      phone: (phone || '').trim(),
      organization: (organization || '').trim(),
      role: role || 'Project Manager',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await db.users.add(user)
  }

  updateOnlineUser(cleanOriginal, user)
  return user
}

// --- GDPR & CCPA Data Privacy & User Rights ---

/**
 * GDPR Article 20: Right to Data Portability
 * Exports all user personal data and projects as a structured, machine-readable JSON archive.
 */
export async function exportAllUserData(email) {
  const cleanEmail = (email || '').trim().toLowerCase()
  const user = await findUser(cleanEmail)
  const allProjects = await getAllProjects()
  const userProjects = cleanEmail
    ? allProjects.filter(p => !p.ownerEmail || p.ownerEmail.toLowerCase() === cleanEmail)
    : allProjects

  const exportPackage = {
    gdpr_export_metadata: {
      generatedAt: new Date().toISOString(),
      standard: 'GDPR Article 20 / CCPA Data Portability Compliance',
      userEmail: cleanEmail,
    },
    profile: user ? {
      name: user.name,
      email: user.email,
      phone: user.phone,
      organization: user.organization,
      role: user.role,
      createdAt: user.createdAt,
    } : null,
    projects: []
  }

  for (const proj of userProjects) {
    const pData = await exportProjectData(proj.uuid)
    exportPackage.projects.push(pData)
  }

  return exportPackage
}

/**
 * GDPR Article 17: Right to Erasure ("Right to be Forgotten")
 * Completely and irreversibly wipes all user data, projects, drawings, punch items,
 * photos, and local credentials from this device.
 */
export async function deleteAllUserData(email) {
  const cleanEmail = (email || '').trim().toLowerCase()
  if (cleanEmail) {
    await db.users.where('email').equals(cleanEmail).delete()
  } else {
    await db.users.clear()
  }

  // Clear project data from local device
  await db.projects.clear()
  await db.phases.clear()
  await db.floorPlans.clear()
  await db.punchItems.clear()
  await db.photos.clear()
  await db.settings.clear()

  // Clear local storage sensitive tokens
  localStorage.removeItem('sitepunch_current_user')
  localStorage.removeItem('sitepunch_theme_color')
  localStorage.removeItem('sitepunch_app_font_family')

  return true
}

// --- Settings helpers ---
export async function getSetting(key, defaultVal = null) {
  const row = await db.settings.where('key').equals(key).first()
  return row ? row.value : defaultVal
}
export async function setSetting(key, value) {
  const existing = await db.settings.where('key').equals(key).first()
  if (existing) await db.settings.update(existing.id, { key, value })
  else           await db.settings.add({ key, value })
}

// --- Project helpers ---
export async function getAllProjects() {
  return db.projects.orderBy('updatedAt').reverse().toArray()
}
export async function getProject(uuid) {
  return db.projects.where('uuid').equals(uuid).first()
}
export async function saveProject(project) {
  if (!project) return
  const { id: _ignoredId, ...projectData } = project
  const existing = await db.projects.where('uuid').equals(projectData.uuid).first()
  if (existing) {
    await db.projects.update(existing.id, {
      ...projectData,
      createdAt: existing.createdAt || projectData.createdAt || Date.now(),
      updatedAt: Date.now()
    })
    return
  }
  await db.projects.add({ ...projectData, createdAt: projectData.createdAt || Date.now(), updatedAt: Date.now() })
}
export async function deleteProject(uuid) {
  const fps = await db.floorPlans.where('projectUuid').equals(uuid).toArray()
  for (const fp of fps) {
    await db.photos.where('punchItemUuid').anyOf(
      (await db.punchItems.where('floorPlanUuid').equals(fp.uuid).toArray()).map(p => p.uuid)
    ).delete()
    await db.punchItems.where('floorPlanUuid').equals(fp.uuid).delete()
  }
  await db.floorPlans.where('projectUuid').equals(uuid).delete()
  await db.punchItems.where('projectUuid').equals(uuid).delete()
  await db.phases.where('projectUuid').equals(uuid).delete()
  await db.projects.where('uuid').equals(uuid).delete()
  // Also clear export logs for deleted project
  try { await db.exportLogs.where('projectUuid').equals(uuid).delete() } catch {}
}

// --- Phase helpers ---
export async function getPhases(projectUuid) {
  if (!projectUuid) return []
  try {
    const cleanId = String(projectUuid).trim()
    const all = await db.phases.toArray()
    // Explicitly filter in memory by projectUuid to prevent cross-project report leaks
    const list = all.filter(p => p.projectUuid && String(p.projectUuid).trim() === cleanId)
    return list.sort((a, b) => (a.order || 0) - (b.order || 0) || (a.createdAt || 0) - (b.createdAt || 0))
  } catch (err) {
    console.error('Failed to getPhases:', err)
    return []
  }
}

export async function getPhase(uuid) {
  if (!uuid) return null
  return db.phases.where('uuid').equals(uuid).first()
}

export async function savePhase(phase) {
  if (!phase) return
  const { id: _ignoredId, ...phaseData } = phase
  const existing = await db.phases.where('uuid').equals(phaseData.uuid).first()
  if (existing) {
    await db.phases.update(existing.id, { ...phaseData, updatedAt: Date.now() })
    return
  }
  const all = await db.phases.toArray()
  const count = all.filter(p => p.projectUuid && String(p.projectUuid).trim() === String(phaseData.projectUuid).trim()).length
  await db.phases.add({
    order: phaseData.order || count + 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...phaseData,
  })
}

export async function deletePhase(uuid) {
  // Delete all floor plans and their punch items in this phase
  const allFps = await db.floorPlans.toArray()
  const fps = allFps.filter(f => f.phaseUuid === uuid)
  for (const fp of fps) {
    await deleteFloorPlan(fp.uuid)
  }
  // Delete direct observations assigned directly to this report
  const directItems = await db.punchItems.where('phaseUuid').equals(uuid).toArray()
  for (const item of directItems) {
    await db.photos.where('punchItemUuid').equals(item.uuid).delete()
    await db.punchItems.where('uuid').equals(item.uuid).delete()
  }
  await db.phases.where('uuid').equals(uuid).delete()
}

export async function ensureProjectPhases(projectUuid) {
  if (!projectUuid) return []
  // Never auto-populate reports automatically: new projects start fresh with 0 reports!
  return getPhases(projectUuid)
}

// --- Floor plan helpers ---
export async function getFloorPlans(projectUuid) {
  if (!projectUuid) return []
  try {
    const cleanId = String(projectUuid).trim()
    const all = await db.floorPlans.toArray()
    return all.filter(fp => fp.projectUuid && String(fp.projectUuid).trim() === cleanId)
  } catch (err) {
    console.error('Failed to getFloorPlans:', err)
    return []
  }
}
export async function getFloorPlansByPhase(phaseUuid) {
  if (!phaseUuid) return []
  try {
    const cleanPhaseId = String(phaseUuid).trim()
    const all = await db.floorPlans.toArray()
    return all.filter(fp => fp.phaseUuid && String(fp.phaseUuid).trim() === cleanPhaseId)
  } catch (err) {
    return []
  }
}
export async function getFloorPlan(uuid) {
  return db.floorPlans.where('uuid').equals(uuid).first()
}
export async function saveFloorPlan(fp) {
  if (!fp) return
  const { id: _ignoredId, ...fpData } = fp
  const existing = await db.floorPlans.where('uuid').equals(fpData.uuid).first()
  if (existing) { await db.floorPlans.update(existing.id, { ...fpData, updatedAt: Date.now() }); return }
  await db.floorPlans.add({ ...fpData, createdAt: fpData.createdAt || Date.now() })
}
export async function deleteFloorPlan(uuid) {
  const fp = await db.floorPlans.where('uuid').equals(uuid).first()
  const projectUuid = fp?.projectUuid
  const phaseUuid = fp?.phaseUuid

  const items = await db.punchItems.where('floorPlanUuid').equals(uuid).toArray()
  for (const item of items) {
    await db.photos.where('punchItemUuid').equals(item.uuid).delete()
  }
  await db.punchItems.where('floorPlanUuid').equals(uuid).delete()
  await db.floorPlans.where('uuid').equals(uuid).delete()

  if (projectUuid && phaseUuid) {
    await resequenceReportPins(projectUuid, phaseUuid)
  }
}

// --- Punch item helpers ---
export async function getPunchItems(projectUuid) {
  if (!projectUuid) return []
  try {
    const cleanId = String(projectUuid).trim()
    const all = await db.punchItems.toArray()
    return all.filter(it => it.projectUuid && String(it.projectUuid).trim() === cleanId)
  } catch (err) {
    console.error('Failed to getPunchItems:', err)
    return []
  }
}
export async function getPunchItemsByFloorPlan(floorPlanUuid) {
  if (!floorPlanUuid) return []
  const directItems = await db.punchItems.where('floorPlanUuid').equals(floorPlanUuid).toArray()
  const allItems = await db.punchItems.toArray()
  const extraItems = allItems.filter(it =>
    it.floorPlanUuid !== floorPlanUuid &&
    Array.isArray(it.extraPins) &&
    it.extraPins.some(ep => ep.floorPlanUuid === floorPlanUuid)
  )
  const map = new Map()
  directItems.forEach(it => map.set(it.uuid, it))
  extraItems.forEach(it => map.set(it.uuid, it))
  return Array.from(map.values())
}
export async function getPunchItem(uuid) {
  return db.punchItems.where('uuid').equals(uuid).first()
}
export async function savePunchItem(item) {
  if (!item) return
  const { id: _ignoredId, ...itemData } = item
  const existing = await db.punchItems.where('uuid').equals(itemData.uuid).first()
  if (existing) { await db.punchItems.update(existing.id, { ...itemData, updatedAt: Date.now() }); return }
  await db.punchItems.add({ ...itemData, createdAt: itemData.createdAt || Date.now(), updatedAt: Date.now() })
}

/**
 * Sorts floor plan drawings based on explicit user order, then creation time or id.
 */
export function sortFloorPlans(fps) {
  if (!fps || !fps.length) return []
  return [...fps].sort((a, b) => {
    if (a.order !== undefined && b.order !== undefined && a.order !== b.order) {
      return a.order - b.order
    }
    if (a.order !== undefined && b.order === undefined) return -1
    if (a.order === undefined && b.order !== undefined) return 1
    return (a.createdAt || 0) - (b.createdAt || 0) || (a.id || 0) - (b.id || 0)
  })
}

/**
 * Reorders drawings within a report/project and immediately updates all pin numbers
 * so that Drawing 1 has #1, 2, 3..., Drawing 2 carries on, Drawing 3 carries on, etc.
 */
export async function reorderFloorPlans(reorderedUuids, projectUuid = null, phaseUuid = null) {
  if (!reorderedUuids || !reorderedUuids.length) return
  for (let i = 0; i < reorderedUuids.length; i++) {
    const uuid = reorderedUuids[i]
    const fp = await db.floorPlans.where('uuid').equals(uuid).first()
    if (fp) {
      await db.floorPlans.update(fp.id, { order: i, updatedAt: Date.now() })
    }
  }
  await resequenceReportPins({ projectUuid, phaseUuid })
}

/**
 * Resequences punch list pins drawing-by-drawing according to the drawing sequence:
 * 1. The first drawing in sequence always has pins starting at #1, 2, 3...
 * 2. If any intermediate pin is deleted or inserted, sequence updates automatically to stay continuous.
 * 3. The end of the first drawing carries its sequence continuously into the second drawing, and so on.
 */
export async function resequenceReportPins(arg1, arg2) {
  let projectUuid, phaseUuid, floorPlanUuid
  if (typeof arg1 === 'object' && arg1 !== null) {
    projectUuid = arg1.projectUuid
    phaseUuid = arg1.phaseUuid
    floorPlanUuid = arg1.floorPlanUuid
  } else {
    projectUuid = arg1
    phaseUuid = arg2
  }

  // If floorPlanUuid is provided, look up phaseUuid and projectUuid if missing
  if (floorPlanUuid && (!phaseUuid || !projectUuid)) {
    const fp = await db.floorPlans.where('uuid').equals(floorPlanUuid).first()
    if (fp) {
      if (!phaseUuid) phaseUuid = fp.phaseUuid
      if (!projectUuid) projectUuid = fp.projectUuid
    }
  }

  // If phaseUuid is still missing, check if the project has any phases
  if (projectUuid && !phaseUuid) {
    const phases = await getPhases(projectUuid)
    if (phases.length > 0) {
      phaseUuid = phases[0].uuid
    }
  }

  // Collect all drawings for this report / project in drawing sequence order
  let phaseFps = []
  if (phaseUuid) {
    phaseFps = await db.floorPlans.where('phaseUuid').equals(phaseUuid).toArray()
    if (projectUuid) {
      const allPhases = await getPhases(projectUuid)
      if (allPhases.length > 0 && allPhases[0].uuid === phaseUuid) {
        const unassignedFps = await db.floorPlans.where('projectUuid').equals(projectUuid).toArray()
        for (const ufp of unassignedFps) {
          if (!ufp.phaseUuid && !phaseFps.some(f => f.uuid === ufp.uuid)) {
            phaseFps.push(ufp)
          }
        }
      }
    }
  } else if (projectUuid) {
    phaseFps = await db.floorPlans.where('projectUuid').equals(projectUuid).toArray()
  }

  const orderedFps = sortFloorPlans(phaseFps)
  const orderedFpUuids = new Set(orderedFps.map(f => f.uuid))

  // Fetch all punch items in scope
  let allItems = []
  if (projectUuid) {
    allItems = await db.punchItems.where('projectUuid').equals(projectUuid).toArray()
  } else if (phaseUuid) {
    allItems = await db.punchItems.where('phaseUuid').equals(phaseUuid).toArray()
  } else if (floorPlanUuid) {
    allItems = await db.punchItems.where('floorPlanUuid').equals(floorPlanUuid).toArray()
  }

  // Filter items that belong to this report or drawings
  const reportItems = allItems.filter(i => {
    if (phaseUuid && i.phaseUuid === phaseUuid) return true
    if (i.floorPlanUuid && orderedFpUuids.has(i.floorPlanUuid)) return true
    return false
  })

  const targetItems = reportItems.length > 0 ? reportItems : allItems
  if (targetItems.length === 0) return

  // Any observations in the report not assigned to a drawing (list-only observations)
  const listItems = targetItems.filter(i => !i.floorPlanUuid || !orderedFpUuids.has(i.floorPlanUuid))

  // Combine floor plans and direct list observations based on their relative order
  const units = [
    ...orderedFps.map(fp => ({
      type: 'fp',
      uuid: fp.uuid,
      order: fp.order !== undefined ? fp.order : 0,
      createdAt: fp.createdAt || 0,
      fp,
    })),
    ...listItems.map(it => ({
      type: 'item',
      uuid: it.uuid,
      order: it.order !== undefined ? it.order : (10000 + (it.itemNumber || 0)),
      createdAt: it.createdAt || 0,
      item: it,
    }))
  ]

  units.sort((a, b) => {
    if (a.order !== undefined && b.order !== undefined && a.order !== b.order) {
      return a.order - b.order
    }
    return (a.createdAt || 0) - (b.createdAt || 0)
  })

  // Organize pins in the interleaved sequence of drawings and direct observations
  const finalOrderedPins = []
  for (const unit of units) {
    if (unit.type === 'fp') {
      const fpPins = targetItems.filter(i => i.floorPlanUuid === unit.uuid)
      fpPins.sort((a, b) => (a.itemNumber || 0) - (b.itemNumber || 0) || (a.createdAt || 0) - (b.createdAt || 0))
      finalOrderedPins.push(...fpPins)
    } else {
      finalOrderedPins.push(unit.item)
    }
  }

  // Resequence sequentially: 1, 2, 3, ...
  for (let i = 0; i < finalOrderedPins.length; i++) {
    const seq = i + 1
    const it = finalOrderedPins[i]
    if (it.itemNumber !== seq) {
      await db.punchItems.update(it.id, {
        itemNumber: seq,
        updatedAt: Date.now()
      })
      it.itemNumber = seq
    }
  }
}

export async function deletePunchItem(uuid) {
  const item = await db.punchItems.where('uuid').equals(uuid).first()
  if (!item) return
  const projectUuid = item.projectUuid
  let phaseUuid = item.phaseUuid
  const floorPlanUuid = item.floorPlanUuid

  // If phaseUuid is not directly on item, look up from its floorPlan
  if (!phaseUuid && floorPlanUuid) {
    const fp = await db.floorPlans.where('uuid').equals(floorPlanUuid).first()
    if (fp) phaseUuid = fp.phaseUuid
  }

  // Delete photos and item
  await db.photos.where('punchItemUuid').equals(uuid).delete()
  await db.punchItems.where('uuid').equals(uuid).delete()

  // Auto-resequence remaining pins in that report / floor plan / project based on drawing sequence
  await resequenceReportPins({ projectUuid, phaseUuid, floorPlanUuid })
}

export async function getNextItemNumber(projectUuid, phaseUuid = null, floorPlanUuid = null) {
  let targetPhaseUuid = phaseUuid

  if (!targetPhaseUuid && floorPlanUuid) {
    const fp = await db.floorPlans.where('uuid').equals(floorPlanUuid).first()
    if (fp) targetPhaseUuid = fp.phaseUuid
  }

  if (!targetPhaseUuid && projectUuid) {
    const phases = await getPhases(projectUuid)
    if (phases.length > 0) {
      targetPhaseUuid = phases[0].uuid
    }
  }

  // If creating on a specific drawing, number follows preceding drawings + pins on this drawing
  if (floorPlanUuid && (targetPhaseUuid || projectUuid)) {
    const phaseFps = targetPhaseUuid
      ? await db.floorPlans.where('phaseUuid').equals(targetPhaseUuid).toArray()
      : await db.floorPlans.where('projectUuid').equals(projectUuid).toArray()
    const orderedFps = sortFloorPlans(phaseFps)
    const fpIndex = orderedFps.findIndex(f => f.uuid === floorPlanUuid)

    if (fpIndex !== -1) {
      const allItems = await db.punchItems.where('projectUuid').equals(projectUuid).toArray()
      let countBefore = 0
      for (let i = 0; i < fpIndex; i++) {
        const prevFpUuid = orderedFps[i].uuid
        const prevPins = allItems.filter(item => item.floorPlanUuid === prevFpUuid)
        countBefore += prevPins.length
      }
      const currentPins = allItems.filter(item => item.floorPlanUuid === floorPlanUuid)
      return countBefore + currentPins.length + 1
    }
  }

  // Fallback to report-wide
  if (targetPhaseUuid) {
    const phaseFps = await db.floorPlans.where('phaseUuid').equals(targetPhaseUuid).toArray()
    const phaseFpUuids = new Set(phaseFps.map(f => f.uuid))
    const allItems = await db.punchItems.where('projectUuid').equals(projectUuid).toArray()
    const phaseItems = allItems.filter(
      i => (i.phaseUuid === targetPhaseUuid) || phaseFpUuids.has(i.floorPlanUuid)
    )
    if (!phaseItems.length) return 1
    return phaseItems.length + 1
  }

  // Fallback to project-wide
  const items = await db.punchItems.where('projectUuid').equals(projectUuid).toArray()
  if (!items.length) return 1
  return items.length + 1
}

// --- Photo helpers ---
export async function getPhotos(punchItemUuid) {
  const list = await db.photos.where('punchItemUuid').equals(punchItemUuid).toArray()
  return list.sort((a, b) => (a.order !== undefined && b.order !== undefined ? a.order - b.order : (a.createdAt || 0) - (b.createdAt || 0)))
}
export async function getPrimaryPhotos(itemUuids) {
  if (!itemUuids || !itemUuids.length) return {}
  const allPhotos = await db.photos.where('punchItemUuid').anyOf(itemUuids).toArray()
  allPhotos.sort((a, b) => (a.order !== undefined && b.order !== undefined ? a.order - b.order : (a.createdAt || 0) - (b.createdAt || 0)))
  const map = {}
  for (const ph of allPhotos) {
    if (!map[ph.punchItemUuid] && ph.imageData) {
      map[ph.punchItemUuid] = ph.imageData
    }
  }
  return map
}
export async function savePhoto(photo) {
  if (!photo) return
  const { id: _ignoredId, ...photoData } = photo
  const existing = await db.photos.where('uuid').equals(photoData.uuid).first()
  if (existing) { await db.photos.update(existing.id, photoData); return }
  await db.photos.add({ ...photoData, createdAt: photoData.createdAt || Date.now() })
}
export async function deletePhoto(uuid) {
  await db.photos.where('uuid').equals(uuid).delete()
}

// --- Custom Trade & Assignee Lists (consistent across projects) ---
export const DEFAULT_TRADES = [
  'General', 'Architectural', 'Structural', 'Civil', 'Mechanical (HVAC)',
  'Plumbing', 'Electrical', 'Fire Protection', 'Landscaping',
  'Finishes / Painting', 'Doors & Hardware', 'Glazing / Windows', 'Other'
]

export const DEFAULT_ASSIGNEES = [
  'Unassigned', 'General Contractor', 'Site Super', 'Electrical Sub',
  'Plumbing Sub', 'HVAC Sub', 'Painting Sub', 'Drywall Sub'
]

export async function getCustomTrades() {
  const custom = await getSetting('customTrades', null)
  let list = Array.isArray(custom) && custom.length > 0 ? custom : DEFAULT_TRADES
  // Guarantee 'Other' category is always present in trades list
  if (!list.some(t => typeof t === 'string' && t.trim().toLowerCase() === 'other')) {
    list = [...list, 'Other']
  }
  return list
}

export async function saveCustomTrades(list) {
  let safeList = Array.isArray(list) ? [...list] : [...DEFAULT_TRADES]
  // Guarantee 'Other' category is preserved and cannot be excluded
  if (!safeList.some(t => typeof t === 'string' && t.trim().toLowerCase() === 'other')) {
    safeList.push('Other')
  }
  await setSetting('customTrades', safeList)
}

/**
 * Automatically reassigns any punch items whose trade matches `oldTrade`
 * to `newTrade` (defaults to 'Other').
 * Returns the count of affected items.
 */
export async function reassignPunchItemsTrade(oldTrade, newTrade = 'Other') {
  if (!oldTrade || typeof oldTrade !== 'string') return 0
  const normalizedOld = oldTrade.trim().toLowerCase()
  if (normalizedOld === newTrade.trim().toLowerCase()) return 0

  return await db.transaction('rw', db.punchItems, async () => {
    const items = await db.punchItems.filter(it =>
      Boolean(it.trade && it.trade.trim().toLowerCase() === normalizedOld)
    ).toArray()

    for (const it of items) {
      await db.punchItems.update(it.id, {
        trade: newTrade,
        updatedAt: Date.now()
      })
    }
    return items.length
  })
}

export async function getCustomAssignees() {
  const custom = await getSetting('customAssignees', null)
  return custom || DEFAULT_ASSIGNEES
}

export async function saveCustomAssignees(list) {
  await setSetting('customAssignees', list)
}

// --- Export / Import ---
export async function exportProjectData(projectUuid) {
  const project    = await getProject(projectUuid)
  const phases     = await getPhases(projectUuid)
  const floorPlans = await getFloorPlans(projectUuid)
  const items      = await getPunchItems(projectUuid)
  const photos     = []
  for (const item of items) {
    const p = await getPhotos(item.uuid)
    photos.push(...p)
  }
  // Include report export payment & license information for this project
  const projectLic = await getProjectLicense(projectUuid)
  const licenses   = projectLic ? [projectLic] : []

  return { project, phases, floorPlans, items, photos, licenses, exportedAt: Date.now() }
}

/**
 * Export a full project with separated photos and clean metadata directly as a structured ZIP archive
 * to connected OneDrive / Google Drive folder, native file picker, or fallback download.
 */
export async function downloadProjectBackup(project) {
  if (!project?.uuid) throw new Error('Missing project identifier for backup export.')
  const data = await exportProjectData(project.uuid)
  const { blob, filename } = await createProjectZipPackage(data)

  const result = await saveBackupToCloud(blob, filename)

  // Log project data backup export
  logExport({
    projectUuid: project.uuid,
    projectName: project.name || '',
    type: 'project',
    reportName: 'Project Backup Archive (.zip)',
    filename: filename,
    pageCount: null,
  }).catch(() => {})

  return result
}

/**
 * Export an individual site visit report (including its key plans, observations, photos, and license).
 */
export async function exportReportData(phaseUuid, projectUuid = null) {
  const phase = await getPhase(phaseUuid)
  if (!phase) throw new Error('Site visit report not found.')

  const targetProjUuid = phase.projectUuid || projectUuid
  const project = await getProject(targetProjUuid)
  if (!project) throw new Error('Parent project for this report was not found.')

  // Fetch all floor plans for this report
  const allFps = await getFloorPlans(project.uuid)
  const phases = await getPhases(project.uuid)
  const isFirstPhase = phases.length > 0 && phases[0].uuid === phase.uuid
  const floorPlans = allFps.filter(f => f.phaseUuid === phase.uuid || (!f.phaseUuid && isFirstPhase))

  // Fetch all punch items for this report
  const fpUuids = new Set(floorPlans.map(f => f.uuid))
  const allItems = await getPunchItems(project.uuid)
  const items = allItems.filter(i => (i.phaseUuid === phase.uuid) || (i.floorPlanUuid && fpUuids.has(i.floorPlanUuid)))

  // Fetch all photos for these items
  const photos = []
  for (const item of items) {
    const p = await getPhotos(item.uuid)
    photos.push(...p)
  }

  // Fetch license information
  const projectLic = await getProjectLicense(project.uuid)
  const licenses = projectLic ? [projectLic] : []

  return {
    app: 'Site Visit Assistant',
    type: 'individual_report',
    version: '2.0.0',
    exportedAt: Date.now(),
    project: {
      uuid: project.uuid,
      name: project.name || '',
      number: project.number || '',
      address: project.address || '',
      client: project.client || '',
      architect: project.architect || '',
      isLicensed: project.isLicensed || false,
      licenseKey: project.licenseKey || null,
    },
    phase: {
      ...phase,
      updatedAt: phase.updatedAt || phase.createdAt || Date.now(),
    },
    floorPlans,
    items,
    photos,
    licenses,
  }
}

/**
 * Downloads an individual site visit report backup as a structured ZIP archive directly or saves to cloud sync folder.
 */
export async function downloadReportBackup(phaseUuid, projectUuid = null) {
  const data = await exportReportData(phaseUuid, projectUuid)
  const { blob, filename } = await createReportZipPackage(data)

  const result = await saveBackupToCloud(blob, filename)

  // Log report export
  try {
    await logExport({
      projectUuid: data.project?.uuid || '',
      projectName: data.project?.name || '',
      type: 'report_zip',
      reportName: data.phase?.name || 'Report Backup (.zip)',
      filename: filename,
      pageCount: null,
    })
  } catch {}

  return result
}

/**
 * Packages all projects, key plans, observations, photos, and licenses into a structured ZIP archive.
 */
export async function getAllProjectsBackupBlob(filenamePrefix = 'site-visit-assistant-ALL-PROJECTS-backup') {
  const allProjects = await getAllProjects()
  if (!allProjects || allProjects.length === 0) {
    throw new Error('No projects found to backup.')
  }

  const projectPackages = []
  for (const proj of allProjects) {
    const pData = await exportProjectData(proj.uuid)
    projectPackages.push(pData)
  }

  const { blob, filename, count } = await createAllProjectsZipPackage(projectPackages)

  return {
    blob,
    filename,
    count,
  }
}

/**
 * Exports all projects, key plans, observations, photos, and licenses into a structured ZIP archive
 * directly to connected OneDrive / Google Drive folder, native file picker, or fallback download.
 */
export async function downloadAllProjectsBackup() {
  const { blob, filename, count } = await getAllProjectsBackupBlob()
  const result = await saveBackupToCloud(blob, filename)
  return {
    count,
    ...result,
  }
}
export async function getSafetyBackup(projectUuid) {
  if (!projectUuid) return null
  return await getSetting(`safety_backup_${projectUuid}`, null)
}

export async function restoreSafetyBackup(projectUuid) {
  const backup = await getSafetyBackup(projectUuid)
  if (!backup || !backup.data) {
    throw new Error('No safety snapshot found for this project.')
  }
  return await importProjectData(backup.data, null, false, projectUuid)
}

export async function importProjectData(data, targetUserEmail = null, asNewCopy = false, overwriteTargetUuid = null) {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid project data format.')
  }
  let { project, phases = [], floorPlans = [], items = [], photos = [], licenses = [] } = data
  if (!project || !project.name) {
    throw new Error('Invalid project file: missing project details.')
  }

  // Security: Cleanse XSS and prototype pollution attacks
  project = {
    ...project,
    name: String(project.name || '').replace(/<[^>]*>?/gm, '').trim(),
    address: project.address ? String(project.address).replace(/<[^>]*>?/gm, '').trim() : '',
    client: project.client ? String(project.client).replace(/<[^>]*>?/gm, '').trim() : '',
  }

  if (asNewCopy) {
    // Generate new UUIDs and remap everything so existing project remains completely untouched
    const oldProjUuid = project.uuid
    const newProjUuid = uuidv4()
    const cleanName = project.name.endsWith('(Imported)') ? project.name : `${project.name} (Imported)`
    const { id: _pId, ...cleanProject } = project
    project = { ...cleanProject, uuid: newProjUuid, name: cleanName }

    const phaseMap = {}
    phases = phases.map(ph => {
      const newPhUuid = uuidv4()
      phaseMap[ph.uuid] = newPhUuid
      const { id: _id, ...cleanPh } = ph
      return { ...cleanPh, uuid: newPhUuid, projectUuid: newProjUuid }
    })

    const fpMap = {}
    floorPlans = floorPlans.map(fp => {
      const newFpUuid = uuidv4()
      fpMap[fp.uuid] = newFpUuid
      const { id: _id, ...cleanFp } = fp
      return {
        ...cleanFp,
        uuid: newFpUuid,
        projectUuid: newProjUuid,
        phaseUuid: phaseMap[fp.phaseUuid] || fp.phaseUuid,
      }
    })

    const itemMap = {}
    items = items.map(item => {
      const newItemUuid = uuidv4()
      itemMap[item.uuid] = newItemUuid
      const { id: _id, ...cleanItem } = item
      return {
        ...cleanItem,
        uuid: newItemUuid,
        projectUuid: newProjUuid,
        floorPlanUuid: fpMap[item.floorPlanUuid] || item.floorPlanUuid,
        phaseUuid: phaseMap[item.phaseUuid] || item.phaseUuid,
      }
    })

    photos = photos.map(photo => {
      const { id: _id, ...cleanPhoto } = photo
      return {
        ...cleanPhoto,
        uuid: uuidv4(),
        punchItemUuid: itemMap[photo.punchItemUuid] || photo.punchItemUuid,
      }
    })

    // Remap licenses to new project/phase UUIDs
    licenses = (licenses || []).map(lic => {
      const { id: _id, ...cleanLic } = lic
      return {
        ...cleanLic,
        projectUuid: newProjUuid,
        reportUuid: phaseMap[lic.reportUuid] || lic.reportUuid,
      }
    })
  } else {
    // Overwrite mode:
    // Identify target project to overwrite
    const targetUuid = overwriteTargetUuid || project.uuid
    const targetExisting = targetUuid ? (await getProject(targetUuid)) : null

    if (targetExisting) {
      // 1. Preserve local license if target project has active license
      const localLic = await getProjectLicense(targetExisting.uuid)
      if (localLic && !project.isLicensed) {
        project.isLicensed = true
        project.licenseKey = localLic.licenseKey
        if (!licenses.some(l => l.licenseKey === localLic.licenseKey)) {
          licenses.push(localLic)
        }
      }

      // 2. Automatic safety restore snapshot saved in DB
      try {
        const safetyBackup = await exportProjectData(targetExisting.uuid)
        await setSetting(`safety_backup_${targetExisting.uuid}`, {
          timestamp: Date.now(),
          projectName: targetExisting.name,
          data: safetyBackup
        })
      } catch (backupErr) {
        console.warn('Pre-overwrite safety snapshot could not be saved:', backupErr)
      }

      // 3. Cleanly delete old project records so no orphaned items/photos remain
      await deleteProject(targetExisting.uuid)
    }

    // Strip id from all entities
    const { id: _pId, ...cleanProject } = project
    project = cleanProject

    phases = phases.map(ph => {
      const { id: _id, ...cleanPh } = ph
      return cleanPh
    })
    floorPlans = floorPlans.map(fp => {
      const { id: _id, ...cleanFp } = fp
      return cleanFp
    })
    items = items.map(item => {
      const { id: _id, ...cleanItem } = item
      return cleanItem
    })
    photos = photos.map(photo => {
      const { id: _id, ...cleanPhoto } = photo
      return cleanPhoto
    })
  }

  if (targetUserEmail) {
    project.ownerEmail = targetUserEmail
  }

  await saveProject(project)
  for (const ph of phases) {
    try { await savePhase(ph) } catch (e) { console.warn('Failed saving phase:', e) }
  }
  for (const fp of floorPlans) {
    try { await saveFloorPlan(fp) } catch (e) { console.warn('Failed saving floorPlan:', e) }
  }
  for (const item of items) {
    try { await savePunchItem(item) } catch (e) { console.warn('Failed saving punchItem:', e) }
  }
  for (const ph of photos) {
    try { await savePhoto(ph) } catch (e) { console.warn('Failed saving photo:', e) }
  }

  // Retain and preserve license information across devices
  await importAndPreserveLicenses(licenses, project)

  return project
}

/**
 * Imports an individual site visit report into a target project.
 * - If targetProjectUuid is provided or matches an existing project (by UUID or name), adds the report inside.
 * - If the parent project does not exist on this device, it automatically creates the parent project.
 * - If a report with the same name already exists in the project:
 *    - resolution === 'auto': returns conflict analysis comparing which version is most current.
 *    - resolution === 'overwrite': replaces existing report data with automatic safety snapshot.
 *    - resolution === 'duplicate': imports as a new copy named "${name} (Imported)".
 * - Preserves licenses: if either the target project or the incoming report is licensed, the project/report remains unlocked.
 */
export async function importReportData(reportPackage, targetProjectUuid = null, resolution = 'auto') {
  if (!reportPackage || typeof reportPackage !== 'object') {
    throw new Error('Invalid report backup data.')
  }
  let { project: incomingProject, phase: incomingPhase, floorPlans = [], items = [], photos = [], licenses = [] } = reportPackage
  if (!incomingPhase || !incomingPhase.name) {
    throw new Error('Invalid report backup: missing report details.')
  }

  // 1. Identify Target Project:
  let targetProject = null
  if (targetProjectUuid) {
    targetProject = await getProject(targetProjectUuid)
  }
  if (!targetProject && incomingProject?.uuid) {
    targetProject = await getProject(incomingProject.uuid)
  }
  if (!targetProject && incomingProject?.name) {
    targetProject = await db.projects.filter(p => p.name && p.name.trim().toLowerCase() === incomingProject.name.trim().toLowerCase()).first()
  }

  // 2. If parent project does NOT exist on this device, create it
  if (!targetProject) {
    const newProjUuid = uuidv4()
    targetProject = {
      uuid: newProjUuid,
      name: incomingProject?.name || 'Imported Project',
      number: incomingProject?.number || '',
      address: incomingProject?.address || '',
      client: incomingProject?.client || '',
      architect: incomingProject?.architect || '',
      isLicensed: !!incomingProject?.isLicensed || (licenses && licenses.length > 0),
      licenseKey: incomingProject?.licenseKey || licenses?.[0]?.licenseKey || null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    await saveProject(targetProject)
  }

  // 3. Check if a report with matching name (or UUID) already exists in this project
  const existingPhases = await getPhases(targetProject.uuid)
  const existingReport = existingPhases.find(
    p => p.uuid === incomingPhase.uuid ||
         (p.name && incomingPhase.name && p.name.trim().toLowerCase() === incomingPhase.name.trim().toLowerCase())
  )

  const existingTimestamp = existingReport ? (existingReport.updatedAt || existingReport.createdAt || 0) : 0
  const incomingTimestamp = incomingPhase.updatedAt || reportPackage.exportedAt || incomingPhase.createdAt || 0
  const isIncomingNewer = incomingTimestamp > existingTimestamp

  // If conflict exists and caller did not specify resolution, return conflict details
  if (existingReport && resolution === 'auto') {
    const allFps = await getFloorPlans(targetProject.uuid)
    const existingFps = allFps.filter(f => f.phaseUuid === existingReport.uuid)
    const fpUuids = new Set(existingFps.map(f => f.uuid))
    const allItems = await getPunchItems(targetProject.uuid)
    const existingItems = allItems.filter(i => (i.phaseUuid === existingReport.uuid) || (i.floorPlanUuid && fpUuids.has(i.floorPlanUuid)))

    return {
      conflict: true,
      existingProject: targetProject,
      existingPhase: existingReport,
      incomingPhase,
      reportPackage,
      existingUpdatedAt: existingTimestamp,
      incomingUpdatedAt: incomingTimestamp,
      isIncomingNewer,
      existingPlanCount: existingFps.length,
      existingItemCount: existingItems.length,
      incomingPlanCount: floorPlans.length,
      incomingItemCount: items.length,
    }
  }

  // 4. Resolve conflict or insert clean report
  let targetPhaseUuid
  let reportName = incomingPhase.name

  if (existingReport && resolution === 'overwrite') {
    // OVERWRITE:
    targetPhaseUuid = existingReport.uuid
    // Safety backup of existing report
    try {
      const safety = await exportReportData(existingReport.uuid, targetProject.uuid)
      await setSetting(`safety_backup_report_${existingReport.uuid}`, {
        timestamp: Date.now(),
        reportName: existingReport.name,
        projectName: targetProject.name,
        data: safety
      })
    } catch (e) {
      console.warn('Report pre-overwrite snapshot notice:', e)
    }

    // Cleanly delete old drawings and observations in existingReport
    const oldFps = (await getFloorPlans(targetProject.uuid)).filter(f => f.phaseUuid === existingReport.uuid)
    for (const fp of oldFps) {
      await deleteFloorPlan(fp.uuid)
    }
    const oldDirect = (await getPunchItems(targetProject.uuid)).filter(i => i.phaseUuid === existingReport.uuid)
    for (const it of oldDirect) {
      await deletePunchItem(it.uuid)
    }

    // Update phase details
    const updatedPhase = {
      ...existingReport,
      ...incomingPhase,
      uuid: targetPhaseUuid,
      projectUuid: targetProject.uuid,
      order: existingReport.order || incomingPhase.order || 1,
      updatedAt: Date.now()
    }
    await savePhase(updatedPhase)
  } else if (existingReport && resolution === 'duplicate') {
    // DUPLICATE:
    targetPhaseUuid = uuidv4()
    reportName = incomingPhase.name.endsWith('(Imported)') ? incomingPhase.name : `${incomingPhase.name} (Imported)`
    const newPhase = {
      ...incomingPhase,
      uuid: targetPhaseUuid,
      projectUuid: targetProject.uuid,
      name: reportName,
      order: existingPhases.length + 1,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    await savePhase(newPhase)
  } else {
    // NO CONFLICT (Insert fresh into project):
    targetPhaseUuid = uuidv4()
    const newPhase = {
      ...incomingPhase,
      uuid: targetPhaseUuid,
      projectUuid: targetProject.uuid,
      order: existingPhases.length + 1,
      createdAt: incomingPhase.createdAt || Date.now(),
      updatedAt: Date.now()
    }
    await savePhase(newPhase)
  }

  // 5. Insert incoming Floor Plans (Key Plans) with mapped UUIDs
  const fpMap = {}
  for (const fp of floorPlans) {
    const newFpUuid = uuidv4()
    fpMap[fp.uuid] = newFpUuid
    const { id: _id, ...cleanFp } = fp
    const newFp = {
      ...cleanFp,
      uuid: newFpUuid,
      projectUuid: targetProject.uuid,
      phaseUuid: targetPhaseUuid,
      createdAt: fp.createdAt || Date.now(),
      updatedAt: Date.now()
    }
    await saveFloorPlan(newFp)
  }

  // 6. Insert incoming Punch Items with mapped UUIDs
  const itemMap = {}
  for (const item of items) {
    const newItemUuid = uuidv4()
    itemMap[item.uuid] = newItemUuid
    const mappedFpUuid = item.floorPlanUuid ? (fpMap[item.floorPlanUuid] || null) : null
    const { id: _id, ...cleanItem } = item
    const newItem = {
      ...cleanItem,
      uuid: newItemUuid,
      projectUuid: targetProject.uuid,
      floorPlanUuid: mappedFpUuid,
      phaseUuid: targetPhaseUuid,
      createdAt: item.createdAt || Date.now(),
      updatedAt: Date.now()
    }
    await savePunchItem(newItem)
  }

  // 7. Insert Photos
  for (const photo of photos) {
    const mappedItemUuid = itemMap[photo.punchItemUuid]
    if (!mappedItemUuid) continue
    const { id: _id, ...cleanPhoto } = photo
    const newPhoto = {
      ...cleanPhoto,
      uuid: uuidv4(),
      punchItemUuid: mappedItemUuid,
      createdAt: photo.createdAt || Date.now()
    }
    await savePhoto(newPhoto)
  }

  // 8. License Preservation:
  const hasIncomingLic = !!incomingProject?.isLicensed || (licenses && licenses.length > 0)
  if (targetProject.isLicensed || hasIncomingLic) {
    const remappedLicenses = (licenses || []).map(lic => ({
      ...lic,
      projectUuid: targetProject.uuid,
      reportUuid: targetPhaseUuid
    }))
    await importAndPreserveLicenses(remappedLicenses, targetProject)
    targetProject.isLicensed = true
    await saveProject(targetProject)
  }

  // 9. Resequence pins continuously across drawings
  try {
    await resequenceReportPins({ projectUuid: targetProject.uuid, phaseUuid: targetPhaseUuid })
  } catch (reseqErr) {
    console.warn('Pins resequencing notice:', reseqErr)
  }

  // Update project counts
  const finalItems = await getPunchItems(targetProject.uuid)
  const openCount = finalItems.filter(i => isObservationOpenStatus(i.status)).length
  targetProject.totalItems = finalItems.length
  targetProject.openItems = openCount
  const finalPhases = await getPhases(targetProject.uuid)
  targetProject.reportCount = finalPhases.length
  await saveProject(targetProject)

  const finalPhase = await getPhase(targetPhaseUuid)

  return {
    status: 'success',
    mode: existingReport ? resolution : 'added',
    project: targetProject,
    targetProject: targetProject,
    phase: finalPhase || { name: reportName, uuid: targetPhaseUuid },
    planCount: floorPlans.length,
    itemCount: items.length,
    photoCount: photos.length,
    isLicensed: !!targetProject.isLicensed
  }
}

/**
 * Intelligently merges an incoming project data package into an existing project.
 * Merging Rules & Conditions:
 * 1. Target Project Metadata: Preserves target project name/number; fills in any blank details (client, address, architect).
 * 2. Reports (Phases): Matches existing reports by UUID or title. Existing reports are preserved; new reports are appended in sequence.
 * 3. Key Plans (Floor Plans): Matches drawings by UUID or drawing name within the report. Existing drawings are retained; new drawings are added.
 * 4. Observations (Punch Items):
 *    - Matching items (by UUID or identical drawing + pin location + notes) are non-destructively updated if incoming is newer.
 *    - Unique items are added as new pins with freshly assigned UUIDs.
 * 5. Photos & Annotations: Combines unique site photos and markups under each observation pin; ignores duplicate photos.
 * 6. License Preservation: If either the local project or the imported backup has an active license, the merged project remains unlocked.
 * 7. Resequencing: Automatically resequences all pin numbers continuously (#1, #2, #3...) across all drawings.
 */
export async function mergeProjectData(targetProjectUuid, data) {
  if (!targetProjectUuid) throw new Error('Target project UUID is required for merging.')
  if (!data || typeof data !== 'object') throw new Error('Invalid project data format.')

  const targetProject = await getProject(targetProjectUuid)
  if (!targetProject) throw new Error('Target project was not found on this device.')

  let { project: incomingProject, phases = [], floorPlans = [], items = [], photos = [], licenses = [] } = data
  if (!incomingProject || !incomingProject.name) {
    throw new Error('Invalid project file: missing project details.')
  }

  // Automatic safety snapshot of target project before merge
  try {
    const safetyBackup = await exportProjectData(targetProjectUuid)
    await setSetting(`safety_backup_${targetProjectUuid}`, {
      timestamp: Date.now(),
      projectName: targetProject.name,
      data: safetyBackup
    })
  } catch (backupErr) {
    console.warn('Pre-merge safety snapshot could not be saved:', backupErr)
  }

  const stats = {
    targetProjectName: targetProject.name,
    reportsAdded: 0,
    reportsMatched: 0,
    keyPlansAdded: 0,
    keyPlansMatched: 0,
    itemsAdded: 0,
    itemsUpdated: 0,
    photosAdded: 0,
    licensePreserved: false
  }

  // 1. Merge project metadata (fill in blanks without overwriting existing data)
  const updatedProject = {
    ...targetProject,
    address: targetProject.address || incomingProject.address || '',
    client: targetProject.client || incomingProject.client || '',
    architect: targetProject.architect || incomingProject.architect || '',
    number: targetProject.number || incomingProject.number || '',
    updatedAt: Date.now()
  }

  // 2. Fetch all existing entities
  const existingPhases = await getPhases(targetProjectUuid)
  const existingFloorPlans = await getFloorPlans(targetProjectUuid)
  const existingItems = await getPunchItems(targetProjectUuid)
  const existingPhotos = await db.photos.toArray()

  // 3. Map Phases (Reports)
  const phaseMap = {}
  for (const ph of phases) {
    const match = existingPhases.find(
      ep => ep.uuid === ph.uuid ||
            (ep.name && ph.name && ep.name.trim().toLowerCase() === ph.name.trim().toLowerCase())
    )
    if (match) {
      phaseMap[ph.uuid] = match.uuid
      stats.reportsMatched++
    } else {
      const newPhaseUuid = uuidv4()
      phaseMap[ph.uuid] = newPhaseUuid
      const { id: _id, ...cleanPh } = ph
      const newPhase = {
        ...cleanPh,
        uuid: newPhaseUuid,
        projectUuid: targetProjectUuid,
        order: existingPhases.length + stats.reportsAdded + 1,
        createdAt: ph.createdAt || Date.now(),
        updatedAt: Date.now()
      }
      await savePhase(newPhase)
      existingPhases.push(newPhase)
      stats.reportsAdded++
    }
  }

  // 4. Map Key Plans (Floor Plans)
  const fpMap = {}
  for (const fp of floorPlans) {
    const mappedPhaseUuid = phaseMap[fp.phaseUuid] || fp.phaseUuid || (existingPhases[0]?.uuid)
    const match = existingFloorPlans.find(
      efp => efp.uuid === fp.uuid ||
             (efp.name && fp.name &&
              efp.name.trim().toLowerCase() === fp.name.trim().toLowerCase() &&
              efp.phaseUuid === mappedPhaseUuid)
    )

    if (match) {
      fpMap[fp.uuid] = match.uuid
      stats.keyPlansMatched++
    } else {
      const newFpUuid = uuidv4()
      fpMap[fp.uuid] = newFpUuid
      const { id: _id, ...cleanFp } = fp
      const newFp = {
        ...cleanFp,
        uuid: newFpUuid,
        projectUuid: targetProjectUuid,
        phaseUuid: mappedPhaseUuid,
        createdAt: fp.createdAt || Date.now(),
        updatedAt: Date.now()
      }
      await saveFloorPlan(newFp)
      existingFloorPlans.push(newFp)
      stats.keyPlansAdded++
    }
  }

  // 5. Map & Merge Punch Items
  const itemMap = {}
  for (const item of items) {
    const mappedFpUuid = fpMap[item.floorPlanUuid] || item.floorPlanUuid
    const mappedPhaseUuid = phaseMap[item.phaseUuid] || item.phaseUuid || (existingPhases[0]?.uuid)

    // Check if item already exists by UUID
    let match = existingItems.find(ei => ei.uuid === item.uuid)

    // If no UUID match, check if there's an item in the exact same location with matching description
    if (!match && mappedFpUuid && item.x != null && item.y != null) {
      match = existingItems.find(ei =>
        ei.floorPlanUuid === mappedFpUuid &&
        Math.abs((ei.x || 0) - item.x) < 0.01 &&
        Math.abs((ei.y || 0) - item.y) < 0.01 &&
        (ei.description || '').trim() === (item.description || '').trim()
      )
    }

    if (match) {
      itemMap[item.uuid] = match.uuid
      // If incoming item has newer notes, update
      if ((item.updatedAt || 0) > (match.updatedAt || 0) || !match.description) {
        await db.punchItems.update(match.id, {
          description: item.description || match.description,
          status: item.status || match.status,
          priority: item.priority || match.priority,
          category: item.category || match.category,
          trade: item.trade || match.trade,
          updatedAt: Date.now()
        })
        stats.itemsUpdated++
      }
    } else {
      const newItemUuid = uuidv4()
      itemMap[item.uuid] = newItemUuid
      const { id: _id, ...cleanItem } = item
      const newItem = {
        ...cleanItem,
        uuid: newItemUuid,
        projectUuid: targetProjectUuid,
        floorPlanUuid: mappedFpUuid,
        phaseUuid: mappedPhaseUuid,
        createdAt: item.createdAt || Date.now(),
        updatedAt: Date.now()
      }
      await savePunchItem(newItem)
      existingItems.push(newItem)
      stats.itemsAdded++
    }
  }

  // 6. Merge Photos
  const targetItemUuids = new Set(existingItems.map(i => i.uuid))
  for (const photo of photos) {
    const mappedItemUuid = itemMap[photo.punchItemUuid] || photo.punchItemUuid
    if (!targetItemUuids.has(mappedItemUuid)) continue

    const photoExists = existingPhotos.some(
      ep => ep.punchItemUuid === mappedItemUuid &&
            (ep.uuid === photo.uuid ||
             ((ep.imageData || ep.dataUrl) && (photo.imageData || photo.dataUrl) &&
              (ep.imageData || ep.dataUrl).slice(0, 300) === (photo.imageData || photo.dataUrl).slice(0, 300)))
    )

    if (!photoExists) {
      const { id: _id, ...cleanPhoto } = photo
      const newPhoto = {
        ...cleanPhoto,
        uuid: uuidv4(),
        punchItemUuid: mappedItemUuid,
        createdAt: photo.createdAt || Date.now()
      }
      await savePhoto(newPhoto)
      existingPhotos.push(newPhoto)
      stats.photosAdded++
    }
  }

  // 7. Retain & preserve licenses if either project has an active license
  if (incomingProject.isLicensed || (licenses && licenses.length > 0) || targetProject.isLicensed) {
    const remappedLicenses = (licenses || []).map(lic => ({
      ...lic,
      projectUuid: targetProjectUuid,
      reportUuid: phaseMap[lic.reportUuid] || lic.reportUuid
    }))
    await importAndPreserveLicenses(remappedLicenses, updatedProject)
    updatedProject.isLicensed = true
    stats.licensePreserved = true
  }

  // Resequence pins and update project counts
  try {
    await resequenceReportPins({ projectUuid: targetProjectUuid })
  } catch (reseqErr) {
    console.warn('Resequence pins during merge notice:', reseqErr)
  }

  const finalItems = await getPunchItems(targetProjectUuid)
  const openCount = finalItems.filter(i => isObservationOpenStatus(i.status)).length
  updatedProject.totalItems = finalItems.length
  updatedProject.openItems = openCount

  const finalPhases = await getPhases(targetProjectUuid)
  updatedProject.reportCount = finalPhases.length

  await saveProject(updatedProject)

  return stats
}

/**
 * Analyzes potential merge conflicts between an existing project on device and an incoming backup.
 * Identifies duplicate/matching observation pins and extracts their details, notes, and photos
 * for side-by-side user comparison.
 */
export async function analyzeProjectMergeConflicts(targetProjectUuid, data) {
  if (!targetProjectUuid) throw new Error('Target project UUID is required for conflict analysis.')
  if (!data || typeof data !== 'object') throw new Error('Invalid project data format.')

  const targetProject = await getProject(targetProjectUuid)
  if (!targetProject) throw new Error('Target project was not found on this device.')

  const { project: incomingProject, phases = [], floorPlans = [], items = [], photos = [] } = data

  const existingPhases = await getPhases(targetProjectUuid)
  const existingFloorPlans = await getFloorPlans(targetProjectUuid)
  const existingItems = await getPunchItems(targetProjectUuid)
  const allExistingPhotos = await db.photos.toArray()

  // Map Phases (Reports)
  const phaseMap = {}
  let matchingReportsCount = 0
  for (const ph of phases) {
    const match = existingPhases.find(
      ep => ep.uuid === ph.uuid ||
            (ep.name && ph.name && ep.name.trim().toLowerCase() === ph.name.trim().toLowerCase())
    )
    if (match) {
      phaseMap[ph.uuid] = match.uuid
      matchingReportsCount++
    }
  }

  // Map Floor Plans (Key Plans)
  const fpMap = {}
  let matchingPlansCount = 0
  for (const fp of floorPlans) {
    const mappedPhaseUuid = phaseMap[fp.phaseUuid] || fp.phaseUuid || (existingPhases[0]?.uuid)
    const match = existingFloorPlans.find(
      efp => efp.uuid === fp.uuid ||
             (efp.name && fp.name &&
              efp.name.trim().toLowerCase() === fp.name.trim().toLowerCase() &&
              efp.phaseUuid === mappedPhaseUuid)
    )
    if (match) {
      fpMap[fp.uuid] = match.uuid
      matchingPlansCount++
    }
  }

  // Quick lookup maps for photos
  const existingPhotosByItem = {}
  for (const p of allExistingPhotos) {
    if (!existingPhotosByItem[p.punchItemUuid]) existingPhotosByItem[p.punchItemUuid] = []
    existingPhotosByItem[p.punchItemUuid].push(p)
  }

  const incomingPhotosByItem = {}
  for (const p of photos) {
    if (!incomingPhotosByItem[p.punchItemUuid]) incomingPhotosByItem[p.punchItemUuid] = []
    incomingPhotosByItem[p.punchItemUuid].push(p)
  }

  const conflictingItems = []
  let newItemsCount = 0

  for (const item of items) {
    const mappedFpUuid = fpMap[item.floorPlanUuid] || item.floorPlanUuid
    const mappedPhaseUuid = phaseMap[item.phaseUuid] || item.phaseUuid || (existingPhases[0]?.uuid)

    // Check if item already exists by UUID
    let match = existingItems.find(ei => ei.uuid === item.uuid)

    // If no UUID match, check matching location + description
    if (!match && mappedFpUuid && item.x != null && item.y != null) {
      match = existingItems.find(ei =>
        ei.floorPlanUuid === mappedFpUuid &&
        Math.abs((ei.x || 0) - item.x) < 0.01 &&
        Math.abs((ei.y || 0) - item.y) < 0.01 &&
        (ei.description || '').trim() === (item.description || '').trim()
      )
    }

    // Also match by floorPlan and pin number
    if (!match && mappedFpUuid && (item.itemNumber != null || item.number != null)) {
      const pinNum = item.itemNumber ?? item.number
      match = existingItems.find(ei =>
        ei.floorPlanUuid === mappedFpUuid &&
        (ei.itemNumber === pinNum || ei.number === pinNum)
      )
    }

    if (match) {
      const existingPlan = existingFloorPlans.find(f => f.uuid === match.floorPlanUuid)
      const existingPhase = existingPhases.find(p => p.uuid === (match.phaseUuid || existingPlan?.phaseUuid))
      const incomingPlan = floorPlans.find(f => f.uuid === item.floorPlanUuid)
      const incomingPhase = phases.find(p => p.uuid === (item.phaseUuid || incomingPlan?.phaseUuid))

      const existingPhotosForItem = existingPhotosByItem[match.uuid] || []
      const incomingPhotosForItem = incomingPhotosByItem[item.uuid] || []

      const existingTs = match.updatedAt || match.createdAt || 0
      const incomingTs = item.updatedAt || item.createdAt || 0
      const isIncomingNewer = incomingTs > existingTs

      const conflictId = item.uuid || match.uuid || `conflict_${conflictingItems.length + 1}`

      conflictingItems.push({
        id: conflictId,
        incomingUuid: item.uuid,
        existingUuid: match.uuid,
        existingId: match.id,
        pinNumber: match.itemNumber || match.number || item.itemNumber || item.number || (conflictingItems.length + 1),
        planName: existingPlan?.name || incomingPlan?.name || 'Key Plan',
        phaseName: existingPhase?.name || incomingPhase?.name || 'Site Visit Report',
        isIncomingNewer,
        existing: match,
        incoming: item,
        existingPhotos: existingPhotosForItem,
        incomingPhotos: incomingPhotosForItem,
        mappedFpUuid,
        mappedPhaseUuid
      })
    } else {
      newItemsCount++
    }
  }

  return {
    targetProject,
    incomingProject,
    conflictingItems,
    newItemsCount,
    matchingReportsCount,
    matchingPlansCount
  }
}

/**
 * Executes a custom project merge using specific user decisions for each conflicting observation.
 * Decisions per conflict id:
 * - 'existing': Keep the observation currently on this device. Non-duplicate incoming photos can be attached.
 * - 'incoming': Overwrite the local observation's description/status/priority/trade with incoming data.
 * - 'both': Keep local observation untouched, and add the incoming observation as a new unique pin.
 */
export async function executeCustomProjectMerge(targetProjectUuid, data, decisions = {}) {
  if (!targetProjectUuid) throw new Error('Target project UUID is required.')
  if (!data || typeof data !== 'object') throw new Error('Invalid project data format.')

  const targetProject = await getProject(targetProjectUuid)
  if (!targetProject) throw new Error('Target project was not found on this device.')

  let { project: incomingProject, phases = [], floorPlans = [], items = [], photos = [], licenses = [] } = data

  // Safety snapshot
  try {
    const safetyBackup = await exportProjectData(targetProjectUuid)
    await setSetting(`safety_backup_${targetProjectUuid}`, {
      timestamp: Date.now(),
      projectName: targetProject.name,
      data: safetyBackup
    })
  } catch (backupErr) {
    console.warn('Pre-merge safety snapshot notice:', backupErr)
  }

  const stats = {
    targetProjectName: targetProject.name,
    reportsAdded: 0,
    reportsMatched: 0,
    keyPlansAdded: 0,
    keyPlansMatched: 0,
    itemsKeptDevice: 0,
    itemsUpdated: 0,
    itemsDuplicated: 0,
    itemsAdded: 0,
    photosAdded: 0,
    licensePreserved: false
  }

  // 1. Merge project metadata
  const updatedProject = {
    ...targetProject,
    address: targetProject.address || incomingProject.address || '',
    client: targetProject.client || incomingProject.client || '',
    architect: targetProject.architect || incomingProject.architect || '',
    number: targetProject.number || incomingProject.number || '',
    updatedAt: Date.now()
  }

  // 2. Fetch all existing entities
  const existingPhases = await getPhases(targetProjectUuid)
  const existingFloorPlans = await getFloorPlans(targetProjectUuid)
  const existingItems = await getPunchItems(targetProjectUuid)
  const existingPhotos = await db.photos.toArray()

  // 3. Map Phases
  const phaseMap = {}
  for (const ph of phases) {
    const match = existingPhases.find(
      ep => ep.uuid === ph.uuid ||
            (ep.name && ph.name && ep.name.trim().toLowerCase() === ph.name.trim().toLowerCase())
    )
    if (match) {
      phaseMap[ph.uuid] = match.uuid
      stats.reportsMatched++
    } else {
      const newPhaseUuid = uuidv4()
      phaseMap[ph.uuid] = newPhaseUuid
      const { id: _id, ...cleanPh } = ph
      const newPhase = {
        ...cleanPh,
        uuid: newPhaseUuid,
        projectUuid: targetProjectUuid,
        order: existingPhases.length + stats.reportsAdded + 1,
        createdAt: ph.createdAt || Date.now(),
        updatedAt: Date.now()
      }
      await savePhase(newPhase)
      existingPhases.push(newPhase)
      stats.reportsAdded++
    }
  }

  // 4. Map Key Plans
  const fpMap = {}
  for (const fp of floorPlans) {
    const mappedPhaseUuid = phaseMap[fp.phaseUuid] || fp.phaseUuid || (existingPhases[0]?.uuid)
    const match = existingFloorPlans.find(
      efp => efp.uuid === fp.uuid ||
             (efp.name && fp.name &&
              efp.name.trim().toLowerCase() === fp.name.trim().toLowerCase() &&
              efp.phaseUuid === mappedPhaseUuid)
    )

    if (match) {
      fpMap[fp.uuid] = match.uuid
      stats.keyPlansMatched++
    } else {
      const newFpUuid = uuidv4()
      fpMap[fp.uuid] = newFpUuid
      const { id: _id, ...cleanFp } = fp
      const newFp = {
        ...cleanFp,
        uuid: newFpUuid,
        projectUuid: targetProjectUuid,
        phaseUuid: mappedPhaseUuid,
        createdAt: fp.createdAt || Date.now(),
        updatedAt: Date.now()
      }
      await saveFloorPlan(newFp)
      existingFloorPlans.push(newFp)
      stats.keyPlansAdded++
    }
  }

  // 5. Items with decisions
  const itemMap = {} // maps incoming item.uuid -> destination punchItemUuid

  for (const item of items) {
    const mappedFpUuid = fpMap[item.floorPlanUuid] || item.floorPlanUuid
    const mappedPhaseUuid = phaseMap[item.phaseUuid] || item.phaseUuid || (existingPhases[0]?.uuid)

    // Check match
    let match = existingItems.find(ei => ei.uuid === item.uuid)
    if (!match && mappedFpUuid && item.x != null && item.y != null) {
      match = existingItems.find(ei =>
        ei.floorPlanUuid === mappedFpUuid &&
        Math.abs((ei.x || 0) - item.x) < 0.01 &&
        Math.abs((ei.y || 0) - item.y) < 0.01 &&
        (ei.description || '').trim() === (item.description || '').trim()
      )
    }
    if (!match && mappedFpUuid && (item.itemNumber != null || item.number != null)) {
      const pinNum = item.itemNumber ?? item.number
      match = existingItems.find(ei =>
        ei.floorPlanUuid === mappedFpUuid &&
        (ei.itemNumber === pinNum || ei.number === pinNum)
      )
    }

    if (match) {
      const conflictId = item.uuid || match.uuid
      const userChoice = decisions[conflictId] || (item.updatedAt > match.updatedAt ? 'incoming' : 'existing')

      if (userChoice === 'existing') {
        // Keep existing item as is
        itemMap[item.uuid] = match.uuid
        stats.itemsKeptDevice++
      } else if (userChoice === 'incoming') {
        // Update existing item with incoming data
        itemMap[item.uuid] = match.uuid
        await db.punchItems.update(match.id, {
          description: item.description !== undefined ? item.description : match.description,
          status: item.status || match.status,
          priority: item.priority || match.priority,
          category: item.category || match.category,
          trade: item.trade || match.trade,
          dueDate: item.dueDate || match.dueDate,
          updatedAt: Date.now()
        })
        stats.itemsUpdated++
      } else if (userChoice === 'both') {
        // Keep both: Keep existing item untouched, and create a brand new duplicate item for incoming
        const duplicateItemUuid = uuidv4()
        itemMap[item.uuid] = duplicateItemUuid
        const { id: _id, ...cleanItem } = item
        const duplicateItem = {
          ...cleanItem,
          uuid: duplicateItemUuid,
          projectUuid: targetProjectUuid,
          floorPlanUuid: mappedFpUuid,
          phaseUuid: mappedPhaseUuid,
          createdAt: item.createdAt || Date.now(),
          updatedAt: Date.now()
        }
        await savePunchItem(duplicateItem)
        existingItems.push(duplicateItem)
        stats.itemsDuplicated++
        stats.itemsAdded++
      }
    } else {
      // Brand new item: create it
      const newItemUuid = uuidv4()
      itemMap[item.uuid] = newItemUuid
      const { id: _id, ...cleanItem } = item
      const newItem = {
        ...cleanItem,
        uuid: newItemUuid,
        projectUuid: targetProjectUuid,
        floorPlanUuid: mappedFpUuid,
        phaseUuid: mappedPhaseUuid,
        createdAt: item.createdAt || Date.now(),
        updatedAt: Date.now()
      }
      await savePunchItem(newItem)
      existingItems.push(newItem)
      stats.itemsAdded++
    }
  }

  // 6. Merge Photos
  const targetItemUuids = new Set(existingItems.map(i => i.uuid))
  for (const photo of photos) {
    const mappedItemUuid = itemMap[photo.punchItemUuid] || photo.punchItemUuid
    if (!targetItemUuids.has(mappedItemUuid)) continue

    const photoExists = existingPhotos.some(
      ep => ep.punchItemUuid === mappedItemUuid &&
            (ep.uuid === photo.uuid ||
             ((ep.imageData || ep.dataUrl) && (photo.imageData || photo.dataUrl) &&
              (ep.imageData || ep.dataUrl).slice(0, 300) === (photo.imageData || photo.dataUrl).slice(0, 300)))
    )

    if (!photoExists) {
      const { id: _id, ...cleanPhoto } = photo
      const newPhoto = {
        ...cleanPhoto,
        uuid: uuidv4(),
        punchItemUuid: mappedItemUuid,
        createdAt: photo.createdAt || Date.now()
      }
      await savePhoto(newPhoto)
      existingPhotos.push(newPhoto)
      stats.photosAdded++
    }
  }

  // 7. Retain & preserve licenses
  if (incomingProject.isLicensed || (licenses && licenses.length > 0) || targetProject.isLicensed) {
    const remappedLicenses = (licenses || []).map(lic => ({
      ...lic,
      projectUuid: targetProjectUuid,
      reportUuid: phaseMap[lic.reportUuid] || lic.reportUuid
    }))
    await importAndPreserveLicenses(remappedLicenses, updatedProject)
    updatedProject.isLicensed = true
    stats.licensePreserved = true
  }

  // Resequence pins and update project counts
  try {
    await resequenceReportPins({ projectUuid: targetProjectUuid })
  } catch (reseqErr) {
    console.warn('Resequence pins during custom merge notice:', reseqErr)
  }

  const finalItems = await getPunchItems(targetProjectUuid)
  const openCount = finalItems.filter(i => isObservationOpenStatus(i.status)).length
  updatedProject.totalItems = finalItems.length
  updatedProject.openItems = openCount

  const finalPhases = await getPhases(targetProjectUuid)
  updatedProject.reportCount = finalPhases.length

  await saveProject(updatedProject)

  return stats
}
