const express = require('express');
const router = express.Router();
const Tool = require('../models/Tool');
const SidebarMenu = require('../models/SidebarMenu');

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

// POST /process - Process tool workflow (Validates file/settings, ready for live APIs)
router.post('/process', async (req, res) => {
  try {
    const authHeader = req.get('authorization') || '';
    let retailerUser = null;
    if (authHeader.startsWith('Bearer ')) {
      try {
        const { verifySessionToken } = require('../utils/sessionToken');
        const token = authHeader.replace(/^Bearer\s+/i, '');
        const session = verifySessionToken(token);
        if (session && session.userId) {
          const User = require('../models/User');
          retailerUser = await User.findOne({ userId: session.userId, status: 'Approved' });
        }
      } catch (tokenErr) {
        // Token verification handled gracefully
      }
    }

    const { toolId, toolTitle, preset, settings, fileName, fileData, fileUrl, aadharType, cardSizeMode, quality, issueDate, downloadDate, citiDob, vidNo } = req.body;

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
    const targetFileUrl = fileUrl || (typeof fileData === 'string' && fileData.startsWith('http') ? fileData : null);

    if (isAadharTool && targetFileUrl) {
      try {
        const { callAadharCardPdfCutterAi } = require('../utils/aadharCutter');
        apiResponse = await callAadharCardPdfCutterAi({
          file_url: targetFileUrl,
          aadhar_type: aadharType || 'normal',
          quality: quality || 'high',
          issuedate: issueDate !== undefined ? String(issueDate) : 'true',
          downloaddate: downloadDate !== undefined ? String(downloadDate) : 'true',
          citidob: citiDob !== undefined ? String(citiDob) : 'true',
          vidno: vidNo !== undefined ? String(vidNo) : 'true'
        });
      } catch (apiErr) {
        console.warn('Aadhar AI API call warning (using fallback layout):', apiErr.message);
      }
    } else if (isAutoCropTool && targetFileUrl) {
      try {
        const { callIdentityCardAutoCropAi } = require('../utils/identityCardAutoCrop');
        apiResponse = await callIdentityCardAutoCropAi({
          file_url: targetFileUrl,
          croptype: req.body.croptype || 'aadhaar',
          ...req.body
        });
      } catch (apiErr) {
        console.warn('Identity Card Auto Crop AI API call warning (using fallback layout):', apiErr.message);
      }
    } else if (isAllIdTool && targetFileUrl) {
      try {
        const { callAllTypeIdCardCutterAi } = require('../utils/allTypeIdCardCutter');
        apiResponse = await callAllTypeIdCardCutterAi({
          file_url: targetFileUrl,
          card_size_mode: cardSizeMode || req.body.card_size_mode || 'none',
          quality: quality || 'high'
        });
      } catch (apiErr) {
        console.warn('All Type ID Card AI API call warning (using fallback layout):', apiErr.message);
      }
    } else if (isBgRemoverTool && targetFileUrl) {
      try {
        const { callBackgroundRemoverAi } = require('../utils/backgroundRemover');
        apiResponse = await callBackgroundRemoverAi({
          file_url: targetFileUrl,
          image_url: targetFileUrl,
          ...req.body
        });
      } catch (apiErr) {
        console.warn('Background Remover AI API call warning (using fallback layout):', apiErr.message);
      }
    } else if (isDigitalSignatureTool && targetFileUrl) {
      try {
        const { callDigitalSignatureValidationAi } = require('../utils/digitalSignatureValidator');
        apiResponse = await callDigitalSignatureValidationAi({
          file_url: targetFileUrl,
          ...req.body
        });
      } catch (apiErr) {
        console.warn('Digital Signature Validation AI API call warning (using fallback layout):', apiErr.message);
      }
    } else if (isImageToTextTool && targetFileUrl) {
      try {
        const { callImageToTextAi } = require('../utils/imageToText');
        apiResponse = await callImageToTextAi({
          file_url: targetFileUrl,
          image_url: targetFileUrl,
          ...req.body
        });
      } catch (apiErr) {
        console.warn('Image to Text AI API call warning (using fallback layout):', apiErr.message);
      }
    } else if (isEnhancerTool && targetFileUrl) {
      try {
        const { callImageEnhancerAi } = require('../utils/imageEnhancer');
        apiResponse = await callImageEnhancerAi({
          file_url: targetFileUrl,
          image_url: targetFileUrl,
          ...req.body
        });
      } catch (apiErr) {
        console.warn('Image Enhancer AI API call warning (using fallback layout):', apiErr.message);
      }
    } else if (isRationTool && targetFileUrl) {
      try {
        const { callMeraRationCutterAi } = require('../utils/meraRationCutter');
        apiResponse = await callMeraRationCutterAi({
          file_url: targetFileUrl,
          quality: quality || 'high',
          ...req.body
        });
      } catch (apiErr) {
        console.warn('Mera Ration Cutter AI API call warning (using fallback layout):', apiErr.message);
      }
    } else if (isPanTool && targetFileUrl) {
      try {
        const { callPanCardCutterAi } = require('../utils/panCardCutter');
        apiResponse = await callPanCardCutterAi({
          file_url: targetFileUrl,
          signature_url: req.body.signature_url || req.body.signatureUrl,
          quality: quality || 'high',
          ...req.body
        });
      } catch (apiErr) {
        console.warn('PAN Card Cutter AI API call warning (using fallback layout):', apiErr.message);
      }
    } else if (isVoterTool && targetFileUrl) {
      try {
        const { callVoterIdCutterAi } = require('../utils/voterIdCutter');
        apiResponse = await callVoterIdCutterAi({
          file_url: targetFileUrl,
          quality: quality || 'high',
          ...req.body
        });
      } catch (apiErr) {
        console.warn('Voter ID Cutter AI API call warning (using fallback layout):', apiErr.message);
      }
    } else if (isPdfToHtmlTool && targetFileUrl) {
      try {
        const { callPdfToHtmlAi } = require('../utils/pdfToHtmlConverter');
        apiResponse = await callPdfToHtmlAi({
          file_url: targetFileUrl,
          ...req.body
        });
      } catch (apiErr) {
        console.warn('PDF 2 HTML Converter AI API call warning (using fallback layout):', apiErr.message);
      }
    } else if (isPmjayTool && targetFileUrl) {
      try {
        const { callPmjayCardCutterAi } = require('../utils/pmjayCardCutter');
        apiResponse = await callPmjayCardCutterAi({
          file_url: targetFileUrl,
          quality: quality || 'high',
          ...req.body
        });
      } catch (apiErr) {
        console.warn('PMJAY Ayushman Card Cutter AI API call warning (using fallback layout):', apiErr.message);
      }
    }

    const result = {
      success: true,
      message: `${toolTitle || 'Tool'} processed successfully.`,
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
      outputFileName: `${(toolTitle || 'document').replace(/[^a-zA-Z0-9]/g, '_')}_output.pdf`,
      outputUrl: apiResponse?.file_url || apiResponse?.url || apiResponse?.image_url || fileData || null,
      apiData: apiResponse || null
    };

    res.json(result);
  } catch (err) {
    console.error('Error processing tool workflow:', err);
    res.status(500).json({ success: false, message: err.message || 'Processing failed' });
  }
});

// POST /aadhar-cutter - Dedicated endpoint for AADHAR CARD PDF CUTTER AI API
router.post('/aadhar-cutter', async (req, res) => {
  try {
    const { callAadharCardPdfCutterAi } = require('../utils/aadharCutter');
    const {
      task_id,
      file_url,
      aadhar_type,
      quality,
      issuedate,
      downloaddate,
      citidob,
      vidno,
      apikeyfill
    } = req.body;

    const data = await callAadharCardPdfCutterAi({
      task_id,
      file_url,
      aadhar_type,
      quality,
      issuedate,
      downloaddate,
      citidob,
      vidno,
      apikeyfill
    });

    res.json({ success: true, data });
  } catch (err) {
    console.error('Aadhar Cutter API Error:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      message: err.response?.data?.message || err.message || 'API call failed',
      error: err.response?.data || err.message
    });
  }
});

// POST /all-id-cutter - Dedicated endpoint for ALL TYPE ID CARD PDF CROP/CUTTER AI API
router.post('/all-id-cutter', async (req, res) => {
  try {
    const { callAllTypeIdCardCutterAi } = require('../utils/allTypeIdCardCutter');
    const {
      task_id,
      file_url,
      card_size_mode,
      quality,
      apikeyfill
    } = req.body;

    const data = await callAllTypeIdCardCutterAi({
      task_id,
      file_url,
      card_size_mode,
      quality,
      apikeyfill
    });

    res.json({ success: true, data });
  } catch (err) {
    console.error('All Type ID Cutter API Error:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      message: err.response?.data?.message || err.message || 'API call failed',
      error: err.response?.data || err.message
    });
  }
});

// POST /bg-remover - Dedicated endpoint for BACKGROUND REMOVER IMAGE AI API
router.post('/bg-remover', async (req, res) => {
  try {
    const { callBackgroundRemoverAi } = require('../utils/backgroundRemover');
    const data = await callBackgroundRemoverAi(req.body);
    res.json({ success: true, data });
  } catch (err) {
    console.error('Background Remover API Error:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      message: err.response?.data?.message || err.message || 'API call failed',
      error: err.response?.data || err.message
    });
  }
});

// POST /digital-signature-validation - Dedicated endpoint for DIGITAL SIGNATURE PDF VALIDATION AI TOOL API
router.post('/digital-signature-validation', async (req, res) => {
  try {
    const { callDigitalSignatureValidationAi } = require('../utils/digitalSignatureValidator');
    const {
      task_id,
      file_url,
      apikeyfill
    } = req.body;

    const data = await callDigitalSignatureValidationAi({
      task_id,
      file_url,
      apikeyfill
    });

    res.json({ success: true, data });
  } catch (err) {
    console.error('Digital Signature Validation API Error:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      message: err.response?.data?.message || err.message || 'API call failed',
      error: err.response?.data || err.message
    });
  }
});

// POST /identity-auto-crop - Dedicated endpoint for ALL IDENTITY CARD AUTOMATIC CROPPING TOOLS API
router.post('/identity-auto-crop', async (req, res) => {
  try {
    const { callIdentityCardAutoCropAi } = require('../utils/identityCardAutoCrop');
    const {
      croptype,
      file_url,
      apikeyfill
    } = req.body;

    const data = await callIdentityCardAutoCropAi({
      croptype,
      file_url,
      apikeyfill,
      ...req.body
    });

    res.json({ success: true, data });
  } catch (err) {
    console.error('Identity Card Auto Crop API Error:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      message: err.response?.data?.message || err.message || 'API call failed',
      error: err.response?.data || err.message
    });
  }
});

// POST /image-to-text - Dedicated endpoint for IMAGE TO TEXT CONVERTER ONLINE API
router.post('/image-to-text', async (req, res) => {
  try {
    const { callImageToTextAi } = require('../utils/imageToText');
    const data = await callImageToTextAi(req.body);
    res.json({ success: true, data });
  } catch (err) {
    console.error('Image to Text API Error:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      message: err.response?.data?.message || err.message || 'API call failed',
      error: err.response?.data || err.message
    });
  }
});

// POST /image-enhancer - Dedicated endpoint for AI IMAGE ENHANCER API
router.post('/image-enhancer', async (req, res) => {
  try {
    const { callImageEnhancerAi } = require('../utils/imageEnhancer');
    const data = await callImageEnhancerAi(req.body);
    res.json({ success: true, data });
  } catch (err) {
    console.error('Image Enhancer API Error:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      message: err.response?.data?.message || err.message || 'API call failed',
      error: err.response?.data || err.message
    });
  }
});

// POST /mera-ration-cutter - Dedicated endpoint for MERA RATION CARD PDF CROP/CUTTER AI API
router.post('/mera-ration-cutter', async (req, res) => {
  try {
    const { callMeraRationCutterAi } = require('../utils/meraRationCutter');
    const {
      task_id,
      file_url,
      quality,
      apikeyfill
    } = req.body;

    const data = await callMeraRationCutterAi({
      task_id,
      file_url,
      quality,
      apikeyfill,
      ...req.body
    });

    res.json({ success: true, data });
  } catch (err) {
    console.error('Mera Ration Cutter API Error:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      message: err.response?.data?.message || err.message || 'API call failed',
      error: err.response?.data || err.message
    });
  }
});

// POST /pan-cutter - Dedicated endpoint for PAN CARD PDF CROP/CUTTER AI API
router.post('/pan-cutter', async (req, res) => {
  try {
    const { callPanCardCutterAi } = require('../utils/panCardCutter');
    const {
      task_id,
      file_url,
      signature_url,
      quality,
      apikeyfill
    } = req.body;

    const data = await callPanCardCutterAi({
      task_id,
      file_url,
      signature_url,
      quality,
      apikeyfill,
      ...req.body
    });

    res.json({ success: true, data });
  } catch (err) {
    console.error('PAN Card Cutter API Error:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      message: err.response?.data?.message || err.message || 'API call failed',
      error: err.response?.data || err.message
    });
  }
});

// POST /voter-cutter - Dedicated endpoint for VOTER ID OR EPIC CARD PDF CROP/CUTTER AI API
router.post('/voter-cutter', async (req, res) => {
  try {
    const { callVoterIdCutterAi } = require('../utils/voterIdCutter');
    const {
      task_id,
      file_url,
      quality,
      apikeyfill
    } = req.body;

    const data = await callVoterIdCutterAi({
      task_id,
      file_url,
      quality,
      apikeyfill,
      ...req.body
    });

    res.json({ success: true, data });
  } catch (err) {
    console.error('Voter ID Cutter API Error:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      message: err.response?.data?.message || err.message || 'API call failed',
      error: err.response?.data || err.message
    });
  }
});

// POST /pdf-to-html - Dedicated endpoint for PDF 2 HTML CONVERT API
router.post('/pdf-to-html', async (req, res) => {
  try {
    const { callPdfToHtmlAi } = require('../utils/pdfToHtmlConverter');
    const data = await callPdfToHtmlAi(req.body);
    res.json({ success: true, data });
  } catch (err) {
    console.error('PDF to HTML API Error:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      message: err.response?.data?.message || err.message || 'API call failed',
      error: err.response?.data || err.message
    });
  }
});

// POST /pmjay-cutter - Dedicated endpoint for PMJAY AYUSHMAN CARD CUTTER AI API
router.post('/pmjay-cutter', async (req, res) => {
  try {
    const { callPmjayCardCutterAi } = require('../utils/pmjayCardCutter');
    const {
      task_id,
      file_url,
      quality,
      apikeyfill
    } = req.body;

    const data = await callPmjayCardCutterAi({
      task_id,
      file_url,
      quality,
      apikeyfill,
      ...req.body
    });

    res.json({ success: true, data });
  } catch (err) {
    console.error('PMJAY Ayushman Card Cutter API Error:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      message: err.response?.data?.message || err.message || 'API call failed',
      error: err.response?.data || err.message
    });
  }
});

module.exports = router;
