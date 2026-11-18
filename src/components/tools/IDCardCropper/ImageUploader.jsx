import React, { useState, useRef } from 'react';

/**
 * ImageUploader component for ID Card Cropper
 * Handles drag-and-drop and browse upload for Front Side and Back Side
 */
const ImageUploader = ({
  sideName = 'Front Side',
  sideSubtitle = 'Upload the front view of any ID card, passport or card document',
  currentFile,
  currentPreviewUrl,
  onImageSelected,
  onRemoveImage,
  onProceed,
  theme = 'light'
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef(null);

  const SUPPORTED_EXTS = ['jpg', 'jpeg', 'png', 'webp'];
  const MAX_FILE_SIZE_MB = 25;

  const validateAndProcessFile = (file) => {
    setErrorMsg('');
    if (!file) return;

    const name = file.name || '';
    const ext = name.split('.').pop().toLowerCase();

    if (!SUPPORTED_EXTS.includes(ext) && !file.type.startsWith('image/')) {
      setErrorMsg(`Unsupported file type (.${ext}). Please upload JPG, PNG, or WEBP image.`);
      return;
    }

    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setErrorMsg(`Image exceeds maximum size of ${MAX_FILE_SIZE_MB}MB. Please choose a smaller photo.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const testImg = new Image();
      testImg.onload = () => {
        onImageSelected(file, dataUrl);
      };
      testImg.onerror = () => {
        setErrorMsg('The selected image appears corrupted or could not be loaded.');
      };
      testImg.src = dataUrl;
    };
    reader.onerror = () => {
      setErrorMsg('Failed to read image file from your device.');
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      validateAndProcessFile(file);
    }
  };

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndProcessFile(e.target.files[0]);
    }
  };

  return (
    <div className={`idcrop-upload-container theme-${theme}`}>
      <div className="idcrop-upload-header">
        <div className="idcrop-upload-badge">
          <span className="idcrop-badge-dot"></span>
          <span>{sideName} Upload</span>
        </div>
        <h2 className="idcrop-upload-title">{sideName}</h2>
        <p className="idcrop-upload-sub">{sideSubtitle}</p>
      </div>

      {errorMsg && (
        <div className="idcrop-error-banner" role="alert">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span>{errorMsg}</span>
        </div>
      )}

      {!currentPreviewUrl ? (
        <div
          className={`idcrop-dropzone ${isDragOver ? 'drag-active' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current && fileInputRef.current.click()}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileInputChange}
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
          />
          <div className="idcrop-dropzone-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="3" width="18" height="18" rx="3" strokeDasharray="3 3"></rect>
              <circle cx="8.5" cy="8.5" r="1.5"></circle>
              <polyline points="21 15 16 10 5 21"></polyline>
              <path d="M12 8v5m0-5l-2.5 2.5M12 8l2.5 2.5" stroke="#ea580c" strokeWidth="2" strokeLinecap="round"></path>
            </svg>
          </div>
          <div className="idcrop-dropzone-cta">
            <span className="idcrop-cta-primary">Click to Browse</span>
            <span className="idcrop-cta-sep">or</span>
            <span className="idcrop-cta-secondary">Drag and Drop your card image here</span>
          </div>
          <div className="idcrop-dropzone-hints">
            <span className="idcrop-hint-pill">JPG, PNG, WEBP</span>
            <span className="idcrop-hint-pill">Up to 25 MB</span>
            <span className="idcrop-hint-pill">High Resolution Preserved</span>
          </div>
        </div>
      ) : (
        <div className="idcrop-preview-card">
          <div className="idcrop-preview-img-wrapper">
            <img src={currentPreviewUrl} alt={`${sideName} Preview`} className="idcrop-loaded-img" />
            <div className="idcrop-loaded-overlay">
              <span className="idcrop-loaded-badge">Ready for Cropping</span>
            </div>
          </div>

          <div className="idcrop-loaded-meta">
            <div className="idcrop-meta-info">
              <span className="idcrop-file-name" title={currentFile?.name || 'card-image.jpg'}>
                {currentFile?.name || 'Selected Card Image'}
              </span>
              <span className="idcrop-file-size">
                {currentFile?.size ? `${(currentFile.size / 1024).toFixed(1)} KB` : ''}
              </span>
            </div>
            <div className="idcrop-meta-actions">
              <button
                type="button"
                className="idcrop-btn-outline"
                onClick={() => fileInputRef.current && fileInputRef.current.click()}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                <span>Replace Image</span>
              </button>
              <button
                type="button"
                className="idcrop-btn-text-danger"
                onClick={onRemoveImage}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
                <span>Remove</span>
              </button>
            </div>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileInputChange}
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
          />

          <div className="idcrop-proceed-bar">
            <button
              type="button"
              className="idcrop-btn-primary idcrop-proceed-btn"
              onClick={onProceed}
            >
              <span>Proceed to Crop {sideName}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageUploader;

