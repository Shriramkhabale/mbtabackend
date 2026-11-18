import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import ImageAdjustments from './ImageAdjustments';
import {
  rotateImageSource,
  warpPerspectiveCanvas,
  straightCropCanvas,
  canvasToBlob
} from './cropUtils';

/**
 * CropWorkspace component matching Reference Image 1 specifications
 * Supports 4-corner perspective crop, straight rectangular crop, rotation,
 * real-time Light & Colour adjustment panel, and high-resolution export.
 */
const CropWorkspace = ({
  sideName = 'Front Side',
  rawImageUrl,
  initialRotation = 0,
  initialCropMode = 'perspective', // 'perspective' | 'straight'
  initialCorners = null,
  initialStraightBox = null,
  initialAdjustments = {},
  onApplyCrop,
  onCancel,
  theme = 'light'
}) => {
  const [cropMode, setCropMode] = useState(initialCropMode);
  const [rotation, setRotation] = useState(initialRotation);
  const [adjustments, setAdjustments] = useState({
    brightness: 0,
    contrast: 0,
    black: 0,
    red: 0,
    yellow: 0,
    blue: 0,
    ...initialAdjustments
  });
  const [showAdjustments, setShowAdjustments] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(true);

  // Natural rotated image dimensions
  const [rotatedDims, setRotatedDims] = useState({ width: 0, height: 0 });
  const [displayDims, setDisplayDims] = useState({ width: 0, height: 0 });

  // 4 corners in rotated image coordinates: [tl, tr, br, bl]
  const [corners, setCorners] = useState(initialCorners);

  // Straight crop box in rotated image coordinates: { x, y, width, height }
  const [straightBox, setStraightBox] = useState(initialStraightBox);

  // References
  const stageRef = useRef(null);
  const baseImgRef = useRef(null); // original unrotated image object
  const rotatedCanvasRef = useRef(null); // canvas of currently rotated image

  // Dragging state
  const draggingHandleRef = useRef(null); // 0, 1, 2, 3 for corners; 'nw','ne','se','sw','move' for straight
  const dragStartRef = useRef({ x: 0, y: 0, initial: null });

  // 1. Load base image and initialize rotated canvas
  useEffect(() => {
    if (!rawImageUrl) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      baseImgRef.current = img;
      updateRotatedImage(img, rotation);
    };
    img.src = rawImageUrl;
  }, [rawImageUrl]);

  // 2. Handle Rotation
  const updateRotatedImage = useCallback((baseImg, angle) => {
    if (!baseImg) return;
    const rotCanvas = rotateImageSource(baseImg, angle);
    rotatedCanvasRef.current = rotCanvas;
    const rw = rotCanvas.width;
    const rh = rotCanvas.height;
    setRotatedDims({ width: rw, height: rh });

    // Initialize or reset default corners (approx 8% margin around standard card)
    const marginX = Math.round(rw * 0.08);
    const marginY = Math.round(rh * 0.12);

    const defaultCorners = [
      [marginX, marginY], // TL
      [rw - marginX, marginY], // TR
      [rw - marginX, rh - marginY], // BR
      [marginX, rh - marginY] // BL
    ];
    setCorners(defaultCorners);

    setStraightBox({
      x: marginX,
      y: marginY,
      width: rw - marginX * 2,
      height: rh - marginY * 2
    });
  }, []);

  const handleRotateLeft = () => {
    const nextRot = (rotation - 90 + 360) % 360;
    setRotation(nextRot);
    if (baseImgRef.current) updateRotatedImage(baseImgRef.current, nextRot);
  };

  const handleRotateRight = () => {
    const nextRot = (rotation + 90) % 360;
    setRotation(nextRot);
    if (baseImgRef.current) updateRotatedImage(baseImgRef.current, nextRot);
  };

  // 3. Reset crop boundaries
  const handleResetCrop = () => {
    if (!rotatedDims.width || !rotatedDims.height) return;
    const rw = rotatedDims.width;
    const rh = rotatedDims.height;
    const marginX = Math.round(rw * 0.08);
    const marginY = Math.round(rh * 0.12);

    setCorners([
      [marginX, marginY],
      [rw - marginX, marginY],
      [rw - marginX, rh - marginY],
      [marginX, rh - marginY]
    ]);

    setStraightBox({
      x: marginX,
      y: marginY,
      width: rw - marginX * 2,
      height: rh - marginY * 2
    });
  };

  // 4. Update display dimensions on stage resize
  const updateDisplayDimensions = useCallback(() => {
    if (!stageRef.current || !rotatedDims.width || !rotatedDims.height) return;
    const stageRect = stageRef.current.getBoundingClientRect();
    const stageW = Math.max(50, stageRect.width - 24);
    const stageH = Math.max(50, stageRect.height - 24);

    const imgAspect = rotatedDims.width / rotatedDims.height;
    const stageAspect = stageW / stageH;

    let dispW, dispH;
    if (imgAspect > stageAspect) {
      dispW = stageW;
      dispH = stageW / imgAspect;
    } else {
      dispH = stageH;
      dispW = stageH * imgAspect;
    }

    setDisplayDims({
      width: Math.max(10, dispW),
      height: Math.max(10, dispH)
    });
  }, [rotatedDims]);

  useEffect(() => {
    updateDisplayDimensions();
    if (!stageRef.current) return;
    const observer = new ResizeObserver(() => {
      updateDisplayDimensions();
    });
    observer.observe(stageRef.current);
    window.addEventListener('resize', updateDisplayDimensions);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateDisplayDimensions);
    };
  }, [updateDisplayDimensions, isFullscreen]);

  // ESC key listener to exit fullscreen or cancel
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else if (onCancel) {
          onCancel();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, onCancel]);

  // Scale factors between screen display pixels and natural image pixels
  const scaleX = displayDims.width ? displayDims.width / rotatedDims.width : 1;
  const scaleY = displayDims.height ? displayDims.height / rotatedDims.height : 1;

  // 5. Drag Interactions for Perspective Corner Handles & Straight Box
  const getEventPoint = (e) => {
    if (e.touches && e.touches.length > 0) {
      return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
    }
    return { clientX: e.clientX, clientY: e.clientY };
  };

  const handlePointerDownHandle = (handleId, e) => {
    e.preventDefault();
    e.stopPropagation();
    draggingHandleRef.current = handleId;
    const pt = getEventPoint(e);
    dragStartRef.current = {
      x: pt.clientX,
      y: pt.clientY,
      initialCorners: corners ? corners.map(([x, y]) => [x, y]) : null,
      initialBox: straightBox ? { ...straightBox } : null
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('touchend', handlePointerUp);
  };

  const handlePointerMove = useCallback((e) => {
    const handleId = draggingHandleRef.current;
    if (handleId === null || !stageRef.current) return;
    e.preventDefault();

    const pt = getEventPoint(e);
    const stageRect = stageRef.current.getBoundingClientRect();

    // Image offset inside stage container (centered)
    const offsetX = (stageRect.width - displayDims.width) / 2;
    const offsetY = (stageRect.height - displayDims.height) / 2;

    const mouseImgDispX = pt.clientX - stageRect.left - offsetX;
    const mouseImgDispY = pt.clientY - stageRect.top - offsetY;

    // Convert to rotated natural image coordinates
    const natX = Math.max(0, Math.min(rotatedDims.width, mouseImgDispX / scaleX));
    const natY = Math.max(0, Math.min(rotatedDims.height, mouseImgDispY / scaleY));

    if (cropMode === 'perspective') {
      const idx = typeof handleId === 'number' ? handleId : 0;
      setCorners((prev) => {
        if (!prev) return prev;
        const next = [...prev];
        next[idx] = [Math.round(natX), Math.round(natY)];
        return next;
      });
    } else if (cropMode === 'straight') {
      const initBox = dragStartRef.current.initialBox;
      if (!initBox) return;

      const deltaNatX = (pt.clientX - dragStartRef.current.x) / scaleX;
      const deltaNatY = (pt.clientY - dragStartRef.current.y) / scaleY;

      setStraightBox(() => {
        let { x, y, width, height } = initBox;

        if (handleId === 'move') {
          x = Math.max(0, Math.min(rotatedDims.width - width, x + deltaNatX));
          y = Math.max(0, Math.min(rotatedDims.height - height, y + deltaNatY));
        } else if (handleId === 'nw') {
          const newX = Math.max(0, Math.min(initBox.x + initBox.width - 20, x + deltaNatX));
          const newY = Math.max(0, Math.min(initBox.y + initBox.height - 20, y + deltaNatY));
          width = initBox.x + initBox.width - newX;
          height = initBox.y + initBox.height - newY;
          x = newX;
          y = newY;
        } else if (handleId === 'ne') {
          const newY = Math.max(0, Math.min(initBox.y + initBox.height - 20, y + deltaNatY));
          width = Math.max(20, Math.min(rotatedDims.width - initBox.x, initBox.width + deltaNatX));
          height = initBox.y + initBox.height - newY;
          y = newY;
        } else if (handleId === 'se') {
          width = Math.max(20, Math.min(rotatedDims.width - initBox.x, initBox.width + deltaNatX));
          height = Math.max(20, Math.min(rotatedDims.height - initBox.y, initBox.height + deltaNatY));
        } else if (handleId === 'sw') {
          const newX = Math.max(0, Math.min(initBox.x + initBox.width - 20, x + deltaNatX));
          width = initBox.x + initBox.width - newX;
          height = Math.max(20, Math.min(rotatedDims.height - initBox.y, initBox.height + deltaNatY));
          x = newX;
        }

        return {
          x: Math.round(x),
          y: Math.round(y),
          width: Math.round(width),
          height: Math.round(height)
        };
      });
    }
  }, [cropMode, displayDims, rotatedDims, scaleX, scaleY]);

  const handlePointerUp = useCallback(() => {
    draggingHandleRef.current = null;
    window.removeEventListener('mousemove', handlePointerMove);
    window.removeEventListener('mouseup', handlePointerUp);
    window.removeEventListener('touchmove', handlePointerMove);
    window.removeEventListener('touchend', handlePointerUp);
  }, [handlePointerMove]);

  // 6. Apply Crop Execution
  const handleExecuteCrop = async () => {
    if (!rotatedCanvasRef.current) return;
    setIsProcessing(true);

    try {
      let resultCanvas;
      if (cropMode === 'perspective' && corners) {
        resultCanvas = warpPerspectiveCanvas(
          rotatedCanvasRef.current,
          corners,
          adjustments
        );
      } else if (cropMode === 'straight' && straightBox) {
        resultCanvas = straightCropCanvas(
          rotatedCanvasRef.current,
          straightBox,
          adjustments
        );
      } else {
        resultCanvas = rotatedCanvasRef.current;
      }

      const blob = await canvasToBlob(resultCanvas, 'image/png');
      const dataUrl = resultCanvas.toDataURL('image/png');

      onApplyCrop({
        croppedDataUrl: dataUrl,
        croppedBlob: blob,
        cropMode,
        rotation,
        corners,
        straightBox,
        adjustments
      });
    } catch (err) {
      console.error('Error applying crop:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Convert corners to SVG polygon points string in display coordinates
  const getSvgPolygonPoints = () => {
    if (!corners) return '';
    return corners
      .map(([x, y]) => `${Math.round(x * scaleX)},${Math.round(y * scaleY)}`)
      .join(' ');
  };

  // Handle label helper
  const CORNER_NAMES = ['Top-Left', 'Top-Right', 'Bottom-Right', 'Bottom-Left'];

  const workspaceContent = (
    <div className={`idcrop-workspace-container ${isFullscreen ? 'idcrop-workspace-fullscreen' : ''} theme-${theme}`}>
      {/* Top Controls Toolbar */}
      <div className="idcrop-ws-toolbar">
        <div className="idcrop-ws-left-actions">
          {/* Side Indicator Badge */}
          <div className="idcrop-ws-side-badge">
            <span className="idcrop-ws-badge-icon">🪪</span>
            <span className="idcrop-ws-badge-text">{sideName} Cropping</span>
            {isFullscreen && <span className="idcrop-ws-fullscreen-pill">FULL SCREEN</span>}
          </div>

          {/* Mode Selector */}
          <div className="idcrop-mode-pills">
            <button
              type="button"
              className={`idcrop-mode-btn ${cropMode === 'perspective' ? 'active' : ''}`}
              onClick={() => setCropMode('perspective')}
              title="4-Corner Perspective Crop with skew correction"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 7l6-4 12 3-5 15-13-2z"></path>
              </svg>
              <span>Perspective Crop</span>
            </button>
            <button
              type="button"
              className={`idcrop-mode-btn ${cropMode === 'straight' ? 'active' : ''}`}
              onClick={() => setCropMode('straight')}
              title="Straight Rectangular Crop"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2"></rect>
              </svg>
              <span>Straight Crop</span>
            </button>
          </div>

          {/* Rotation Buttons */}
          <div className="idcrop-rot-group">
            <button
              type="button"
              className="idcrop-ws-icon-btn"
              onClick={handleRotateLeft}
              title="Rotate Left 90°"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2.5 2v6h6M2.66 15.57a10 10 0 1 0 .57-8.38L2.5 8"></path>
              </svg>
              <span>Rotate Left</span>
            </button>
            <button
              type="button"
              className="idcrop-ws-icon-btn"
              onClick={handleRotateRight}
              title="Rotate Right 90°"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38L21.5 8"></path>
              </svg>
              <span>Rotate Right</span>
            </button>
          </div>
        </div>

        <div className="idcrop-ws-right-actions">
          {/* Toggle Light & Colour Adjustments */}
          <button
            type="button"
            className={`idcrop-ws-adj-toggle ${showAdjustments ? 'active' : ''}`}
            onClick={() => setShowAdjustments((v) => !v)}
            title="Toggle Light & Colour Adjustments Panel"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            <span>Light & Colour</span>
          </button>

          {/* TOP BAR PROMINENT APPLY CROP BUTTON */}
          <button
            type="button"
            className="idcrop-ws-top-apply-btn"
            onClick={handleExecuteCrop}
            disabled={isProcessing}
            title={`Apply Crop for ${sideName}`}
          >
            {isProcessing ? (
              <>
                <span className="idcrop-spinner"></span>
                <span>Processing...</span>
              </>
            ) : (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <span>Apply Crop (${sideName})</span>
              </>
            )}
          </button>

          {/* Reset Crop */}
          <button
            type="button"
            className="idcrop-ws-icon-btn"
            onClick={handleResetCrop}
            title="Reset crop corners to default"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="1 4 1 10 7 10"></polyline>
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
            </svg>
            <span>Reset Crop</span>
          </button>

          {/* Fullscreen Toggle Button */}
          <button
            type="button"
            className="idcrop-ws-icon-btn idcrop-fullscreen-toggle-btn"
            onClick={() => setIsFullscreen((v) => !v)}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path>
                </svg>
                <span>Windowed</span>
              </>
            ) : (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"></path>
                </svg>
                <span>Fullscreen</span>
              </>
            )}
          </button>

          {/* Close back to upload */}
          {onCancel && (
            <button
              type="button"
              className="idcrop-ws-icon-btn idcrop-ws-close-btn"
              onClick={onCancel}
              title="Close editor and return to upload"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Main Workspace Body */}
      <div className="idcrop-ws-body">
        {/* Stage Container */}
        <div className="idcrop-stage-wrapper">
          {/* Instruction Pill (Reference Image 1) */}
          <div className="idcrop-instruction-banner">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <span>
              {cropMode === 'perspective'
                ? 'Drag each corner onto the actual corner of the card, then click Apply Crop.'
                : 'Drag and resize the rectangular crop box over the card, then click Apply Crop.'}
            </span>
          </div>

          <div className="idcrop-stage" ref={stageRef}>
            {displayDims.width > 0 && rotatedCanvasRef.current && (
              <div
                className="idcrop-canvas-viewport"
                style={{
                  width: `${displayDims.width}px`,
                  height: `${displayDims.height}px`
                }}
              >
                {/* Background Rotated Image */}
                <img
                  src={rotatedCanvasRef.current.toDataURL()}
                  alt="Rotated Target Card"
                  className="idcrop-display-img"
                  style={{
                    filter: `brightness(${1 + (adjustments.brightness || 0) / 100}) contrast(${1 + (adjustments.contrast || 0) / 100})`
                  }}
                />

                {/* Perspective Crop Overlay */}
                {cropMode === 'perspective' && corners && (
                  <svg
                    className="idcrop-overlay-svg"
                    width={displayDims.width}
                    height={displayDims.height}
                    viewBox={`0 0 ${displayDims.width} ${displayDims.height}`}
                  >
                    {/* Semi-transparent Darkened Mask Outside Polygon */}
                    <defs>
                      <mask id="cropPolygonMask">
                        <rect width="100%" height="100%" fill="white" />
                        <polygon points={getSvgPolygonPoints()} fill="black" />
                      </mask>
                    </defs>
                    <rect
                      width="100%"
                      height="100%"
                      fill="rgba(0, 0, 0, 0.45)"
                      mask="url(#cropPolygonMask)"
                    />

                    {/* Connecting Blue Polygon Boundary Line */}
                    <polygon
                      points={getSvgPolygonPoints()}
                      className="idcrop-boundary-polygon"
                    />

                    {/* Internal alignment guide lines (midpoint cross) */}
                    {corners.length === 4 && (
                      <>
                        <line
                          x1={(corners[0][0] * scaleX + corners[3][0] * scaleX) / 2}
                          y1={(corners[0][1] * scaleY + corners[3][1] * scaleY) / 2}
                          x2={(corners[1][0] * scaleX + corners[2][0] * scaleX) / 2}
                          y2={(corners[1][1] * scaleY + corners[2][1] * scaleY) / 2}
                          stroke="rgba(56, 189, 248, 0.35)"
                          strokeWidth="1"
                          strokeDasharray="4 4"
                        />
                        <line
                          x1={(corners[0][0] * scaleX + corners[1][0] * scaleX) / 2}
                          y1={(corners[0][1] * scaleY + corners[1][1] * scaleY) / 2}
                          x2={(corners[3][0] * scaleX + corners[2][0] * scaleX) / 2}
                          y2={(corners[3][1] * scaleY + corners[2][1] * scaleY) / 2}
                          stroke="rgba(56, 189, 248, 0.35)"
                          strokeWidth="1"
                          strokeDasharray="4 4"
                        />
                      </>
                    )}
                  </svg>
                )}

                {/* 4 Draggable Blue Corner Handles (Reference Image 1) */}
                {cropMode === 'perspective' &&
                  corners &&
                  corners.map(([x, y], idx) => {
                    const dispX = x * scaleX;
                    const dispY = y * scaleY;
                    return (
                      <div
                        key={idx}
                        className="idcrop-corner-handle"
                        style={{
                          left: `${dispX}px`,
                          top: `${dispY}px`
                        }}
                        onMouseDown={(e) => handlePointerDownHandle(idx, e)}
                        onTouchStart={(e) => handlePointerDownHandle(idx, e)}
                        title={`Drag ${CORNER_NAMES[idx]} Corner`}
                      >
                        <div className="idcrop-handle-core"></div>
                        <div className="idcrop-handle-pulse"></div>
                      </div>
                    );
                  })}

                {/* Straight Rectangular Crop Overlay */}
                {cropMode === 'straight' && straightBox && (
                  <div
                    className="idcrop-straight-box"
                    style={{
                      left: `${straightBox.x * scaleX}px`,
                      top: `${straightBox.y * scaleY}px`,
                      width: `${straightBox.width * scaleX}px`,
                      height: `${straightBox.height * scaleY}px`
                    }}
                    onMouseDown={(e) => handlePointerDownHandle('move', e)}
                    onTouchStart={(e) => handlePointerDownHandle('move', e)}
                  >
                    {/* Corner resize grips */}
                    <div
                      className="idcrop-rect-grip grip-nw"
                      onMouseDown={(e) => handlePointerDownHandle('nw', e)}
                      onTouchStart={(e) => handlePointerDownHandle('nw', e)}
                    />
                    <div
                      className="idcrop-rect-grip grip-ne"
                      onMouseDown={(e) => handlePointerDownHandle('ne', e)}
                      onTouchStart={(e) => handlePointerDownHandle('ne', e)}
                    />
                    <div
                      className="idcrop-rect-grip grip-se"
                      onMouseDown={(e) => handlePointerDownHandle('se', e)}
                      onTouchStart={(e) => handlePointerDownHandle('se', e)}
                    />
                    <div
                      className="idcrop-rect-grip grip-sw"
                      onMouseDown={(e) => handlePointerDownHandle('sw', e)}
                      onTouchStart={(e) => handlePointerDownHandle('sw', e)}
                    />

                    {/* 3x3 Grid inside straight box */}
                    <div className="idcrop-rect-grid">
                      <div className="grid-h grid-h-1"></div>
                      <div className="grid-h grid-h-2"></div>
                      <div className="grid-v grid-v-1"></div>
                      <div className="grid-v grid-v-2"></div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Side Adjustment Drawer */}
        {showAdjustments && (
          <div className="idcrop-adj-drawer">
            <ImageAdjustments
              adjustments={adjustments}
              onChange={setAdjustments}
              onReset={() =>
                setAdjustments({
                  brightness: 0,
                  contrast: 0,
                  black: 0,
                  red: 0,
                  yellow: 0,
                  blue: 0
                })
              }
              theme={theme}
            />
          </div>
        )}
      </div>

      {/* Bottom Footer Actions Bar */}
      <div className="idcrop-ws-footer">
        <button
          type="button"
          className="idcrop-btn-outline"
          onClick={onCancel}
          disabled={isProcessing}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          <span>Back to Upload</span>
        </button>

        <button
          type="button"
          className="idcrop-btn-primary idcrop-apply-crop-btn"
          onClick={handleExecuteCrop}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <>
              <span className="idcrop-spinner"></span>
              <span>Processing Crop...</span>
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              <span>Apply Crop ({sideName})</span>
            </>
          )}
        </button>
      </div>
    </div>
  );

  if (isFullscreen && typeof document !== 'undefined') {
    return ReactDOM.createPortal(workspaceContent, document.body);
  }

  return workspaceContent;
};

export default CropWorkspace;

