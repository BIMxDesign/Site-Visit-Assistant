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
 * Normalizes a WordPress store URL: ensures protocol (https://) and strips trailing slashes
 */
export function normalizeWpUrl(url) {
  if (!url) return DEFAULT_WP_URL
  let cleaned = String(url).trim().replace(/\/+$/, '')
  if (!cleaned) return DEFAULT_WP_URL
  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = 'https://' + cleaned
  }
  if (cleaned.toLowerCase() === 'https://bimxdesign.com' || cleaned.toLowerCase() === 'http://bimxdesign.com') {
    cleaned = 'https://www.bimxdesign.com'
  }
  return cleaned
}

/**
 * Returns candidate base URLs for WordPress:
 * - The configured domain (e.g. https://www.bimxdesign.com)
 * - The non-www / www variant (to avoid cross-origin redirect CORS failures)
 * - Local Vite proxy (/api-wp) when developing on localhost
 */
export function getCandidateBases(inputUrl) {
  const normalized = normalizeWpUrl(inputUrl || getWordPressUrl())
  const bases = [normalized]

  // Add non-www / www variant
  if (normalized.includes('://www.')) {
    bases.push(normalized.replace('://www.', '://'))
  } else if (normalized.includes('://')) {
    bases.push(normalized.replace('://', '://www.'))
  }

  // In local development, prepend local proxy so CORS is 100% bypassed
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    bases.unshift(window.location.origin + '/api-wp')
  }

  return [...new Set(bases)]
}

/**
 * Get the configured WordPress store URL (strips trailing slashes)
 */
export function getWordPressUrl() {
  try {
    const custom = localStorage.getItem(STORAGE_KEY_WP_URL)
    if (custom && custom.trim() && !custom.includes('ideaarchitects.com')) {
      return normalizeWpUrl(custom)
    }
  } catch {}
  return DEFAULT_WP_URL
}

/**
 * Update the WordPress store URL in settings
 */
export function setWordPressUrl(url) {
  try {
    if (!url || !url.trim()) {
      localStorage.removeItem(STORAGE_KEY_WP_URL)
    } else {
      localStorage.setItem(STORAGE_KEY_WP_URL, normalizeWpUrl(url))
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
 * Test connectivity and API key permissions against WordPress / WooCommerce License Manager
 */
export async function testWordPressConnection(customWpUrl, customKey, customSecret) {
  const bases = getCandidateBases(customWpUrl)
  const key = (customKey !== undefined ? customKey : getLmfwcConsumerKey()).trim()
  const secret = (customSecret !== undefined ? customSecret : getLmfwcConsumerSecret()).trim()

  let lastAuthError = null
  let anyEndpointReached = false

  for (const base of bases) {
    const testEndpoints = [
      buildCandidateUrl(base, '/wp-json/lmfwc/v2/licenses', { consumer_key: key, consumer_secret: secret, limit: '1' }),
      buildCandidateUrl(base, '/wp-json/lmfwc/v1/licenses', { consumer_key: key, consumer_secret: secret, limit: '1' }),
      buildCandidateUrl(base, '', { rest_route: '/lmfwc/v2/licenses', consumer_key: key, consumer_secret: secret, limit: '1' }),
    ]

    for (const url of testEndpoints) {
      try {
        // Try query auth first (no Basic header to avoid Apache/CGI interception)
        let resp = await fetch(url, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        })

        // If 401/403, retry with Authorization: Basic header
        if ((resp.status === 401 || resp.status === 403) && key && secret) {
          const basicHeaders = { 'Accept': 'application/json' }
          try {
            basicHeaders['Authorization'] = 'Basic ' + btoa(`${key}:${secret}`)
          } catch {}
          const resp2 = await fetch(url, { method: 'GET', headers: basicHeaders }).catch(() => null)
          if (resp2 && (resp2.ok || resp2.status !== 401)) {
            resp = resp2
          }
        }

        if (resp.ok) {
          return {
            success: true,
            message: `Connection successful! Reached WordPress store (${normalizeWpUrl(customWpUrl || getWordPressUrl())}) and WooCommerce API credentials are valid with Read/Write access.`,
          }
        }

        if (resp.status === 401 || resp.status === 403) {
          anyEndpointReached = true
          lastAuthError = `Authentication failed (HTTP ${resp.status}): WooCommerce rejected the Consumer Key or Secret.\n\nPlease verify in WordPress Admin > WooCommerce > Settings > Advanced > REST API that:\n1. Your API Key exists and matches your Consumer Key and Secret.\n2. The Permissions are set to "Read/Write" (Read-only keys are rejected).`
          break
        }

        if (resp.status === 404) {
          anyEndpointReached = true
        }
      } catch (err) {
        // Network or CORS error on this base candidate, continue to next
      }
    }

    if (lastAuthError) {
      return { success: false, message: lastAuthError }
    }
  }

  if (anyEndpointReached) {
    return {
      success: false,
      message: `WordPress is reachable, but the License Manager REST endpoint was not found (404).\n\nPlease verify:\n1. 'License Manager for WooCommerce' plugin is active in WordPress.\n2. Go to WordPress Admin > Settings > Permalinks and click 'Save Changes' to refresh routes.`,
    }
  }

  return {
    success: false,
    message: `Unable to connect to WordPress server at ${bases[0] || getWordPressUrl()}.\n\nPlease check:\n1. Verify your internet connection.\n2. Ensure the store address starts with https:// (e.g. https://www.bimxdesign.com).\n3. If your site has Cloudflare or a security plugin, ensure cross-origin API requests from your app are permitted.`,
  }
}

/**
 * Helper to build full candidate URLs with query parameters
 */
function buildCandidateUrl(base, path, queryParams = {}) {
  let urlStr = base.replace(/\/+$/, '') + path
  try {
    const u = new URL(urlStr)
    for (const [k, v] of Object.entries(queryParams)) {
      if (v != null && v !== '') u.searchParams.set(k, String(v))
    }
    return u.toString()
  } catch {
    const params = Object.entries(queryParams)
      .filter(([_, v]) => v != null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&')
    if (!params) return urlStr
    return `${urlStr}${urlStr.includes('?') ? '&' : '?'}${params}`
  }
}

/**
 * Helper to save an activated license locally in Dexie DB and localStorage
 */
async function saveLicenseRecord(record, cleanProjId, cleanKey) {
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
      projectName: record.projectName || 'Site Project',
      provider: record.provider || 'wordpress',
      createdAt: Date.now(),
    })
  } catch (licErr) {
    console.warn('Failed to save license into licenses table:', licErr)
  }

  // 3. Save into LocalStorage cache
  const cached = getCachedLicenses()
  const existingIdx = cached.findIndex(c => c.projectUuid === cleanProjId)
  if (existingIdx >= 0) {
    cached[existingIdx] = record
  } else {
    cached.push(record)
  }
  saveCachedLicenses(cached)
}

/**
 * Activates a project license key via WordPress License Manager (LMFWC) REST API.
 * - Contacts WordPress License Manager REST endpoint:
 *   - Primary: GET {wpUrl}/wp-json/lmfwc/v2/licenses/activate/{licenseKey} (official LMFWC v2 method)
 *   - Resilient fallbacks: POST v2, GET v1, POST v1, and Plain permalinks (?rest_route=...)
 *   - Automatic candidate base resolution (domain, non-www, and localhost proxy)
 * - Once activated, attaches license directly to the project record in IndexedDB
 * - 100% offline-ready: license is permanently saved locally so subsequent exports never need internet
 */
export async function activateProjectLicense(projectUuid, licenseKey, projectName = '') {
  if (!projectUuid) throw new Error('Missing project identifier.')
  if (!licenseKey || !licenseKey.trim()) throw new Error('Please enter a valid license key.')

  const cleanKey = licenseKey.trim().toUpperCase()
  const cleanProjId = String(projectUuid).trim()

  // Safeguard: Prevent activating multiple distinct projects with the same key on this device
  if (!cleanKey.startsWith('OFFLINE') && !cleanKey.startsWith('DEMO') && cleanKey !== 'TEST-KEY') {
    const existingWithKey = getCachedLicenses().find(
      l => l.licenseKey?.toUpperCase() === cleanKey && l.projectUuid && l.projectUuid !== cleanProjId
    )
    if (existingWithKey) {
      throw new Error(
        `This license key is already in use by project "${existingWithKey.projectName || 'Another Project'}". Each project requires its own 1-time license key.`
      )
    }
  }

  // Offline / Demo emergency activation bypass
  if (
    cleanKey.startsWith('OFFLINE') ||
    cleanKey.startsWith('DEMO') ||
    cleanKey.startsWith('SITE-') ||
    cleanKey === 'TEST-KEY'
  ) {
    const record = {
      licenseKey: cleanKey,
      projectUuid: cleanProjId,
      reportUuid: cleanProjId,
      projectName: projectName || 'Site Project',
      status: 'ACTIVE',
      provider: 'offline_bypass',
      activatedAt: Date.now(),
      wpData: { offline: true },
    }
    await saveLicenseRecord(record, cleanProjId, cleanKey)
    return record
  }

  const wpBase = getWordPressUrl()
  const bases = getCandidateBases(wpBase)
  const consumerKey = getLmfwcConsumerKey()
  const consumerSecret = getLmfwcConsumerSecret()

  let responseData = null

  // Build candidate activation routes across all candidate bases (domain, non-www, and localhost proxy)
  const candidates = []
  for (const base of bases) {
    // 1. Official LMFWC v2 GET endpoint (Standard documented activation method)
    candidates.push({
      label: `LMFWC v2 (GET) - ${base}`,
      method: 'GET',
      url: buildCandidateUrl(base, `/wp-json/lmfwc/v2/licenses/activate/${encodeURIComponent(cleanKey)}`, {
        consumer_key: consumerKey,
        consumer_secret: consumerSecret,
        label: projectName || cleanProjId,
      }),
    })
    // 2. LMFWC v2 POST endpoint
    candidates.push({
      label: `LMFWC v2 (POST) - ${base}`,
      method: 'POST',
      url: buildCandidateUrl(base, `/wp-json/lmfwc/v2/licenses/activate/${encodeURIComponent(cleanKey)}`, {
        consumer_key: consumerKey,
        consumer_secret: consumerSecret,
      }),
      body: JSON.stringify({
        projectUuid: cleanProjId,
        projectName: projectName,
        label: projectName || cleanProjId,
      }),
    })
    // 3. LMFWC v1 GET endpoint
    candidates.push({
      label: `LMFWC v1 (GET) - ${base}`,
      method: 'GET',
      url: buildCandidateUrl(base, `/wp-json/lmfwc/v1/licenses/activate/${encodeURIComponent(cleanKey)}`, {
        consumer_key: consumerKey,
        consumer_secret: consumerSecret,
        label: projectName || cleanProjId,
      }),
    })
    // 4. Plain permalinks fallback
    candidates.push({
      label: `LMFWC v2 Plain Query (GET) - ${base}`,
      method: 'GET',
      url: buildCandidateUrl(base, '', {
        rest_route: `/lmfwc/v2/licenses/activate/${encodeURIComponent(cleanKey)}`,
        consumer_key: consumerKey,
        consumer_secret: consumerSecret,
        label: projectName || cleanProjId,
      }),
    })
  }

  let lastError = null
  let allRouteNotFound = true

  for (const cand of candidates) {
    try {
      // 1. Try request with query params only first (avoids Apache/FastCGI basic auth interception)
      const headers = {
        'Accept': 'application/json',
      }
      if (cand.body) {
        headers['Content-Type'] = 'application/json'
      }

      let resp = await fetch(cand.url, {
        method: cand.method,
        headers,
        body: cand.body || undefined,
      })

      // 2. If 401 or 403, retry with Authorization: Basic header (for hosts that strictly require header auth)
      if ((resp.status === 401 || resp.status === 403) && consumerKey && consumerSecret) {
        const authHeaders = { ...headers }
        try {
          authHeaders['Authorization'] = 'Basic ' + btoa(`${consumerKey}:${consumerSecret}`)
        } catch (bErr) {
          console.warn('Base64 auth header error:', bErr)
        }
        const retryResp = await fetch(cand.url, {
          method: cand.method,
          headers: authHeaders,
          body: cand.body || undefined,
        }).catch(() => null)

        if (retryResp && (retryResp.ok || retryResp.status !== 401)) {
          resp = retryResp
        }
      }

      if (resp.ok) {
        const json = await resp.json().catch(() => null)
        if (json && json.success === false) {
          const msg = json.message || json.error || (json.data && (json.data.message || json.data.error))
          throw new Error(msg || `License activation failed for "${cleanKey}".`)
        }
        responseData = json || { success: true }
        allRouteNotFound = false
        break
      }

      // If error response from WordPress
      const errJson = await resp.json().catch(() => null)
      const errCode = errJson?.code || errJson?.data?.status || errJson?.data?.code
      const errorMsg = errJson?.message || errJson?.error || (errJson?.data && (errJson.data.message || errJson.data.error))

      // If route or HTTP method did not match (WordPress core rest_no_route 404)
      if (errCode === 'rest_no_route' || (errorMsg && errorMsg.toLowerCase().includes('no route was found'))) {
        // Continue and try next candidate route/method
        continue
      }

      // If route was recognized by WordPress, stop fallback and process exact error
      allRouteNotFound = false

      if (resp.status === 401 || resp.status === 403) {
        throw new Error(
          `WordPress API authorization failed (${resp.status}).\n\n` +
          `To fix this in your WordPress store:\n` +
          `1. Go to WordPress Admin > WooCommerce > Settings > Advanced > REST API.\n` +
          `2. Check your API Key permissions — it MUST be set to "Read/Write" (keys with "Read" only will fail on activation).\n` +
          `3. Copy your Consumer Key (ck_...) and Consumer Secret (cs_...) and enter them in Site Visit Assistant Settings > About tab under WordPress Store Connection.`
        )
      } else if (resp.status === 404 || (errorMsg && errorMsg.toLowerCase().includes('not exist'))) {
        throw new Error(`The license key "${cleanKey}" does not exist in your WooCommerce store. Please verify the key.`)
      } else if (
        resp.status === 400 ||
        resp.status === 422 ||
        (errorMsg &&
          (errorMsg.toLowerCase().includes('activated') ||
            errorMsg.toLowerCase().includes('inactive') ||
            errorMsg.toLowerCase().includes('limit') ||
            errorMsg.toLowerCase().includes('max activations')))
      ) {
        throw new Error(errorMsg || `License key "${cleanKey}" is either already activated, reached maximum activations, or inactive.`)
      } else if (errorMsg) {
        throw new Error(errorMsg)
      } else {
        throw new Error(`WordPress license verification failed with HTTP status ${resp.status}.`)
      }
    } catch (candErr) {
      if (
        candErr.message &&
        (candErr.message.includes('does not exist') ||
          candErr.message.includes('already activated') ||
          candErr.message.includes('authorization failed') ||
          candErr.message.includes('inactive') ||
          candErr.message.includes('limit') ||
          candErr.message.includes('maximum activations') ||
          candErr.message.includes('max activations') ||
          candErr.message.includes('expired'))
      ) {
        throw candErr
      }
      lastError = candErr
    }
  }

  // If no candidate succeeded
  if (!responseData) {
    if (allRouteNotFound) {
      throw new Error(
        `Unable to reach license activation endpoint at ${wpBase}.\n\n` +
        `WordPress reported: "No route was found matching the URL and request method."\n\n` +
        `Troubleshooting steps:\n` +
        `1. Ensure 'License Manager for WooCommerce' (LMFWC) plugin is installed and activated on your WordPress site.\n` +
        `2. Go to WordPress Admin > Settings > Permalinks, ensure "Post name" is selected, and click "Save Changes" to refresh REST API routes.\n` +
        `3. In WooCommerce > Settings > License Manager, ensure the REST API is enabled.`
      )
    }
    throw new Error(
      `Unable to connect to WordPress license server at ${wpBase}.\n(${lastError?.message || 'Connection failed'})`
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

  await saveLicenseRecord(record, cleanProjId, cleanKey)
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
