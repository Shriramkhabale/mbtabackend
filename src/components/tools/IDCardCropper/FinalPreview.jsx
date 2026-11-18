import React, { useState } from 'react';
import { downloadFile, downloadBothSidesAsPdf, downloadBothSidesAsZip } from './cropUtils';

/**
 * FinalPreview component for ID Card Cropper
 * Displays side-by-side previews of Front & Back sides with individual and combined ZIP downloads
 */
const FinalPreview = ({
  frontResult,
  backResult,
  onEditFront,
  onEditBack,
  onReplaceFront,
  onReplaceBack,
  onResetAll,
  theme = 'light'
}) => {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [downloadSuccessMsg, setDownloadSuccessMsg] = useState('');

  const handleDownloadSingle = (dataUrl, sideName) => {
    if (!dataUrl) return;
    const filename = `${sideName.toLowerCase().replace(/\s+/g, '-')}-card.png`;
    downloadFile(dataUrl, filename);
    setDownloadSuccessMsg(`Downloaded ${filename} successfully!`);
    setTimeout(() => setDownloadSuccessMsg(''), 4000);
  };

  const handleDownloadBoth = async () => {
    if (!frontResult?.croppedDataUrl || !backResult?.croppedDataUrl) return;
    setIsGeneratingPdf(true);
    try {
      await downloadBothSidesAsPdf(
        frontResult.croppedDataUrl,
        backResult.croppedDataUrl,
        'id-card-both-sides.pdf'
      );
      setDownloadSuccessMsg('Downloaded id-card-both-sides.pdf successfully!');
      setTimeout(() => setDownloadSuccessMsg(''), 4000);
    } catch (err) {
      console.error('Failed to generate PDF document:', err);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className={`idcrop-final-container theme-${theme}`}>
      <div className="idcrop-final-header">
        <div className="idcrop-success-badge">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>Both Sides Successfully Cropped</span>
        </div>
        <h2 className="idcrop-final-title">Final ID Card Preview</h2>
        <p className="idcrop-final-sub">
          Review your cropped front and back card images. You can edit, download individually, or download both sides in a print-ready A4 PDF.
        </p>
      </div>

      {downloadSuccessMsg && (
        <div className="idcrop-success-banner" role="status">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>{downloadSuccessMsg}</span>
        </div>
      )}

      {/* Side-by-Side Dual Previews */}
      <div className="idcrop-duo-grid">
        {/* Front Card Preview */}
        <div className="idcrop-card-panel">
          <div className="idcrop-panel-titlebar">
            <div className="idcrop-panel-label-group">
              <span className="idcrop-panel-chip">Front Side</span>
              <span className="idcrop-mode-tag">
                {frontResult?.cropMode === 'perspective' ? 'Perspective Adjusted' : 'Straight Cropped'}
              </span>
            </div>
            <div className="idcrop-panel-quick-actions">
              <button
                type="button"
                className="idcrop-quick-btn"
                onClick={onEditFront}
                title="Edit Front Side Crop"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 20h9"></path>
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                </svg>
                <span>Edit Crop</span>
              </button>
              <button
                type="button"
                className="idcrop-quick-btn"
                onClick={onReplaceFront}
                title="Replace Front Image"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                <span>Replace</span>
              </button>
            </div>
          </div>

          <div className="idcrop-card-viewbox">
            {frontResult?.croppedDataUrl ? (
              <img
                src={frontResult.croppedDataUrl}
                alt="Front Side Cropped"
                className="idcrop-result-img"
              />
            ) : (
              <div className="idcrop-empty-state">No front crop available</div>
            )}
          </div>

          <div className="idcrop-panel-footer">
            <button
              type="button"
              className="idcrop-btn-outline idcrop-single-download-btn"
              onClick={() => handleDownloadSingle(frontResult?.croppedDataUrl, 'front-side')}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span>Download Front Side (PNG)</span>
            </button>
          </div>
        </div>

        {/* Back Card Preview */}
        <div className="idcrop-card-panel">
          <div className="idcrop-panel-titlebar">
            <div className="idcrop-panel-label-group">
              <span className="idcrop-panel-chip">Back Side</span>
              <span className="idcrop-mode-tag">
                {backResult?.cropMode === 'perspective' ? 'Perspective Adjusted' : 'Straight Cropped'}
              </span>
            </div>
            <div className="idcrop-panel-quick-actions">
              <button
                type="button"
                className="idcrop-quick-btn"
                onClick={onEditBack}
                title="Edit Back Side Crop"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 20h9"></path>
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                </svg>
                <span>Edit Crop</span>
              </button>
              <button
                type="button"
                className="idcrop-quick-btn"
                onClick={onReplaceBack}
                title="Replace Back Image"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                <span>Replace</span>
              </button>
            </div>
          </div>

          <div className="idcrop-card-viewbox">
            {backResult?.croppedDataUrl ? (
              <img
                src={backResult.croppedDataUrl}
                alt="Back Side Cropped"
                className="idcrop-result-img"
              />
            ) : (
              <div className="idcrop-empty-state">No back crop available</div>
            )}
          </div>

          <div className="idcrop-panel-footer">
            <button
              type="button"
              className="idcrop-btn-outline idcrop-single-download-btn"
              onClick={() => handleDownloadSingle(backResult?.croppedDataUrl, 'back-side')}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span>Download Back Side (PNG)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Combined Download & Finish Bar */}
      <div className="idcrop-final-actions-bar">
        <button
          type="button"
          className="idcrop-btn-secondary"
          onClick={onResetAll}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="1 4 1 10 7 10"></polyline>
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
          </svg>
          <span>Crop Another Card</span>
        </button>

        <button
          type="button"
          className="idcrop-btn-primary idcrop-download-both-btn"
          onClick={handleDownloadBoth}
          disabled={isGeneratingPdf || !frontResult?.croppedDataUrl || !backResult?.croppedDataUrl}
        >
          {isGeneratingPdf ? (
            <>
              <span className="idcrop-spinner"></span>
              <span>Generating Print-Ready PDF...</span>
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
              <span>Download Both Sides (PDF)</span>
              <span className="idcrop-badge-included">Print Ready A4 PDF</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default FinalPreview;

