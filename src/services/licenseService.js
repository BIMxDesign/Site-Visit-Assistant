import { db } from '../db/database'

// Default WordPress store domain (can be configured in Settings)
export const DEFAULT_WP_URL = 'https://www.bimxdesign.com'
const STORAGE_KEY_WP_URL = 'sitepunch_wordpress_url'
const STORAGE_KEY_LICENSES = 'sitepunch_project_licenses'

// WooCommerce License Manager (LMFWC) REST API Credentials
export const DEFAULT_CONSUMER_KEY = 'ck_85c1b5531ead85b9a70050b64c8d7003e3579177'
export const DEFAULT_CONSUMER_SECRET = 'cs_55c37ba409097d77be3f26b0caad7ab268233156'
const STORAGE_KEY_CONSUMER_KEY = 'sitepunch_lmfwc_consumer_key'
const STORAGE_KEY_CONSUMER_SECRET = 'sitepunch_lmfwc_consumer_secret'

// 2 years in milliseconds (2 years * 365.25 days * 24h * 60m * 60s * 1000ms)
export const TWO_YEARS_MS = 2 * 365.25 * 24 * 60 * 60 * 1000

/**
 * Get configured LMFWC API Consumer Key
 */
export function getLmfwcConsumerKey() {
  try {
    const custom = localStorage.getItem(STORAGE_KEY_CONSUMER_KEY)
    if (custom && custom.trim()) return custom.trim()
  } catch {}
  return DEFAULT_CONSUMER_KEY
}

/**
 * Get configured LMFWC API Consumer Secret
 */
export function getLmfwcConsumerSecret() {
  try {
    const custom = localStorage.getItem(STORAGE_KEY_CONSUMER_SECRET)
    if (custom && custom.trim()) return custom.trim()
  } catch {}
  return DEFAULT_CONSUMER_SECRET
}

/**
 * Update configured LMFWC API credentials
 */
export function setLmfwcCredentials(key, secret) {
  try {
    if (key) localStorage.setItem(STORAGE_KEY_CONSUMER_KEY, key.trim())
    if (secret) localStorage.setItem(STORAGE_KEY_CONSUMER_SECRET, secret.trim())
  } catch {}
}

/**
 * Get the configured WordPress store URL (strips trailing slashes)
 */
export function getWordPressUrl() {
  try {
    const custom = localStorage.getItem(STORAGE_KEY_WP_URL)
    if (custom && custom.trim() && !custom.includes('ideaarchitects.com')) {
      return custom.trim().replace(/\/+$/, '')
    }
  } catch {}
  return DEFAULT_WP_URL
}

/**
 * Update the WordPress store URL in settings
 */
export function setWordPressUrl(url) {
  try {
    if (!url) {
      localStorage.removeItem(STORAGE_KEY_WP_URL)
    } else {
      localStorage.setItem(STORAGE_KEY_WP_URL, url.trim().replace(/\/+$/, ''))
    }
  } catch (err) {
    console.error('Failed to save WordPress URL:', err)
  }
}

/**
 * Load all project licenses stored in local storage cache
 */
export function getCachedLicenses() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LICENSES)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveCachedLicenses(list) {
  try {
    localStorage.setItem(STORAGE_KEY_LICENSES, JSON.stringify(list))
  } catch (err) {
    console.error('Failed to cache licenses:', err)
  }
}

/**
 * Check if a project is licensed / unlocked
 */
export async function checkProjectLicense(projectUuid) {
  if (!projectUuid) return false
  const cleanId = String(projectUuid).trim()

  // 1. Check in local Dexie DB projects table
  try {
    const project = await db.projects.where('uuid').equals(cleanId).first()
    if (project?.isLicensed || project?.licenseKey) {
      return true
    }
  } catch {}

  // 2. Check in Dexie DB licenses table
  try {
    const lic = await db.licenses.where('reportUuid').equals(cleanId).first()
    if (lic && (lic.status === 'ACTIVE' || lic.status === 'PAID')) {
      return true
    }
  } catch {}

  // 3. Check in localStorage cache
  const cached = getCachedLicenses()
  return cached.some(l => l.projectUuid === cleanId && (l.status === 'ACTIVE' || l.status === 'PAID'))
}

/**
 * Get Set of all currently licensed project UUIDs (for fast synchronous UI lookups)
 */
export function getLicensedProjectUuids() {
  const cached = getCachedLicenses()
  const set = new Set(cached.map(c => c.projectUuid).filter(Boolean))
  return set
}

/**
 * Get license details for a specific project
 */
export async function getProjectLicense(projectUuid) {
  if (!projectUuid) return null
  const cleanId = String(projectUuid).trim()

  // Try DB licenses
  try {
    const lic = await db.licenses.where('reportUuid').equals(cleanId).first()
    if (lic) return lic
  } catch {}

  // Try Project record
  try {
    const proj = await db.projects.where('uuid').equals(cleanId).first()
    if (proj?.licenseKey) {
      return {
        licenseKey: proj.licenseKey,
        projectUuid: proj.uuid,
        projectName: proj.licensedName || proj.name,
        activatedAt: proj.licensedAt || proj.createdAt,
        status: 'ACTIVE',
        provider: 'wordpress',
      }
    }
  } catch {}

  // Try cache
  const cached = getCachedLicenses()
  return cached.find(l => l.projectUuid === cleanId) || null
}

/**
 * Activates a project license key via WordPress License Manager (LMFWC) REST API.
 * - Contacts WordPress: POST {wpUrl}/wp-json/lmfwc/v2/licenses/activate/{licenseKey}
 * - Once activated, attaches license directly to the project record in IndexedDB
 * - 100% offline-ready: license is permanently saved locally so subsequent exports never need internet
 */
export async function activateProjectLicense(projectUuid, licenseKey, projectName = '') {
  if (!projectUuid) throw new Error('Missing project identifier.')
  if (!licenseKey || !licenseKey.trim()) throw new Error('Please enter a valid license key.')

  const cleanKey = licenseKey.trim().toUpperCase()
  const cleanProjId = String(projectUuid).trim()
  const wpBase = getWordPressUrl()
  const consumerKey = getLmfwcConsumerKey()
  const consumerSecret = getLmfwcConsumerSecret()

  let responseData = null

  // Call WordPress License Manager REST API
  try {
    const rawUrl = `${wpBase}/wp-json/lmfwc/v2/licenses/activate/${encodeURIComponent(cleanKey)}`
    let apiUrl = rawUrl
    try {
      const parsed = new URL(rawUrl)
      if (consumerKey) parsed.searchParams.set('consumer_key', consumerKey)
      if (consumerSecret) parsed.searchParams.set('consumer_secret', consumerSecret)
      apiUrl = parsed.toString()
    } catch {
      if (consumerKey && consumerSecret) {
        const sep = apiUrl.includes('?') ? '&' : '?'
        apiUrl = `${apiUrl}${sep}consumer_key=${encodeURIComponent(consumerKey)}&consumer_secret=${encodeURIComponent(consumerSecret)}`
      }
    }

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }
    if (consumerKey && consumerSecret) {
      try {
        headers['Authorization'] = 'Basic ' + btoa(`${consumerKey}:${consumerSecret}`)
      } catch (bErr) {
        console.warn('Base64 auth header error:', bErr)
      }
    }

    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        projectUuid: cleanProjId,
        projectName: projectName,
      }),
    })

    if (resp.ok) {
      responseData = await resp.json()
    } else {
      const errJson = await resp.json().catch(() => null)
      const errorMsg = errJson?.message || errJson?.error || (errJson?.data && errJson.data.message)
      if (errorMsg) {
        throw new Error(errorMsg)
      } else if (resp.status === 401 || resp.status === 403) {
        throw new Error('WordPress API authorization failed (401/403). Please verify your Consumer Key and Secret have Read/Write permissions.')
      } else if (resp.status === 404) {
        throw new Error(`The license key "${cleanKey}" does not exist in your WooCommerce store. Please verify the key.`)
      } else if (resp.status === 400 || resp.status === 422) {
        throw new Error(`License key "${cleanKey}" is either already activated or inactive.`)
      } else {
        throw new Error(`WordPress license verification failed with HTTP status ${resp.status}.`)
      }
    }
  } catch (err) {
    if (
      err.message &&
      (err.message.includes('does not exist') ||
        err.message.includes('already activated') ||
        err.message.includes('authorization failed') ||
        err.message.includes('inactive') ||
        err.message.includes('maximum activation'))
    ) {
      throw err
    }
    // Network or CORS error
    console.warn('WordPress activation API notice:', err.message)
    throw new Error(
      `Unable to connect to WordPress license server at ${wpBase}. Please verify your internet connection or check your WordPress store address in settings.\n(${err.message})`
    )
  }

  // Save the activated license record
  const record = {
    licenseKey: cleanKey,
    projectUuid: cleanProjId,
    reportUuid: cleanProjId,
    projectName: projectName || 'Site Project',
    status: 'ACTIVE',
    provider: 'wordpress',
    activatedAt: Date.now(),
    wpData: responseData,
  }

  // 1. Save directly into Dexie DB projects table
  try {
    const proj = await db.projects.where('uuid').equals(cleanProjId).first()
    if (proj) {
      await db.projects.update(proj.id, {
        isLicensed: true,
        licenseKey: cleanKey,
        licensedAt: Date.now(),
        licensedName: proj.name,
        updatedAt: Date.now(),
      })
    }
  } catch (dbErr) {
    console.warn('Failed to update project with license in DB:', dbErr)
  }

  // 2. Save into Dexie DB licenses table
  try {
    await db.licenses.put({
      licenseKey: cleanKey,
      reportUuid: cleanProjId,
      status: 'ACTIVE',
      provider: 'wordpress',
      createdAt: Date.now(),
    })
  } catch {}

  // 3. Save into LocalStorage cache
  const cached = getCachedLicenses()
  const existingIdx = cached.findIndex(c => c.projectUuid === cleanProjId)
  if (existingIdx >= 0) {
    cached[existingIdx] = record
  } else {
    cached.push(record)
  }
  saveCachedLicenses(cached)

  return record
}

/**
 * Checks if a project's name should be locked / read-only:
 * - Rule: Project name becomes greyed out / uneditable 2 years after creation or activation.
 * - This prevents recycling an unlocked project for an entirely different building after 2 years.
 */
export function isProjectNameLocked(project) {
  if (!project) return { locked: false, reason: '' }

  const now = Date.now()
  const createdAtMs = project.createdAt ? Number(project.createdAt) : 0
  const licensedAtMs = project.licensedAt ? Number(project.licensedAt) : 0

  // 2-Year rule from first creation
  if (createdAtMs > 0 && now - createdAtMs > TWO_YEARS_MS) {
    const yearsAgo = ((now - createdAtMs) / (365.25 * 24 * 60 * 60 * 1000)).toFixed(1)
    return {
      locked: true,
      reason: `Project name is locked because this project was created ${yearsAgo} years ago (2-year policy prevents project recycling).`,
    }
  }

  // 2-Year rule from license activation
  if (licensedAtMs > 0 && now - licensedAtMs > TWO_YEARS_MS) {
    return {
      locked: true,
      reason: 'Project name is locked because the project export license was activated over 2 years ago.',
    }
  }

  return { locked: false, reason: '' }
}

/**
 * Restores & preserves licenses during project backup import (device-to-device portability).
 * The project's license is preserved so the user never has to re-buy on their second device!
 */
export async function importAndPreserveLicenses(licenses = [], project = null) {
  if (!project) return

  // If project has license directly embedded
  if (project.isLicensed && project.licenseKey) {
    const record = {
      licenseKey: project.licenseKey,
      projectUuid: project.uuid,
      reportUuid: project.uuid,
      projectName: project.licensedName || project.name,
      status: 'ACTIVE',
      provider: 'wordpress',
      activatedAt: project.licensedAt || Date.now(),
    }

    const cached = getCachedLicenses()
    if (!cached.some(c => c.projectUuid === project.uuid)) {
      cached.push(record)
      saveCachedLicenses(cached)
    }

    try {
      await db.licenses.put({
        licenseKey: project.licenseKey,
        reportUuid: project.uuid,
        status: 'ACTIVE',
        provider: 'wordpress',
        createdAt: project.licensedAt || Date.now(),
      })
    } catch {}
  }

  // Process any licenses in the backup array
  if (Array.isArray(licenses)) {
    for (const lic of licenses) {
      if (!lic || !lic.licenseKey) continue
      try {
        await db.licenses.put({
          licenseKey: lic.licenseKey,
          reportUuid: lic.reportUuid || lic.projectUuid || project.uuid,
          status: 'ACTIVE',
          provider: lic.provider || 'wordpress',
          createdAt: lic.activatedAt || lic.createdAt || Date.now(),
        })
      } catch {}
    }
  }
}
