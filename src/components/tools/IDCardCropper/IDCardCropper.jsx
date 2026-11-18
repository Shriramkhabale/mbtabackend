import React, { useState } from 'react';
import ImageUploader from './ImageUploader';
import CropWorkspace from './CropWorkspace';
import FinalPreview from './FinalPreview';
import './IDCardCropper.css';

/**
 * IDCardCropper — Master Coordinator Component
 * Orchestrates the complete 5-step workflow:
 * Step 1: Upload Front Side
 * Step 2: Crop Front Side (Perspective / Straight + Light & Colour adjustments)
 * Step 3: Upload Back Side
 * Step 4: Crop Back Side (Perspective / Straight + Light & Colour adjustments)
 * Step 5: Preview & Download (Side-by-side previews, Edit/Replace, PNG & ZIP downloads)
 */
const IDCardCropper = ({
  tool,
  onClose,
  theme = 'light'
}) => {
  // Step: 1 (Front Upload), 2 (Front Crop), 3 (Back Upload), 4 (Back Crop), 5 (Final Preview)
  const [step, setStep] = useState(1);

  // Front Side State
  const [frontRawFile, setFrontRawFile] = useState(null);
  const [frontRawUrl, setFrontRawUrl] = useState('');
  const [frontCropParams, setFrontCropParams] = useState({
    rotation: 0,
    cropMode: 'perspective',
    corners: null,
    straightBox: null,
    adjustments: {
      brightness: 0,
      contrast: 0,
      black: 0,
      red: 0,
      yellow: 0,
      blue: 0
    }
  });
  const [frontResult, setFrontResult] = useState(null);

  // Back Side State
  const [backRawFile, setBackRawFile] = useState(null);
  const [backRawUrl, setBackRawUrl] = useState('');
  const [backCropParams, setBackCropParams] = useState({
    rotation: 0,
    cropMode: 'perspective',
    corners: null,
    straightBox: null,
    adjustments: {
      brightness: 0,
      contrast: 0,
      black: 0,
      red: 0,
      yellow: 0,
      blue: 0
    }
  });
  const [backResult, setBackResult] = useState(null);

  // Stepper metadata
  const STEPS = [
    { num: 1, title: 'Front Upload', sub: 'Upload front image' },
    { num: 2, title: 'Front Crop', sub: 'Perspective / Straight' },
    { num: 3, title: 'Back Upload', sub: 'Upload back image' },
    { num: 4, title: 'Back Crop', sub: 'Perspective / Straight' },
    { num: 5, title: 'Preview & Download', sub: 'Print Ready PDF' }
  ];

  // Step 1: Front Image Selected
  const handleFrontImageSelected = (file, dataUrl) => {
    setFrontRawFile(file);
    setFrontRawUrl(dataUrl);
  };

  const handleFrontRemove = () => {
    setFrontRawFile(null);
    setFrontRawUrl('');
    setFrontResult(null);
  };

  // Step 2: Front Crop Applied
  const handleFrontCropApplied = (result) => {
    setFrontResult(result);
    setFrontCropParams({
      rotation: result.rotation,
      cropMode: result.cropMode,
      corners: result.corners,
      straightBox: result.straightBox,
      adjustments: result.adjustments
    });
    // Move to Step 3: Back Side Upload
    setStep(3);
  };

  // Step 3: Back Image Selected
  const handleBackImageSelected = (file, dataUrl) => {
    setBackRawFile(file);
    setBackRawUrl(dataUrl);
  };

  const handleBackRemove = () => {
    setBackRawFile(null);
    setBackRawUrl('');
    setBackResult(null);
  };

  // Step 4: Back Crop Applied
  const handleBackCropApplied = (result) => {
    setBackResult(result);
    setBackCropParams({
      rotation: result.rotation,
      cropMode: result.cropMode,
      corners: result.corners,
      straightBox: result.straightBox,
      adjustments: result.adjustments
    });
    // Move to Step 5: Final Preview
    setStep(5);
  };

  // Reset Everything to Start Fresh
  const handleResetAll = () => {
    setStep(1);
    setFrontRawFile(null);
    setFrontRawUrl('');
    setFrontResult(null);
    setFrontCropParams({
      rotation: 0,
      cropMode: 'perspective',
      corners: null,
      straightBox: null,
      adjustments: { brightness: 0, contrast: 0, black: 0, red: 0, yellow: 0, blue: 0 }
    });
    setBackRawFile(null);
    setBackRawUrl('');
    setBackResult(null);
    setBackCropParams({
      rotation: 0,
      cropMode: 'perspective',
      corners: null,
      straightBox: null,
      adjustments: { brightness: 0, contrast: 0, black: 0, red: 0, yellow: 0, blue: 0 }
    });
  };

  // Stepper click handler (allows jumping back to completed steps)
  const handleStepClick = (targetStep) => {
    if (targetStep === 1) setStep(1);
    else if (targetStep === 2 && frontRawUrl) setStep(2);
    else if (targetStep === 3 && frontResult) setStep(3);
    else if (targetStep === 4 && backRawUrl) setStep(4);
    else if (targetStep === 5 && frontResult && backResult) setStep(5);
  };

  return (
    <div className={`idcrop-root theme-${theme}`}>
      {/* Top Header with Stepper and Action Bar */}
      <div className="idcrop-master-header">
        <div className="idcrop-header-left">
          <div className="idcrop-tool-title-pill">
            <span className="idcrop-title-icon">🪪</span>
            <div className="idcrop-title-texts">
              <span className="idcrop-title-main">
                {tool?.title || 'ID CARD CROPPING TOOL'}
              </span>
              <span className="idcrop-title-sub">
                Front Side + Back Side Manual & Perspective Card Cropping
              </span>
            </div>
          </div>
        </div>

        <div className="idcrop-header-right">
          {onClose && (
            <button
              type="button"
              className="idcrop-btn-back-dashboard"
              onClick={onClose}
              title="Return to Tools Dashboard"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
              </svg>
              <span>Back to Tools</span>
            </button>
          )}
        </div>
      </div>

      {/* Stepper Track */}
      <div className="idcrop-stepper-track">
        {STEPS.map((s) => {
          const isCurrent = step === s.num;
          const isCompleted = step > s.num;
          const isClickable =
            s.num === 1 ||
            (s.num === 2 && Boolean(frontRawUrl)) ||
            (s.num === 3 && Boolean(frontResult)) ||
            (s.num === 4 && Boolean(backRawUrl)) ||
            (s.num === 5 && Boolean(frontResult && backResult));

          return (
            <div
              key={s.num}
              className={`idcrop-step-pill ${isCurrent ? 'active' : ''} ${isCompleted ? 'completed' : ''} ${isClickable ? 'clickable' : 'disabled'}`}
              onClick={() => isClickable && handleStepClick(s.num)}
              title={s.sub}
            >
              <span className="idcrop-step-number">
                {isCompleted ? '✓' : s.num}
              </span>
              <div className="idcrop-step-text-group">
                <span className="idcrop-step-title">{s.num}. {s.title}</span>
                <span className="idcrop-step-subtitle">{s.sub}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Dynamic View depending on active Step */}
      <div className="idcrop-main-stage">
        {/* STEP 1: Front Side Upload */}
        {step === 1 && (
          <ImageUploader
            sideName="Front Side"
            sideSubtitle="Upload the front view of any ID card, voter card, PAN card, driving licence or card document"
            currentFile={frontRawFile}
            currentPreviewUrl={frontRawUrl}
            onImageSelected={handleFrontImageSelected}
            onRemoveImage={handleFrontRemove}
            onProceed={() => setStep(2)}
            theme={theme}
          />
        )}

        {/* STEP 2: Front Side Cropping */}
        {step === 2 && (
          <CropWorkspace
            sideName="Front Side"
            rawImageUrl={frontRawUrl}
            initialRotation={frontCropParams.rotation}
            initialCropMode={frontCropParams.cropMode}
            initialCorners={frontCropParams.corners}
            initialStraightBox={frontCropParams.straightBox}
            initialAdjustments={frontCropParams.adjustments}
            onApplyCrop={handleFrontCropApplied}
            onCancel={() => setStep(1)}
            theme={theme}
          />
        )}

        {/* STEP 3: Back Side Upload */}
        {step === 3 && (
          <ImageUploader
            sideName="Back Side"
            sideSubtitle="Upload the back view of your identity card to crop independently"
            currentFile={backRawFile}
            currentPreviewUrl={backRawUrl}
            onImageSelected={handleBackImageSelected}
            onRemoveImage={handleBackRemove}
            onProceed={() => setStep(4)}
            theme={theme}
          />
        )}

        {/* STEP 4: Back Side Cropping */}
        {step === 4 && (
          <CropWorkspace
            sideName="Back Side"
            rawImageUrl={backRawUrl}
            initialRotation={backCropParams.rotation}
            initialCropMode={backCropParams.cropMode}
            initialCorners={backCropParams.corners}
            initialStraightBox={backCropParams.straightBox}
            initialAdjustments={backCropParams.adjustments}
            onApplyCrop={handleBackCropApplied}
            onCancel={() => setStep(3)}
            theme={theme}
          />
        )}

        {/* STEP 5: Final Preview & Download */}
        {step === 5 && (
          <FinalPreview
            frontResult={frontResult}
            backResult={backResult}
            onEditFront={() => setStep(2)}
            onEditBack={() => setStep(4)}
            onReplaceFront={() => setStep(1)}
            onReplaceBack={() => setStep(3)}
            onResetAll={handleResetAll}
            theme={theme}
          />
        )}
      </div>
    </div>
  );
};

export default IDCardCropper;

