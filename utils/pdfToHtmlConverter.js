const { PDFParse } = require('pdf-parse');
const { PDFDocument } = require('pdf-lib');
const {
  parseIncomingPdf,
  saveTempOutput
} = require('./toolHelpers');

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Local PDF to HTML Converter
 * Generates clean, responsive HTML5 with per-page layout and print styling
 * without calling any external paid APIs.
 *
 * @param {Object} options
 * @returns {Promise<Object>}
 */
async function callPdfToHtmlAi(options = {}) {
  const {
    file_url,
    fileData,
    password = '',
    pdfPassword = '',
    userId = 'retailer',
    title = 'Converted PDF Document',
    pageRange = 'all',
    theme = 'clean',
    fontSize = 'medium',
    ...rest
  } = options;

  // 1. Obtain and validate PDF buffer locally (decrypting if password-protected)
  const docPassword = password || pdfPassword;
  const pdfBuffer = await parseIncomingPdf(fileData, file_url, docPassword);

  // 2. Parse text and page metadata using PDFParse
  let parsedDoc;
  try {
    const parser = new PDFParse({ data: pdfBuffer });
    parsedDoc = await parser.getText();
    await parser.destroy();
  } catch (err) {
    throw new Error(`Failed to extract text from PDF: ${err.message}`);
  }

  // 3. Inspect page count with pdf-lib
  let pageCount = 1;
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    pageCount = pdfDoc.getPageCount();
  } catch (e) {
    pageCount = parsedDoc?.total || (parsedDoc?.pages?.length || 1);
  }

  let rawPages = Array.isArray(parsedDoc?.pages) ? parsedDoc.pages : [];
  const docTitle = escapeHtml(title || 'Document');

  // Filter pages if pageRange is specified
  if (pageRange === '1' || pageRange === 'first') {
    if (rawPages.length > 0) {
      rawPages = rawPages.slice(0, 1);
    }
  }

  // Determine font and theme styles
  let baseFontSize = '14px';
  let headingFontSize = '17px';
  if (fontSize === 'small') {
    baseFontSize = '12px';
    headingFontSize = '15px';
  } else if (fontSize === 'large') {
    baseFontSize = '16px';
    headingFontSize = '20px';
  }

  let bgColor = '#f1f5f9';
  let cardBg = '#ffffff';
  let textColor = '#0f172a';
  let mutedColor = '#64748b';
  let borderColor = '#e2e8f0';

  if (theme === 'dark') {
    bgColor = '#0f172a';
    cardBg = '#1e293b';
    textColor = '#f8fafc';
    mutedColor = '#94a3b8';
    borderColor = '#334155';
  } else if (theme === 'compact') {
    bgColor = '#f8fafc';
    cardBg = '#ffffff';
    textColor = '#1e293b';
    borderColor = '#cbd5e1';
  }

  // 4. Construct modern semantic HTML5
  const pageHtmlSections = [];

  if (rawPages.length > 0) {
    rawPages.forEach((p, idx) => {
      const pageNum = p.num || (idx + 1);
      const lines = (p.text || '').split('\n');
      const formattedLines = lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed) return '<div class="pdf-line-break"></div>';
        // Headings detection
        if (trimmed.length < 60 && (trimmed === trimmed.toUpperCase() || /^([A-Z0-9\s:.-]{3,50})$/.test(trimmed)) && !trimmed.endsWith('.')) {
          return `<h2 class="pdf-heading">${escapeHtml(trimmed)}</h2>`;
        }
        return `<p class="pdf-para">${escapeHtml(trimmed)}</p>`;
      }).join('\n');

      pageHtmlSections.push(`
        <article class="pdf-page" id="page-${pageNum}" data-page="${pageNum}">
          <header class="pdf-page-header">
            <span class="pdf-page-num">Page ${pageNum} of ${pageCount}</span>
          </header>
          <div class="pdf-page-content">
            ${formattedLines}
          </div>
        </article>
      `);
    });
  } else {
    // Fallback if pages array is not split
    const allText = parsedDoc?.text || 'No readable text content found in document.';
    const lines = allText.split('\n');
    const formattedLines = lines.map(line => `<p class="pdf-para">${escapeHtml(line)}</p>`).join('\n');
    pageHtmlSections.push(`
      <article class="pdf-page" id="page-1" data-page="1">
        <header class="pdf-page-header">
          <span class="pdf-page-num">Page 1 of 1</span>
        </header>
        <div class="pdf-page-content">
          ${formattedLines}
        </div>
      </article>
    `);
  }

  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${docTitle}</title>
  <style>
    :root {
      --bg-color: ${bgColor};
      --card-bg: ${cardBg};
      --text-color: ${textColor};
      --muted-color: ${mutedColor};
      --primary-color: #ea580c;
      --border-color: ${borderColor};
      --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      --base-font-size: ${baseFontSize};
      --heading-font-size: ${headingFontSize};
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg-color);
      color: var(--text-color);
      font-family: var(--font-family);
      line-height: ${theme === 'compact' ? '1.4' : '1.6'};
      padding: ${theme === 'compact' ? '12px 8px' : '24px 16px'};
    }
    .pdf-container {
      max-width: 850px;
      margin: 0 auto;
    }
    .pdf-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: var(--card-bg);
      padding: 12px 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      border: 1px solid var(--border-color);
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }
    .pdf-toolbar h1 {
      font-size: 16px;
      font-weight: 700;
      color: var(--primary-color);
    }
    .pdf-toolbar button {
      background: var(--primary-color);
      color: #fff;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    .pdf-page {
      background: var(--card-bg);
      border-radius: 8px;
      padding: ${theme === 'compact' ? '20px' : '40px'};
      margin-bottom: ${theme === 'compact' ? '14px' : '24px'};
      border: 1px solid var(--border-color);
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
      min-height: 400px;
    }
    .pdf-page-header {
      border-bottom: 1px dashed var(--border-color);
      padding-bottom: 8px;
      margin-bottom: 16px;
      text-align: right;
    }
    .pdf-page-num {
      font-size: 11px;
      color: var(--muted-color);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .pdf-heading {
      font-size: var(--heading-font-size);
      font-weight: 700;
      color: var(--text-color);
      margin: 16px 0 8px 0;
      border-bottom: 2px solid #fdba74;
      display: inline-block;
      padding-bottom: 2px;
    }
    .pdf-para {
      font-size: var(--base-font-size);
      color: var(--text-color);
      margin-bottom: 8px;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .pdf-line-break {
      height: 12px;
    }
    @media print {
      body { background: #fff; padding: 0; }
      .pdf-toolbar { display: none; }
      .pdf-page {
        border: none;
        box-shadow: none;
        padding: 0;
        margin: 0;
        page-break-after: always;
      }
    }
  </style>
</head>
      --text-color: #0f172a;
      --muted-color: #64748b;
      --primary-color: #ea580c;
      --border-color: #e2e8f0;
      --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg-color);
      color: var(--text-color);
      font-family: var(--font-family);
      line-height: 1.6;
      padding: 24px 16px;
    }
    .pdf-container {
      max-width: 850px;
      margin: 0 auto;
    }
    .pdf-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: var(--card-bg);
      padding: 12px 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      border: 1px solid var(--border-color);
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }
    .pdf-toolbar h1 {
      font-size: 16px;
      font-weight: 700;
      color: var(--primary-color);
    }
    .pdf-toolbar button {
      background: var(--primary-color);
      color: #fff;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    .pdf-page {
      background: var(--card-bg);
      border-radius: 8px;
      padding: 40px;
      margin-bottom: 24px;
      border: 1px solid var(--border-color);
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
      min-height: 500px;
    }
    .pdf-page-header {
      border-bottom: 1px dashed var(--border-color);
      padding-bottom: 8px;
      margin-bottom: 20px;
      text-align: right;
    }
    .pdf-page-num {
      font-size: 11px;
      color: var(--muted-color);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .pdf-heading {
      font-size: 17px;
      font-weight: 700;
      color: #1e293b;
      margin: 16px 0 8px 0;
      border-bottom: 2px solid #fdba74;
      display: inline-block;
      padding-bottom: 2px;
    }
    .pdf-para {
      font-size: 14px;
      color: #334155;
      margin-bottom: 8px;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .pdf-line-break {
      height: 12px;
    }
    @media print {
      body { background: #fff; padding: 0; }
      .pdf-toolbar { display: none; }
      .pdf-page {
        border: none;
        box-shadow: none;
        padding: 0;
        margin: 0;
        page-break-after: always;
      }
    }
  </style>
</head>
<body>
  <div class="pdf-container">
    <div class="pdf-toolbar">
      <h1>${docTitle}</h1>
      <button onclick="window.print()">Print / Save as PDF</button>
    </div>
    ${pageHtmlSections.join('\n')}
  </div>
</body>
</html>`;

  // 5. Save HTML output file
  const tempFile = saveTempOutput(Buffer.from(fullHtml, 'utf8'), 'html', 'pdf_to_html', userId);

  return {
    status: 'Success',
    code: 200,
    message: 'PDF converted to HTML successfully.',
    html: fullHtml,
    html_content: fullHtml,
    file_url: tempFile.fileUrl,
    download_url: tempFile.fileUrl,
    output_url: tempFile.fileUrl,
    outputFileName: tempFile.fileName,
    pageCount
  };
}

module.exports = {
  callPdfToHtmlAi
};
