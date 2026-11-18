import React from 'react';

/**
 * ImageAdjustments component for ID Card Cropper
 * Provides Light & Colour sliders (Brightness, Contrast, Black, Red, Yellow, Blue)
 * matching Reference Image 2 specifications
 */
const ImageAdjustments = ({
  adjustments,
  onChange,
  onReset,
  theme = 'light'
}) => {
  const handleChange = (key, value) => {
    onChange({
      ...adjustments,
      [key]: parseInt(value, 10) || 0
    });
  };

  const SLIDERS = [
    {
      id: 'brightness',
      label: 'Brightness',
      min: -100,
      max: 100,
      value: adjustments.brightness || 0,
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="5"></circle>
          <line x1="12" y1="1" x2="12" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="23"></line>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
          <line x1="1" y1="12" x2="3" y2="12"></line>
          <line x1="21" y1="12" x2="23" y2="12"></line>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
        </svg>
      )
    },
    {
      id: 'contrast',
      label: 'Contrast',
      min: -100,
      max: 100,
      value: adjustments.contrast || 0,
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor"></path>
        </svg>
      )
    },
    {
      id: 'black',
      label: 'Black',
      min: -100,
      max: 100,
      value: adjustments.black || 0,
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor"></rect>
        </svg>
      )
    },
    {
      id: 'red',
      label: 'Red',
      min: -100,
      max: 100,
      value: adjustments.red || 0,
      trackClass: 'track-red',
      icon: <span className="idcrop-color-dot dot-red"></span>
    },
    {
      id: 'yellow',
      label: 'Yellow',
      min: -100,
      max: 100,
      value: adjustments.yellow || 0,
      trackClass: 'track-yellow',
      icon: <span className="idcrop-color-dot dot-yellow"></span>
    },
    {
      id: 'blue',
      label: 'Blue',
      min: -100,
      max: 100,
      value: adjustments.blue || 0,
      trackClass: 'track-blue',
      icon: <span className="idcrop-color-dot dot-blue"></span>
    }
  ];

  const hasModifications = Object.values(adjustments).some((v) => v !== 0);

  return (
    <div className={`idcrop-adjustments-card theme-${theme}`}>
      <div className="idcrop-adj-header">
        <div className="idcrop-adj-title-group">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="4" y1="21" x2="4" y2="14"></line>
            <line x1="4" y1="10" x2="4" y2="3"></line>
            <line x1="12" y1="21" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12" y2="3"></line>
            <line x1="20" y1="21" x2="20" y2="16"></line>
            <line x1="20" y1="12" x2="20" y2="3"></line>
            <line x1="1" y1="14" x2="7" y2="14"></line>
            <line x1="9" y1="8" x2="15" y2="8"></line>
            <line x1="17" y1="16" x2="23" y2="16"></line>
          </svg>
          <span className="idcrop-adj-title">Light & Colour</span>
        </div>
        <button
          type="button"
          className="idcrop-adj-reset-btn"
          onClick={onReset}
          disabled={!hasModifications}
          title="Reset all adjustments to zero"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="1 4 1 10 7 10"></polyline>
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
          </svg>
          <span>Reset</span>
        </button>
      </div>

      <div className="idcrop-adj-sliders-list">
        {SLIDERS.map((s) => (
          <div key={s.id} className="idcrop-adj-row">
            <div className="idcrop-adj-label-cell">
              <span className="idcrop-adj-icon">{s.icon}</span>
              <label htmlFor={`slider-${s.id}`} className="idcrop-adj-label">
                {s.label}
              </label>
            </div>
            <div className="idcrop-adj-slider-cell">
              <input
                id={`slider-${s.id}`}
                type="range"
                min={s.min}
                max={s.max}
                value={s.value}
                onChange={(e) => handleChange(s.id, e.target.value)}
                className={`idcrop-slider-input ${s.trackClass || ''}`}
              />
            </div>
            <div className="idcrop-adj-val-cell">
              <span className={`idcrop-adj-val-badge ${s.value !== 0 ? 'modified' : ''}`}>
                {s.value > 0 ? `+${s.value}` : s.value}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ImageAdjustments;

