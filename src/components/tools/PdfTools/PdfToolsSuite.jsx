import React, { useState, useRef, useEffect, useMemo } from 'react';
import { apiFetch } from '../../../utils/apiClient';
import './PdfTools.css';

// ----------------------------------------------------------------------
// 15 Tool Definitions grouped into 4 functional categories
// ----------------------------------------------------------------------
export const PDF_TOOLS_CATALOG = [
  // A. PDF Conversion (1-5)
  {
    id: 'image_to_pdf',
    category: 'conversion',
    title: 'JPG / PNG to PDF',
    badge: 'Conversion',
    icon: '🖼️',
    description: 'Combine one or multiple images (JPG, PNG, WebP) into a crisp, high-quality PDF document.',
    accept: '.jpg,.jpeg,.png,.webp,.bmp',
    multiple: true,
    actionLabel: 'Convert Images to PDF',
    outputExt: '.pdf'
  },
  {
    id: 'pdf_to_images',
    category: 'conversion',
    title: 'PDF to JPG / PNG',
    badge: 'Conversion',
    icon: '📸',
    description: 'Convert every page of your PDF into high-resolution JPG or PNG images (single or ZIP bundle).',
    accept: '.pdf',
    multiple: false,
    actionLabel: 'Extract Images from PDF',
    outputExt: '.zip'
  },
  {
    id: 'word_to_pdf',
    category: 'conversion',
    title: 'Word to PDF',
    badge: 'Conversion',
    icon: '📝',
    description: 'Convert Microsoft Word documents (.docx, .doc) into standard PDF documents with layout preservation.',
    accept: '.docx,.doc',
    multiple: false,
    actionLabel: 'Convert Word to PDF',
    outputExt: '.pdf'
  },
  {
    id: 'pdf_to_word',
    category: 'conversion',
    title: 'PDF to Word (Editable)',
    badge: 'Conversion',
    icon: '📄',
    description: 'Convert PDF documents into editable Microsoft Word (.docx) documents with paragraphs, tables, and images.',
    accept: '.pdf',
    multiple: false,
    actionLabel: 'Convert PDF to Word (.docx)',
    outputExt: '.docx'
  },
  {
    id: 'pdf_to_excel',
    category: 'conversion',
    title: 'PDF to Excel (.xlsx)',
    badge: 'Conversion',
    icon: '📊',
    description: 'Extract tables, statement data, and tabular contents from PDF into formatted Microsoft Excel (.xlsx) spreadsheets.',
    accept: '.pdf',
    multiple: false,
    actionLabel: 'Extract Data to Excel (.xlsx)',
    outputExt: '.xlsx'
  },

  // B. PDF Management (6-12)
  {
    id: 'merge_pdfs',
    category: 'management',
    title: 'Merge PDF Files',
    badge: 'Management',
    icon: '📑',
    description: 'Combine multiple PDF documents into a single document in your customized page and file order.',
    accept: '.pdf',
    multiple: true,
    actionLabel: 'Merge PDF Files',
    outputExt: '.pdf'
  },
  {
    id: 'split_pdf',
    category: 'management',
    title: 'Split PDF Pages',
    badge: 'Management',
    icon: '✂️',
    description: 'Extract custom page ranges or separate all pages into individual PDF files effortlessly.',
    accept: '.pdf',
    multiple: false,
    actionLabel: 'Split PDF',
    outputExt: '.pdf'
  },
  {
    id: 'compress_pdf',
    category: 'management',
    title: 'Compress PDF',
    badge: 'Management',
    icon: '🗜️',
    description: 'Reduce PDF file size while retaining crystal-clear quality using advanced downsampling & deflation.',
    accept: '.pdf',
    multiple: false,
    actionLabel: 'Compress PDF File',
    outputExt: '.pdf'
  },
  {
    id: 'rotate_pdf',
    category: 'management',
    title: 'Rotate PDF Pages',
    badge: 'Management',
    icon: '🔄',
    description: 'Rotate all or specific pages by 90°, 180°, or 270° clockwise with instant orientation preview.',
    accept: '.pdf',
    multiple: false,
    actionLabel: 'Apply Rotation',
    outputExt: '.pdf'
  },
  {
    id: 'reorder_pdf',
    category: 'management',
    title: 'Reorder PDF Pages',
    badge: 'Management',
    icon: '🔀',
    description: 'Visually rearrange PDF pages in any desired sequence with live page preview thumbnails.',
    accept: '.pdf',
    multiple: false,
    actionLabel: 'Apply New Page Order',
    outputExt: '.pdf'
  },
  {
    id: 'delete_pages',
    category: 'management',
    title: 'Delete PDF Pages',
    badge: 'Management',
    icon: '🗑️',
    description: 'Select and remove unwanted pages or ranges from your PDF document in one click.',
    accept: '.pdf',
    multiple: false,
    actionLabel: 'Delete Selected Pages',
    outputExt: '.pdf'
  },
  {
    id: 'add_page_numbers',
    category: 'management',
    title: 'Add Page Numbers',
    badge: 'Management',
    icon: '🔢',
    description: 'Stamp professional page numbering at custom positions (headers, footers, center, or corners).',
    accept: '.pdf',
    multiple: false,
    actionLabel: 'Add Page Numbers to PDF',
    outputExt: '.pdf'
  },

  // C. PDF Security (13-14)
  {
    id: 'protect_pdf',
    category: 'security',
    title: 'Protect PDF (Add Password)',
    badge: 'Security',
    icon: '🔒',
    description: 'Encrypt your confidential PDF files with robust military-grade AES-256 user password protection.',
    accept: '.pdf',
    multiple: false,
    actionLabel: 'Encrypt & Protect PDF',
    outputExt: '.pdf'
  },
  {
    id: 'unlock_pdf',
    category: 'security',
    title: 'Unlock PDF',
    badge: 'Security',
    icon: '🔓',
    description: 'Authorized PDF decryption: enter your valid password to permanently remove password restrictions.',
    accept: '.pdf',
    multiple: false,
    actionLabel: 'Unlock & Decrypt PDF',
    outputExt: '.pdf'
  },

  // D. OCR (15)
  {
    id: 'ocr_searchable_pdf',
    category: 'ocr',
    title: 'Scan Images to Searchable PDF (OCR)',
    badge: 'OCR / AI',
    icon: '🔍',
    description: 'Extract and embed an invisible searchable text layer over scanned documents & photos using OCR.',
    accept: '.jpg,.jpeg,.png,.webp,.pdf',
    multiple: false,
    actionLabel: 'Generate Searchable PDF (OCR)',
    outputExt: '.pdf'
  }
];

export const CATEGORIES = [
  { id: 'all', label: 'All Tools', count: 15 },
  { id: 'conversion', label: 'Conversion', count: 5 },
  { id: 'management', label: 'Management', count: 7 },
  { id: 'security', label: 'Security', count: 2 },
  { id: 'ocr', label: 'OCR', count: 1 }
];

export default function PdfToolsSuite({ tool, onClose, theme = 'light' }) {
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeToolId, setActiveToolId] = useState(null);

  // Sub-Tools Dynamic Configuration from Admin
  const [subToolsConfig, setSubToolsConfig] = useState(tool?.subTools || {});

  useEffect(() => {
    let isMounted = true;
    const fetchConfig = async () => {
      try {
        const res = await apiFetch('/api/pdf-tools/config');
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.success && data.subTools) {
            setSubToolsConfig(data.subTools);
          }
        }
      } catch (err) {
        // Fallback to props tool.subTools
      }
    };
    fetchConfig();
    return () => { isMounted = false; };
  }, [tool]);

  // Merge Catalog with subToolsConfig, filtering out disabled tools
  const effectiveCatalog = useMemo(() => {
    return PDF_TOOLS_CATALOG.map((item) => {
      const custom = subToolsConfig[item.id] || {};
      if (custom.isActive === false) return null;
      return {
        ...item,
        title: custom.title || item.title,
        badge: custom.badge || item.badge,
        fee: custom.fee !== undefined ? parseFloat(custom.fee) || 0 : 0
      };
    }).filter(Boolean);
  }, [subToolsConfig]);

  // Dynamic category tabs with real visible counts
  const effectiveCategories = useMemo(() => {
    return [
      { id: 'all', label: 'All Tools', count: effectiveCatalog.length },
      { id: 'conversion', label: 'Conversion', count: effectiveCatalog.filter(t => t.category === 'conversion').length },
      { id: 'management', label: 'Management', count: effectiveCatalog.filter(t => t.category === 'management').length },
      { id: 'security', label: 'Security', count: effectiveCatalog.filter(t => t.category === 'security').length },
      { id: 'ocr', label: 'OCR', count: effectiveCatalog.filter(t => t.category === 'ocr').length }
    ];
  }, [effectiveCatalog]);

  // Workspace State
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [inspectData, setInspectData] = useState(null);
  const [isInspecting, setIsInspecting] = useState(false);

  // Form options state
  const [options, setOptions] = useState({});

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [resultData, setResultData] = useState(null);

  const fileInputRef = useRef(null);

  const activeTool = effectiveCatalog.find((t) => t.id === activeToolId);

  // Filter tools based on category & search query
  const filteredTools = effectiveCatalog.filter((t) => {
    if (activeCategory !== 'all' && t.category !== activeCategory) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.badge.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // When active tool changes, reset workspace
  const handleSelectTool = (toolId) => {
    setActiveToolId(toolId);
    setUploadedFiles([]);
    setInspectData(null);
    setResultData(null);
    setErrorMessage('');
    setProgress(0);

    // Initial default options per tool
    const initial = {};
    if (toolId === 'image_to_pdf') {
      initial.pageSize = 'fit';
      initial.orientation = 'auto';
      initial.margin = '0';
    } else if (toolId === 'pdf_to_images') {
      initial.format = 'jpg';
      initial.dpi = 150;
      initial.pages = 'all';
    } else if (toolId === 'split_pdf') {
      initial.mode = 'range';
      initial.range = '1-2';
      initial.chunkSize = 1;
    } else if (toolId === 'compress_pdf') {
      initial.level = 'recommended';
    } else if (toolId === 'rotate_pdf') {
      initial.angle = 90;
      initial.pages = 'all';
    } else if (toolId === 'add_page_numbers') {
      initial.position = 'bottom-center';
      initial.format = 'Page {n} of {total}';
      initial.startPage = 1;
      initial.fontSize = 10;
      initial.margin = 30;
    } else if (toolId === 'protect_pdf') {
      initial.password = '';
      initial.confirmPassword = '';
    } else if (toolId === 'unlock_pdf') {
      initial.password = '';
    } else if (toolId === 'ocr_searchable_pdf') {
      initial.language = 'eng';
    } else if (toolId === 'reorder_pdf') {
      initial.order = [];
    } else if (toolId === 'delete_pages') {
      initial.pages = [];
    }
    setOptions(initial);
  };

  // Inspect PDF for thumbnail previews & metadata
  const inspectPdfFile = async (file) => {
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) return;
    setIsInspecting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiFetch('/api/pdf-tools/inspect', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success && data.data) {
        setInspectData(data.data);
        // Pre-fill reorder order array
        if (data.data.pageCount) {
          const defaultOrder = Array.from({ length: data.data.pageCount }, (_, i) => i + 1);
          setOptions((prev) => ({ ...prev, order: defaultOrder }));
        }
      }
    } catch (err) {
      console.warn('PDF inspect notice:', err.message);
    } finally {
      setIsInspecting(false);
    }
  };

  // File Upload Handlers
  const handleFilesAdded = (filesList) => {
    const arr = Array.from(filesList);
    if (!arr.length) return;

    if (!activeTool?.multiple) {
      const file = arr[0];
      setUploadedFiles([file]);
      if (['reorder_pdf', 'delete_pages', 'rotate_pdf', 'split_pdf'].includes(activeToolId)) {
        inspectPdfFile(file);
      }
    } else {
      setUploadedFiles((prev) => [...prev, ...arr]);
    }
    setErrorMessage('');
    setResultData(null);
  };

  const handleRemoveFile = (index) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
    if (uploadedFiles.length <= 1) {
      setInspectData(null);
    }
  };

  const handleMoveFile = (index, dir) => {
    setUploadedFiles((prev) => {
      const copy = [...prev];
      const target = index + dir;
      if (target < 0 || target >= copy.length) return prev;
      const tmp = copy[index];
      copy[index] = copy[target];
      copy[target] = tmp;
      return copy;
    });
  };

  // Drag and drop events
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };
  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length) {
      handleFilesAdded(e.dataTransfer.files);
    }
  };

  // Format file size
  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Reorder page move handler
  const handleMovePage = (index, dir) => {
    const curOrder = options.order || [];
    const target = index + dir;
    if (target < 0 || target >= curOrder.length) return;
    const copy = [...curOrder];
    const tmp = copy[index];
    copy[index] = copy[target];
    copy[target] = tmp;
    setOptions((prev) => ({ ...prev, order: copy }));
  };

  // Toggle page for deletion
  const handleToggleDeletePage = (pageNum) => {
    const cur = options.pages || [];
    if (cur.includes(pageNum)) {
      setOptions((prev) => ({ ...prev, pages: cur.filter((p) => p !== pageNum) }));
    } else {
      if (inspectData?.pageCount && cur.length >= inspectData.pageCount - 1) {
        setErrorMessage('At least 1 page must remain in the document.');
        return;
      }
      setOptions((prev) => ({ ...prev, pages: [...cur, pageNum].sort((a, b) => a - b) }));
    }
  };

  // Submit & Process
  const handleProcess = async () => {
    if (!uploadedFiles.length) {
      setErrorMessage('Please upload a file before processing.');
      return;
    }

    if (activeToolId === 'merge_pdfs' && uploadedFiles.length < 2) {
      setErrorMessage('Please upload at least 2 PDF files to merge.');
      return;
    }

    if (activeToolId === 'protect_pdf') {
      if (!options.password || !options.password.trim()) {
        setErrorMessage('Password is required to protect the PDF.');
        return;
      }
      if (options.password !== options.confirmPassword) {
        setErrorMessage('Passwords do not match. Please verify your password confirmation.');
        return;
      }
    }

    if (activeToolId === 'unlock_pdf') {
      if (!options.password || !options.password.trim()) {
        setErrorMessage('Password is required to unlock this PDF. Only authorized access with a valid password is supported.');
        return;
      }
    }

    if (activeToolId === 'delete_pages') {
      if (!options.pages || options.pages.length === 0) {
        setErrorMessage('Please select at least one page to delete.');
        return;
      }
      if (inspectData?.pageCount && options.pages.length >= inspectData.pageCount) {
        setErrorMessage('Cannot delete all pages. At least 1 page must remain.');
        return;
      }
    }

    setIsProcessing(true);
    setProgress(15);
    setStatusMessage('Uploading files to local processing engine...');
    setErrorMessage('');

    // Simulated progress tick
    const pTimer = setInterval(() => {
      setProgress((prev) => {
        if (prev < 85) return prev + 12;
        return prev;
      });
    }, 280);

    try {
      const formData = new FormData();
      uploadedFiles.forEach((file) => {
        formData.append('files', file);
      });
      formData.append('operation', activeToolId);
      formData.append('options', JSON.stringify(options));
      formData.append('download', 'true');

      // Determine client download file name
      const primaryName = uploadedFiles[0]?.name ? uploadedFiles[0].name.replace(/\.[^/.]+$/, '') : 'document';
      let outName = `${primaryName}_processed${activeTool.outputExt || '.pdf'}`;
      if (activeToolId === 'image_to_pdf') outName = `${primaryName}_combined.pdf`;
      if (activeToolId === 'pdf_to_images') outName = `${primaryName}_images.zip`;
      if (activeToolId === 'pdf_to_word') outName = `${primaryName}_converted.docx`;
      if (activeToolId === 'pdf_to_excel') outName = `${primaryName}_data.xlsx`;
      if (activeToolId === 'merge_pdfs') outName = `merged_document_${uploadedFiles.length}_files.pdf`;
      if (activeToolId === 'compress_pdf') outName = `${primaryName}_compressed.pdf`;
      if (activeToolId === 'protect_pdf') outName = `${primaryName}_protected.pdf`;
      if (activeToolId === 'unlock_pdf') outName = `${primaryName}_unlocked.pdf`;
      if (activeToolId === 'ocr_searchable_pdf') outName = `${primaryName}_searchable_ocr.pdf`;

      formData.append('outputName', outName);

      const sessionToken = sessionStorage.getItem('sessionToken') || localStorage.getItem('sessionToken');
      const currentUserId = localStorage.getItem('currentUser') || sessionStorage.getItem('currentUser');
      if (currentUserId) {
        formData.append('userId', currentUserId);
      }
      const headers = {};
      if (sessionToken) {
        headers['Authorization'] = `Bearer ${sessionToken}`;
      }

      setStatusMessage('Executing operation locally...');

      const response = await apiFetch('/api/pdf-tools/process', {
        method: 'POST',
        headers,
        body: formData
      });

      clearInterval(pTimer);

      if (!response.ok) {
        let errText = 'Operation failed';
        try {
          const errJson = await response.json();
          errText = errJson.error || errText;
        } catch (e) {
          errText = `HTTP Error ${response.status}: ${response.statusText}`;
        }
        throw new Error(errText);
      }

      const feeDeducted = response.headers.get('x-fee-deducted');
      const newWalletBal = response.headers.get('x-wallet-balance');
      if (feeDeducted || newWalletBal) {
        window.dispatchEvent(new Event('walletUpdated'));
      }

      setProgress(100);
      setStatusMessage('File generated successfully! Downloading...');

      // Convert response to Blob and trigger direct browser download
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = outName;
      document.body.appendChild(a);
      a.click();
      a.remove();

      setResultData({
        fileName: outName,
        fileSize: blob.size,
        downloadUrl,
        blob
      });
    } catch (err) {
      clearInterval(pTimer);
      setErrorMessage(err.message || 'Processing failed. Please check inputs and retry.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadAgain = () => {
    if (!resultData?.downloadUrl) return;
    const a = document.createElement('a');
    a.href = resultData.downloadUrl;
    a.download = resultData.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleResetWorkspace = () => {
    setUploadedFiles([]);
    setInspectData(null);
    setResultData(null);
    setErrorMessage('');
    setProgress(0);
  };

  return (
    <div className={`pdf-tools-container theme-${theme}`}>
      {/* Header */}
      <div className="pdf-tools-header">
        <div className="pdf-tools-title-group">
          <div className="pdf-tools-logo-badge">📄</div>
          <div className="pdf-tools-title-text">
            <h2>PDF TOOLS — ALL IN ONE SUITE</h2>
            <p>15 professional PDF conversion, editing, security, management & OCR tools in one interface</p>
          </div>
        </div>
        <div className="pdf-tools-header-actions">
          {activeToolId && (
            <button className="pdf-tools-back-btn" onClick={() => setActiveToolId(null)}>
              ← All PDF Tools
            </button>
          )}
          {onClose && (
            <button className="pdf-tools-back-btn" onClick={onClose}>
              Back to Dashboard ✕
            </button>
          )}
        </div>
      </div>

      {/* Main Content: Mode A = Tool Selector Grid, Mode B = Active Workspace */}
      {!activeToolId ? (
        <>
          {/* Category Filter Nav */}
          <div className="pdf-tools-category-nav">
            {effectiveCategories.map((cat) => (
              <button
                key={cat.id}
                className={`pdf-category-tab ${activeCategory === cat.id ? 'active' : ''}`}
                onClick={() => setActiveCategory(cat.id)}
              >
                {cat.label}
                <span className="tab-count">{cat.count}</span>
              </button>
            ))}
          </div>

          {/* Search Bar */}
          <div className="pdf-tools-search-wrap">
            <span className="pdf-tools-search-icon">🔍</span>
            <input
              type="text"
              className="pdf-tools-search-input"
              placeholder="Search PDF tools (e.g., compress, word to pdf, excel, merge, password, ocr)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Feature Cards Grid */}
          {filteredTools.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', background: '#ffffff', borderRadius: '14px', border: '1px dashed #cbd5e1', margin: '20px 0' }}>
              <span style={{ fontSize: '32px' }}>📑</span>
              <h4 style={{ margin: '8px 0 4px 0', color: '#0f172a' }}>No PDF Tools Found</h4>
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                No active tools match the current search or category filter.
              </p>
            </div>
          ) : (
            <div className="pdf-features-grid">
              {filteredTools.map((item) => (
                <div
                  key={item.id}
                  className="pdf-feature-card"
                  onClick={() => handleSelectTool(item.id)}
                >
                  <div className="pdf-card-top">
                    <div className="pdf-feature-icon">{item.icon}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className={`pdf-feature-badge ${item.category}`}>{item.badge}</span>
                      {item.fee > 0 ? (
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: '#fef3c7',
                          color: '#b45309',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
                        }}>
                          ₹{item.fee}
                        </span>
                      ) : (
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: '#dcfce7',
                          color: '#15803d'
                        }}>
                          FREE
                        </span>
                      )}
                    </div>
                  </div>
                  <h4 className="pdf-feature-name">{item.title}</h4>
                  <p className="pdf-feature-desc">{item.description}</p>
                  <div className="pdf-card-action-hint">
                    Use Tool <span>→</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        /* Workspace Active Tool Panel */
        <div className="pdf-workspace-card">
          {/* Workspace Tool Header */}
          <div className="pdf-workspace-header">
            <div className="pdf-workspace-info">
              <div className="pdf-workspace-icon">{activeTool?.icon}</div>
              <div className="pdf-workspace-titles">
                <h3>{activeTool?.title}</h3>
                <p>{activeTool?.description}</p>
              </div>
            </div>
            <button className="pdf-change-tool-btn" onClick={() => setActiveToolId(null)}>
              Switch Tool
            </button>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="pdf-error-banner">
              <span className="pdf-error-icon">⚠️</span>
              <div>
                <strong>Notice:</strong> {errorMessage}
              </div>
            </div>
          )}

          {/* Body: Left = File Upload, Right = Options */}
          <div className="pdf-workspace-body">
            {/* Left Column: Upload */}
            <div className="pdf-upload-section">
              <h4 className="pdf-section-title">
                <span className="pdf-step-num">1</span>
                Upload {activeTool?.multiple ? 'Files' : 'File'}
              </h4>

              <div
                className={`pdf-dropzone ${isDragOver ? 'dragover' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={activeTool?.accept}
                  multiple={activeTool?.multiple}
                  style={{ display: 'none' }}
                  onChange={(e) => handleFilesAdded(e.target.files)}
                />
                <div className="pdf-dropzone-icon">{activeTool?.icon}</div>
                <div className="pdf-dropzone-text">
                  Drag & Drop {activeTool?.multiple ? 'files' : 'file'} here
                </div>
                <div className="pdf-dropzone-hint">
                  Supported formats: {activeTool?.accept.replace(/,/g, ', ')} (up to 50MB)
                </div>
                <button
                  type="button"
                  className="pdf-browse-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                >
                  Browse from Device
                </button>
              </div>

              {/* Uploaded File List */}
              {uploadedFiles.length > 0 && (
                <div className="pdf-file-list">
                  {uploadedFiles.map((f, idx) => (
                    <div key={idx} className="pdf-file-item">
                      <div className="pdf-file-info">
                        <span className="pdf-file-icon">📄</span>
                        <div className="pdf-file-details">
                          <div className="pdf-file-name">{f.name}</div>
                          <div className="pdf-file-size">{formatBytes(f.size)}</div>
                        </div>
                      </div>
                      <div className="pdf-file-actions">
                        {activeToolId === 'merge_pdfs' && (
                          <>
                            <button
                              className="pdf-btn-icon"
                              title="Move Up"
                              disabled={idx === 0}
                              onClick={() => handleMoveFile(idx, -1)}
                            >
                              ⬆️
                            </button>
                            <button
                              className="pdf-btn-icon"
                              title="Move Down"
                              disabled={idx === uploadedFiles.length - 1}
                              onClick={() => handleMoveFile(idx, 1)}
                            >
                              ⬇️
                            </button>
                          </>
                        )}
                        <button
                          className="pdf-btn-icon"
                          title="Remove file"
                          onClick={() => handleRemoveFile(idx)}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right Column: Dynamic Tool Settings */}
            <div className="pdf-settings-section">
              <h4 className="pdf-section-title">
                <span className="pdf-step-num">2</span>
                Configure Settings
              </h4>

              <div className="pdf-settings-panel">
                {/* 1. JPG / PNG to PDF */}
                {activeToolId === 'image_to_pdf' && (
                  <>
                    <div className="pdf-form-group">
                      <label className="pdf-form-label">Page Size</label>
                      <div className="pdf-preset-grid">
                        {['fit', 'a4', 'letter'].map((sz) => (
                          <button
                            key={sz}
                            type="button"
                            className={`pdf-preset-btn ${options.pageSize === sz ? 'active' : ''}`}
                            onClick={() => setOptions({ ...options, pageSize: sz })}
                          >
                            {sz === 'fit' ? 'Fit Image' : sz.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="pdf-form-group">
                      <label className="pdf-form-label">Orientation</label>
                      <div className="pdf-preset-grid">
                        {['auto', 'portrait', 'landscape'].map((or) => (
                          <button
                            key={or}
                            type="button"
                            className={`pdf-preset-btn ${options.orientation === or ? 'active' : ''}`}
                            onClick={() => setOptions({ ...options, orientation: or })}
                          >
                            {or.charAt(0).toUpperCase() + or.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="pdf-form-group">
                      <label className="pdf-form-label">Page Margin</label>
                      <select
                        className="pdf-form-select"
                        value={options.margin}
                        onChange={(e) => setOptions({ ...options, margin: e.target.value })}
                      >
                        <option value="0">No Margin (0 px)</option>
                        <option value="15">Small Margin (15 px)</option>
                        <option value="30">Standard Margin (30 px)</option>
                      </select>
                    </div>
                  </>
                )}

                {/* 2. PDF to Images */}
                {activeToolId === 'pdf_to_images' && (
                  <>
                    <div className="pdf-form-group">
                      <label className="pdf-form-label">Image Format</label>
                      <div className="pdf-preset-grid">
                        {['jpg', 'png'].map((fmt) => (
                          <button
                            key={fmt}
                            type="button"
                            className={`pdf-preset-btn ${options.format === fmt ? 'active' : ''}`}
                            onClick={() => setOptions({ ...options, format: fmt })}
                          >
                            {fmt.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="pdf-form-group">
                      <label className="pdf-form-label">Resolution / Quality</label>
                      <div className="pdf-preset-grid">
                        {[
                          { val: 150, lbl: 'Standard (150 DPI)' },
                          { val: 300, lbl: 'High (300 DPI)' }
                        ].map((q) => (
                          <button
                            key={q.val}
                            type="button"
                            className={`pdf-preset-btn ${options.dpi === q.val ? 'active' : ''}`}
                            onClick={() => setOptions({ ...options, dpi: q.val })}
                          >
                            {q.lbl}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="pdf-form-group">
                      <label className="pdf-form-label">Pages to Extract</label>
                      <input
                        type="text"
                        className="pdf-form-input"
                        placeholder="e.g. all or 1, 2-3"
                        value={options.pages}
                        onChange={(e) => setOptions({ ...options, pages: e.target.value })}
                      />
                      <span className="pdf-form-hint">Type 'all' or specific pages like '1, 3-5'.</span>
                    </div>
                  </>
                )}

                {/* 3. Word to PDF */}
                {activeToolId === 'word_to_pdf' && (
                  <div className="pdf-form-group">
                    <p className="pdf-form-hint">
                      Converts Microsoft Word (.docx or .doc) into high-fidelity PDF documents. Font styles, tables, headings, and margins are preserved cleanly.
                    </p>
                  </div>
                )}

                {/* 4. PDF to Word */}
                {activeToolId === 'pdf_to_word' && (
                  <div className="pdf-form-group">
                    <label className="pdf-form-label">Page Range</label>
                    <input
                      type="text"
                      className="pdf-form-input"
                      placeholder="e.g. all or 1-5"
                      value={options.pages || 'all'}
                      onChange={(e) => setOptions({ ...options, pages: e.target.value })}
                    />
                    <span className="pdf-form-hint">Converts PDF into a fully editable Microsoft Word (.docx) document.</span>
                  </div>
                )}

                {/* 5. PDF to Excel */}
                {activeToolId === 'pdf_to_excel' && (
                  <div className="pdf-form-group">
                    <p className="pdf-form-hint">
                      Scans the PDF document, detects table grids, rows and cells, and outputs a formatted Microsoft Excel spreadsheet (.xlsx).
                    </p>
                  </div>
                )}

                {/* 6. Merge PDFs */}
                {activeToolId === 'merge_pdfs' && (
                  <div className="pdf-form-group">
                    <p className="pdf-form-hint">
                      Combine 2 or more PDF documents. Use the up and down arrow buttons in the file list on the left to set the exact merge order.
                    </p>
                  </div>
                )}

                {/* 7. Split PDF */}
                {activeToolId === 'split_pdf' && (
                  <>
                    <div className="pdf-form-group">
                      <label className="pdf-form-label">Split Mode</label>
                      <div className="pdf-preset-grid">
                        {[
                          { id: 'range', lbl: 'Custom Range' },
                          { id: 'all', lbl: 'All Pages (ZIP)' },
                          { id: 'every_n', lbl: 'Every N Pages' }
                        ].map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            className={`pdf-preset-btn ${options.mode === m.id ? 'active' : ''}`}
                            onClick={() => setOptions({ ...options, mode: m.id })}
                          >
                            {m.lbl}
                          </button>
                        ))}
                      </div>
                    </div>
                    {options.mode === 'range' && (
                      <div className="pdf-form-group">
                        <label className="pdf-form-label">Page Range Expression</label>
                        <input
                          type="text"
                          className="pdf-form-input"
                          placeholder="e.g. 1-3, 5"
                          value={options.range || ''}
                          onChange={(e) => setOptions({ ...options, range: e.target.value })}
                        />
                      </div>
                    )}
                    {options.mode === 'every_n' && (
                      <div className="pdf-form-group">
                        <label className="pdf-form-label">Chunk Size (Pages per split)</label>
                        <input
                          type="number"
                          min="1"
                          className="pdf-form-input"
                          value={options.chunkSize || 1}
                          onChange={(e) => setOptions({ ...options, chunkSize: e.target.value })}
                        />
                      </div>
                    )}
                  </>
                )}

                {/* 8. Compress PDF */}
                {activeToolId === 'compress_pdf' && (
                  <div className="pdf-form-group">
                    <label className="pdf-form-label">Compression Level</label>
                    <div className="pdf-preset-grid">
                      {[
                        { id: 'extreme', lbl: 'Extreme (Smallest)' },
                        { id: 'recommended', lbl: 'Recommended (Balanced)' },
                        { id: 'low', lbl: 'Low (Highest Quality)' }
                      ].map((lvl) => (
                        <button
                          key={lvl.id}
                          type="button"
                          className={`pdf-preset-btn ${options.level === lvl.id ? 'active' : ''}`}
                          onClick={() => setOptions({ ...options, level: lvl.id })}
                        >
                          {lvl.lbl}
                        </button>
                      ))}
                    </div>
                    <span className="pdf-form-hint">
                      Optimizes images, streams, and removes duplicate font/color dictionaries.
                    </span>
                  </div>
                )}

                {/* 9. Rotate PDF */}
                {activeToolId === 'rotate_pdf' && (
                  <>
                    <div className="pdf-form-group">
                      <label className="pdf-form-label">Rotation Angle</label>
                      <div className="pdf-preset-grid">
                        {[
                          { val: 90, lbl: '90° Clockwise' },
                          { val: 180, lbl: '180° Flip' },
                          { val: 270, lbl: '270° Counter-CW' }
                        ].map((deg) => (
                          <button
                            key={deg.val}
                            type="button"
                            className={`pdf-preset-btn ${options.angle === deg.val ? 'active' : ''}`}
                            onClick={() => setOptions({ ...options, angle: deg.val })}
                          >
                            {deg.lbl}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="pdf-form-group">
                      <label className="pdf-form-label">Apply To Pages</label>
                      <input
                        type="text"
                        className="pdf-form-input"
                        placeholder="e.g. all or 1, 3-5"
                        value={options.pages || 'all'}
                        onChange={(e) => setOptions({ ...options, pages: e.target.value })}
                      />
                    </div>
                  </>
                )}

                {/* 10. Reorder PDF */}
                {activeToolId === 'reorder_pdf' && (
                  <div className="pdf-form-group">
                    <label className="pdf-form-label">
                      Page Sequence ({inspectData?.pageCount || 0} Pages)
                    </label>
                    {isInspecting ? (
                      <p className="pdf-form-hint">Generating visual page previews...</p>
                    ) : inspectData?.pages?.length ? (
                      <div className="pdf-pages-visual-grid">
                        {(options.order || []).map((pageNum, idx) => {
                          const pInfo = inspectData.pages.find((p) => p.page === pageNum);
                          return (
                            <div key={idx} className="pdf-page-thumb-card">
                              {pInfo?.thumbnail ? (
                                <img
                                  src={pInfo.thumbnail}
                                  alt={`Page ${pageNum}`}
                                  className="pdf-page-thumb-img"
                                />
                              ) : (
                                <div className="pdf-page-thumb-img">📄</div>
                              )}
                              <span className="pdf-page-number-label">Page {pageNum}</span>
                              <div style={{ display: 'flex', gap: '2px', marginTop: '4px' }}>
                                <button
                                  type="button"
                                  disabled={idx === 0}
                                  onClick={() => handleMovePage(idx, -1)}
                                  style={{ cursor: 'pointer', border: 'none', background: '#e2e8f0', borderRadius: '4px' }}
                                >
                                  ◀
                                </button>
                                <button
                                  type="button"
                                  disabled={idx === (options.order || []).length - 1}
                                  onClick={() => handleMovePage(idx, 1)}
                                  style={{ cursor: 'pointer', border: 'none', background: '#e2e8f0', borderRadius: '4px' }}
                                >
                                  ▶
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="pdf-form-hint">Upload a PDF to view and reorder pages.</span>
                    )}
                  </div>
                )}

                {/* 11. Delete PDF Pages */}
                {activeToolId === 'delete_pages' && (
                  <div className="pdf-form-group">
                    <label className="pdf-form-label">Click Pages to Delete</label>
                    {isInspecting ? (
                      <p className="pdf-form-hint">Loading page thumbnails...</p>
                    ) : inspectData?.pages?.length ? (
                      <div className="pdf-pages-visual-grid">
                        {inspectData.pages.map((p) => {
                          const isDel = (options.pages || []).includes(p.page);
                          return (
                            <div
                              key={p.page}
                              className={`pdf-page-thumb-card ${isDel ? 'deleted' : ''}`}
                              onClick={() => handleToggleDeletePage(p.page)}
                              title={isDel ? 'Click to restore' : 'Click to delete'}
                            >
                              {p.thumbnail ? (
                                <img
                                  src={p.thumbnail}
                                  alt={`Page ${p.page}`}
                                  className="pdf-page-thumb-img"
                                />
                              ) : (
                                <div className="pdf-page-thumb-img">📄</div>
                              )}
                              <span className="pdf-page-number-label">Page {p.page}</span>
                              {isDel && <span className="pdf-thumb-overlay-badge">✕ Delete</span>}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="pdf-form-hint">Upload a PDF to select pages to delete.</span>
                    )}
                  </div>
                )}

                {/* 12. Add Page Numbers */}
                {activeToolId === 'add_page_numbers' && (
                  <>
                    <div className="pdf-form-group">
                      <label className="pdf-form-label">Position</label>
                      <select
                        className="pdf-form-select"
                        value={options.position}
                        onChange={(e) => setOptions({ ...options, position: e.target.value })}
                      >
                        <option value="bottom-center">Bottom Center</option>
                        <option value="bottom-right">Bottom Right</option>
                        <option value="bottom-left">Bottom Left</option>
                        <option value="top-center">Top Center</option>
                        <option value="top-right">Top Right</option>
                        <option value="top-left">Top Left</option>
                      </select>
                    </div>
                    <div className="pdf-form-group">
                      <label className="pdf-form-label">Numbering Format</label>
                      <select
                        className="pdf-form-select"
                        value={options.format}
                        onChange={(e) => setOptions({ ...options, format: e.target.value })}
                      >
                        <option value="Page {n} of {total}">Page 1 of 10</option>
                        <option value="{n} / {total}">1 / 10</option>
                        <option value="Page {n}">Page 1</option>
                        <option value="{n}">1 (Bare number)</option>
                      </select>
                    </div>
                    <div className="pdf-form-group">
                      <label className="pdf-form-label">Start Numbering on Page</label>
                      <input
                        type="number"
                        min="1"
                        className="pdf-form-input"
                        value={options.startPage || 1}
                        onChange={(e) => setOptions({ ...options, startPage: e.target.value })}
                      />
                    </div>
                  </>
                )}

                {/* 13. Protect PDF */}
                {activeToolId === 'protect_pdf' && (
                  <>
                    <div className="pdf-form-group">
                      <label className="pdf-form-label">Enter Password</label>
                      <input
                        type="password"
                        className="pdf-form-input"
                        placeholder="Choose a strong password..."
                        value={options.password || ''}
                        onChange={(e) => setOptions({ ...options, password: e.target.value })}
                      />
                    </div>
                    <div className="pdf-form-group">
                      <label className="pdf-form-label">Confirm Password</label>
                      <input
                        type="password"
                        className="pdf-form-input"
                        placeholder="Re-enter password..."
                        value={options.confirmPassword || ''}
                        onChange={(e) => setOptions({ ...options, confirmPassword: e.target.value })}
                      />
                    </div>
                    <span className="pdf-form-hint">
                      Uses AES-256 military-grade encryption to safeguard your sensitive documents.
                    </span>
                  </>
                )}

                {/* 14. Unlock PDF */}
                {activeToolId === 'unlock_pdf' && (
                  <div className="pdf-form-group">
                    <label className="pdf-form-label">Document Password</label>
                    <input
                      type="password"
                      className="pdf-form-input"
                      placeholder="Enter the valid PDF password..."
                      value={options.password || ''}
                      onChange={(e) => setOptions({ ...options, password: e.target.value })}
                    />
                    <span className="pdf-form-hint">
                      Authorized decryption: Provide the correct password to unlock and permanently decrypt the document.
                    </span>
                  </div>
                )}

                {/* 15. OCR Searchable PDF */}
                {activeToolId === 'ocr_searchable_pdf' && (
                  <div className="pdf-form-group">
                    <label className="pdf-form-label">OCR Recognition Language</label>
                    <select
                      className="pdf-form-select"
                      value={options.language}
                      onChange={(e) => setOptions({ ...options, language: e.target.value })}
                    >
                      <option value="eng">English (eng)</option>
                      <option value="hin">Hindi (hin)</option>
                      <option value="eng+hin">English + Hindi (eng+hin)</option>
                    </select>
                    <span className="pdf-form-hint">
                      Scans the text inside the image or document and places a selectable, searchable text layer aligned with the visuals.
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Action & Result Section */}
          <div className="pdf-action-footer">
            {/* Progress bar during execution */}
            {isProcessing && (
              <div className="pdf-progress-wrap">
                <div className="pdf-progress-header">
                  <span>{statusMessage}</span>
                  <span>{progress}%</span>
                </div>
                <div className="pdf-progress-bar-bg">
                  <div className="pdf-progress-fill" style={{ width: `${progress}%` }}></div>
                </div>
              </div>
            )}

            {/* Success result card */}
            {resultData && !isProcessing && (
              <div className="pdf-result-card">
                <div className="pdf-result-icon">✓</div>
                <h4 className="pdf-result-title">Operation Completed Successfully!</h4>
                <p className="pdf-result-desc">
                  Generated: <strong>{resultData.fileName}</strong> ({formatBytes(resultData.fileSize)})
                </p>
                <div className="pdf-result-actions">
                  <button className="pdf-download-btn" onClick={handleDownloadAgain}>
                    📥 Download Again
                  </button>
                  <button className="pdf-reset-btn" onClick={handleResetWorkspace}>
                    Process Another File
                  </button>
                </div>
              </div>
            )}

            {/* Primary Process Button */}
            {!resultData && (
              <button
                className="pdf-process-btn"
                disabled={isProcessing || !uploadedFiles.length}
                onClick={handleProcess}
              >
                {isProcessing
                  ? 'Processing... Please wait'
                  : `⚡ ${activeTool?.actionLabel || 'Process PDF'}${activeTool?.fee > 0 ? ` • ₹${activeTool.fee}` : ''}`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

