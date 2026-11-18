import React, { useMemo, useState } from 'react';

const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

const EPanCorrectionPanForm = ({ onBack, onSubmit, serviceLabel = 'E-PAN Correction', submitLabel = 'Continue to Provider', showPanNumber = true, isSubmitting = false }) => {
  const [formData, setFormData] = useState({
    panNumber: '',
    title: '',
    firstName: '',
    middleName: '',
    lastName: '',
    dob: '',
    mobileNumber: '',
    email: ''
  });

  const fieldErrors = useMemo(() => {
    const nextErrors = {};

    if (showPanNumber && formData.panNumber && !PAN_PATTERN.test(formData.panNumber)) {
      nextErrors.panNumber = 'Enter a valid PAN in the format ABCDE1234F.';
    }

    if (formData.mobileNumber && !/^\d{10}$/.test(formData.mobileNumber)) {
      nextErrors.mobileNumber = 'Mobile number must be exactly 10 digits.';
    }

    ['firstName', 'middleName', 'lastName'].forEach((field) => {
      if (formData[field].length > 25) {
        nextErrors[field] = 'Name fields cannot exceed 25 characters.';
      }
    });

    if (formData.email.length > 75) {
      nextErrors.email = 'Email address cannot exceed 75 characters.';
    } else if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      nextErrors.email = 'Please enter a valid email address.';
    }

    if (formData.dob) {
      const selectedDate = new Date(`${formData.dob}T00:00:00`);
      if (Number.isNaN(selectedDate.getTime())) {
        nextErrors.dob = 'Please enter a valid date of birth.';
      }
    }

    return nextErrors;
  }, [formData, showPanNumber]);

  const isValid = Boolean(
    (!showPanNumber || (formData.panNumber && PAN_PATTERN.test(formData.panNumber))) &&
    formData.title &&
    formData.lastName.trim() &&
    formData.firstName.length <= 25 &&
    formData.middleName.length <= 25 &&
    formData.lastName.length <= 25 &&
    formData.dob &&
    formData.mobileNumber &&
    /^\d{10}$/.test(formData.mobileNumber) &&
    formData.email &&
    formData.email.length <= 75 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)
  );

  const handleChange = (event) => {
    const { name, value } = event.target;
    const nextValue = name === 'panNumber' ? value.toUpperCase() : value;
    setFormData(prev => ({ ...prev, [name]: nextValue }));
  };

  const handleSubmit = async () => {
    if (!isValid || !onSubmit) return;
    const [year, month, day] = formData.dob.split('-');
    await onSubmit({
      panNumber: formData.panNumber.trim(),
      title: formData.title,
      firstName: formData.firstName.trim(),
      middleName: formData.middleName.trim(),
      lastName: formData.lastName.trim(),
      dob: formData.dob,
      dateofbirth: `${day}/${month}/${year}`,
      mobileNumber: formData.mobileNumber.trim(),
      email: formData.email.trim().toLowerCase(),
      providerFields: {
        title: formData.title,
        lastname: formData.lastName.trim(),
        firstname: formData.firstName.trim(),
        middlename: formData.middleName.trim(),
        dateofbirth: `${day}/${month}/${year}`,
        mobileno: formData.mobileNumber.trim(),
        emailid: formData.email.trim().toLowerCase(),
        ...(showPanNumber ? { pan: formData.panNumber.trim() } : {})
      }
    });
  };

  return (
    <div style={{ gridColumn: '1 / -1', maxWidth: '560px', width: '100%' }}>
      <div onKeyDown={(event) => {
        if (event.key === 'Enter') event.preventDefault();
      }}>
        {showPanNumber && <div className="form-group-pro">
          <label className="form-label-pro" htmlFor="epan-correction-pan">
            PAN Number <span className="req-star">*</span>
          </label>
          <input
            id="epan-correction-pan"
            name="panNumber"
            type="text"
            value={formData.panNumber}
            onChange={handleChange}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.preventDefault();
            }}
            placeholder="ABCDE1234F"
            maxLength={10}
            required
            autoComplete="off"
            pattern="[A-Z]{5}[0-9]{4}[A-Z]"
            aria-invalid={Boolean(formData.panNumber && fieldErrors.panNumber)}
            aria-describedby="epan-correction-status"
            className="form-input-pro uppercase-text"
          />
          {fieldErrors.panNumber && (
            <p role="alert" style={{ color: '#dc2626', fontSize: '12px', margin: '6px 0 0' }}>
              {fieldErrors.panNumber}
            </p>
          )}
        </div>}

        <div className="form-group-pro" style={{ marginTop: '14px' }}>
          <label className="form-label-pro" htmlFor="epan-correction-title">
            Title <span className="req-star">*</span>
          </label>
          <select
            id="epan-correction-title"
            name="title"
            value={formData.title}
            onChange={handleChange}
            required
            className="form-select-pro"
          >
            <option value="">Select title</option>
            <option value="1">SHRI</option>
            <option value="2">SMT</option>
            <option value="3">KUMARI</option>
          </select>
        </div>

        <div className="form-group-pro" style={{ marginTop: '14px' }}>
          <label className="form-label-pro" htmlFor="epan-correction-first-name">
            First Name
          </label>
          <input
            id="epan-correction-first-name"
            name="firstName"
            type="text"
            value={formData.firstName}
            onChange={handleChange}
            maxLength={25}
            autoComplete="given-name"
            className="form-input-pro"
          />
          {fieldErrors.firstName && (
            <p role="alert" style={{ color: '#dc2626', fontSize: '12px', margin: '6px 0 0' }}>
              {fieldErrors.firstName}
            </p>
          )}
        </div>

        <div className="form-group-pro" style={{ marginTop: '14px' }}>
          <label className="form-label-pro" htmlFor="epan-correction-middle-name">
            Middle Name
          </label>
          <input
            id="epan-correction-middle-name"
            name="middleName"
            type="text"
            value={formData.middleName}
            onChange={handleChange}
            maxLength={25}
            autoComplete="additional-name"
            className="form-input-pro"
          />
          <small>Optional; maximum 25 characters.</small>
          {fieldErrors.middleName && (
            <p role="alert" style={{ color: '#dc2626', fontSize: '12px', margin: '6px 0 0' }}>
              {fieldErrors.middleName}
            </p>
          )}
        </div>

        <div className="form-group-pro" style={{ marginTop: '14px' }}>
          <label className="form-label-pro" htmlFor="epan-correction-last-name">
            Last Name <span className="req-star">*</span>
          </label>
          <input
            id="epan-correction-last-name"
            name="lastName"
            type="text"
            value={formData.lastName}
            onChange={handleChange}
            maxLength={25}
            required
            autoComplete="family-name"
            className="form-input-pro"
          />
          {fieldErrors.lastName && (
            <p role="alert" style={{ color: '#dc2626', fontSize: '12px', margin: '6px 0 0' }}>
              {fieldErrors.lastName}
            </p>
          )}
        </div>

        <div className="form-group-pro" style={{ marginTop: '14px' }}>
          <label className="form-label-pro" htmlFor="epan-correction-dob">
            Date of Birth <span className="req-star">*</span>
          </label>
          <input
            id="epan-correction-dob"
            name="dob"
            type="date"
            value={formData.dob}
            onChange={handleChange}
            required
            className="form-input-pro"
          />
          {fieldErrors.dob && (
            <p role="alert" style={{ color: '#dc2626', fontSize: '12px', margin: '6px 0 0' }}>
              {fieldErrors.dob}
            </p>
          )}
        </div>

        <div className="form-group-pro" style={{ marginTop: '14px' }}>
          <label className="form-label-pro" htmlFor="epan-correction-mobile">
            Mobile Number <span className="req-star">*</span>
          </label>
          <input
            id="epan-correction-mobile"
            name="mobileNumber"
            type="tel"
            value={formData.mobileNumber}
            onChange={handleChange}
            placeholder="9876543210"
            maxLength={10}
            required
            className="form-input-pro"
          />
          {fieldErrors.mobileNumber && (
            <p role="alert" style={{ color: '#dc2626', fontSize: '12px', margin: '6px 0 0' }}>
              {fieldErrors.mobileNumber}
            </p>
          )}
        </div>

        <div className="form-group-pro" style={{ marginTop: '14px' }}>
          <label className="form-label-pro" htmlFor="epan-correction-email">
            Email Address <span className="req-star">*</span>
          </label>
          <input
            id="epan-correction-email"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="name@example.com"
            maxLength={75}
            required
            className="form-input-pro"
          />
          {fieldErrors.email && (
            <p role="alert" style={{ color: '#dc2626', fontSize: '12px', margin: '6px 0 0' }}>
              {fieldErrors.email}
            </p>
          )}
        </div>

        <div
          id="epan-correction-status"
          role="status"
          style={{
            background: '#fff7ed',
            border: '1px solid #fdba74',
            borderRadius: '10px',
            color: '#9a3412',
            fontSize: '13px',
            lineHeight: 1.5,
            marginTop: '16px',
            padding: '12px 14px'
          }}
        >
          After submission, you will be redirected to the provider to authorize {serviceLabel}.
          The application fee is debited only after the provider confirms your request was successful.
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
          <button
            type="button"
            onClick={handleSubmit}
            className="pancard-submit-btn"
            disabled={!isValid || !onSubmit || isSubmitting}
            style={{
              cursor: !isValid || !onSubmit || isSubmitting ? 'not-allowed' : 'pointer',
              opacity: !isValid || !onSubmit || isSubmitting ? 0.6 : 1
            }}
          >
            {isSubmitting ? 'Submitting...' : submitLabel}
          </button>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              style={{
                background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                border: 'none',
                borderRadius: '8px',
                color: '#ffffff',
                cursor: 'pointer',
                fontSize: '12.5px',
                fontWeight: 700,
                padding: '8px 20px'
              }}
            >
              ◀ Back to PAN Services
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default EPanCorrectionPanForm;
