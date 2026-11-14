const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const Tool = require('../models/Tool');
const User = require('../models/User');
const WalletTransaction = require('../models/WalletTransaction');
const { verifySessionToken } = require('../utils/sessionToken');
const { getPythonExecutable } = require('../utils/toolHelpers');

// Ensure isolated temp directory for PDF tools processing
const TEMP_DIR = path.join(__dirname, '..', 'uploads', 'pdf_tools_temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, TEMP_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || '';
    const safeBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `upload-${safeBase}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 60 * 1024 * 1024 // 60MB per file
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = ['.pdf', '.docx', '.doc', '.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff'];
    if (allowed.includes(ext) || file.mimetype.includes('pdf') || file.mimetype.includes('image') || file.mimetype.includes('word')) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} is not supported.`));
    }
  }
});

const ENGINE_PATH = path.join(__dirname, '..', 'utils', 'pdfTools', 'pdf_engine.py');

/**
 * Executes a PDF engine operation via python
 */
function runPdfEngine(operation, filePaths, outputPath, options = {}) {
  return new Promise((resolve, reject) => {
    const payload = {
      operation,
      files: filePaths,
      outputPath,
      options
    };

    const payloadFile = path.join(TEMP_DIR, `payload-${Date.now()}-${Math.round(Math.random() * 1e6)}.json`);
    fs.writeFileSync(payloadFile, JSON.stringify(payload, null, 2), 'utf8');

    // Run python with UTF-8 encoding
    const py = spawn(getPythonExecutable(), [ENGINE_PATH, payloadFile], {
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });

    let stdoutData = '';
    let stderrData = '';

    py.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });

    py.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    py.on('close', (code) => {
      // Clean up payload file
      try {
        if (fs.existsSync(payloadFile)) fs.unlinkSync(payloadFile);
      } catch (e) {}

      if (code !== 0) {
        // Try to parse json from stdout if returned error format
        const lines = stdoutData.trim().split('\n');
        for (let i = lines.length - 1; i >= 0; i--) {
          const l = lines[i].trim();
          if (l.startsWith('{') && l.endsWith('}')) {
            try {
              const parsed = JSON.parse(l);
              if (parsed.error) return reject(new Error(parsed.error));
            } catch (err) {}
          }
        }
        return reject(new Error(stderrData || stdoutData || `PDF Engine exited with code ${code}`));
      }

      try {
        const lines = stdoutData.trim().split('\n');
        let parsedResult = null;
        for (let i = lines.length - 1; i >= 0; i--) {
          const l = lines[i].trim();
          if (l.startsWith('{') && l.endsWith('}')) {
            try {
              parsedResult = JSON.parse(l);
              break;
            } catch (err) {}
          }
        }

        if (parsedResult) {
          if (parsedResult.success) {
            resolve(parsedResult);
          } else {
            reject(new Error(parsedResult.error || 'Operation failed in PDF Engine'));
          }
        } else {
          resolve(JSON.parse(stdoutData.trim()));
        }
      } catch (err) {
        reject(new Error(`Failed to parse engine output: ${stdoutData}`));
      }
    });

    py.on('error', (err) => {
      try {
        if (fs.existsSync(payloadFile)) fs.unlinkSync(payloadFile);
      } catch (e) {}
      reject(new Error(`Failed to spawn Python process: ${err.message}`));
    });
  });
}

/**
 * Safely delete an array of file paths
 */
function cleanupFiles(fileList) {
  if (!Array.isArray(fileList)) return;
  fileList.forEach((filePath) => {
    try {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (e) {}
  });
}

// ----------------------------------------------------------------------
// Route: Inspect PDF (Metadata, Page Count, Thumbnails)
// ----------------------------------------------------------------------
router.post('/inspect', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded' });
  }

  const uploadedPath = req.file.path;
  try {
    const result = await runPdfEngine('inspect_pdf', [uploadedPath], '', {});
    cleanupFiles([uploadedPath]);
    return res.json({
      success: true,
      data: result.data
    });
  } catch (err) {
    cleanupFiles([uploadedPath]);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to inspect PDF'
    });
  }
});

// ----------------------------------------------------------------------
// GET Config: Active Sub-Tools Configuration for PDF Tools Suite
// ----------------------------------------------------------------------
router.get('/config', async (req, res) => {
  try {
    const parentTool = await Tool.findOne({
      title: /pdf tools|pdf suite|all in one pdf/i
    });
    return res.json({
      success: true,
      toolId: parentTool?._id,
      subTools: parentTool?.subTools || {}
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------------------------
// Unified Process Route for all 15 operations
// ----------------------------------------------------------------------
router.post('/process', upload.array('files', 50), async (req, res) => {
  const body = req.body || {};
  const uploadedFiles = (req.files || []).map((f) => f.path);
  const operation = body.operation;
  let options = {};

  try {
    if (body.options) {
      options = typeof body.options === 'string' ? JSON.parse(body.options) : body.options;
    }
  } catch (e) {
    cleanupFiles(uploadedFiles);
    return res.status(400).json({ success: false, error: 'Invalid JSON in options' });
  }

  if (!operation) {
    cleanupFiles(uploadedFiles);
    return res.status(400).json({ success: false, error: 'Operation name is required.' });
  }

  if (!uploadedFiles || uploadedFiles.length === 0) {
    return res.status(400).json({ success: false, error: 'Please upload at least one file.' });
  }

  // Check sub-tools configuration & permissions from MongoDB
  let parentTool = null;
  let subToolConfig = null;
  let toolFee = 0;
  let payingUser = null;

  try {
    parentTool = await Tool.findOne({
      title: /pdf tools|pdf suite|all in one pdf/i
    });

    if (parentTool && parentTool.subTools && parentTool.subTools[operation]) {
      subToolConfig = parentTool.subTools[operation];
      if (subToolConfig.isDeleted === true || subToolConfig.isActive === false) {
        cleanupFiles(uploadedFiles);
        return res.status(403).json({
          success: false,
          error: `"${subToolConfig.title || operation}" is currently disabled by administrator.`
        });
      }
      toolFee = parseFloat(subToolConfig.fee || 0);
    }
  } catch (lookupErr) {
    console.error('PDF Tool lookup error:', lookupErr);
  }

  // Pre-check wallet balance if sub-tool has a fee
  if (toolFee > 0) {
    const authHeader = req.get('authorization') || '';
    const match = /^Bearer\s+(.+)$/i.exec(authHeader);
    const session = match && verifySessionToken(match[1]);
    if (session && session.userId) {
      payingUser = await User.findOne({ userId: session.userId });
    }

    if (!payingUser) {
      cleanupFiles(uploadedFiles);
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please log in to your retailer account to use this service.'
      });
    }

    const currentBal = parseFloat(payingUser.walletBalance || 0);
    if (currentBal < toolFee) {
      cleanupFiles(uploadedFiles);
      return res.status(400).json({
        success: false,
        error: `Insufficient wallet balance. Fee ₹${toolFee.toFixed(2)} required. Current balance: ₹${currentBal.toFixed(2)}`
      });
    }
  }

  // Determine output extension and name based on operation
  let outExt = '.pdf';
  let defaultDownloadName = 'processed.pdf';

  switch (operation) {
    case 'pdf_to_images':
      if (options.pages && (!Array.isArray(options.pages) && !options.pages.includes(',')) && parseInt(options.pages)) {
        outExt = options.format === 'png' ? '.png' : '.jpg';
        defaultDownloadName = `page_${options.pages}${outExt}`;
      } else {
        outExt = '.zip';
        defaultDownloadName = 'pdf_images.zip';
      }
      break;
    case 'pdf_to_word':
      outExt = '.docx';
      defaultDownloadName = 'converted_document.docx';
      break;
    case 'pdf_to_excel':
      outExt = '.xlsx';
      defaultDownloadName = 'extracted_data.xlsx';
      break;
    case 'split_pdf':
      if (options.mode === 'all' || options.mode === 'every_n') {
        outExt = '.zip';
        defaultDownloadName = 'split_pages.zip';
      } else {
        outExt = '.pdf';
        defaultDownloadName = 'split_pages.pdf';
      }
      break;
    case 'merge_pdfs':
      defaultDownloadName = 'merged_document.pdf';
      break;
    case 'compress_pdf':
      defaultDownloadName = 'compressed_document.pdf';
      break;
    case 'rotate_pdf':
      defaultDownloadName = 'rotated_document.pdf';
      break;
    case 'reorder_pdf':
      defaultDownloadName = 'reordered_document.pdf';
      break;
    case 'delete_pages':
      defaultDownloadName = 'pages_deleted_document.pdf';
      break;
    case 'add_page_numbers':
      defaultDownloadName = 'numbered_document.pdf';
      break;
    case 'protect_pdf':
      defaultDownloadName = 'protected_document.pdf';
      break;
    case 'unlock_pdf':
      defaultDownloadName = 'unlocked_document.pdf';
      break;
    case 'ocr_searchable_pdf':
      defaultDownloadName = 'searchable_ocr_document.pdf';
      break;
    case 'word_to_pdf':
      defaultDownloadName = 'converted_from_word.pdf';
      break;
    case 'image_to_pdf':
      defaultDownloadName = 'images_combined.pdf';
      break;
    default:
      outExt = '.pdf';
      defaultDownloadName = 'output.pdf';
  }

  const outputFilename = `output-${operation}-${Date.now()}-${Math.round(Math.random() * 1e6)}${outExt}`;
  const outputPath = path.join(TEMP_DIR, outputFilename);

  try {
    const result = await runPdfEngine(operation, uploadedFiles, outputPath, options);

    // If client requested download as stream or file
    const isDownload = req.body.download !== 'false';
    const clientFileName = req.body.outputName || defaultDownloadName;

    // Clean up uploaded source files
    cleanupFiles(uploadedFiles);

    // Deduct fee from wallet if configured
    let newBal = undefined;
    if (toolFee > 0 && payingUser) {
      try {
        const balanceBefore = parseFloat(payingUser.walletBalance || 0);
        const balanceAfter = parseFloat((balanceBefore - toolFee).toFixed(2));
        payingUser.walletBalance = balanceAfter;
        await payingUser.save();
        newBal = balanceAfter;

        const randomDigits = Math.floor(10000 + Math.random() * 90000);
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const refNumber = 'PDF' + dateStr + randomDigits;

        const newTx = new WalletTransaction({
          userId: payingUser.userId,
          transactionType: 'Debit',
          amount: toolFee,
          balanceBefore,
          balanceAfter,
          description: 'PDF Tool Fee - ' + (subToolConfig?.title || operation),
          referenceNumber: refNumber,
          status: 'Success'
        });
        await newTx.save();
      } catch (txErr) {
        console.error('Wallet deduction error in pdf tools:', txErr);
      }
    }

    if (parentTool) {
      parentTool.usageCount = (parentTool.usageCount || 0) + 1;
      parentTool.successCount = (parentTool.successCount || 0) + 1;
      await parentTool.save().catch(() => {});
    }

    if (isDownload && fs.existsSync(outputPath)) {
      if (toolFee > 0) {
        res.setHeader('X-Fee-Deducted', String(toolFee));
        if (newBal !== undefined) res.setHeader('X-Wallet-Balance', String(newBal));
        res.setHeader('Access-Control-Expose-Headers', 'X-Fee-Deducted, X-Wallet-Balance');
      }
      // Send download
      res.download(outputPath, clientFileName, (err) => {
        // Clean up output file after send
        cleanupFiles([outputPath]);
        if (err && !res.headersSent) {
          res.status(500).json({ success: false, error: 'Failed to download processed file' });
        }
      });
    } else {
      // Return metadata
      cleanupFiles([outputPath]);
      return res.json({
        success: true,
        operation,
        data: result.data,
        feeDeducted: toolFee,
        walletBalance: newBal
      });
    }
  } catch (err) {
    cleanupFiles(uploadedFiles);
    cleanupFiles([outputPath]);
    const statusCode = err.message && (err.message.includes('password') || err.message.includes('Invalid') || err.message.includes('required')) ? 400 : 500;
    return res.status(statusCode).json({
      success: false,
      operation,
      error: err.message || 'Operation failed'
    });
  }
});

module.exports = router;
