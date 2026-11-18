import React, { useState, useRef, useEffect } from 'react';
import { Rnd } from 'react-rnd';

/**
 * Illumination-Normalized Adaptive Document & Signature Background Removal Algorithm
 * Eliminates all camera shadows, table surfaces, and dark edge bands/black lines.
 * Converts 100% of the paper and shadow background to pure transparency, while keeping
 * dark signatures and colored stamp ink (purple, blue, red) ultra-sharp and crystal clear.
 */
const makeImageTransparent = (imgElement) => {
  const canvas = document.createElement('canvas');
  const w = imgElement.naturalWidth || imgElement.width || 400;
  const h = imgElement.naturalHeight || imgElement.height || 200;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imgElement, 0, 0, w, h);

  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const totalPixels = w * h;

  const lumArray = new Float32Array(totalPixels);
  const satArray = new Float32Array(totalPixels);

  let globalPaperLum = 0;
  let globalPaperCount = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const maxChannel = Math.max(r, g, b);
    const minChannel = Math.min(r, g, b);
    const sat = maxChannel - minChannel;
    const pIdx = i / 4;

    lumArray[pIdx] = lum;
    satArray[pIdx] = sat;

    if (sat < 30 && lum > 80) {
      globalPaperLum += lum;
      globalPaperCount++;
    }
  }

  const avgGlobalPaper = globalPaperCount > 0 ? (globalPaperLum / globalPaperCount) : 180;

  // 2. Compute 2D background grid (20x20)
  const gridX = 20;
  const gridY = 20;
  const cellW = w / gridX;
  const cellH = h / gridY;
  const bgGrid = Array.from({ length: gridY }, () => new Float32Array(gridX));

  for (let gy = 0; gy < gridY; gy++) {
    for (let gx = 0; gx < gridX; gx++) {
      const startX = Math.floor(gx * cellW);
      const endX = Math.min(w, Math.floor((gx + 1) * cellW));
      const startY = Math.floor(gy * cellH);
      const endY = Math.min(h, Math.floor((gy + 1) * cellH));

      let maxCellLum = 0;
      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const idx = y * w + x;
          if (satArray[idx] < 30) {
            if (lumArray[idx] > maxCellLum) maxCellLum = lumArray[idx];
          }
        }
      }
      bgGrid[gy][gx] = maxCellLum;
    }
  }

  // 3. Process each pixel
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const pIdx = y * w + x;
      const i = pIdx * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = lumArray[pIdx];
      const sat = satArray[pIdx];

      const gx = Math.min(gridX - 1, Math.floor(x / cellW));
      const gy = Math.min(gridY - 1, Math.floor(y / cellH));
      const cellBg = bgGrid[gy][gx];
      const localBg = cellBg > 70 ? cellBg : avgGlobalPaper;

      // Contrast ratio relative to paper
      const ratio = lum / localBg;

      // 1. Saturated colored ink (Stamp: purple, blue, red)
      const isColoredInk = (sat >= 14 && ratio < 0.95) || sat >= 24;

      // 2. Genuine pen stroke on paper (must be on paper with localBg >= 75 and ratio < 0.75)
      const isDarkInk = localBg >= 75 && ratio < 0.75 && lum < avgGlobalPaper - 15;

      if (isColoredInk) {
        data[i + 3] = 255;
      } else if (isDarkInk) {
        data[i] = Math.round(r * 0.7);
        data[i + 1] = Math.round(g * 0.7);
        data[i + 2] = Math.round(b * 0.7);
        data[i + 3] = 255;
      } else {
        // Everything else: paper, shadows, desk, dark edge bands -> 100% Transparent
        if (ratio >= 0.80 || cellBg < 70) {
          data[i + 3] = 0; // 100% Transparent
        } else {
          const factor = (0.80 - ratio) / 0.05;
          data[i + 3] = Math.round(255 * Math.max(0, Math.min(1, factor)));
          if (data[i + 3] < 30) data[i + 3] = 0;
        }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/png');
};

/**
 * Auto-Crop Algorithm
 * Crops empty transparent boundaries around the merged non-transparent graphics.
 */
const autoCropCanvas = (canvas, padding = 4) => {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  let minX = w, minY = h, maxX = 0, maxY = 0;
  let hasPixels = false;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const alpha = data[(y * w + x) * 4 + 3];
      if (alpha > 15) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        hasPixels = true;
      }
    }
  }

  if (!hasPixels) return canvas;

  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(w - 1, maxX + padding);
  maxY = Math.min(h - 1, maxY + padding);

  const cropW = Math.max(1, maxX - minX + 1);
  const cropH = Math.max(1, maxY - minY + 1);

  const croppedCanvas = document.createElement('canvas');
  croppedCanvas.width = cropW;
  croppedCanvas.height = cropH;
  const cropCtx = croppedCanvas.getContext('2d');
  cropCtx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);

  return croppedCanvas;
};

const StampSignatureMerger = ({ value, onMerge, isRequired = false }) => {
  const [stampRaw, setStampRaw] = useState(null);
  const [signatureRaw, setSignatureRaw] = useState(null);
  const [stampProcessed, setStampProcessed] = useState(null);
  const [signatureProcessed, setSignatureProcessed] = useState(null);

  const [stampDimensions, setStampDimensions] = useState({ width: 360, height: 160 });
  const [sigPos, setSigPos] = useState({ x: 90, y: 35, width: 180, height: 85 });
  const [isSaved, setIsSaved] = useState(false);
  const [mergedPreview, setMergedPreview] = useState(value || null);
  const [isProcessing, setIsProcessing] = useState(false);

  const stageRef = useRef(null);

  // Sync external value
  useEffect(() => {
    if (value && value !== mergedPreview) {
      setMergedPreview(value);
      setIsSaved(true);
    }
  }, [value]);

  // Make Stamp Background 100% Transparent automatically upon upload
  useEffect(() => {
    if (stampRaw) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const transparentStamp = makeImageTransparent(img);
        setStampProcessed(transparentStamp);
        
        // Adjust stage aspect ratio based on stamp
        const naturalW = img.naturalWidth || 360;
        const naturalH = img.naturalHeight || 160;
        const maxStageW = 420;
        const scaleFactor = Math.min(maxStageW / naturalW, 200 / naturalH, 1);
        const stageW = Math.max(280, Math.round(naturalW * scaleFactor) || 360);
        const stageH = Math.max(140, Math.round(naturalH * scaleFactor) || 160);
        setStampDimensions({ width: stageW, height: stageH });
      };
      img.src = stampRaw;
    } else {
      setStampProcessed(null);
    }
  }, [stampRaw]);

  // Make Signature Background 100% Transparent automatically upon upload
  useEffect(() => {
    if (signatureRaw) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const transparentSig = makeImageTransparent(img);
        setSignatureProcessed(transparentSig);
      };
      img.src = signatureRaw;
    } else {
      setSignatureProcessed(null);
    }
  }, [signatureRaw]);

  const handleStampChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setStampRaw(reader.result);
      setIsSaved(false);
    };
    reader.readAsDataURL(file);
  };

  const handleSignatureChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setSignatureRaw(reader.result);
      setIsSaved(false);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveCombinedImage = async () => {
    if (!stampProcessed && !signatureProcessed) {
      alert('Please upload a Stamp image and Signature image.');
      return;
    }

    setIsProcessing(true);

    try {
      const stageW = stampDimensions.width || 360;
      const stageH = stampDimensions.height || 160;

      // High-definition 3x scale for crisp print PDF output
      const scale = 3;
      const canvas = document.createElement('canvas');
      canvas.width = stageW * scale;
      canvas.height = stageH * scale;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const loadImage = (src) => new Promise((resolve, reject) => {
        if (!src) return resolve(null);
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });

      const [stampImg, sigImg] = await Promise.all([
        loadImage(stampProcessed),
        loadImage(signatureProcessed)
      ]);

      // 1. Draw Transparent Stamp Background Layer
      if (stampImg) {
        ctx.drawImage(stampImg, 0, 0, stageW * scale, stageH * scale);
      }

      // 2. Draw Transparent Signature Overlay Layer
      if (sigImg) {
        ctx.drawImage(
          sigImg,
          sigPos.x * scale,
          sigPos.y * scale,
          sigPos.width * scale,
          sigPos.height * scale
        );
      }

      // 3. Auto-crop transparent boundaries
      const croppedCanvas = autoCropCanvas(canvas, 6);
      const finalCombinedDataUrl = croppedCanvas.toDataURL('image/png');

      setMergedPreview(finalCombinedDataUrl);
      setIsSaved(true);

      if (onMerge) {
        onMerge(finalCombinedDataUrl);
      }
    } catch (err) {
      console.error('Error saving combined stamp & signature:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={{
      border: '1.5px dashed #0284c7',
      borderRadius: '10px',
      padding: '16px 20px',
      background: 'rgba(2, 132, 199, 0.03)',
      boxSizing: 'border-box',
      width: '100%',
      fontFamily: 'inherit'
    }}>
      {/* Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0284c7', fontSize: '13.5px', fontWeight: '800', marginBottom: '14px' }}>
        <span>🖊️</span>
        <span>Upload Authorized Signatory Stamp & Signature {isRequired && <span style={{ color: '#ef4444' }}>*</span>}</span>
      </div>

      {/* Upload Inputs Flow */}
      {!stampRaw && (
        <div style={{ marginBottom: '10px' }}>
          <div style={{ color: '#0f172a', fontSize: '12.5px', fontWeight: '700', marginBottom: '6px' }}>
            1. Upload Stamp Image (Background):
          </div>
          <input
            type="file"
            accept="image/*"
            onChange={handleStampChange}
            style={{
              color: '#334155',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          />
        </div>
      )}

      {stampRaw && (
        <div>
          {/* Step 1 & Step 2 File Selection Inputs */}
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' }}>
            <div>
              <div style={{ color: '#0f172a', fontSize: '12px', fontWeight: '700', marginBottom: '4px' }}>
                1. Stamp: <span style={{ color: '#16a34a', fontWeight: '800' }}>✓ Loaded (Transparent)</span>
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={handleStampChange}
                style={{ color: '#64748b', fontSize: '11px', cursor: 'pointer' }}
              />
            </div>

            <div>
              <div style={{ color: '#0f172a', fontSize: '12px', fontWeight: '700', marginBottom: '4px' }}>
                2. Upload Signature Image (Overlay): {signatureRaw && <span style={{ color: '#16a34a', fontWeight: '800' }}>✓ Loaded (Transparent)</span>}
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={handleSignatureChange}
                style={{ color: '#334155', fontSize: '12px', cursor: 'pointer' }}
              />
            </div>
          </div>

          {/* Helper Text */}
          <div style={{ color: '#475569', fontSize: '12px', fontWeight: '600', marginBottom: '10px' }}>
            Drag and resize the signature over the stamp. Click &quot;Save Combined Image&quot; when done.
          </div>

          {/* Active Canvas Stage matching Screenshot perfectly */}
          <div
            ref={stageRef}
            style={{
              position: 'relative',
              width: `${stampDimensions.width}px`,
              maxWidth: '100%',
              height: `${stampDimensions.height}px`,
              background: '#ffffff',
              borderRadius: '6px',
              boxShadow: '0 4px 14px rgba(0,0,0,0.1)',
              overflow: 'hidden',
              userSelect: 'none',
              border: '1.5px solid #cbd5e1'
            }}
          >
            {/* Background Stamp Image Layer */}
            {stampProcessed && (
              <img
                src={stampProcessed}
                alt="Stamp Background"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  display: 'block',
                  pointerEvents: 'none'
                }}
              />
            )}

            {/* Draggable & Resizable Signature Overlay Layer with Orange Dashed Border */}
            {signatureProcessed ? (
              <Rnd
                bounds="parent"
                size={{ width: sigPos.width, height: sigPos.height }}
                position={{ x: sigPos.x, y: sigPos.y }}
                onDragStop={(e, d) => {
                  setSigPos(prev => ({ ...prev, x: d.x, y: d.y }));
                }}
                onResizeStop={(e, direction, ref, delta, position) => {
                  setSigPos({
                    width: parseInt(ref.style.width, 10),
                    height: parseInt(ref.style.height, 10),
                    ...position
                  });
                }}
                style={{
                  border: '2px dashed #f97316',
                  cursor: 'move',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 20
                }}
              >
                <img
                  src={signatureProcessed}
                  alt="Signature Overlay"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    pointerEvents: 'none'
                  }}
                />
              </Rnd>
            ) : (
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                background: 'rgba(15, 23, 42, 0.85)',
                color: '#ffffff',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: '600',
                pointerEvents: 'none'
              }}>
                ℹ️ Please upload Signature image above to overlay
              </div>
            )}
          </div>

          {/* Action Button & Status */}
          <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={isProcessing}
              onClick={handleSaveCombinedImage}
              style={{
                background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                color: '#ffffff',
                border: 'none',
                padding: '9px 20px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: '700',
                cursor: 'pointer',
                boxShadow: '0 3px 10px rgba(249, 115, 22, 0.35)',
                transition: 'opacity 0.2s'
              }}
            >
              {isProcessing ? 'Saving...' : isSaved ? '💾 Update / Save Changes' : 'Save Combined Image'}
            </button>

            {isSaved && mergedPreview && (
              <div style={{ color: '#16a34a', fontSize: '12px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span>✅</span> Combined Transparent Stamp & Signature Saved! (You can drag & resize above anytime to re-adjust)
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default StampSignatureMerger;
