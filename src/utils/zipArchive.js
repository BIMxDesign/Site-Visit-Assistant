import JSZip from 'jszip'

/**
 * Converts a Data URL (base64) string into a binary Blob.
 */
export function dataUrlToBlob(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null
  try {
    const parts = dataUrl.split(',')
    if (parts.length < 2) return null
    const mimeMatch = parts[0].match(/:(.*?);/)
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg'
    const bstr = atob(parts[1])
    let n = bstr.length
    const u8arr = new Uint8Array(n)
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n)
    }
    return new Blob([u8arr], { type: mime })
  } catch (err) {
    console.warn('Failed converting data URL to blob:', err)
    return null
  }
}

/**
 * Converts a Blob or ArrayBuffer to a Base64 data URL.
 */
export function blobToDataUrl(blob, mimeType = 'image/jpeg') {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob instanceof Blob ? blob : new Blob([blob], { type: mimeType }))
  })
}

/**
 * Determines file extension based on MIME type or dataUrl header.
 */
export function getExtensionFromMime(dataUrl) {
  if (!dataUrl) return 'jpg'
  if (dataUrl.startsWith('data:image/png')) return 'png'
  if (dataUrl.startsWith('data:image/webp')) return 'webp'
  if (dataUrl.startsWith('data:image/svg')) return 'svg'
  return 'jpg'
}

/**
 * Creates a structured ZIP archive for a full project:
 * - project.json (clean metadata with references to photos/drawings)
 * - photos/photo_<uuid>.jpg (individual binary image files)
 * - drawings/drawing_<uuid>.png (individual drawing blueprint files)
 */
export async function createProjectZipPackage(projectData) {
  const zip = new JSZip()
  const { project, phases = [], floorPlans = [], items = [], photos = [], licenses = [] } = projectData

  const photosFolder = zip.folder('photos')
  const drawingsFolder = zip.folder('drawings')

  // 1. Process and extract photos into binary files in the photos/ folder
  const cleanPhotos = []
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i]
    const ext = getExtensionFromMime(p.imageData || p.dataUrl)
    const filename = `photos/photo_${p.uuid || i + 1}.${ext}`
    const rawImage = p.imageData || p.dataUrl

    if (rawImage && rawImage.startsWith('data:')) {
      const blob = dataUrlToBlob(rawImage)
      if (blob) {
        photosFolder.file(`photo_${p.uuid || i + 1}.${ext}`, blob)
      }
    }

    // Keep metadata clean without megabytes of base64
    cleanPhotos.push({
      ...p,
      filename,
      imageData: undefined, // Stripped from JSON
      dataUrl: undefined,
    })
  }

  // 2. Process and extract drawings into binary files in the drawings/ folder
  const cleanFloorPlans = []
  for (let i = 0; i < floorPlans.length; i++) {
    const fp = floorPlans[i]
    const ext = getExtensionFromMime(fp.imageData)
    const filename = `drawings/drawing_${fp.uuid || i + 1}.${ext}`
    const rawImage = fp.imageData

    if (rawImage && rawImage.startsWith('data:')) {
      const blob = dataUrlToBlob(rawImage)
      if (blob) {
        drawingsFolder.file(`drawing_${fp.uuid || i + 1}.${ext}`, blob)
      }
    }

    cleanFloorPlans.push({
      ...fp,
      filename,
      imageData: undefined, // Stripped from JSON
    })
  }

  // 3. Assemble clean metadata JSON
  const metadata = {
    app: 'Site Visit Assistant',
    formatVersion: '2.0.0', // 2.0 indicates separated folder & zip structure
    type: 'project_package',
    exportedAt: Date.now(),
    project,
    phases,
    floorPlans: cleanFloorPlans,
    items,
    photos: cleanPhotos,
    licenses,
  }

  zip.file('project.json', JSON.stringify(metadata, null, 2))

  // 4. Generate the ZIP blob
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  const sanitized = (project?.name || 'project').replace(/[^a-z0-9_-]/gi, '_')
  const filename = `${sanitized}-backup-${new Date().toISOString().slice(0, 10)}.zip`

  return { blob, filename, metadata }
}

/**
 * Creates a structured ZIP archive for an individual site visit report:
 * - report.json
 * - photos/
 * - drawings/
 */
export async function createReportZipPackage(reportData) {
  const zip = new JSZip()
  const { project, phase, floorPlans = [], items = [], photos = [], license = null } = reportData

  const photosFolder = zip.folder('photos')
  const drawingsFolder = zip.folder('drawings')

  // Extract photos
  const cleanPhotos = []
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i]
    const ext = getExtensionFromMime(p.imageData || p.dataUrl)
    const filename = `photos/photo_${p.uuid || i + 1}.${ext}`
    const rawImage = p.imageData || p.dataUrl

    if (rawImage && rawImage.startsWith('data:')) {
      const blob = dataUrlToBlob(rawImage)
      if (blob) {
        photosFolder.file(`photo_${p.uuid || i + 1}.${ext}`, blob)
      }
    }

    cleanPhotos.push({
      ...p,
      filename,
      imageData: undefined,
      dataUrl: undefined,
    })
  }

  // Extract drawings
  const cleanFloorPlans = []
  for (let i = 0; i < floorPlans.length; i++) {
    const fp = floorPlans[i]
    const ext = getExtensionFromMime(fp.imageData)
    const filename = `drawings/drawing_${fp.uuid || i + 1}.${ext}`
    const rawImage = fp.imageData

    if (rawImage && rawImage.startsWith('data:')) {
      const blob = dataUrlToBlob(rawImage)
      if (blob) {
        drawingsFolder.file(`drawing_${fp.uuid || i + 1}.${ext}`, blob)
      }
    }

    cleanFloorPlans.push({
      ...fp,
      filename,
      imageData: undefined,
    })
  }

  const metadata = {
    app: 'Site Visit Assistant',
    formatVersion: '2.0.0',
    type: 'individual_report',
    exportedAt: Date.now(),
    project,
    phase,
    floorPlans: cleanFloorPlans,
    items,
    photos: cleanPhotos,
    license,
  }

  zip.file('report.json', JSON.stringify(metadata, null, 2))

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  const sanitized = (phase?.name || 'site_visit').replace(/[^a-z0-9_-]/gi, '_')
  const filename = `${sanitized}-visit-${new Date().toISOString().slice(0, 10)}.zip`

  return { blob, filename, metadata }
}

/**
 * Creates a structured ZIP archive containing ALL projects in the application,
 * organized into subfolders per project:
 * - Projects/
 *   - The Chelsea Lofts/
 *     - project.json
 *     - photos/
 *     - drawings/
 */
export async function createAllProjectsZipPackage(allProjectPackages) {
  const zip = new JSZip()

  for (const pData of allProjectPackages) {
    const { project, phases = [], floorPlans = [], items = [], photos = [], licenses = [] } = pData
    const sanitizedProj = (project?.name || `Project_${project?.uuid || 'unknown'}`).replace(/[^a-z0-9_-]/gi, '_')
    const projFolder = zip.folder(`Projects/${sanitizedProj}`)
    const photosFolder = projFolder.folder('photos')
    const drawingsFolder = projFolder.folder('drawings')

    const cleanPhotos = []
    for (let i = 0; i < photos.length; i++) {
      const p = photos[i]
      const ext = getExtensionFromMime(p.imageData || p.dataUrl)
      const filename = `photos/photo_${p.uuid || i + 1}.${ext}`
      const rawImage = p.imageData || p.dataUrl
      if (rawImage && rawImage.startsWith('data:')) {
        const blob = dataUrlToBlob(rawImage)
        if (blob) photosFolder.file(`photo_${p.uuid || i + 1}.${ext}`, blob)
      }
      cleanPhotos.push({
        ...p,
        filename,
        imageData: undefined,
        dataUrl: undefined,
      })
    }

    const cleanFloorPlans = []
    for (let i = 0; i < floorPlans.length; i++) {
      const fp = floorPlans[i]
      const ext = getExtensionFromMime(fp.imageData)
      const filename = `drawings/drawing_${fp.uuid || i + 1}.${ext}`
      const rawImage = fp.imageData
      if (rawImage && rawImage.startsWith('data:')) {
        const blob = dataUrlToBlob(rawImage)
        if (blob) drawingsFolder.file(`drawing_${fp.uuid || i + 1}.${ext}`, blob)
      }
      cleanFloorPlans.push({
        ...fp,
        filename,
        imageData: undefined,
      })
    }

    const metadata = {
      app: 'Site Visit Assistant',
      formatVersion: '2.0.0',
      type: 'project_package',
      exportedAt: Date.now(),
      project,
      phases,
      floorPlans: cleanFloorPlans,
      items,
      photos: cleanPhotos,
      licenses,
    }

    projFolder.file('project.json', JSON.stringify(metadata, null, 2))
  }

  // Top-level manifest
  zip.file('manifest.json', JSON.stringify({
    app: 'Site Visit Assistant',
    formatVersion: '2.0.0',
    type: 'all_projects_archive',
    exportedAt: new Date().toISOString(),
    totalProjects: allProjectPackages.length,
    projectNames: allProjectPackages.map(p => p.project?.name || 'Unnamed'),
  }, null, 2))

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  const filename = `site-visit-assistant-ALL-PROJECTS-backup-${new Date().toISOString().slice(0, 10)}.zip`
  return { blob, filename, count: allProjectPackages.length }
}

/**
 * Checks whether a given File or Blob is a ZIP archive.
 */
export async function isZipFile(fileOrBlob) {
  if (!fileOrBlob) return false
  if (fileOrBlob.name && (fileOrBlob.name.endsWith('.zip') || fileOrBlob.name.endsWith('.sitevisit') || fileOrBlob.name.endsWith('.punch'))) {
    return true
  }
  // Check magic bytes PK\x03\x04
  try {
    const slice = fileOrBlob.slice(0, 4)
    const buffer = await slice.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
  } catch {
    return false
  }
}

/**
 * Extracts and reassembles a ZIP backup package into database-ready objects:
 * Restores binary image files back into the dataUrl/imageData fields so the
 * Dexie database and UI consume them seamlessly.
 */
export async function extractZipBackup(fileOrBlob) {
  const zip = await JSZip.loadAsync(fileOrBlob)

  // 1. Check for All-Projects Archive (manifest.json)
  const manifestFile = zip.file('manifest.json')
  if (manifestFile) {
    const manifestText = await manifestFile.async('text')
    const manifest = JSON.parse(manifestText)
    const projects = []

    // Find all project.json files across subfolders
    const projectFiles = zip.file(/Projects\/[^/]+\/project\.json$/)
    for (const pFile of projectFiles) {
      const folderPath = pFile.name.replace(/project\.json$/, '')
      const pText = await pFile.async('text')
      const pData = JSON.parse(pText)

      // Re-hydrate photos
      if (Array.isArray(pData.photos)) {
        for (const ph of pData.photos) {
          if (ph.filename) {
            const rawFile = zip.file(`${folderPath}${ph.filename}`) || zip.file(ph.filename)
            if (rawFile) {
              const ext = ph.filename.split('.').pop()
              const mime = ext === 'png' ? 'image/png' : 'image/jpeg'
              const buffer = await rawFile.async('arraybuffer')
              ph.imageData = await blobToDataUrl(buffer, mime)
            }
          }
        }
      }

      // Re-hydrate drawings
      if (Array.isArray(pData.floorPlans)) {
        for (const fp of pData.floorPlans) {
          if (fp.filename) {
            const rawFile = zip.file(`${folderPath}${fp.filename}`) || zip.file(fp.filename)
            if (rawFile) {
              const ext = fp.filename.split('.').pop()
              const mime = ext === 'png' ? 'image/png' : 'image/jpeg'
              const buffer = await rawFile.async('arraybuffer')
              fp.imageData = await blobToDataUrl(buffer, mime)
            }
          }
        }
      }

      projects.push(pData)
    }

    return {
      type: 'all_projects_archive',
      manifest,
      projects,
    }
  }

  // 2. Check for Single Project Package (project.json)
  const projectFile = zip.file('project.json') || zip.file(/project\.json$/)[0]
  if (projectFile) {
    const pText = await projectFile.async('text')
    const pData = JSON.parse(pText)

    if (Array.isArray(pData.photos)) {
      for (const ph of pData.photos) {
        if (ph.filename) {
          const rawFile = zip.file(ph.filename) || zip.file(`photos/${ph.filename.split('/').pop()}`)
          if (rawFile) {
            const ext = ph.filename.split('.').pop()
            const mime = ext === 'png' ? 'image/png' : 'image/jpeg'
            const buffer = await rawFile.async('arraybuffer')
            ph.imageData = await blobToUrl(buffer, mime)
          }
        }
      }
    }

    if (Array.isArray(pData.floorPlans)) {
      for (const fp of pData.floorPlans) {
        if (fp.filename) {
          const rawFile = zip.file(fp.filename) || zip.file(`drawings/${fp.filename.split('/').pop()}`)
          if (rawFile) {
            const ext = fp.filename.split('.').pop()
            const mime = ext === 'png' ? 'image/png' : 'image/jpeg'
            const buffer = await rawFile.async('arraybuffer')
            fp.imageData = await blobToUrl(buffer, mime)
          }
        }
      }
    }

    return pData
  }

  // 3. Check for Individual Site Visit Report Package (report.json)
  const reportFile = zip.file('report.json') || zip.file(/report\.json$/)[0]
  if (reportFile) {
    const rText = await reportFile.async('text')
    const rData = JSON.parse(rText)

    if (Array.isArray(rData.photos)) {
      for (const ph of rData.photos) {
        if (ph.filename) {
          const rawFile = zip.file(ph.filename) || zip.file(`photos/${ph.filename.split('/').pop()}`)
          if (rawFile) {
            const ext = ph.filename.split('.').pop()
            const mime = ext === 'png' ? 'image/png' : 'image/jpeg'
            const buffer = await rawFile.async('arraybuffer')
            ph.imageData = await blobToUrl(buffer, mime)
          }
        }
      }
    }

    if (Array.isArray(rData.floorPlans)) {
      for (const fp of rData.floorPlans) {
        if (fp.filename) {
          const rawFile = zip.file(fp.filename) || zip.file(`drawings/${fp.filename.split('/').pop()}`)
          if (rawFile) {
            const ext = fp.filename.split('.').pop()
            const mime = ext === 'png' ? 'image/png' : 'image/jpeg'
            const buffer = await rawFile.async('arraybuffer')
            fp.imageData = await blobToUrl(buffer, mime)
          }
        }
      }
    }

    return rData
  }

  throw new Error('Unrecognized archive format: Missing project.json or report.json inside ZIP.')
}

async function blobToUrl(buffer, mime) {
  return await blobToDataUrl(buffer, mime)
}
