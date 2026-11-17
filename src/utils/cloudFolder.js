import { db } from '../db/database'

const DIR_HANDLE_KEY = 'sitepunch_cloud_sync_dir_handle'
const DIR_NAME_KEY = 'sitepunch_cloud_sync_dir_name'

async function getSettingDirect(key) {
  try {
    const row = await db.settings.where('key').equals(key).first()
    return row ? row.value : null
  } catch {
    return null
  }
}

async function setSettingDirect(key, value) {
  try {
    const existing = await db.settings.where('key').equals(key).first()
    if (existing) {
      await db.settings.update(existing.id, { key, value })
    } else {
      await db.settings.add({ key, value })
    }
  } catch (err) {
    console.warn('Could not store setting directly:', err)
  }
}

/**
 * Checks if the File System Access API is supported (Chrome, Edge, Opera, Desktop PWA).
 */
export function isFileSystemAccessSupported() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

export function isSaveFilePickerSupported() {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window
}

/**
 * Verifies or requests readwrite permission on an existing directory handle.
 */
async function verifyPermission(fileHandle, readWrite = true) {
  const options = {}
  if (readWrite) {
    options.mode = 'readwrite'
  }
  try {
    if ((await fileHandle.queryPermission(options)) === 'granted') {
      return true
    }
    if ((await fileHandle.requestPermission(options)) === 'granted') {
      return true
    }
  } catch (err) {
    console.warn('Permission query/request error:', err)
  }
  return false
}

/**
 * Opens native OS folder picker so user can select their OneDrive, Google Drive, or iCloud folder.
 */
export async function selectCloudSyncFolder() {
  if (!isFileSystemAccessSupported()) {
    throw new Error('Your browser does not support direct folder selection. Please use Google Chrome, Microsoft Edge, or a Desktop PWA.')
  }

  try {
    const handle = await window.showDirectoryPicker({
      id: 'site-visit-cloud-sync',
      mode: 'readwrite',
      startIn: 'documents',
    })

    const hasPermission = await verifyPermission(handle, true)
    if (!hasPermission) {
      throw new Error('Permission to write to the selected folder was denied.')
    }

    // Persist handle in IndexedDB
    await setSettingDirect(DIR_HANDLE_KEY, handle)
    await setSettingDirect(DIR_NAME_KEY, handle.name || 'Cloud Folder')

    return {
      handle,
      name: handle.name || 'Cloud Folder',
    }
  } catch (err) {
    if (err.name === 'AbortError') return null
    throw err
  }
}

/**
 * Gets currently connected cloud sync folder handle, if any.
 */
export async function getConnectedCloudFolder() {
  try {
    const handle = await getSettingDirect(DIR_HANDLE_KEY)
    const name = await getSettingDirect(DIR_NAME_KEY)
    if (handle) {
      return { handle, name: name || handle.name || 'Cloud Folder' }
    }
  } catch (err) {
    console.warn('Could not retrieve cloud sync handle:', err)
  }
  return null
}

/**
 * Disconnects the cloud folder.
 */
export async function disconnectCloudFolder() {
  await setSettingDirect(DIR_HANDLE_KEY, null)
  await setSettingDirect(DIR_NAME_KEY, '')
}

/**
 * Saves a backup file directly into the user's connected OneDrive / Google Drive folder.
 * If no folder is connected, opens the native OS "Save As" file dialog so the user can
 * choose their OneDrive / Google Drive folder directly.
 */
export async function saveBackupToCloud(blob, filename) {
  // 1. Try directly writing to connected cloud folder
  const connected = await getConnectedCloudFolder()
  if (connected?.handle) {
    const hasPerm = await verifyPermission(connected.handle, true)
    if (hasPerm) {
      try {
        const fileHandle = await connected.handle.getFileHandle(filename, { create: true })
        const writable = await fileHandle.createWritable()
        await writable.write(blob)
        await writable.close()
        return {
          success: true,
          method: 'direct-folder',
          folderName: connected.name,
          filename,
        }
      } catch (writeErr) {
        console.warn('Direct folder write failed, falling back to file picker:', writeErr)
      }
    }
  }

  // 2. Try native Save As File Picker (user selects OneDrive / Google Drive / any folder directly)
  if (isSaveFilePickerSupported()) {
    try {
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: 'Site Visit Assistant Backup File (.json)',
            accept: {
              'application/json': ['.json'],
            },
          },
        ],
      })
      const writable = await fileHandle.createWritable()
      await writable.write(blob)
      await writable.close()
      return {
        success: true,
        method: 'save-picker',
        filename,
      }
    } catch (pickerErr) {
      if (pickerErr.name === 'AbortError') {
        return { success: false, aborted: true }
      }
      console.warn('Save file picker failed, falling back:', pickerErr)
    }
  }

  // 3. Fallback to standard download
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  return {
    success: true,
    method: 'download',
    filename,
  }
}

/**
 * Lists available backup files in the connected cloud folder.
 */
export async function listBackupsInCloudFolder() {
  const connected = await getConnectedCloudFolder()
  if (!connected?.handle) return []

  const hasPerm = await verifyPermission(connected.handle, false)
  if (!hasPerm) return []

  const backups = []
  try {
    for await (const entry of connected.handle.values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.json')) {
        const file = await entry.getFile()
        backups.push({
          name: entry.name,
          size: file.size,
          lastModified: file.lastModified,
          handle: entry,
        })
      }
    }
  } catch (err) {
    console.warn('Could not list cloud folder files:', err)
  }

  return backups.sort((a, b) => b.lastModified - a.lastModified)
}

// ── Automatic Periodic Cloud Backup Engine ───────────────────────────────────

export const AUTO_BACKUP_FREQ_KEY = 'sitepunch_auto_backup_freq'
export const AUTO_BACKUP_LAST_TIME_KEY = 'sitepunch_auto_backup_last_time'
export const AUTO_BACKUP_LAST_STATUS_KEY = 'sitepunch_auto_backup_last_status'

export const AUTO_BACKUP_FREQUENCIES = {
  off: {
    id: 'off',
    label: 'Off / Manual',
    description: 'Manual backups only',
    intervalMs: 0,
  },
  daily: {
    id: 'daily',
    label: 'Daily',
    description: 'Every 24 hours',
    intervalMs: 24 * 60 * 60 * 1000,
  },
  weekly: {
    id: 'weekly',
    label: 'Weekly',
    description: 'Every 7 days',
    intervalMs: 7 * 24 * 60 * 60 * 1000,
  },
  monthly: {
    id: 'monthly',
    label: 'Monthly',
    description: 'Every 30 days',
    intervalMs: 30 * 24 * 60 * 60 * 1000,
  },
}

/**
 * Gets the current automatic periodic backup configuration and state.
 */
export async function getAutoBackupConfig() {
  const frequency = (await getSettingDirect(AUTO_BACKUP_FREQ_KEY)) || 'off'
  const lastTime = Number(await getSettingDirect(AUTO_BACKUP_LAST_TIME_KEY)) || null
  const lastStatus = (await getSettingDirect(AUTO_BACKUP_LAST_STATUS_KEY)) || null

  const freqConfig = AUTO_BACKUP_FREQUENCIES[frequency] || AUTO_BACKUP_FREQUENCIES.off
  let nextDueTime = null
  let isDue = false

  if (freqConfig.intervalMs > 0) {
    if (!lastTime) {
      isDue = true
      nextDueTime = Date.now()
    } else {
      nextDueTime = lastTime + freqConfig.intervalMs
      isDue = Date.now() >= nextDueTime
    }
  }

  return {
    frequency,
    lastTime,
    lastStatus,
    nextDueTime,
    isDue,
    freqConfig,
  }
}

/**
 * Updates the automatic periodic backup frequency ('off', 'daily', 'weekly', 'monthly').
 */
export async function setAutoBackupFrequency(frequency) {
  const valid = AUTO_BACKUP_FREQUENCIES[frequency] ? frequency : 'off'
  await setSettingDirect(AUTO_BACKUP_FREQ_KEY, valid)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sitepunch-auto-backup-updated', { detail: { frequency: valid } }))
  }
  return valid
}

/**
 * Explicitly prompts the user for folder permission if browser requires it.
 */
export async function requestCloudFolderPermission() {
  const connected = await getConnectedCloudFolder()
  if (!connected?.handle) return false
  return await verifyPermission(connected.handle, true)
}

/**
 * Writes a blob directly to the connected cloud folder without prompting the user.
 */
export async function writeDirectToCloudFolder(blob, filename) {
  const connected = await getConnectedCloudFolder()
  if (!connected?.handle) {
    throw new Error('No cloud folder is connected. Please select your OneDrive or Google Drive folder in Settings.')
  }

  const hasPerm = await verifyPermission(connected.handle, true)
  if (!hasPerm) {
    throw new Error('Permission to write to the connected cloud folder was not granted.')
  }

  const fileHandle = await connected.handle.getFileHandle(filename, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(blob)
  await writable.close()

  return {
    success: true,
    folderName: connected.name,
    filename,
  }
}

/**
 * Executes an automatic periodic backup push to the connected cloud folder.
 */
export async function executePeriodicAutoBackup(getPackageBlobFn) {
  const config = await getAutoBackupConfig()
  const connected = await getConnectedCloudFolder()

  if (!connected?.handle) {
    const status = {
      status: 'no_folder',
      timestamp: Date.now(),
      message: 'No cloud folder connected. Please select your OneDrive or Google Drive folder.',
    }
    await setSettingDirect(AUTO_BACKUP_LAST_STATUS_KEY, status)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sitepunch-auto-backup-updated', { detail: status }))
    }
    return status
  }

  // Check permission
  const hasPerm = await verifyPermission(connected.handle, true)
  if (!hasPerm) {
    const status = {
      status: 'needs_permission',
      timestamp: Date.now(),
      message: `Folder access confirmation needed for "${connected.name}". Click to grant permission.`,
    }
    await setSettingDirect(AUTO_BACKUP_LAST_STATUS_KEY, status)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sitepunch-auto-backup-updated', { detail: status }))
    }
    return status
  }

  try {
    const prefix = `site-visit-assistant-AUTO-backup-${config.frequency}`
    const { blob, filename, count } = await getPackageBlobFn(prefix)

    const writeRes = await writeDirectToCloudFolder(blob, filename)

    const now = Date.now()
    const status = {
      status: 'success',
      timestamp: now,
      filename,
      folderName: writeRes.folderName,
      count,
      message: `Automatically pushed to ${writeRes.folderName}`,
    }

    await setSettingDirect(AUTO_BACKUP_LAST_TIME_KEY, now)
    await setSettingDirect(AUTO_BACKUP_LAST_STATUS_KEY, status)

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sitepunch-auto-backup-updated', { detail: status }))
      console.log(`Site Visit Assistant: Periodic ${config.frequency} cloud backup completed: ${filename}`)
    }

    return status
  } catch (err) {
    console.error('Auto-backup push failed:', err)
    const status = {
      status: 'error',
      timestamp: Date.now(),
      message: err.message || 'Auto-backup write failed',
    }
    await setSettingDirect(AUTO_BACKUP_LAST_STATUS_KEY, status)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sitepunch-auto-backup-updated', { detail: status }))
    }
    return status
  }
}

/**
 * Checks if a scheduled periodic backup is due; if so, executes it silently.
 */
export async function checkAndRunPeriodicBackup(getPackageBlobFn) {
  try {
    const config = await getAutoBackupConfig()
    if (config.frequency === 'off' || !config.isDue) {
      return { ran: false, isDue: config.isDue }
    }

    const connected = await getConnectedCloudFolder()
    if (!connected?.handle) {
      return { ran: false, reason: 'no_folder' }
    }

    const res = await executePeriodicAutoBackup(getPackageBlobFn)
    return { ran: res.status === 'success', result: res }
  } catch (err) {
    console.warn('Periodic backup check error:', err)
    return { ran: false, error: err.message }
  }
}
