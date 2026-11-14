const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const TEMP_DIR = path.join(__dirname, '..', 'uploads', 'temp');

/**
 * Ensure temporary uploads directory exists
 */
function ensureTempDir() {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
  return TEMP_DIR;
}

/**
 * Shared Python Executable Resolver (Task 2)
 * Priority order:
 *  1. process.env.PYTHON_BIN (if explicitly configured)
 *  2. Active Virtual Environment interpreter (VIRTUAL_ENV)
 *  3. Project-local .venv/venv interpreter
 *  4. Platform default: 'python' on Windows dev, 'python3' on Linux production
 */
function getPythonExecutable() {
  if (process.env.PYTHON_BIN && process.env.PYTHON_BIN.trim()) {
    return process.env.PYTHON_BIN.trim();
  }
  if (process.env.VIRTUAL_ENV) {
    const venvBin = process.platform === 'win32'
      ? path.join(process.env.VIRTUAL_ENV, 'Scripts', 'python.exe')
      : path.join(process.env.VIRTUAL_ENV, 'bin', 'python3');
    if (fs.existsSync(venvBin)) {
      return venvBin;
    }
  }
  const backendDir = path.resolve(__dirname, '..');
  const venvInterpreter = process.platform === 'win32' ? 'Scripts\\python.exe' : 'bin/python3';
  for (const venvName of ['.venv', 'venv']) {
    const localPython = path.join(backendDir, venvName, venvInterpreter);
    if (fs.existsSync(localPython)) {
      return localPython;
    }
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

/**
 * Robust execution of a Python worker child process
 * Handles ENOENT, timeouts, child termination, and missing module errors.
 * Never logs passwords or sensitive document payloads.
 *
 * @param {string} scriptPath - Absolute path to Python script
 * @param {Buffer} [stdinBuffer] - Optional input buffer piped to stdin
 * @param {Object} [options] - Environment variables, timeout, etc.
 * @returns {Promise<Buffer>}
 */
function runPythonWorker(scriptPath, stdinBuffer = null, options = {}) {
  const {
    env = {},
    timeoutMs = 60000,
    maxBuffer = 50 * 1024 * 1024,
    description = 'Python worker'
  } = options;

  return new Promise((resolve, reject) => {
    if (!fs.existsSync(scriptPath)) {
      return reject(new Error(`${description} script not found: ${path.basename(scriptPath)}`));
    }

    const pythonBin = getPythonExecutable();
    const child = spawn(pythonBin, [scriptPath], {
      env: { ...process.env, ...env },
      maxBuffer
    });

    const chunks = [];
    let errStr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGKILL');
      } catch (kErr) {}
      reject(new Error(`${description} timed out after ${Math.round(timeoutMs / 1000)} seconds.`));
    }, timeoutMs);

    child.stdout.on('data', chunk => chunks.push(chunk));
    child.stderr.on('data', chunk => {
      if (errStr.length < 5000) {
        errStr += chunk.toString();
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      if (timedOut) return;
      if (err.code === 'ENOENT') {
        return reject(new Error(`Python executable "${pythonBin}" not found. Please install Python 3 or set PYTHON_BIN in environment variables.`));
      }
      reject(new Error(`${description} execution error: ${err.message}`));
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return;

      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        const stderrTrim = errStr.trim();
        const missingModMatch = /No module named ['"]([^'"]+)['"]/.exec(stderrTrim);
        if (missingModMatch) {
          return reject(new Error(`Required Python module "${missingModMatch[1]}" is not installed on this system. Please check requirements.`));
        }
        reject(new Error(`${description} failed with exit code ${code}: ${stderrTrim || 'Unknown error'}`));
      }
    });

    if (stdinBuffer && Buffer.isBuffer(stdinBuffer)) {
      child.stdin.write(stdinBuffer);
    }
    child.stdin.end();
  });
}

/**
 * Validates that a buffer starts with standard %PDF- magic bytes
 * @param {Buffer} buffer 
 */
function validatePdfBuffer(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error('Invalid file buffer received for PDF processing.');
  }
  if (buffer.length < 5) {
    throw new Error('Corrupted or empty PDF file uploaded.');
  }
  const header = buffer.subarray(0, 5).toString('ascii');
  if (!header.startsWith('%PDF')) {
    throw new Error('Invalid PDF format: file header does not begin with %PDF-.');
  }
  const maxBytes = 25 * 1024 * 1024;
  if (buffer.length > maxBytes) {
    throw new Error('PDF file size exceeds the maximum limit of 25 MB.');
  }
  return true;
}

/**
 * Decrypts a password-protected PDF locally using the secure helper
 * Never logs or persists the password.
 * @param {Buffer} buffer 
 * @param {string} password 
 * @returns {Promise<Buffer>}
 */
function decryptPdfIfEncrypted(buffer, password = '') {
  return new Promise((resolve, reject) => {
    const isEncrypted = buffer.includes('/Encrypt');
    if (!isEncrypted) {
      return resolve(buffer);
    }

    const pyScript = path.join(__dirname, 'pdf_decryptor.py');
    const pythonBin = getPythonExecutable();
    const child = spawn(pythonBin, [pyScript], {
      env: { ...process.env, PDF_UNLOCK_PASSWORD: password || '' }
    });

    const chunks = [];
    let errStr = '';

    child.stdout.on('data', chunk => chunks.push(chunk));
    child.stderr.on('data', chunk => errStr += chunk.toString());

    child.on('error', (err) => {
      if (err.code === 'ENOENT') {
        return reject(new Error(`Python executable "${pythonBin}" not found for PDF decryption. Please install Python 3 or set PYTHON_BIN.`));
      }
      reject(new Error(`PDF decryption helper unavailable: ${err.message}`));
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else if (code === 2) {
        reject(new Error('This PDF is password-protected. Please enter the document password (e.g. first 4 letters of name in CAPITAL + year of birth for Aadhaar, or DOB for PAN).'));
      } else if (code === 3) {
        reject(new Error('Incorrect password entered for this encrypted document. Please verify the password and try again.'));
      } else {
        const stderrTrim = errStr.trim();
        const missingModMatch = /No module named ['"]([^'"]+)['"]/.exec(stderrTrim);
        if (missingModMatch) {
          return reject(new Error(`Required Python module "${missingModMatch[1]}" is not installed on this system for PDF decryption.`));
        }
        reject(new Error(`Decryption failed: ${stderrTrim || 'Unsupported encryption format'}`));
      }
    });

    child.stdin.write(buffer);
    child.stdin.end();
  });
}

/**
 * Generate a cryptographically signed, short-lived download token
 */
function generateDownloadToken(fileName, userId) {
  const secret = process.env.JWT_KEY || 'mbta_secure_tool_key';
  const exp = Date.now() + 30 * 60 * 1000; // 30 minutes
  const payload = `${userId}:${fileName}:${exp}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(`${payload}:${sig}`).toString('base64url');
}

/**
 * Verify a short-lived download token
 */
function verifyDownloadToken(token, requestedFileName) {
  try {
    const secret = process.env.JWT_KEY || 'mbta_secure_tool_key';
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length !== 4) return null;
    const [userId, fileName, expStr, sig] = parts;
    if (fileName !== requestedFileName) return null;
    if (Date.now() > parseInt(expStr, 10)) return null;
    const expectedSig = crypto.createHmac('sha256', secret).update(`${userId}:${fileName}:${expStr}`).digest('hex');
    const actualBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    if (actualBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(actualBuf, expectedBuf)) {
      return null;
    }
    return { userId, fileName };
  } catch {
    return null;
  }
}

/**
 * Verify that a requesting retailer owns the target file
 */
function verifyFileOwnership(fileName, requestingUserId, requestingRole) {
  if (requestingRole === 'admin') return true;
  if (!fileName || !requestingUserId) return false;
  const safeUser = requestingUserId.replace(/[^a-zA-Z0-9_-]/g, '');
  return fileName.includes(`_${safeUser}_`);
}

/**
 * Safely resolves an incoming document (PDF or Image) from base64 data, local upload,
 * or authenticated /api/tools/download/... transfer reference (Task 1).
 * Prevents SSRF by forbidding external HTTP requests to unknown hosts.
 * Validates ownership, HMAC token signature, file size, MIME signature, and destination format.
 *
 * @param {Object} options
 * @param {string|Buffer} options.fileData - Base64 string, data URL, or Buffer
 * @param {string} [options.fileUrl] - Reference URL or local path
 * @param {string} [options.expectedType] - 'pdf' | 'image' | 'any'
 * @param {string} [options.userId] - Requesting retailer ID for ownership check
 * @param {string} [options.role] - Requesting user role (e.g. 'retailer', 'admin')
 * @param {string} [options.password] - Optional password for encrypted PDFs
 * @returns {Promise<{ buffer: Buffer, mimeType: string, extension: string, fileName: string }>}
 */
async function resolveIncomingDocument(options = {}) {
  const {
    fileData,
    fileUrl,
    expectedType = 'any',
    userId = 'retailer',
    role = 'retailer',
    password = ''
  } = options;

  let buffer = null;
  let resolvedFileName = '';

  // 1. Resolve from Buffer if passed directly
  if (Buffer.isBuffer(fileData)) {
    buffer = fileData;
  } else if (fileData && typeof fileData === 'string') {
    // 2. Resolve from base64 data URL or raw base64 string
    if (fileData.startsWith('data:')) {
      const commaIndex = fileData.indexOf(',');
      const base64Data = commaIndex !== -1 ? fileData.slice(commaIndex + 1) : fileData;
      buffer = Buffer.from(base64Data, 'base64');
    } else if (/^[A-Za-z0-9+/=\s]+$/.test(fileData.trim().slice(0, 100))) {
      buffer = Buffer.from(fileData.trim(), 'base64');
    }
  }

  // 3. Resolve from fileUrl if buffer not yet obtained
  if (!buffer && Buffer.isBuffer(fileUrl)) {
    buffer = fileUrl;
  } else if (!buffer && fileUrl && typeof fileUrl === 'string') {
    const rawUrl = fileUrl.trim();

    // 3a. Base64 data URL inside fileUrl parameter
    if (rawUrl.startsWith('data:')) {
      const commaIndex = rawUrl.indexOf(',');
      const base64Data = commaIndex !== -1 ? rawUrl.slice(commaIndex + 1) : rawUrl;
      buffer = Buffer.from(base64Data, 'base64');
    }
    // 3b. Authenticated tool transfer reference: /api/tools/download/:filename(?token=...)
    else if (rawUrl.includes('/api/tools/download/')) {
      let pathname = rawUrl;
      let token = null;

      try {
        const urlObj = new URL(rawUrl, 'http://localhost');
        pathname = urlObj.pathname;
        token = urlObj.searchParams.get('token');
      } catch (uErr) {
        const qIdx = rawUrl.indexOf('?');
        if (qIdx !== -1) {
          pathname = rawUrl.substring(0, qIdx);
          const qStr = rawUrl.substring(qIdx + 1);
          const tMatch = /token=([^&#]+)/.exec(qStr);
          if (tMatch) token = decodeURIComponent(tMatch[1]);
        }
      }

      const match = /\/api\/tools\/download\/([^/?#]+)/.exec(pathname);
      if (!match) {
        throw new Error('Invalid document download reference URL.');
      }

      const safeFileName = path.basename(match[1]);
      resolvedFileName = safeFileName;

      // 1. Verify cryptographic download token if present
      let tokenVerified = false;
      let tokenUserId = null;
      if (token) {
        const verified = verifyDownloadToken(token, safeFileName);
        if (!verified) {
          throw new Error('Download reference token has expired or is invalid. Please re-process the document.');
        }
        tokenVerified = true;
        tokenUserId = verified.userId;
      }

      // 2. Ownership verification: ensure requesting retailer owns this processed file
      if (userId && userId !== 'retailer' && role !== 'admin') {
        if (!verifyFileOwnership(safeFileName, userId, role)) {
          throw new Error("Forbidden: You do not have permission to access another user's document.");
        }
      } else if (!tokenVerified && !verifyFileOwnership(safeFileName, userId, role)) {
        throw new Error("Forbidden: Valid download token or ownership required to access this document.");
      }

      const tempFilePath = path.join(TEMP_DIR, safeFileName);
      if (!fs.existsSync(tempFilePath)) {
        throw new Error('Referenced document has expired or was removed from temporary storage. Please re-upload.');
      }

      buffer = fs.readFileSync(tempFilePath);
    }
    // 3c. Local static uploads: /uploads/...
    else if (rawUrl.startsWith('/uploads/') || rawUrl.startsWith('uploads/')) {
      const relativePath = rawUrl.startsWith('/') ? rawUrl.slice(1) : rawUrl;
      const safePath = path.normalize(path.join(__dirname, '..', relativePath));
      const uploadsRoot = path.normalize(path.join(__dirname, '..', 'uploads'));
      if (!safePath.startsWith(uploadsRoot) || !fs.existsSync(safePath)) {
        throw new Error('Referenced upload file not found.');
      }
      buffer = fs.readFileSync(safePath);
      resolvedFileName = path.basename(safePath);
    }
    // 3d. Disallow arbitrary external HTTP URLs to prevent SSRF
    else if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
      if (rawUrl.includes('/api/tools/download/')) {
        const relUrl = rawUrl.slice(rawUrl.indexOf('/api/tools/download/'));
        return resolveIncomingDocument({ ...options, fileUrl: relUrl });
      }
      throw new Error('External URL fetching is restricted for security. Please upload the file directly or use an authorized tool transfer reference.');
    }
    // 3e. Local file path on disk (worker internal use)
    else if (fs.existsSync(rawUrl)) {
      const safePath = path.normalize(rawUrl);
      if (safePath.startsWith(TEMP_DIR)) {
        resolvedFileName = path.basename(safePath);
        if (userId && !verifyFileOwnership(resolvedFileName, userId, role)) {
          throw new Error("Forbidden: You do not have permission to access another user's document.");
        }
      }
      buffer = fs.readFileSync(safePath);
    }
  }

  if (!buffer || buffer.length === 0) {
    throw new Error('No valid document file data or accessible reference provided. Please upload a file.');
  }

  // 4. File size check (25MB limit)
  const maxBytes = 25 * 1024 * 1024;
  if (buffer.length > maxBytes) {
    throw new Error(`File size (${(buffer.length / (1024 * 1024)).toFixed(1)} MB) exceeds the maximum allowed limit of 25 MB.`);
  }

  // 5. Binary magic byte inspection
  const isPdf = buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii').startsWith('%PDF-');
  const isPng = buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
  const isJpeg = buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
  const isWebp = buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  const isBmp = buffer.length >= 2 && buffer[0] === 0x42 && buffer[1] === 0x4D;
  const isImage = isPng || isJpeg || isWebp || isBmp;

  // 6. Destination format compatibility checks
  if (expectedType === 'pdf') {
    if (isImage) {
      throw new Error('Incompatible file format: A PDF document (.pdf) is required for this tool, but an image file was provided.');
    }
    if (!isPdf) {
      throw new Error('Invalid PDF format: file header does not begin with %PDF-.');
    }
    buffer = await decryptPdfIfEncrypted(buffer, password);
  } else if (expectedType === 'image') {
    if (isPdf) {
      throw new Error('Incompatible file format: An image file (.png, .jpg) is required for this tool, but a PDF document was provided. Please choose a PDF-compatible tool (such as PDF to HTML Converter).');
    }
    if (!isImage) {
      throw new Error('Invalid file format: Uploaded file is corrupted or not a supported image format (.png, .jpg, .webp).');
    }
  }

  let mimeType = 'application/octet-stream';
  let extension = 'bin';
  if (isPdf) {
    mimeType = 'application/pdf';
    extension = 'pdf';
  } else if (isPng) {
    mimeType = 'image/png';
    extension = 'png';
  } else if (isJpeg) {
    mimeType = 'image/jpeg';
    extension = 'jpg';
  } else if (isWebp) {
    mimeType = 'image/webp';
    extension = 'webp';
  } else if (isBmp) {
    mimeType = 'image/bmp';
    extension = 'bmp';
  }

  return {
    buffer,
    mimeType,
    extension,
    fileName: resolvedFileName || `document.${extension}`
  };
}

/**
 * Backward-compatible parseIncomingPdf delegating to resolveIncomingDocument
 */
async function parseIncomingPdf(fileData, fileUrl, password = '', context = {}) {
  const result = await resolveIncomingDocument({
    fileData,
    fileUrl,
    expectedType: 'pdf',
    password,
    userId: context.userId || 'retailer',
    role: context.role || 'retailer'
  });
  return result.buffer;
}

/**
 * Backward-compatible parseIncomingImage delegating to resolveIncomingDocument
 */
async function parseIncomingImage(fileData, fileUrl, context = {}) {
  const result = await resolveIncomingDocument({
    fileData,
    fileUrl,
    expectedType: 'image',
    userId: context.userId || 'retailer',
    role: context.role || 'retailer'
  });
  return result.buffer;
}

/**
 * Safely saves output buffer into temporary directory with ownership tracking
 */
function saveTempOutput(dataBuffer, extension = 'pdf', prefix = 'processed', userId = 'retailer') {
  ensureTempDir();
  autoPurgeOldTempFiles();

  const rand = crypto.randomBytes(8).toString('hex');
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeUser = (userId || 'user').replace(/[^a-zA-Z0-9_-]/g, '');
  const fileName = `${safePrefix}_${safeUser}_${Date.now()}_${rand}.${extension}`;
  const filePath = path.join(TEMP_DIR, fileName);

  fs.writeFileSync(filePath, Buffer.from(dataBuffer));

  const downloadToken = generateDownloadToken(fileName, userId);

  return {
    filePath,
    fileName,
    fileUrl: `/api/tools/download/${fileName}?token=${downloadToken}`,
    relativeUrl: `/api/tools/download/${fileName}`,
    downloadToken
  };
}

/**
 * Clean up specific temporary files safely
 */
function cleanupTempFiles(paths = []) {
  for (const p of paths) {
    if (!p) continue;
    try {
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
      }
    } catch (e) {
      // Non-fatal, suppress cleanup error
    }
  }
}

/**
 * Purge temporary files older than maxAgeMs (default 30 min)
 */
function autoPurgeOldTempFiles(maxAgeMs = 30 * 60 * 1000) {
  try {
    if (!fs.existsSync(TEMP_DIR)) return;
    const now = Date.now();
    const files = fs.readdirSync(TEMP_DIR);
    for (const f of files) {
      if (f === '.gitkeep') continue;
      const fp = path.join(TEMP_DIR, f);
      try {
        const stats = fs.statSync(fp);
        if (now - stats.mtimeMs > maxAgeMs) {
          fs.unlinkSync(fp);
        }
      } catch (err) {
        // Continue cleaning other files
      }
    }
  } catch (err) {
    // Non-fatal
  }
}

/**
 * Convert millimeters to PDF points (1 inch = 25.4 mm = 72 pt)
 */
function mmToPoints(mm) {
  return (parseFloat(mm) * 72) / 25.4;
}

/**
 * Convert PDF points to millimeters
 */
function pointsToMm(points) {
  return (parseFloat(points) * 25.4) / 72;
}

// Standard ISO/IEC 7810 ID-1 (CR-80) Card Dimensions: 85.60 mm x 53.98 mm
const CR80_WIDTH_PT = mmToPoints(85.60); // ~242.65 pt
const CR80_HEIGHT_PT = mmToPoints(53.98); // ~153.01 pt

// Standard A4 dimensions: 210 mm x 297 mm
const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;

/**
 * Resolves and validates target output dimensions, DPI and layout parameters
 * based on user settings and selected presets.
 */
function resolveOutputDimensions(settings = {}, preset = '') {
  let widthMm = parseFloat(settings.widthMm || settings.width_mm);
  let heightMm = parseFloat(settings.heightMm || settings.height_mm);
  let dpi = parseInt(settings.dpi || settings.resolution, 10);
  const layoutMode = (settings.layoutMode || settings.layout || '').toLowerCase();
  const format = (settings.format || 'pdf').toLowerCase();
  const targetSizeKb = parseInt(settings.targetSizeKb || settings.maxKb, 10) || null;

  const presetKey = (preset || '').toLowerCase();
  const isA4Grid = presetKey.includes('a4_multi_4') || layoutMode.includes('a4_multi_4') || layoutMode.includes('a4_grid_4') || presetKey.includes('4-card');

  if (isA4Grid) {
    if (!widthMm || !heightMm) {
      widthMm = 85.6;
      heightMm = 54.0;
    }
  } else if (presetKey.includes('passport')) {
    if (!widthMm) widthMm = 35.0;
    if (!heightMm) heightMm = 45.0;
  } else if (presetKey.includes('pan_card_photo') || presetKey.includes('pan photo')) {
    if (!widthMm) widthMm = 25.0;
    if (!heightMm) heightMm = 35.0;
  } else if (!widthMm || !heightMm) {
    widthMm = 85.60;
    heightMm = 54.00;
  }

  // Validate and clamp values
  widthMm = Math.max(10, Math.min(widthMm, 500));
  heightMm = Math.max(10, Math.min(heightMm, 500));
  dpi = Math.max(72, Math.min(dpi || 300, 1200));

  const widthPt = mmToPoints(widthMm);
  const heightPt = mmToPoints(heightMm);
  const widthPx = Math.round((widthMm / 25.4) * dpi);
  const heightPx = Math.round((heightMm / 25.4) * dpi);

  return {
    widthMm,
    heightMm,
    widthPt,
    heightPt,
    dpi,
    widthPx,
    heightPx,
    layoutMode: isA4Grid ? 'a4_grid_4' : (layoutMode || 'standard'),
    format,
    targetSizeKb,
    isA4Grid
  };
}

/**
 * Generates an A4 4-Card Grid page (2x2 grid) with cut alignment guides
 */
async function generateA4CardGridLayout(destDoc, embeddedFront, embeddedBack, cardWidthPt = CR80_WIDTH_PT, cardHeightPt = CR80_HEIGHT_PT) {
  const { rgb } = require('pdf-lib');
  const a4Page = destDoc.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);

  // Center 2 columns x 2 rows
  const marginX = (A4_WIDTH_PT - (cardWidthPt * 2 + 30)) / 2;
  const marginY = (A4_HEIGHT_PT - (cardHeightPt * 2 + 50)) / 2;

  const col1X = Math.max(20, marginX);
  const col2X = col1X + cardWidthPt + 30;

  const row1Y = Math.max(30, marginY + cardHeightPt + 50);
  const row2Y = Math.max(30, marginY);

  const grayColor = rgb(0.65, 0.65, 0.65);

  // Position 1: Front (Top Left)
  a4Page.drawPage(embeddedFront, { x: col1X, y: row1Y, width: cardWidthPt, height: cardHeightPt });
  // Position 2: Back (Top Right)
  if (embeddedBack) {
    a4Page.drawPage(embeddedBack, { x: col2X, y: row1Y, width: cardWidthPt, height: cardHeightPt });
  } else {
    a4Page.drawPage(embeddedFront, { x: col2X, y: row1Y, width: cardWidthPt, height: cardHeightPt });
  }

  // Position 3: Front duplicate (Bottom Left)
  a4Page.drawPage(embeddedFront, { x: col1X, y: row2Y, width: cardWidthPt, height: cardHeightPt });
  // Position 4: Back duplicate (Bottom Right)
  if (embeddedBack) {
    a4Page.drawPage(embeddedBack, { x: col2X, y: row2Y, width: cardWidthPt, height: cardHeightPt });
  } else {
    a4Page.drawPage(embeddedFront, { x: col2X, y: row2Y, width: cardWidthPt, height: cardHeightPt });
  }

  // Draw alignment cut guides around cards
  const drawGuide = (x, y, w, h) => {
    const markLen = 8;
    // Top-left
    a4Page.drawLine({ start: { x: x - 4, y: y + h }, end: { x: x - 4 - markLen, y: y + h }, color: grayColor, thickness: 0.5 });
    a4Page.drawLine({ start: { x: x, y: y + h + 4 }, end: { x: x, y: y + h + 4 + markLen }, color: grayColor, thickness: 0.5 });
    // Top-right
    a4Page.drawLine({ start: { x: x + w + 4, y: y + h }, end: { x: x + w + 4 + markLen, y: y + h }, color: grayColor, thickness: 0.5 });
    a4Page.drawLine({ start: { x: x + w, y: y + h + 4 }, end: { x: x + w, y: y + h + 4 + markLen }, color: grayColor, thickness: 0.5 });
    // Bottom-left
    a4Page.drawLine({ start: { x: x - 4, y: y }, end: { x: x - 4 - markLen, y: y }, color: grayColor, thickness: 0.5 });
    a4Page.drawLine({ start: { x: x, y: y - 4 }, end: { x: x, y: y - 4 - markLen }, color: grayColor, thickness: 0.5 });
    // Bottom-right
    a4Page.drawLine({ start: { x: x + w + 4, y: y }, end: { x: x + w + 4 + markLen, y: y }, color: grayColor, thickness: 0.5 });
    a4Page.drawLine({ start: { x: x + w, y: y - 4 }, end: { x: x + w, y: y - 4 - markLen }, color: grayColor, thickness: 0.5 });
  };

  drawGuide(col1X, row1Y, cardWidthPt, cardHeightPt);
  drawGuide(col2X, row1Y, cardWidthPt, cardHeightPt);
  drawGuide(col1X, row2Y, cardWidthPt, cardHeightPt);
  drawGuide(col2X, row2Y, cardWidthPt, cardHeightPt);

  return a4Page;
}

/**
 * Detect or resolve calibrated standard ID card crop boxes.
 * ISO/IEC 7810 ID-1 standard: 85.6 mm x 54.0 mm.
 * Eliminates scissor cut lines, top letter text, and bottom banner bleed.
 *
 * @param {Buffer} pdfBuffer
 * @param {string} cardType - 'aadhaar' | 'pan' | 'voter' | 'pmjay' | 'ration'
 * @param {number} [srcWidth]
 * @param {number} [srcHeight]
 * @returns {Promise<{ frontBox: Object, backBox: Object, mode: string }>}
 */
async function detectCardPdfBoxes(pdfBuffer, cardType = 'aadhaar', srcWidth = A4_WIDTH_PT, srcHeight = A4_HEIGHT_PT) {
  const scaleX = srcWidth / A4_WIDTH_PT;
  const scaleY = srcHeight / A4_HEIGHT_PT;
  const cardW = 243.0 * scaleX;
  const cardH = 153.5 * scaleY;

  // Calibrated official standard default coordinates
  const getStandardBoxes = () => {
    let topY = 235.0 * scaleY;
    let botFrontY = 71.0 * scaleY;
    let botBackY = 60.0 * scaleY;
    let leftFront = 36.0 * scaleX;
    let rightFront = 288.0 * scaleX;
    let leftBack = 298.0 * scaleX;
    let rightBack = 550.0 * scaleX;

    if (cardType === 'pan') {
      topY = 200.0 * scaleY;
      botFrontY = 29.5 * scaleY;
      botBackY = 29.5 * scaleY;
      leftFront = 32.0 * scaleX;
      rightFront = 282.0 * scaleX;
      leftBack = 292.0 * scaleX;
      rightBack = 560.0 * scaleX;
    } else if (cardType === 'voter' || cardType === 'epic') {
      topY = 748.5 * scaleY;
      botFrontY = 591.5 * scaleY;
      botBackY = 591.5 * scaleY;
      leftFront = 31.0 * scaleX;
      rightFront = 280.0 * scaleX;
      leftBack = 325.5 * scaleX;
      rightBack = 574.0 * scaleX;
    } else if (cardType === 'pmjay' || cardType === 'ayushman') {
      topY = 225.0 * scaleY;
      botFrontY = 55.0 * scaleY;
      botBackY = 55.0 * scaleY;
      leftFront = 38.0 * scaleX;
      rightFront = 292.0 * scaleX;
      leftBack = 298.0 * scaleX;
      rightBack = 552.0 * scaleX;
    }

    return {
      frontBox: {
        left: Math.round(leftFront * 100) / 100,
        bottom: Math.round(botFrontY * 100) / 100,
        right: Math.round(rightFront * 100) / 100,
        top: Math.round(topY * 100) / 100
      },
      backBox: {
        left: Math.round(leftBack * 100) / 100,
        bottom: Math.round(botBackY * 100) / 100,
        right: Math.round(rightBack * 100) / 100,
        top: Math.round(topY * 100) / 100
      },
      mode: 'calibrated_standard'
    };
  };

  // Attempt smart PyMuPDF detection
  const DETECTOR_SCRIPT = path.join(__dirname, 'local_card_detector.py');
  if (pdfBuffer && Buffer.isBuffer(pdfBuffer) && fs.existsSync(DETECTOR_SCRIPT)) {
    try {
      const outBuf = await runPythonWorker(DETECTOR_SCRIPT, pdfBuffer, {
        env: { CARD_TYPE: cardType },
        timeoutMs: 8000,
        description: 'Card box detector'
      });
      if (outBuf && outBuf.length > 0) {
        const parsed = JSON.parse(outBuf.toString('utf8'));
        if (parsed.frontBox && parsed.backBox) {
          return parsed;
        }
      }
    } catch (err) {
      // Fallback silently to calibrated baseline
    }
  }

  return getStandardBoxes();
}

module.exports = {
  detectCardPdfBoxes,
  ensureTempDir,
  validatePdfBuffer,
  decryptPdfIfEncrypted,
  getPythonExecutable,
  runPythonWorker,
  resolveIncomingDocument,
  resolveOutputDimensions,
  generateA4CardGridLayout,
  parseIncomingPdf,
  parseIncomingImage,
  generateDownloadToken,
  verifyDownloadToken,
  saveTempOutput,
  verifyFileOwnership,
  cleanupTempFiles,
  autoPurgeOldTempFiles,
  mmToPoints,
  pointsToMm,
  CR80_WIDTH_PT,
  CR80_HEIGHT_PT,
  A4_WIDTH_PT,
  A4_HEIGHT_PT,
  TEMP_DIR
};
