const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const Tool = require('../models/Tool');
const User = require('../models/User');
const WalletTransaction = require('../models/WalletTransaction');
const SidebarMenu = require('../models/SidebarMenu');
const { cloudinary } = require('../cloudinaryConfig');
const verifyRetailer = require('../middleware/verifyRetailer');

// Helper to resolve a public HTTPS URL for third-party tool APIs
const resolvePublicFileUrl = async (fileUrl, fileData) => {
  if (fileUrl && typeof fileUrl === 'string' && fileUrl.startsWith('http')) {
    return fileUrl;
  }
  if (fileData && typeof fileData === 'string') {
    if (fileData.startsWith('http')) {
      return fileData;
    }
    // If it's a data URL, upload to Cloudinary to obtain a public URL
    if (fileData.startsWith('data:')) {
      if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
        const uploadResult = await cloudinary.uploader.upload(fileData, {
          folder: 'samples/mb_mitra/tools',
          resource_type: 'auto'
        });
        return uploadResult.secure_url;
      }
    }
  }
  return null;
};

const getBackgroundRemoverOutputUrl = (apiResponse) => {
  const outputKeys = [
    'output_url',
    'outputUrl',
    'output_file_url',
    'outputFileUrl',
    'result_url',
    'resultUrl',
    'result',
    'output',
    'processed_image_url',
    'processedImageUrl',
    'transparent_image_url',
    'transparentImageUrl',
    'file_url',
    'fileUrl',
    'url'
  ];

  const findUrl = (value) => {
    if (!value || typeof value !== 'object') return null;
    for (const key of outputKeys) {
      if (typeof value[key] === 'string' && /^(https?:\/\/|data:image\/)/i.test(value[key])) {
        return value[key];
      }
    }
    for (const child of Object.values(value)) {
      const nestedUrl = findUrl(child);
      if (nestedUrl) return nestedUrl;
    }
    return null;
  };

  if (typeof apiResponse === 'string' && /^(https?:\/\/|data:image\/)/i.test(apiResponse)) {
    return apiResponse;
  }
  return findUrl(apiResponse);
};

// Initial default tools list to seed if empty
const DEFAULT_TOOLS = [
  {
    title: 'AADHAR CARD PDF CUTTER AI API',
    icon: '🪪',
    category: 'Card Cutter',
    badge: 'AI API',
    description: 'Automated Aadhaar card PDF crop and cutting tool using smart boundary detection AI.',
    fee: 0,
    isActive: true,
    order: 0
  },
  {
    title: 'ALL TYPE ID CARD PDF CROP/CUTTER AI API',
    icon: '✂️',
    category: 'Card Cutter',
    badge: 'AI API',
    description: 'Universal identity card crop and multi-format PDF cutter API.',
    fee: 0,
    isActive: true,
    order: 1
  },
  {
    title: 'BACKGROUND REMOVER IMAGE AI API',
    icon: '🖼️',
    category: 'Image AI',
    badge: 'AI API',
    description: 'Instant background removal from photos and ID card portrait images.',
    fee: 0,
    isActive: true,
    order: 2
  },
  {
    title: 'DIGITAL SIGNATURE PDF VALIDATION AI TOOL API',
    icon: '✍️',
    category: 'Validation',
    badge: 'AI Tool',
    description: 'Validate and verify cryptographic digital signatures on signed PDF documents.',
    fee: 0,
    isActive: true,
    order: 3
  },
  {
    title: 'ALL IDENTITY CARD AUTOMATIC CROPPING TOOLS API',
    icon: '📐',
    category: 'Card Cutter',
    badge: 'AI Tool',
    description: 'Automatic edge detection and precision cropping tool for all government IDs.',
    fee: 0,
    isActive: true,
    order: 4
  },
  {
    title: 'IMAGE TO TEXT CONVERTER ONLINE API',
    icon: '📝',
    category: 'OCR / Text',
    badge: 'Online API',
    description: 'High accuracy OCR engine to extract editable text from scanned forms and images.',
    fee: 0,
    isActive: true,
    order: 5
  },
  {
    title: 'AI IMAGE ENHANCER API – IMPROVE IMAGE QUALITY INSTANTLY',
    icon: '✨',
    category: 'Image AI',
    badge: 'AI Enhancer',
    description: 'Enhance resolution, sharpen blurred photos, and restore low-light applicant pictures.',
    fee: 0,
    isActive: true,
    order: 6
  },
  {
    title: 'MERA RATION CARD PDF CROP/CUTTER AI API',
    icon: '🌾',
    category: 'Card Cutter',
    badge: 'AI API',
    description: 'Crop Ration Cards and NFSA family slips from official PDF downloads.',
    fee: 0,
    isActive: true,
    order: 7
  },
  {
    title: 'PAN CARD PDF CROP/CUTTER AI API',
    icon: '💳',
    category: 'Card Cutter',
    badge: 'AI API',
    description: 'Precision PAN card e-PDF crop cutter and printable 300 DPI layout formatter.',
    fee: 0,
    isActive: true,
    order: 8
  },
  {
    title: 'VOTER ID OR EPIC CARD PDF CROP/CUTTER AI API',
    icon: '🗳️',
    category: 'Card Cutter',
    badge: 'AI API',
    description: 'Automated e-EPIC and voter identity slip extraction and cutter API.',
    fee: 0,
    isActive: true,
    order: 9
  },
  {
    title: 'PDF 2 HTML CONVERT API',
    icon: '🌐',
    category: 'Converter',
    badge: 'Convert API',
    description: 'Convert complex document layout PDFs into clean HTML5 format.',
    fee: 0,
    isActive: true,
    order: 10
  },
  {
    title: 'PMJAY AYUSHMAN CARD CUTTER AI API',
    icon: '🏥',
    category: 'Card Cutter',
    badge: 'AI API',
    description: 'Extract and format Ayushman Bharat PMJAY golden health cards instantly.',
    fee: 0,
    isActive: true,
    order: 11
  }
];

// Helper: Seed tools if collection is empty
const ensureToolsSeeded = async () => {
  const count = await Tool.countDocuments();
  if (count === 0) {
    await Tool.insertMany(DEFAULT_TOOLS);
  }
};

// GET all tools
router.get('/', async (req, res) => {
  try {
    await ensureToolsSeeded();
    const tools = await Tool.find().sort({ order: 1, createdAt: 1 });
    res.json(tools);
  } catch (err) {
    console.error('Error fetching tools:', err);
    res.status(500).json({ message: err.message });
  }
});

// GET service status (checks if Tools is active in SidebarMenu)
router.get('/service-status', async (req, res) => {
  try {
    const menu = await SidebarMenu.findOne({ label: { $regex: /^tools$/i } });
    res.json({
      isActive: menu ? Boolean(menu.isActive) : true,
      menu
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST toggle whole Tools service ON/OFF
router.post('/toggle-service', async (req, res) => {
  try {
    const { isActive } = req.body;
    let menu = await SidebarMenu.findOne({ label: { $regex: /^tools$/i } });
    if (!menu) {
      menu = new SidebarMenu({
        label: 'Tools',
        url: '/tools',
        isActive: isActive !== undefined ? isActive : true,
        order: 0
      });
    } else {
      menu.isActive = isActive !== undefined ? isActive : !menu.isActive;
      menu.url = '/tools';
    }
    await menu.save();
    res.json({ success: true, isActive: menu.isActive, menu });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST create new tool
router.post('/', async (req, res) => {
  try {
    const count = await Tool.countDocuments();
    const newTool = new Tool({
      ...req.body,
      order: req.body.order !== undefined ? req.body.order : count
    });
    await newTool.save();
    res.status(201).json(newTool);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PUT update tool
router.put('/:id', async (req, res) => {
  try {
    const updated = await Tool.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
    if (!updated) return res.status(404).json({ message: 'Tool not found' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// DELETE tool
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Tool.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Tool not found' });
    res.json({ message: 'Tool deleted successfully', id: req.params.id });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST reorder tools
router.post('/reorder', async (req, res) => {
  try {
    const { orderedIds } = req.body;
    if (Array.isArray(orderedIds)) {
      for (let i = 0; i < orderedIds.length; i++) {
        await Tool.findByIdAndUpdate(orderedIds[i], { order: i });
      }
    }
    res.json({ success: true, message: 'Tools reordered' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /process - Process tool workflow (Protected by verifyRetailer)
router.post('/process', verifyRetailer, async (req, res) => {
  try {
    const {
      toolId,
      toolTitle,
      preset,
      settings,
      fileName,
      fileData,
      fileUrl,
      aadharType,
      cardSizeMode,
      quality,
      issueDate,
      downloadDate,
      citiDob,
      vidNo,
      cropBox
    } = req.body;

    const widthMm = parseFloat(settings?.widthMm) || 85.6;
    const heightMm = parseFloat(settings?.heightMm) || 54.0;
    const dpi = parseInt(settings?.dpi, 10) || 300;

    let apiResponse = null;
    const isAadharTool = (toolTitle || '').toLowerCase().includes('aadhar') && (toolTitle || '').toLowerCase().includes('cutter');
    const isAutoCropTool = (toolTitle || '').toLowerCase().includes('automatic cropping') || (toolTitle || '').toLowerCase().includes('auto crop');
    const isAllIdTool = !isAutoCropTool && ((toolTitle || '').toLowerCase().includes('all type') || (toolTitle || '').toLowerCase().includes('all identity'));
    const isBgRemoverTool = (toolTitle || '').toLowerCase().includes('background remover') || (toolTitle || '').toLowerCase().includes('remove bg');
    const isDigitalSignatureTool = (toolTitle || '').toLowerCase().includes('digital signature') || (toolTitle || '').toLowerCase().includes('signature validation');
    const isImageToTextTool = (toolTitle || '').toLowerCase().includes('image to text') || (toolTitle || '').toLowerCase().includes('ocr');
    const isEnhancerTool = (toolTitle || '').toLowerCase().includes('enhancer') || (toolTitle || '').toLowerCase().includes('improve image');
    const isRationTool = (toolTitle || '').toLowerCase().includes('ration');
    const isPanTool = (toolTitle || '').toLowerCase().includes('pan') && (toolTitle || '').toLowerCase().includes('cutter');
    const isVoterTool = (toolTitle || '').toLowerCase().includes('voter') || (toolTitle || '').toLowerCase().includes('epic');
    const isPdfToHtmlTool = (toolTitle || '').toLowerCase().includes('pdf 2 html') || (toolTitle || '').toLowerCase().includes('pdf to html');
    const isPmjayTool = (toolTitle || '').toLowerCase().includes('pmjay') || (toolTitle || '').toLowerCase().includes('ayushman');

    // Check if input document is present
    if (!fileData && !fileUrl) {
      return res.status(400).json({
        success: false,
        message: 'A valid document file (PDF or Image) is required to process this tool. Please ensure the file is uploaded.'
      });
    }

    const requestingUserId = req.retailer?.userId || 'retailer';
    const pdfPassword = req.body.password || req.body.pdfPassword || '';

    // Resolve Tool and Fee from database
    let toolDoc = null;
    if (toolId) {
      try {
        toolDoc = await Tool.findById(toolId);
      } catch (e) {}
    }
    if (!toolDoc && toolTitle) {
      const cleanTitle = String(toolTitle).trim();
      toolDoc = await Tool.findOne({ title: cleanTitle }) || await Tool.findOne({ title: new RegExp('^' + cleanTitle + '$', 'i') });
    }
    const toolFee = (toolDoc && typeof toolDoc.fee === 'number' && toolDoc.fee > 0) ? toolDoc.fee : 0;

    let user = null;
    if (requestingUserId && requestingUserId !== 'retailer') {
      user = await User.findOne({ userId: requestingUserId }) || await User.findOne({ userId: new RegExp('^' + requestingUserId + '$', 'i') });
    }

    // Pre-check wallet balance if tool has a fee
    if (toolFee > 0) {
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User account not found. Please log in again to continue.'
        });
      }
      const currentBalance = parseFloat(user.walletBalance || 0);
      if (currentBalance < toolFee) {
        return res.status(400).json({
          success: false,
          message: 'Insufficient wallet balance. Fee ₹' + toolFee.toFixed(2) + ' required. Current balance: ₹' + currentBalance.toFixed(2)
        });
      }
    }

    // Phase 1 tools are processed locally without external APIs or Cloudinary uploads
    if (isAadharTool) {
      const { callAadharCardPdfCutterAi } = require('../utils/aadharCutter');
      apiResponse = await callAadharCardPdfCutterAi({
        fileData,
        file_url: fileUrl,
        password: pdfPassword,
        userId: requestingUserId,
        aadhar_type: aadharType || req.body.aadhar_type || 'normal',
        quality: quality || 'high',
        cropBox,
        settings,
        ...req.body
      });
    } else if (isAllIdTool) {
      const { callAllTypeIdCardCutterAi } = require('../utils/allTypeIdCardCutter');
      apiResponse = await callAllTypeIdCardCutterAi({
        fileData,
        file_url: fileUrl,
        password: pdfPassword,
        userId: requestingUserId,
        card_size_mode: cardSizeMode || req.body.card_size_mode || 'none',
        quality: quality || 'high',
        cropBox,
        settings,
        ...req.body
      });
    } else if (isRationTool) {
      const { callMeraRationCutterAi } = require('../utils/meraRationCutter');
      apiResponse = await callMeraRationCutterAi({
        fileData,
        file_url: fileUrl,
        password: pdfPassword,
        userId: requestingUserId,
        quality: quality || 'high',
        cropBox,
        settings,
        ...req.body
      });
    } else if (isPanTool) {
      const { callPanCardCutterAi } = require('../utils/panCardCutter');
      apiResponse = await callPanCardCutterAi({
        fileData,
        file_url: fileUrl,
        password: pdfPassword,
        userId: requestingUserId,
        signature_url: req.body.signature_url || req.body.signatureUrl,
        signatureData: req.body.signatureData,
        quality: quality || 'high',
        cropBox,
        settings,
        ...req.body
      });
    } else if (isVoterTool) {
      const { callVoterIdCutterAi } = require('../utils/voterIdCutter');
      apiResponse = await callVoterIdCutterAi({
        fileData,
        file_url: fileUrl,
        password: pdfPassword,
        userId: requestingUserId,
        quality: quality || 'high',
        cropBox,
        settings,
        ...req.body
      });
    } else if (isPmjayTool) {
      const { callPmjayCardCutterAi } = require('../utils/pmjayCardCutter');
      apiResponse = await callPmjayCardCutterAi({
        fileData,
        file_url: fileUrl,
        password: pdfPassword,
        userId: requestingUserId,
        quality: quality || 'high',
        cropBox,
        settings,
        ...req.body
      });
    } else if (isPdfToHtmlTool) {
      const { callPdfToHtmlAi } = require('../utils/pdfToHtmlConverter');
      apiResponse = await callPdfToHtmlAi({
        fileData,
        file_url: fileUrl,
        password: pdfPassword,
        userId: requestingUserId,
        title: fileName ? fileName.replace(/\.[^/.]+$/, '') : 'Converted Document',
        ...req.body
      });
    } else {
      // Phase 2 tools — fully local processing (no external API calls, no data upload)

      if (isAutoCropTool) {
        // LOCAL: OpenCV contour detection
        const { resolveIncomingDocument } = require('../utils/toolHelpers');
        const resolved = await resolveIncomingDocument({
          fileData,
          fileUrl,
          expectedType: 'image',
          userId: requestingUserId,
          role: req.retailer?.role
        });
        const { callIdentityCardAutoCropLocal } = require('../utils/localAutoCrop');
        apiResponse = await callIdentityCardAutoCropLocal({
          fileData: resolved.buffer,
          croptype: req.body.croptype || req.body.cropType || 'generic',
          userId: requestingUserId
        });
      } else if (isBgRemoverTool) {
        // LOCAL: rembg (U2-Net) with GrabCut fallback
        const { resolveIncomingDocument } = require('../utils/toolHelpers');
        const resolved = await resolveIncomingDocument({
          fileData,
          fileUrl,
          expectedType: 'image',
          userId: requestingUserId,
          role: req.retailer?.role
        });
        const { callBackgroundRemoverLocal } = require('../utils/localBackgroundRemover');
        apiResponse = await callBackgroundRemoverLocal({
          fileData: resolved.buffer,
          settings: req.body.settings || settings,
          preset: req.body.preset || preset,
          bgColor: req.body.bgColor || settings?.bgColor || req.body.bg_color,
          model: req.body.model || settings?.model || 'u2net_human_seg',
          format: req.body.outputFormat || req.body.format || settings?.format,
          cropBox: req.body.cropBox || settings?.cropBox,
          rotation: req.body.rotation || settings?.rotation,
          isPreCropped: req.body.isPreCropped || settings?.isPreCropped,
          subjectPosition: req.body.subjectPosition || settings?.subjectPosition,
          userId: requestingUserId
        });
      } else if (isDigitalSignatureTool) {
        // LOCAL: PDF structure inspection + metadata extraction
        const { resolveIncomingDocument } = require('../utils/toolHelpers');
        const resolved = await resolveIncomingDocument({
          fileData,
          fileUrl,
          expectedType: 'pdf',
          userId: requestingUserId,
          role: req.retailer?.role,
          password: pdfPassword
        });
        const { callDigitalSignatureValidatorLocal } = require('../utils/localDigitalSignatureValidator');
        apiResponse = await callDigitalSignatureValidatorLocal({
          fileData: resolved.buffer,
          fileName: fileName || resolved.fileName || 'document.pdf',
          password: pdfPassword
        });
      } else if (isImageToTextTool) {
        // LOCAL: EasyOCR (Hindi + English) with pytesseract fallback
        const { resolveIncomingDocument } = require('../utils/toolHelpers');
        const resolved = await resolveIncomingDocument({
          fileData,
          fileUrl,
          expectedType: 'image',
          userId: requestingUserId,
          role: req.retailer?.role
        });
        const { callImageToTextLocal } = require('../utils/localOcr');
        apiResponse = await callImageToTextLocal({
          fileData: resolved.buffer,
          extraLangs: req.body.extraLangs || req.body.extra_langs || ''
        });
      } else if (isEnhancerTool) {
        // LOCAL: CLAHE + Unsharp Masking (standard or advanced level)
        const { resolveIncomingDocument } = require('../utils/toolHelpers');
        const resolved = await resolveIncomingDocument({
          fileData,
          fileUrl,
          expectedType: 'image',
          userId: requestingUserId,
          role: req.retailer?.role
        });
        const { callImageEnhancerLocal } = require('../utils/localImageEnhancer');
        const enhanceLevel = (req.body.enhanceLevel || req.body.level || settings?.level || 'standard');
        apiResponse = await callImageEnhancerLocal({
          fileData: resolved.buffer,
          level: enhanceLevel,
          format: req.body.outputFormat || 'png',
          userId: requestingUserId
        });
      } else {
        return res.status(400).json({
          success: false,
          message: `Tool "${toolTitle || toolId}" is not yet supported for local processing.`
        });
      }
    }

    if (!apiResponse) {
      throw new Error('Tool processor did not return a response.');
    }

    // Check for failure status codes or messages
    // Phase 2 local tools always return { success: true } or throw — no .status/.code needed
    const isLocalResponse = apiResponse.success === true && !apiResponse.code;
    const isProviderFailure = !isLocalResponse && (
      apiResponse.status === 'Failure' ||
      apiResponse.status === 'failure' ||
      apiResponse.status === 'failed' ||
      (apiResponse.code && String(apiResponse.code) !== '200' && !apiResponse.download_url && !apiResponse.file_url && !apiResponse.output_image_url && !apiResponse.enhanced_image_url && !apiResponse.text && !apiResponse.html)
    );

    if (isProviderFailure) {
      const errorMsg = apiResponse.message || apiResponse.error || 'Tool processing failed';
      throw new Error(errorMsg);
    }

    const extractedText = isImageToTextTool
      ? (apiResponse?.text || apiResponse?.extracted_text || apiResponse?.data?.text || (typeof apiResponse === 'string' ? apiResponse : null))
      : null;

    const htmlContent = isPdfToHtmlTool
      ? (apiResponse?.html || apiResponse?.html_content || apiResponse?.data?.html || (typeof apiResponse === 'string' ? apiResponse : null))
      : null;

    // Digital signature tool returns structured JSON — no binary file URL
    const signatureValidationResult = isDigitalSignatureTool
      ? (apiResponse?.validationStatus ? apiResponse : null)
      : null;

    // Resolve output URL: Phase 2 local tools use camelCase .fileUrl
    const rawOutputUrl =
      apiResponse?.fileUrl ||           // Phase 2 local tools
      apiResponse?.file_url ||
      apiResponse?.output_url ||
      apiResponse?.image_url ||
      apiResponse?.url ||
      apiResponse?.download_url ||
      apiResponse?.output_image_url ||
      apiResponse?.enhanced_image_url ||
      apiResponse?.data?.file_url ||
      apiResponse?.data?.output_url ||
      apiResponse?.data?.image_url ||
      apiResponse?.data?.url ||
      apiResponse?.data?.download_url;

    if (isImageToTextTool) {
      if (!extractedText) {
        throw new Error(apiResponse.message || 'Image to Text failed: No text was extracted.');
      }
    } else if (isPdfToHtmlTool) {
      if (!htmlContent) {
        throw new Error(apiResponse.message || 'PDF to HTML failed: No HTML was generated.');
      }
    } else if (isDigitalSignatureTool) {
      // Digital Signature returns structured JSON — no download URL needed
      if (!signatureValidationResult) {
        throw new Error(apiResponse.message || 'Digital Signature Validation failed to return a result.');
      }
    } else {
      if (!rawOutputUrl) {
        throw new Error(apiResponse.message || 'Tool processor did not return a valid output file URL.');
      }
    }

    const outputUrl = rawOutputUrl || fileUrl;

    // Phase 2 local tools produce PNG; Phase 1 API tools may produce JPG for enhancer
    const outputExt = isBgRemoverTool
      ? 'png'
      : isEnhancerTool
      ? 'png'    // Local enhancer outputs PNG by default
      : isAutoCropTool
      ? 'png'
      : isDigitalSignatureTool
      ? 'json'
      : isPdfToHtmlTool
      ? 'html'
      : isImageToTextTool
      ? 'txt'
      : 'pdf';

    const result = {
      success: true,
      message: apiResponse.message || `${toolTitle || 'Tool'} processed successfully.`,
      toolId,
      toolTitle: toolTitle || 'Identity Document Studio',
      processedAt: new Date().toISOString(),
      preset: preset || 'CR-80 Standard ID Card (85.6 × 54.0 mm, 300 DPI)',
      dimensions: {
        widthMm: widthMm.toFixed(1),
        heightMm: heightMm.toFixed(1),
        dpi: dpi,
        widthPx: Math.round((widthMm / 25.4) * dpi),
        heightPx: Math.round((heightMm / 25.4) * dpi)
      },
      outputFileName: `${(toolTitle || 'document').replace(/[^a-zA-Z0-9]/g, '_')}_output.${outputExt}`,
      outputUrl: isBgRemoverTool
        ? (outputUrl || getBackgroundRemoverOutputUrl(apiResponse))
        : (outputUrl || apiResponse?.file_url || apiResponse?.url || apiResponse?.image_url || fileData || null),
      extractedText,
      htmlContent,
      // Phase 2: Structured results for non-file tools
      signatureValidation: signatureValidationResult || null,
      cropType: apiResponse?.cropType || null,
      localProcessing: isLocalResponse, // flag: true = no external API was used
      feeDeducted: toolFee,
      newBalance: user ? user.walletBalance : undefined,
      walletBalance: user ? user.walletBalance : undefined,
      apiData: apiResponse || null
    };

    // Deduct Tool Fee from User Wallet only after successful processing
    if (toolFee > 0 && user) {
      const balanceBefore = parseFloat(user.walletBalance || 0);
      const balanceAfter = parseFloat((balanceBefore - toolFee).toFixed(2));
      user.walletBalance = balanceAfter;
      await user.save();

      const randomDigits = Math.floor(10000 + Math.random() * 90000);
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const refNumber = 'TOOL' + dateStr + randomDigits;

      const newTx = new WalletTransaction({
        userId: user.userId,
        transactionType: 'Debit',
        amount: toolFee,
        balanceBefore,
        balanceAfter,
        description: 'Tool Fee - ' + (toolDoc?.title || toolTitle || 'AI Tool'),
        referenceNumber: refNumber,
        status: 'Success'
      });
      await newTx.save();

      result.feeDeducted = toolFee;
      result.newBalance = balanceAfter;
      result.walletBalance = balanceAfter;
    }

    if (toolDoc) {
      toolDoc.usageCount = (toolDoc.usageCount || 0) + 1;
      toolDoc.successCount = (toolDoc.successCount || 0) + 1;
      await toolDoc.save().catch(() => {});
    }

    res.json(result);
  } catch (err) {
    console.error('Error processing tool workflow:', err.response?.data || err.message);
    if (typeof toolDoc !== 'undefined' && toolDoc) {
      toolDoc.usageCount = (toolDoc.usageCount || 0) + 1;
      toolDoc.failureCount = (toolDoc.failureCount || 0) + 1;
      await toolDoc.save().catch(() => {});
    }
    const status = err.response?.status || (err.message && err.message.includes('required') ? 400 : 502);
    res.status(status).json({
      success: false,
      message: err.response?.data?.message || err.response?.data?.error || err.message || 'Processing failed'
    });
  }
});

// POST /aadhar-cutter - Dedicated endpoint for AADHAR CARD PDF CROP/CUTTER AI API
router.post('/aadhar-cutter', verifyRetailer, async (req, res) => {
  try {
    const { callAadharCardPdfCutterAi } = require('../utils/aadharCutter');
    const {
      file_url,
      fileData,
      aadhar_type,
      quality,
      cropBox,
      settings
    } = req.body;

    const data = await callAadharCardPdfCutterAi({
      file_url,
      fileData,
      aadhar_type,
      quality,
      cropBox,
      settings,
      ...req.body
    });

    res.json({ success: true, data });
  } catch (err) {
    console.error('Aadhar Cutter Error:', err.message);
    res.status(500).json({
      success: false,
      message: err.message || 'Aadhaar cropping failed',
      error: err.message
    });
  }
});

// POST /all-id-cutter - Dedicated endpoint for ALL TYPE ID CARD PDF CROP/CUTTER AI API
router.post('/all-id-cutter', verifyRetailer, async (req, res) => {
  try {
    const { callAllTypeIdCardCutterAi } = require('../utils/allTypeIdCardCutter');
    const {
      file_url,
      fileData,
      card_size_mode,
      quality,
      cropBox,
      settings
    } = req.body;

    const data = await callAllTypeIdCardCutterAi({
      file_url,
      fileData,
      card_size_mode,
      quality,
      cropBox,
      settings,
      ...req.body
    });

    res.json({ success: true, data });
  } catch (err) {
    console.error('All Type ID Cutter Error:', err.message);
    res.status(500).json({
      success: false,
      message: err.message || 'ID card cropping failed',
      error: err.message
    });
  }
});

// POST /bg-remover - Dedicated endpoint for BACKGROUND REMOVER IMAGE AI API
router.post('/bg-remover', verifyRetailer, async (req, res) => {
  try {
    const { callBackgroundRemoverAi } = require('../utils/backgroundRemover');
    const data = await callBackgroundRemoverAi({
      ...req.body,
      fileData: req.body.fileData || req.body.imageData,
      file_url: req.body.file_url || req.body.image_url,
      image_url: req.body.image_url || req.body.file_url || req.body.fileData,
      userId: req.user?._id || 'retailer'
    });
    const outputUrl = data?.output_url || data?.file_url || data?.image_url || getBackgroundRemoverOutputUrl(data) || data;
    res.json({
      success: true,
      data,
      outputUrl
    });
  } catch (err) {
    console.error('Background Remover API Error:', err.message);
    res.status(500).json({
      success: false,
      message: err.message || 'Background removal failed',
      error: err.message
    });
  }
});

// POST /digital-signature-validation - Dedicated endpoint for DIGITAL SIGNATURE PDF VALIDATION AI TOOL API
router.post('/digital-signature-validation', verifyRetailer, async (req, res) => {
  try {
    const { callDigitalSignatureValidationAi } = require('../utils/digitalSignatureValidator');
    const {
      file_url,
      fileData,
      fileName,
      password
    } = req.body;

    const data = await callDigitalSignatureValidationAi({
      file_url,
      fileData,
      fileName: fileName || 'document.pdf',
      password: password || req.body.pdfPassword || '',
      userId: req.user?._id || 'retailer'
    });

    res.json({ success: true, data });
  } catch (err) {
    console.error('Digital Signature Validation API Error:', err.message);
    res.status(500).json({
      success: false,
      message: err.message || 'Digital signature validation failed',
      error: err.message
    });
  }
});

// POST /identity-auto-crop - Dedicated endpoint for ALL IDENTITY CARD AUTOMATIC CROPPING TOOLS API
router.post('/identity-auto-crop', verifyRetailer, async (req, res) => {
  try {
    const { callIdentityCardAutoCropAi } = require('../utils/identityCardAutoCrop');
    const {
      croptype,
      cropType,
      file_url,
      fileData
    } = req.body;

    const data = await callIdentityCardAutoCropAi({
      croptype: croptype || cropType || 'generic',
      file_url,
      fileData,
      userId: req.user?._id || 'retailer',
      ...req.body
    });

    res.json({ success: true, data });
  } catch (err) {
    console.error('Identity Card Auto Crop API Error:', err.message);
    res.status(500).json({
      success: false,
      message: err.message || 'ID card auto-crop failed',
      error: err.message
    });
  }
});

// POST /image-to-text - Dedicated endpoint for IMAGE TO TEXT CONVERTER ONLINE API
router.post('/image-to-text', verifyRetailer, async (req, res) => {
  try {
    const { callImageToTextAi } = require('../utils/imageToText');
    const data = await callImageToTextAi({
      ...req.body,
      fileData: req.body.fileData || req.body.imageData,
      file_url: req.body.file_url || req.body.image_url
    });
    res.json({ success: true, data });
  } catch (err) {
    console.error('Image to Text API Error:', err.message);
    res.status(500).json({
      success: false,
      message: err.message || 'Text extraction failed',
      error: err.message
    });
  }
});

// POST /image-enhancer - Dedicated endpoint for AI IMAGE ENHANCER API
router.post('/image-enhancer', verifyRetailer, async (req, res) => {
  try {
    const { callImageEnhancerAi } = require('../utils/imageEnhancer');
    const data = await callImageEnhancerAi({
      ...req.body,
      fileData: req.body.fileData || req.body.imageData,
      file_url: req.body.file_url || req.body.image_url,
      userId: req.user?._id || 'retailer'
    });
    res.json({ success: true, data });
  } catch (err) {
    console.error('Image Enhancer API Error:', err.message);
    res.status(500).json({
      success: false,
      message: err.message || 'Image enhancement failed',
      error: err.message
    });
  }
});

// POST /mera-ration-cutter - Dedicated endpoint for MERA RATION CARD PDF CROP/CUTTER AI API
router.post('/mera-ration-cutter', verifyRetailer, async (req, res) => {
  try {
    const { callMeraRationCutterAi } = require('../utils/meraRationCutter');
    const {
      file_url,
      fileData,
      quality,
      cropBox,
      settings
    } = req.body;

    const data = await callMeraRationCutterAi({
      file_url,
      fileData,
      quality,
      cropBox,
      settings,
      ...req.body
    });

    res.json({ success: true, data });
  } catch (err) {
    console.error('Mera Ration Cutter Error:', err.message);
    res.status(500).json({
      success: false,
      message: err.message || 'Mera Ration Card cropping failed',
      error: err.message
    });
  }
});

// POST /pan-cutter - Dedicated endpoint for PAN CARD PDF CROP/CUTTER AI API
router.post('/pan-cutter', verifyRetailer, async (req, res) => {
  try {
    const { callPanCardCutterAi } = require('../utils/panCardCutter');
    const {
      file_url,
      fileData,
      signature_url,
      signatureData,
      quality,
      cropBox,
      settings
    } = req.body;

    const data = await callPanCardCutterAi({
      file_url,
      fileData,
      signature_url,
      signatureData,
      quality,
      cropBox,
      settings,
      ...req.body
    });

    res.json({ success: true, data });
  } catch (err) {
    console.error('PAN Card Cutter Error:', err.message);
    res.status(500).json({
      success: false,
      message: err.message || 'PAN Card cropping failed',
      error: err.message
    });
  }
});

// POST /voter-cutter - Dedicated endpoint for VOTER ID OR EPIC CARD PDF CROP/CUTTER AI API
router.post('/voter-cutter', verifyRetailer, async (req, res) => {
  try {
    const { callVoterIdCutterAi } = require('../utils/voterIdCutter');
    const {
      file_url,
      fileData,
      quality,
      cropBox,
      settings
    } = req.body;

    const data = await callVoterIdCutterAi({
      file_url,
      fileData,
      quality,
      cropBox,
      settings,
      ...req.body
    });

    res.json({ success: true, data });
  } catch (err) {
    console.error('Voter ID Cutter Error:', err.message);
    res.status(500).json({
      success: false,
      message: err.message || 'Voter ID cropping failed',
      error: err.message
    });
  }
});

// POST /pdf-to-html - Dedicated endpoint for PDF 2 HTML CONVERT API
router.post('/pdf-to-html', verifyRetailer, async (req, res) => {
  try {
    const { callPdfToHtmlAi } = require('../utils/pdfToHtmlConverter');
    const { file_url, fileData, title, fileName } = req.body;

    const data = await callPdfToHtmlAi({
      file_url,
      fileData,
      title: title || (fileName ? fileName.replace(/\.[^/.]+$/, '') : 'Converted Document'),
      ...req.body
    });
    res.json({ success: true, data });
  } catch (err) {
    console.error('PDF to HTML Error:', err.message);
    res.status(500).json({
      success: false,
      message: err.message || 'PDF to HTML conversion failed',
      error: err.message
    });
  }
});

// POST /pmjay-cutter - Dedicated endpoint for PMJAY AYUSHMAN CARD CUTTER AI API
router.post('/pmjay-cutter', verifyRetailer, async (req, res) => {
  try {
    const { callPmjayCardCutterAi } = require('../utils/pmjayCardCutter');
    const {
      file_url,
      fileData,
      quality,
      cropBox,
      settings
    } = req.body;

    const data = await callPmjayCardCutterAi({
      file_url,
      fileData,
      quality,
      cropBox,
      settings,
      ...req.body
    });

    res.json({ success: true, data });
  } catch (err) {
    console.error('PMJAY Ayushman Card Cutter Error:', err.message);
    res.status(500).json({
      success: false,
      message: err.message || 'PMJAY card cropping failed',
      error: err.message
    });
  }
});

// GET /download/:filename - Authenticated and secure file download endpoint
router.get('/download/:filename', async (req, res) => {
  try {
    const rawFilename = req.params.filename;
    // Sanitize filename to prevent directory traversal
    const safeFileName = path.basename(rawFilename);
    if (!safeFileName || safeFileName !== rawFilename || safeFileName.includes('..') || safeFileName.includes('/') || safeFileName.includes('\\')) {
      return res.status(400).json({ success: false, message: 'Invalid file name requested.' });
    }

    const { verifyDownloadToken, verifyFileOwnership, TEMP_DIR } = require('../utils/toolHelpers');
    const { verifySessionToken } = require('../utils/sessionToken');

    let authorizedUserId = null;
    let authorizedRole = null;

    // Check 1: Short-lived HMAC signed download token in query string (?token=...)
    const token = req.query.token;
    if (token) {
      const verified = verifyDownloadToken(token, safeFileName);
      if (verified) {
        authorizedUserId = verified.userId;
      }
    }

    // Check 2: Bearer session token in Authorization header
    if (!authorizedUserId) {
      const authHeader = req.get('authorization') || '';
      const match = /^Bearer\s+(.+)$/i.exec(authHeader);
      if (match) {
        const session = verifySessionToken(match[1]);
        if (session) {
          authorizedUserId = session.userId;
          authorizedRole = session.role;
        }
      }
    }

    if (!authorizedUserId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Valid authentication session or download token required to access this file.'
      });
    }

    // Verify ownership: requesting retailer must own this file (or be admin)
    const isOwner = verifyFileOwnership(safeFileName, authorizedUserId, authorizedRole);
    if (!isOwner) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: You do not have permission to access another user's generated document."
      });
    }

    const filePath = path.join(TEMP_DIR, safeFileName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'File not found or has expired after retention period.'
      });
    }

    // Determine content type
    const ext = path.extname(safeFileName).toLowerCase();
    const contentTypes = {
      '.pdf': 'application/pdf',
      '.html': 'text/html; charset=utf-8',
      '.htm': 'text/html; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.txt': 'text/plain; charset=utf-8'
    };
    const contentType = contentTypes[ext] || 'application/octet-stream';

    // Set secure response headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);

    // Stream file to client
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (err) {
    console.error('Secure Download Error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to process download request.' });
  }
});

module.exports = router;
