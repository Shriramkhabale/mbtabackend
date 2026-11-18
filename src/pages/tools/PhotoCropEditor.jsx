import React, { useState, useEffect, useRef, useCallback } from 'react';

/**
 * MB Mitra — "Crop & Adjust Candidate Photo" Modal
 * Exactly matching the UI layout, controls, styling, and interactions:
 * - Header: Icon badge, "Crop & Adjust Candidate Photo", subtitle, close (X)
 * - Presets: Square (1:1), Passport (3:4), Landscape (active pink pill)
 * - Stage: Dark viewport, dashed crop rectangle, 4 pink corner brackets
 * - Alignment: 3x3 grid, oval/circle face & eye-level guide, "+ Drag to align" pill badge
 * - Toolbar: Zoom slider with icon, [#] Grid toggle, ↻ Rotate (90°), ↺ Reset
 * - Footer: ↺ Retake Photo, Cancel, ✓ Crop & Use Photo (pink pill button)
 */
const PhotoCropEditor = ({
  imageSrc,
  onConfirm,
  onCancel,
  onRetakePhoto,
  theme = 'light'
}) => {
  // Presets: 'square' (1:1) | 'passport' (3:4) | 'landscape' (4:3)
  const [aspectMode, setAspectMode] = useState('passport');

  // Transformation states
  const [zoom, setZoom] = useState(1.0); // 1.0 to 3.0
  const [rotation, setRotation] = useState(0); // 0, 90, 180, 270
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState(true);

  // Crop box in percentages relative to stage container: { x, y, width, height }
  const [cropBox, setCropBox] = useState({ x: 20, y: 10, width: 60, height: 80 });

  // Natural image dimensions
  const [naturalDimensions, setNaturalDimensions] = useState({ width: 0, height: 0 });

  // Stage & Image references
  const stageRef = useRef(null);
  const imageRef = useRef(null);
  const fileInputRef = useRef(null);

  // Dragging state references
  const isDraggingRef = useRef(false);
  const dragModeRef = useRef(null); // 'move' | 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's' | 'e' | 'w'
  const dragStartRef = useRef({ x: 0, y: 0, crop: null, pan: null });

  // Ratio getter based on active preset
  const getAspectRatio = useCallback(() => {
    if (aspectMode === 'square') return 1.0;
    if (aspectMode === 'passport') return 3.0 / 4.0; // 0.75 (standard 3:4 portrait)
    if (aspectMode === 'landscape') return 4.0 / 3.0; // 1.333
    return 3.0 / 4.0;
  }, [aspectMode]);

  // Recenter and re-apply aspect ratio to crop box
  const applyPresetRatio = useCallback((ratio) => {
    if (!stageRef.current) return;
    const stage = stageRef.current.getBoundingClientRect();
    const stageRatio = stage.width / (stage.height || 1);

    // If stage not yet painted (zero size), retry after next animation frame
    if (!stageRatio || stage.width < 10) {
      requestAnimationFrame(() => {
        if (!stageRef.current) return;
        const s2 = stageRef.current.getBoundingClientRect();
        const sr2 = s2.width / (s2.height || 1);
        if (!sr2 || s2.width < 10) return;
        setCropBox(() => {
          let boxH = 75;
          let boxW = (boxH * ratio) / sr2;
          if (boxW > 85) { boxW = 85; boxH = (boxW / ratio) * sr2; }
          const x = Math.max(5, (100 - boxW) / 2);
          const y = Math.max(5, (100 - boxH) / 2);
          return {
            x: Math.round(x * 10) / 10,
            y: Math.round(y * 10) / 10,
            width: Math.round(boxW * 10) / 10,
            height: Math.round(boxH * 10) / 10
          };
        });
      });
      return;
    }

    setCropBox(() => {
      // Fit a crop box of this ratio inside the stage
      let boxH = 75; // 75% height
      let boxW = (boxH * ratio) / stageRatio;

      if (boxW > 85) {
        boxW = 85;
        boxH = (boxW / ratio) * stageRatio;
      }

      const x = Math.max(5, (100 - boxW) / 2);
      const y = Math.max(5, (100 - boxH) / 2);

      return {
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
        width: Math.round(boxW * 10) / 10,
        height: Math.round(boxH * 10) / 10
      };
    });
  }, []);

  // When preset changes, recalculate crop box
  const handleSelectPreset = (mode) => {
    setAspectMode(mode);
    let ratio = 3.0 / 4.0;
    if (mode === 'square') ratio = 1.0;
    else if (mode === 'landscape') ratio = 4.0 / 3.0;
    applyPresetRatio(ratio);
  };

  // Image load handler — use rAF so stage is painted before measuring
  const handleImageLoaded = (e) => {
    const img = e.target;
    const nw = img.naturalWidth || img.width;
    const nh = img.naturalHeight || img.height;
    setNaturalDimensions({ width: nw, height: nh });
    // Delay by one animation frame so the stage element has correct dimensions
    requestAnimationFrame(() => applyPresetRatio(getAspectRatio()));
  };

  // Re-center crop box whenever imageSrc changes (handles cached images where onLoad doesn't fire)
  useEffect(() => {
    if (!imageSrc) return;
    // Allow two animation frames for modal + image to fully paint
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => applyPresetRatio(getAspectRatio()));
    });
    return () => cancelAnimationFrame(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageSrc]);

  // Reset to initial defaults
  const handleReset = () => {
    setZoom(1.0);
    setRotation(0);
    setPan({ x: 0, y: 0 });
    applyPresetRatio(getAspectRatio());
  };

  // Rotate 90 degrees clockwise
  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  // Drag initiation
  const handlePointerDown = (mode, e) => {
    e.preventDefault();
    e.stopPropagation();
    isDraggingRef.current = true;
    dragModeRef.current = mode;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      crop: { ...cropBox },
      pan: { ...pan }
    };
  };

  // Global Pointer Move & Up listeners for smooth dragging
  useEffect(() => {
    const onPointerMove = (e) => {
      if (!isDraggingRef.current || !stageRef.current) return;
      const stage = stageRef.current.getBoundingClientRect();
      if (!stage.width || !stage.height) return;

      const deltaXPct = ((e.clientX - dragStartRef.current.x) / stage.width) * 100;
      const deltaYPct = ((e.clientY - dragStartRef.current.y) / stage.height) * 100;
      const initial = dragStartRef.current.crop;
      const mode = dragModeRef.current;
      const ratio = getAspectRatio();
      const stageRatio = stage.width / stage.height;

      if (mode === 'move') {
        const maxX = 100 - initial.width;
        const maxY = 100 - initial.height;
        const newX = Math.max(0, Math.min(initial.x + deltaXPct, maxX));
        const newY = Math.max(0, Math.min(initial.y + deltaYPct, maxY));

        setCropBox(prev => ({
          ...prev,
          x: newX,
          y: newY
        }));
        return;
      }

      // Handle corner and edge resizing with aspect ratio preservation
      setCropBox(() => {
        let { x, y, width, height } = initial;

        if (mode === 'se') {
          // Bottom-Right
          width = Math.max(15, Math.min(initial.width + deltaXPct, 100 - initial.x));
          height = (width / ratio) * stageRatio;
          if (initial.y + height > 100) {
            height = 100 - initial.y;
            width = (height * ratio) / stageRatio;
          }
        } else if (mode === 'sw') {
          // Bottom-Left
          const maxLeftShift = initial.x + initial.width - 15;
          const shift = Math.min(deltaXPct, maxLeftShift);
          x = Math.max(0, initial.x + shift);
          width = initial.width - (x - initial.x);
          height = (width / ratio) * stageRatio;
          if (initial.y + height > 100) {
            height = 100 - initial.y;
            width = (height * ratio) / stageRatio;
            x = initial.x + initial.width - width;
          }
        } else if (mode === 'ne') {
          // Top-Right
          width = Math.max(15, Math.min(initial.width + deltaXPct, 100 - initial.x));
          height = (width / ratio) * stageRatio;
          const maxTopShift = initial.y + initial.height - 15;
          y = Math.max(0, initial.y + initial.height - height);
          if (y < 0) {
            y = 0;
            height = initial.y + initial.height;
            width = (height * ratio) / stageRatio;
          }
        } else if (mode === 'nw') {
          // Top-Left
          width = Math.max(15, initial.width - deltaXPct);
          height = (width / ratio) * stageRatio;
          x = initial.x + initial.width - width;
          y = initial.y + initial.height - height;
          if (x < 0) {
            x = 0;
            width = initial.x + initial.width;
            height = (width / ratio) * stageRatio;
            y = initial.y + initial.height - height;
          }
          if (y < 0) {
            y = 0;
            height = initial.y + initial.height;
            width = (height * ratio) / stageRatio;
            x = initial.x + initial.width - width;
          }
        }

        return {
          x: Math.max(0, Math.min(x, 90)),
          y: Math.max(0, Math.min(y, 90)),
          width: Math.max(15, Math.min(width, 100 - x)),
          height: Math.max(15, Math.min(height, 100 - y))
        };
      });
    };

    const onPointerUp = () => {
      isDraggingRef.current = false;
      dragModeRef.current = null;
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [getAspectRatio]);

  // Handle local Retake Photo file change
  const handleRetakeFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (onRetakePhoto) {
        onRetakePhoto(file);
      }
    }
  };

  // Crop & Confirm to Use Photo
  const handleCropAndUsePhoto = () => {
    if (!imageRef.current || !stageRef.current) return;
    const img = imageRef.current;
    const stage = stageRef.current.getBoundingClientRect();

    // Determine high-resolution canvas pixel dimensions based on preset
    const naturalW = img.naturalWidth || 1200;
    const naturalH = img.naturalHeight || 1600;
    const cropFractionW = Math.max(0.05, cropBox.width / 100);
    const cropFractionH = Math.max(0.05, cropBox.height / 100);

    let rawW = Math.round(naturalW * cropFractionW);
    let rawH = Math.round(naturalH * cropFractionH);

    // Keep high resolution (at least 1200px height) for crystal-clear AI processing
    const minHeight = 1200;
    if (rawH < minHeight && rawH > 0) {
      const scale = minHeight / rawH;
      rawW = Math.round(rawW * scale);
      rawH = minHeight;
    }
    const targetWidthPx = Math.max(600, rawW);
    const targetHeightPx = Math.max(800, rawH);
    let widthMm = 35.0;
    let heightMm = 45.0;

    if (aspectMode === 'square') {
      widthMm = 45.0;
      heightMm = 45.0;
    } else if (aspectMode === 'landscape') {
      widthMm = 60.0;
      heightMm = 45.0;
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetWidthPx;
    canvas.height = targetHeightPx;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Calculate crop rectangle in stage pixel coordinates
    const cropX = (cropBox.x / 100) * stage.width;
    const cropY = (cropBox.y / 100) * stage.height;
    const cropW = (cropBox.width / 100) * stage.width;
    const cropH = (cropBox.height / 100) * stage.height;

    // Render cropped portion to canvas
    // Account for rotation and zoom
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Scale canvas to match crop box
    ctx.scale(targetWidthPx / cropW, targetHeightPx / cropH);
    ctx.translate(-cropX, -cropY);

    // Apply stage image transform (zoom, pan, rotation at stage center)
    const centerX = stage.width / 2;
    const centerY = stage.height / 2;
    ctx.translate(centerX + pan.x, centerY + pan.y);
    ctx.scale(zoom, zoom);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-centerX, -centerY);

    // Render image centered in stage
    const imgAspect = (img.naturalWidth || 1) / (img.naturalHeight || 1);
    const stageAspect = stage.width / stage.height;
    let drawW, drawH, drawX, drawY;

    if (imgAspect > stageAspect) {
      drawW = stage.width;
      drawH = stage.width / imgAspect;
      drawX = 0;
      drawY = (stage.height - drawH) / 2;
    } else {
      drawH = stage.height;
      drawW = stage.height * imgAspect;
      drawX = (stage.width - drawW) / 2;
      drawY = 0;
    }

    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    ctx.restore();

    const croppedBase64 = canvas.toDataURL('image/png', 0.95);

    // Natural image crop coordinates for backend engine
    const cropNatW = naturalDimensions.width || naturalW;
    const cropNatH = naturalDimensions.height || naturalH;
    const pixelCrop = {
      x: Math.round((cropBox.x / 100) * cropNatW),
      y: Math.round((cropBox.y / 100) * cropNatH),
      width: Math.round((cropBox.width / 100) * cropNatW),
      height: Math.round((cropBox.height / 100) * cropNatH)
    };

    onConfirm({
      croppedFileData: croppedBase64,
      cropBox: pixelCrop,
      rotation,
      preset: aspectMode === 'passport' ? 'passport_in' : (aspectMode === 'square' ? 'square' : 'landscape'),
      isPreCropped: true,
      targetDimensions: {
        widthPx: targetWidthPx,
        heightPx: targetHeightPx,
        widthMm,
        heightMm
      },
      settings: {
        preset: aspectMode === 'passport' ? 'passport_in' : (aspectMode === 'square' ? 'square' : 'landscape'),
        widthMm,
        heightMm,
        dpi: 300,
        format: 'png',
        bgColor: 'white'
      }
    });
  };

  return (
    <div className={`candidate-crop-modal-backdrop theme-${theme}`}>
      <div className="candidate-crop-modal-card">

        {/* Hidden file input for "Retake Photo" */}
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          accept=".jpg,.jpeg,.png,.webp"
          onChange={handleRetakeFileChange}
        />

        {/* Modal Header */}
        <div className="candidate-crop-header">
          <div className="crop-title-group">
            <div className="crop-icon-badge">
              {/* Crop Symbol Icon */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2v14a2 2 0 0 0 2 2h14" />
                <path d="M18 22V8a2 2 0 0 0-2-2H2" />
              </svg>
            </div>
            <div>
              <h3 className="candidate-crop-title">Crop & Adjust Candidate Photo</h3>
              <p className="candidate-crop-subtitle">Drag to position, zoom, and fit face in the frame</p>
            </div>
          </div>
          <button
            type="button"
            className="candidate-crop-close-btn"
            onClick={onCancel}
            title="Close editor"
          >
            ✕
          </button>
        </div>

        {/* Crop Presets Bar */}
        <div className="crop-preset-bar">
          <span className="preset-bar-label">CROP PRESET:</span>
          <div className="preset-pill-group">
            <button
              type="button"
              className={`preset-pill ${aspectMode === 'square' ? 'active' : ''}`}
              onClick={() => handleSelectPreset('square')}
            >
              Square (1:1)
            </button>
            <button
              type="button"
              className={`preset-pill ${aspectMode === 'passport' ? 'active' : ''}`}
              onClick={() => handleSelectPreset('passport')}
            >
              Passport (3:4)
            </button>
            <button
              type="button"
              className={`preset-pill ${aspectMode === 'landscape' ? 'active' : ''}`}
              onClick={() => handleSelectPreset('landscape')}
            >
              Landscape
            </button>
          </div>
        </div>

        {/* Main Cropping Viewport / Stage */}
        <div className="candidate-crop-stage-wrap" ref={stageRef}>
          {/* Loaded Image */}
          <div
            className="crop-image-layer"
            style={{
              transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg)`,
              transition: isDraggingRef.current ? 'none' : 'transform 0.1s ease-out'
            }}
          >
            <img
              ref={imageRef}
              src={imageSrc}
              alt="Candidate"
              className="candidate-source-img"
              onLoad={handleImageLoaded}
              draggable={false}
            />
          </div>

          {/* Dimmed Outside Mask Overlays */}
          <div className="stage-mask-top" style={{ height: `${cropBox.y}%` }} />
          <div className="stage-mask-bottom" style={{ top: `${cropBox.y + cropBox.height}%`, bottom: 0 }} />
          <div className="stage-mask-left" style={{ top: `${cropBox.y}%`, height: `${cropBox.height}%`, width: `${cropBox.x}%` }} />
          <div className="stage-mask-right" style={{ top: `${cropBox.y}%`, height: `${cropBox.height}%`, left: `${cropBox.x + cropBox.width}%`, right: 0 }} />

          {/* The Active Draggable Crop Box */}
          <div
            className="candidate-crop-box"
            style={{
              top: `${cropBox.y}%`,
              left: `${cropBox.x}%`,
              width: `${cropBox.width}%`,
              height: `${cropBox.height}%`
            }}
            onPointerDown={(e) => handlePointerDown('move', e)}
          >
            {/* 4 Pink L-brackets on corners */}
            <span className="pink-bracket bracket-tl" />
            <span className="pink-bracket bracket-tr" />
            <span className="pink-bracket bracket-bl" />
            <span className="pink-bracket bracket-br" />

            {/* 3x3 Rule Grid (Toggleable) */}
            {showGrid && (
              <>
                <div className="crop-rule-grid grid-h1" />
                <div className="crop-rule-grid grid-h2" />
                <div className="crop-rule-grid grid-v1" />
                <div className="crop-rule-grid grid-v2" />

                {/* Face & Eye-Level Guide Ring */}
                <div className="candidate-face-oval">
                  <div className="candidate-eye-line" />
                </div>
              </>
            )}

            {/* Floating "+ Drag to align" Pill Badge */}
            <div className="drag-to-align-pill">
              <span className="drag-icon">✥</span>
              <span>Drag to align</span>
            </div>

            {/* Corner Resize Drag Handles */}
            <div className="crop-resize-handle handle-nw" onPointerDown={(e) => handlePointerDown('nw', e)} />
            <div className="crop-resize-handle handle-ne" onPointerDown={(e) => handlePointerDown('ne', e)} />
            <div className="crop-resize-handle handle-sw" onPointerDown={(e) => handlePointerDown('sw', e)} />
            <div className="crop-resize-handle handle-se" onPointerDown={(e) => handlePointerDown('se', e)} />
          </div>
        </div>

        {/* Toolbar below stage: Zoom Slider (Left) + Grid, Rotate, Reset (Right) */}
        <div className="candidate-crop-toolbar">
          {/* Zoom Slider */}
          <div className="toolbar-zoom-wrap">
            <svg className="zoom-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="range"
              min="1.0"
              max="3.0"
              step="0.05"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="candidate-zoom-slider"
              title="Zoom candidate photo"
            />
          </div>

          {/* Action Buttons: Grid, Rotate, Reset */}
          <div className="toolbar-actions-wrap">
            {/* Grid Toggle */}
            <button
              type="button"
              className={`tool-action-btn ${showGrid ? 'active' : ''}`}
              onClick={() => setShowGrid(g => !g)}
              title="Toggle rule-of-thirds grid"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
                <line x1="15" y1="3" x2="15" y2="21" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="3" y1="15" x2="21" y2="15" />
              </svg>
              <span>Grid</span>
            </button>

            {/* Rotate Clockwise */}
            <button
              type="button"
              className="tool-action-btn"
              onClick={handleRotate}
              title="Rotate photo 90 degrees"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
              <span>Rotate</span>
            </button>

            {/* Reset */}
            <button
              type="button"
              className="tool-action-btn"
              onClick={handleReset}
              title="Reset crop, zoom, and orientation"
            >
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Modal Footer: Retake Photo (Left) + Cancel & Crop & Use Photo (Right) */}
        <div className="candidate-crop-footer">
          <button
            type="button"
            className="footer-retake-btn"
            onClick={() => fileInputRef.current?.click()}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 4v6h6M23 20v-6h-6" />
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
            </svg>
            <span>Retake Photo</span>
          </button>

          <div className="footer-submit-group">
            <button
              type="button"
              className="footer-cancel-btn"
              onClick={onCancel}
              title="Use original full photo without cropping"
            >
              Skip Crop (Full Photo)
            </button>
            <button
              type="button"
              className="footer-crop-use-btn"
              onClick={handleCropAndUsePhoto}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>Crop & Use Photo</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default PhotoCropEditor;
