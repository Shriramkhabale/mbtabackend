import {
  ALL_INDIAN_STATES,
  INDIAN_STATES_DISTRICTS,
  ALL_INDIAN_DISTRICTS,
  PROOF_OF_IDENTITY_OPTIONS,
  PROOF_OF_ADDRESS_OPTIONS,
  PROOF_OF_DOB_OPTIONS
} from '../../utils/indiaData';
import StampSignatureMerger from './StampSignatureMerger';

const TextField = ({ label, name, value, onChange, required = false, type = 'text', placeholder, uppercase = false }) => (

  <div className="form-group-pro">
    <label className="form-label-pro">{label} {required && <span className="req-star">*</span>}</label>
    <input
      className={`form-input-pro ${uppercase ? 'uppercase-text' : ''}`}
      type={type}
      name={name}
      value={value || ''}
      onChange={onChange}
      placeholder={placeholder || label}
      required={required}
    />
  </div>
);

const SelectField = ({ label, name, value, onChange, children, required = false }) => (
  <div className="form-group-pro">
    <label className="form-label-pro">{label} {required && <span className="req-star">*</span>}</label>
    <select className="form-select-pro" name={name} value={value || ''} onChange={onChange} required={required}>{children}</select>
  </div>
);

const PanCorrectionForm = ({ data, onChange, onFileChange, onSubmit, onDownload, isSubmitting, customFields = [], tabs = [] }) => {
  const isIndividual = !data.category || data.category === 'INDIVIDUAL';
  const tabObj = (Array.isArray(tabs) ? tabs.find(t => t.id === 'epan_correction' || t.id === 'manual_pan_correction') : null) || {
    label: 'PAN Correction',
    icon: '📝',
    fee: 107,
    badge: 'PAN Update Service',
    description: 'Request changes or corrections to an existing PAN record for Individual (Form 93) or Non-Individual Entities (Form 94).'
  };

  return (
    <form onSubmit={onSubmit} className="manual-pan-form">
      {/* Top Header Card */}
      <div className="pancard-form-hero-card" style={{ marginBottom: '20px' }}>
        <div className="hero-card-header">
          <h4 className="hero-form-title">
            {tabObj.icon || '📝'} {tabObj.label || 'PAN Correction'} <span className="hero-fee-pill">Fee: ₹{tabObj.fee ?? 107}</span>
          </h4>
          <p className="hero-form-desc">
            {tabObj.description || 'Request changes or corrections to an existing PAN record for Individual (Form 93) or Non-Individual Entities (Form 94).'}
          </p>
        </div>
      </div>

      {/* Primary Fields: Existing PAN & Category */}
      <div className="pan-primary-fields-card">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label className="form-label-pro">EXISTING PAN NUMBER <span className="req-star">*</span></label>
            <input
              type="text"
              name="panNumber"
              value={data.panNumber || ''}
              onChange={onChange}
              placeholder="e.g. ABCDE1234F"
              maxLength={10}
              className="form-input-pro uppercase-text"
              required
            />
          </div>

          <div>
            <label className="form-label-pro">CATEGORY OF APPLICANT <span className="req-star">*</span></label>
            <select
              name="category"
              value={data.category || 'INDIVIDUAL'}
              onChange={onChange}
              className="form-select-pro"
              style={{ width: '100%' }}
            >
              <option value="INDIVIDUAL">INDIVIDUAL</option>
              <option value="FIRM">FIRM</option>
              <option value="BODY OF INDIVIDUALS">BODY OF INDIVIDUALS</option>
              <option value="TRUST">TRUST</option>
              <option value="ASSOCIATION OF PERSONS">ASSOCIATION OF PERSONS</option>
              <option value="LOCAL AUTHORITY">LOCAL AUTHORITY</option>
              <option value="COMPANY">COMPANY</option>
              <option value="HINDU UNDIVIDED FAMILY">HINDU UNDIVIDED FAMILY</option>
              <option value="LIMITED LIABILITY PARTNERSHIP">LIMITED LIABILITY PARTNERSHIP</option>
              <option value="ARTIFICIAL JURIDICAL PERSON">ARTIFICIAL JURIDICAL PERSON</option>
              <option value="GOVERNMENT">GOVERNMENT</option>
            </select>
          </div>
        </div>
      </div>

      {/* =========================================================================
          IF CATEGORY IS INDIVIDUAL -> RENDER FORM 93 INDIVIDUAL CORRECTION
         ========================================================================= */}
      {isIndividual ? (
        <>
          {/* Correction / Change Selection Checkboxes */}
          <div className="form-section-card pan-correction-tick-card">
            <div className="form-section-header">
              <span className="form-section-icon">☑️</span>
              <h4 className="form-section-title" style={{ color: '#ea580c' }}>Select Fields to Update / Correct (Tick Boxes)</h4>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', padding: '6px 0' }}>
              <label className="pan-correction-tick-label">
                <input type="checkbox" name="nameCorrection" checked={Boolean(data.nameCorrection)} onChange={(e) => onChange({ target: { name: 'nameCorrection', value: e.target.checked } })} />
                <span>Correct Name</span>
              </label>
              <label className="pan-correction-tick-label">
                <input type="checkbox" name="dobCorrection" checked={Boolean(data.dobCorrection)} onChange={(e) => onChange({ target: { name: 'dobCorrection', value: e.target.checked } })} />
                <span>Correct Date of Birth</span>
              </label>
              <label className="pan-correction-tick-label">
                <input type="checkbox" name="genderCorrection" checked={Boolean(data.genderCorrection)} onChange={(e) => onChange({ target: { name: 'genderCorrection', value: e.target.checked } })} />
                <span>Correct Gender</span>
              </label>
              <label className="pan-correction-tick-label">
                <input type="checkbox" name="addressCorrection" checked={Boolean(data.addressCorrection)} onChange={(e) => onChange({ target: { name: 'addressCorrection', value: e.target.checked } })} />
                <span>Update Address</span>
              </label>
              <label className="pan-correction-tick-label">
                <input type="checkbox" name="fatherCorrection" checked={Boolean(data.fatherCorrection)} onChange={(e) => onChange({ target: { name: 'fatherCorrection', value: e.target.checked } })} />
                <span>Correct Parent Name</span>
              </label>
              <label className="pan-correction-tick-label">
                <input type="checkbox" name="contactCorrection" checked={Boolean(data.contactCorrection)} onChange={(e) => onChange({ target: { name: 'contactCorrection', value: e.target.checked } })} />
                <span>Update Mobile / Email</span>
              </label>
            </div>
          </div>

          {/* Section 1: Personal Details */}
          <div className="form-section-card">
            <div className="form-section-header">
              <span className="form-section-icon">👤</span>
              <h4 className="form-section-title">PART A - Personal Information</h4>
            </div>
            <div className="pancard-form-grid">
              <TextField label="AADHAAR NO" name="aadhaarNumber" value={data.aadhaarNumber} onChange={onChange} required placeholder="12 DIGITS UID NO" />
              <SelectField label="TITLE" name="title" value={data.title || 'SHRI'} onChange={onChange} required>
                <option value="SHRI">SHRI</option>
                <option value="SMT">SMT</option>
                <option value="KUMARI">KUMARI</option>
                <option value="M/S">M/S</option>
              </SelectField>
              <TextField label="FIRST NAME" name="firstName" value={data.firstName} onChange={onChange} required uppercase />
              <TextField label="MIDDLE NAME" name="middleName" value={data.middleName} onChange={onChange} uppercase />
              <TextField label="LAST NAME / SURNAME" name="lastName" value={data.lastName} onChange={onChange} required uppercase />
              <TextField label="NAME AS PER AADHAAR" name="nameAsPerAadhaar" value={data.nameAsPerAadhaar} onChange={onChange} required uppercase />
              <SelectField label="GENDER" name="gender" value={data.gender} onChange={onChange} required>
                <option value="">Please Select</option>
                <option value="MALE">MALE</option>
                <option value="FEMALE">FEMALE</option>
                <option value="TRANSGENDER">TRANSGENDER</option>
              </SelectField>
              <TextField label="DATE OF BIRTH" name="dob" value={data.dob} onChange={onChange} required type="date" />
              <TextField label="MOBILE NO." name="mobileNumber" value={data.mobileNumber} onChange={onChange} required type="tel" placeholder="MOBILE NO." />
              <TextField label="EMAIL ID" name="email" value={data.email} onChange={onChange} required type="email" />
            </div>
          </div>

          {/* Section 2: Address Details */}
          <div className="form-section-card">
            <div className="form-section-header">
              <span className="form-section-icon">🏡</span>
              <h4 className="form-section-title">Address Details (Residence / Office)</h4>
            </div>
            <div style={{ color: '#ef4444', fontWeight: 800, fontSize: '12.5px', marginBottom: '14px' }}>
              NOTE: Please fill address details exactly as per Aadhaar / Supporting Proof.
            </div>
            <div className="pancard-form-grid">
              <SelectField label="ADDRESS TYPE" name="addressType" value={data.addressType || 'RESIDENCE'} onChange={onChange} required>
                <option value="RESIDENCE">RESIDENCE</option>
                <option value="OFFICE">OFFICE</option>
              </SelectField>
              <TextField label="FLAT / DOOR / BUILDING" name="flatNo" value={data.flatNo || data.flatDoorBuilding} onChange={onChange} required uppercase />
              <TextField label="ROAD / STREET / BLOCK / SECTOR" name="roadStreet" value={data.roadStreet || data.roadStreetBlock} onChange={onChange} required uppercase />
              <TextField label="POST OFFICE" name="postOffice" value={data.postOffice} onChange={onChange} required uppercase />
              <TextField label="AREA / LOCALITY / TOWN / CITY" name="areaTaluka" value={data.areaTaluka || data.areaLocality} onChange={onChange} required uppercase />
              <SelectField
                label="STATE / UNION TERRITORY"
                name="state"
                value={data.state ? data.state.toUpperCase() : ''}
                onChange={(e) => {
                  onChange(e);
                  onChange({ target: { name: 'district', value: '' } });
                }}
                required
              >
                <option value="">PLEASE SELECT</option>
                {ALL_INDIAN_STATES.map(st => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </SelectField>

              <SelectField
                label="DISTRICT"
                name="district"
                value={data.district ? data.district.toUpperCase() : ''}
                onChange={onChange}
                required
              >
                <option value="">SELECT DISTRICT</option>
                {(() => {
                  const stUpper = (data.state || '').toUpperCase().trim();
                  const stateDistList = INDIAN_STATES_DISTRICTS[stUpper] || ALL_INDIAN_DISTRICTS;
                  const currentDist = (data.district || '').toUpperCase().trim();
                  const distOptions = [...new Set([...stateDistList, currentDist])].filter(Boolean);
                  return distOptions.map(dist => (
                    <option key={dist} value={dist}>{dist}</option>
                  ));
                })()}
              </SelectField>
              <TextField label="COUNTRY / REGION" name="country" value={data.country || 'INDIA'} onChange={onChange} required uppercase />
              <TextField label="PIN / ZIP CODE" name="pincode" value={data.pincode} onChange={onChange} required />
            </div>
          </div>

          {/* Section 3: Parent Details */}
          <div className="form-section-card">
            <div className="form-section-header">
              <span className="form-section-icon">👪</span>
              <h4 className="form-section-title">PART B - Details of Parents</h4>
            </div>
            <div className="pancard-form-grid">
              <TextField label="FATHER'S FIRST NAME" name="fatherFirstName" value={data.fatherFirstName} onChange={onChange} required uppercase />
              <TextField label="FATHER'S MIDDLE NAME" name="fatherMiddleName" value={data.fatherMiddleName} onChange={onChange} uppercase />
              <TextField label="FATHER'S LAST NAME" name="fatherLastName" value={data.fatherLastName} onChange={onChange} required uppercase />
              <TextField label="MOTHER'S FIRST NAME" name="motherFirstName" value={data.motherFirstName} onChange={onChange} uppercase />
              <TextField label="MOTHER'S MIDDLE NAME" name="motherMiddleName" value={data.motherMiddleName} onChange={onChange} uppercase />
              <TextField label="MOTHER'S LAST NAME" name="motherLastName" value={data.motherLastName} onChange={onChange} uppercase />
              <SelectField label="NAME OF PARENT TO PRINT ON PAN CARD" name="parentToPrint" value={data.parentToPrint || data.parentNameToPrint || 'Father'} onChange={onChange} required>
                <option value="Father">FATHER</option>
                <option value="Mother">MOTHER</option>
              </SelectField>
            </div>
          </div>

          {/* Section 4: Proof Documents */}
          <div className="form-section-card">
            <div className="form-section-header">
              <span className="form-section-icon">🪪</span>
              <h4 className="form-section-title">Part C - Proof Documents & Declarations</h4>
            </div>
            <div className="pancard-form-grid">
              <SelectField label="PROOF OF IDENTITY" name="proofOfIdentity" value={data.proofOfIdentity} onChange={onChange} required>
                <option value="">Please Select</option>
                {PROOF_OF_IDENTITY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </SelectField>
              <SelectField label="PROOF OF ADDRESS" name="proofOfAddress" value={data.proofOfAddress} onChange={onChange} required>
                <option value="">Please Select</option>
                {PROOF_OF_ADDRESS_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </SelectField>
              <SelectField label="PROOF OF DATE OF BIRTH" name="proofOfDob" value={data.proofOfDob} onChange={onChange} required>
                <option value="">Please Select</option>
                {PROOF_OF_DOB_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </SelectField>
              <SelectField label="COPY OF EXISTING PAN" name="copyOfPan" value={data.copyOfPan || 'YES'} onChange={onChange}>
                <option value="YES">COPY OF PAN CARD ATTACHED</option>
                <option value="ALLOTMENT_LETTER">PAN ALLOTMENT LETTER ATTACHED</option>
                <option value="NO">NO PAN COPY ATTACHED</option>
              </SelectField>
              <TextField label="PASSPORT NUMBER (IF APPLICABLE)" name="passportNumber" value={data.passportNumber} onChange={onChange} uppercase />
              <TextField label="TIN IN COUNTRY OF RESIDENCE (IF APPLICABLE)" name="tin" value={data.tin} onChange={onChange} uppercase />
            </div>
          </div>

        </>
      ) : (
        /* =========================================================================
            IF CATEGORY IS NOT INDIVIDUAL -> RENDER NON-INDIVIDUAL CORRECTION FORM
           ========================================================================= */
        <div className="non-individual-form-wrapper" style={{ marginTop: '16px' }}>
          <div className="pan-nonindiv-banner">
            🏢 <strong>Request For Changes Or Correction in PAN Data [For Non-Individual]</strong>: Update of PAN Record for {data.category} (Company / Firm / Trust / Entity / Association of Persons / Body of Individuals / HUF / LLP).
          </div>

          {/* PART A: ENTITY INFORMATION */}
          <div className="form-section-card">
            <div className="form-section-header">
              <span className="form-section-icon">🏢</span>
              <h4 className="form-section-title">Part A - Personal / Entity Information</h4>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label className="form-label-pro">1. NAME OF {data.category} / ENTITY <span className="req-star">*</span></label>
                <input
                  type="text"
                  name="entityName"
                  value={data.entityName || data.lastName || ''}
                  onChange={onChange}
                  placeholder={`ENTER FULL NAME OF ${data.category}`}
                  className="form-input-pro uppercase-text"
                  required
                />
              </div>

              <div>
                <label className="form-label-pro">2. DATE OF INCORPORATION / AGREEMENT / TRUST DEED / FORMATION <span className="req-star">*</span></label>
                <input
                  type="date"
                  name="dateOfIncorporation"
                  value={data.dateOfIncorporation || data.dob || ''}
                  onChange={onChange}
                  className="form-input-pro"
                  required
                />
              </div>

              <div>
                <label className="form-label-pro">REGISTRATION NUMBER (FOR COMPANY, FIRM, LLP, TRUST, ETC.)</label>
                <input
                  type="text"
                  name="registrationNumber"
                  value={data.registrationNumber || ''}
                  onChange={onChange}
                  placeholder="ENTER REGISTRATION / CIN NO."
                  className="form-input-pro uppercase-text"
                />
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <label className="form-label-pro">TAXPAYER IDENTIFICATION NUMBER (TIN IN COUNTRY OF RESIDENCE, IF ANY)</label>
                <input
                  type="text"
                  name="tin"
                  value={data.tin || ''}
                  onChange={onChange}
                  placeholder="ENTER TIN IN COUNTRY OF RESIDENCE (IF APPLICABLE)"
                  className="form-input-pro uppercase-text"
                />
              </div>
            </div>

            {/* Contact Details */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginTop: '14px' }}>
              <div>
                <label className="form-label-pro">MOBILE NO. <span className="req-star">*</span></label>
                <input
                  type="tel"
                  name="mobileNumber"
                  value={data.mobileNumber || ''}
                  onChange={onChange}
                  placeholder="10-DIGIT MOBILE NO."
                  maxLength={10}
                  className="form-input-pro"
                  required
                />
              </div>

              <div>
                <label className="form-label-pro">EMAIL ID <span className="req-star">*</span></label>
                <input
                  type="email"
                  name="email"
                  value={data.email || ''}
                  onChange={onChange}
                  placeholder="OFFICIAL EMAIL ID"
                  className="form-input-pro"
                  required
                />
              </div>

              <div>
                <label className="form-label-pro">LANDLINE NO. WITH STD CODE</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="text"
                    name="stdCode"
                    value={data.stdCode || ''}
                    onChange={onChange}
                    placeholder="STD"
                    style={{ width: '60px' }}
                    className="form-input-pro"
                  />
                  <input
                    type="text"
                    name="landlineNumber"
                    value={data.landlineNumber || ''}
                    onChange={onChange}
                    placeholder="LANDLINE NO."
                    className="form-input-pro"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* OFFICE ADDRESS */}
          <div className="form-section-card">
            <div className="form-section-header">
              <span className="form-section-icon">📍</span>
              <h4 className="form-section-title">Office Address</h4>
            </div>

            <div className="pancard-form-grid">
              <TextField label="FLAT / DOOR / BUILDING" name="flatNo" value={data.flatNo || data.flatDoorBuilding} onChange={onChange} required uppercase />
              <TextField label="ROAD / STREET / BLOCK / SECTOR" name="roadStreet" value={data.roadStreet || data.roadStreetBlock} onChange={onChange} required uppercase />
              <TextField label="POST OFFICE" name="postOffice" value={data.postOffice} onChange={onChange} required uppercase />
              <TextField label="AREA / LOCALITY / TOWN / CITY" name="areaTaluka" value={data.areaTaluka || data.areaLocality} onChange={onChange} required uppercase />
              <SelectField
                label="STATE / UNION TERRITORY"
                name="state"
                value={data.state ? data.state.toUpperCase() : ''}
                onChange={(e) => {
                  onChange(e);
                  onChange({ target: { name: 'district', value: '' } });
                }}
                required
              >
                <option value="">PLEASE SELECT</option>
                {ALL_INDIAN_STATES.map(st => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </SelectField>

              <SelectField
                label="DISTRICT"
                name="district"
                value={data.district ? data.district.toUpperCase() : ''}
                onChange={onChange}
                required
              >
                <option value="">SELECT DISTRICT</option>
                {(() => {
                  const stUpper = (data.state || '').toUpperCase().trim();
                  const stateDistList = INDIAN_STATES_DISTRICTS[stUpper] || ALL_INDIAN_DISTRICTS;
                  const currentDist = (data.district || '').toUpperCase().trim();
                  const distOptions = [...new Set([...stateDistList, currentDist])].filter(Boolean);
                  return distOptions.map(dist => (
                    <option key={dist} value={dist}>{dist}</option>
                  ));
                })()}
              </SelectField>
              <TextField label="COUNTRY / REGION" name="country" value={data.country || 'INDIA'} onChange={onChange} required uppercase />
              <TextField label="PIN / ZIP CODE" name="pincode" value={data.pincode} onChange={onChange} required />
            </div>
          </div>

          {/* PART B: DECLARATION & PROOF DOCUMENTS */}
          <div className="form-section-card">
            <div className="form-section-header">
              <span className="form-section-icon">📑</span>
              <h4 className="form-section-title">Part B - Declaration by Applicant & Proof Documents</h4>
            </div>

            <div className="pancard-form-grid">
              <SelectField label="PROOF OF IDENTITY" name="proofOfIdentity" value={data.proofOfIdentity} onChange={onChange} required>
                <option value="">Please Select</option>
                {PROOF_OF_IDENTITY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </SelectField>
              <SelectField label="PROOF OF ADDRESS" name="proofOfAddress" value={data.proofOfAddress} onChange={onChange} required>
                <option value="">Please Select</option>
                {PROOF_OF_ADDRESS_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </SelectField>
              <SelectField label="PROOF OF INCORPORATION / AGREEMENT / DEED" name="proofOfIncorporation" value={data.proofOfIncorporation || data.proofOfDob} onChange={onChange} required>
                <option value="">Please Select</option>
                <option value="REGISTRATION CERTIFICATE ISSUED BY REGISTRAR OF COMPANIES">REGISTRATION CERTIFICATE (ROC)</option>
                <option value="PARTNERSHIP DEED">PARTNERSHIP DEED</option>
                <option value="TRUST DEED">TRUST DEED</option>
                <option value="LLP AGREEMENT">LLP AGREEMENT</option>
                <option value="CERTIFICATE OF INCORPORATION">CERTIFICATE OF INCORPORATION</option>
              </SelectField>
              <SelectField label="PROOF OF PAN" name="copyOfPan" value={data.copyOfPan || 'YES'} onChange={onChange}>
                <option value="YES">COPY OF PAN CARD ATTACHED</option>
                <option value="ALLOTMENT_LETTER">PAN ALLOTMENT LETTER ATTACHED</option>
                <option value="NO">NO PAN COPY ATTACHED</option>
              </SelectField>
              <TextField label="AUTHORIZED SIGNATORY / VERIFIER NAME" name="verifierName" value={data.verifierName || data.raName} onChange={onChange} required uppercase />
              <SelectField label="DESIGNATION OF SIGNATORY" name="designation" value={data.designation || ''} onChange={onChange} required>
                <option value="">-- Select DESIGNATION OF SIGNATORY --</option>
                <option value="PARTNER">PARTNER</option>
                <option value="DIRECTOR">DIRECTOR</option>
                <option value="TRUSTEE">TRUSTEE</option>
                <option value="AUTHORISED SIGNATORY">AUTHORISED SIGNATORY</option>
                <option value="PROPRIETOR">PROPRIETOR</option>
                <option value="KARTA">KARTA</option>
              </SelectField>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Custom Fields Section */}
      {customFields.length > 0 && (
        <div className={`pan-custom-fields-box ${isIndividual ? 'theme-blue' : 'theme-orange'}`}>
          <h4 className="pan-custom-fields-title">
            ✨ Additional Custom Form Fields ({isIndividual ? 'Form 93' : 'Form 94'})
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
            {customFields.map(f => (
              <div key={f.name}>
                <label className="form-label-pro">
                  {f.icon ? `${f.icon} ` : ''}{f.label} {f.required && <span className="req-star">*</span>}
                </label>
                {f.type === 'select' ? (
                  <select
                    name={f.name}
                    value={data[f.name] || ''}
                    onChange={onChange}
                    className="form-select-pro"
                    style={{ width: '100%' }}
                    required={f.required}
                  >
                    <option value="">-- Select {f.label} --</option>
                    {(f.options || []).map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : f.type === 'file' ? (
                  <input
                    type="file"
                    onChange={(e) => onFileChange(e, f.name)}
                    className="form-input-pro"
                    style={{ width: '100%' }}
                  />
                ) : (
                  <input
                    type={f.type || 'text'}
                    name={f.name}
                    value={data[f.name] || ''}
                    onChange={onChange}
                    placeholder={f.placeholder || `Enter ${f.label}`}
                    className="form-input-pro"
                    style={{ width: '100%' }}
                    required={f.required}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Photo & Signature Upload Section */}
      <div className="form-section-card" style={{ marginTop: '24px' }}>
        <div className="form-section-header">
          <span className="form-section-icon">📷</span>
          <h4 className="form-section-title">
            {isIndividual ? 'Photo & Signature Upload Form' : 'Authorized Representative Signature & Stamp Upload'}
          </h4>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isIndividual ? '1fr 1fr' : '1fr', gap: '16px' }}>
          {isIndividual && (
            <div className="file-upload-label" style={{ padding: '10px 14px' }}>
              <div className="file-upload-info-group">
                <span className="file-upload-icon">👤</span>
                <div>
                  <div className="file-upload-title" style={{ fontSize: '12.5px' }}>Upload Applicant Photo *</div>
                  <div className="file-upload-subtitle" style={{ fontSize: '10.5px' }}>JPG, PNG photo</div>
                </div>
              </div>
              <input type="file" accept="image/*" onChange={e => onFileChange(e, 'photoUrl')} style={{ display: 'none' }} id="corrPhotoInput" />
              <label htmlFor="corrPhotoInput" className="file-upload-btn-badge" style={{ padding: '4px 10px', fontSize: '11px', cursor: 'pointer' }}>
                {data.photoUrl ? '✅ Attached' : 'Browse'}
              </label>
            </div>
          )}
          {isIndividual ? (
            <div className="file-upload-label" style={{ padding: '10px 14px', gridColumn: 'span 1' }}>
              <div className="file-upload-info-group">
                <span className="file-upload-icon">✍️</span>
                <div>
                  <div className="file-upload-title" style={{ fontSize: '12.5px' }}>
                    Upload Applicant Signature *
                  </div>
                  <div className="file-upload-subtitle" style={{ fontSize: '10.5px' }}>JPG, PNG signature image</div>
                </div>
              </div>
              <input type="file" accept="image/*" onChange={e => onFileChange(e, 'signatureUrl')} style={{ display: 'none' }} id="corrSigInput" />
              <label htmlFor="corrSigInput" className="file-upload-btn-badge" style={{ padding: '4px 10px', fontSize: '11px', cursor: 'pointer' }}>
                {data.signatureUrl ? '✅ Attached' : 'Browse'}
              </label>
            </div>
          ) : (
            <div style={{ gridColumn: 'span 1' }}>
              <StampSignatureMerger
                value={data.signatureUrl}
                isRequired={true}
                onMerge={(dataUrl) => onFileChange(dataUrl, 'signatureUrl')}
              />
            </div>
          )}
        </div>
      </div>

      {/* Supporting Documents Upload Section (Attached after PDF) */}
      <div className="form-section-card" style={{ marginTop: '20px' }}>
        <div className="form-section-header">
          <span className="form-section-icon">📁</span>
          <h4 className="form-section-title">
            {isIndividual ? 'Supporting Documents Upload (Attached after PDF form)' : 'Supporting Documents Upload (Registration Certificate, Identity & Address Proof)'}
          </h4>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
          {!isIndividual && (
            <div className="file-upload-label" style={{ padding: '10px 14px' }}>
              <div className="file-upload-info-group">
                <span className="file-upload-icon">📜</span>
                <div>
                  <div className="file-upload-title" style={{ fontSize: '12.5px' }}>Upload Registration Certificate *</div>
                  <div className="file-upload-subtitle" style={{ fontSize: '10.5px' }}>ROC, Partnership Deed, Trust Deed (PDF/JPG)</div>
                </div>
              </div>
              <input type="file" accept="image/*,application/pdf" onChange={e => onFileChange(e, 'proofOfIncorporationUrl')} style={{ display: 'none' }} id="corrIncorpInput" />
              <label htmlFor="corrIncorpInput" className="file-upload-btn-badge" style={{ padding: '4px 10px', fontSize: '11px', cursor: 'pointer' }}>
                {data.proofOfIncorporationUrl ? '✅ Attached' : 'Browse'}
              </label>
            </div>
          )}

          <div className="file-upload-label" style={{ padding: '10px 14px' }}>
            <div className="file-upload-info-group">
              <span className="file-upload-icon">🪪</span>
              <div>
                <div className="file-upload-title" style={{ fontSize: '12.5px' }}>Upload Identity Proof *</div>
                <div className="file-upload-subtitle" style={{ fontSize: '10.5px' }}>Identity document (PDF/JPG)</div>
              </div>
            </div>
            <input type="file" accept="image/*,application/pdf" onChange={e => onFileChange(e, 'proofOfIdentityUrl')} style={{ display: 'none' }} id="corrPoiInput" />
            <label htmlFor="corrPoiInput" className="file-upload-btn-badge" style={{ padding: '4px 10px', fontSize: '11px', cursor: 'pointer' }}>
              {data.proofOfIdentityUrl ? '✅ Attached' : 'Browse'}
            </label>
          </div>

          <div className="file-upload-label" style={{ padding: '10px 14px' }}>
            <div className="file-upload-info-group">
              <span className="file-upload-icon">🏠</span>
              <div>
                <div className="file-upload-title" style={{ fontSize: '12.5px' }}>Upload Address Proof *</div>
                <div className="file-upload-subtitle" style={{ fontSize: '10.5px' }}>Address document (PDF/JPG)</div>
              </div>
            </div>
            <input type="file" accept="image/*,application/pdf" onChange={e => onFileChange(e, 'proofOfAddressUrl')} style={{ display: 'none' }} id="corrPoaInput" />
            <label htmlFor="corrPoaInput" className="file-upload-btn-badge" style={{ padding: '4px 10px', fontSize: '11px', cursor: 'pointer' }}>
              {data.proofOfAddressUrl ? '✅ Attached' : 'Browse'}
            </label>
          </div>

          {isIndividual && (
            <div className="file-upload-label" style={{ padding: '10px 14px' }}>
              <div className="file-upload-info-group">
                <span className="file-upload-icon">🎂</span>
                <div>
                  <div className="file-upload-title" style={{ fontSize: '12.5px' }}>Upload Date of Birth Proof</div>
                  <div className="file-upload-subtitle" style={{ fontSize: '10.5px' }}>DOB proof document (PDF/JPG)</div>
                </div>
              </div>
              <input type="file" accept="image/*,application/pdf" onChange={e => onFileChange(e, 'proofOfDobUrl')} style={{ display: 'none' }} id="corrDobInput" />
              <label htmlFor="corrDobInput" className="file-upload-btn-badge" style={{ padding: '4px 10px', fontSize: '11px', cursor: 'pointer' }}>
                {data.proofOfDobUrl ? '✅ Attached' : 'Browse'}
              </label>
            </div>
          )}

          <div className="file-upload-label" style={{ padding: '10px 14px' }}>
            <div className="file-upload-info-group">
              <span className="file-upload-icon">💳</span>
              <div>
                <div className="file-upload-title" style={{ fontSize: '12.5px' }}>Upload Copy of Existing PAN</div>
                <div className="file-upload-subtitle" style={{ fontSize: '10.5px' }}>PAN Card copy or allotment letter (PDF/JPG)</div>
              </div>
            </div>
            <input type="file" accept="image/*,application/pdf" onChange={e => onFileChange(e, 'proofOfPanUrl')} style={{ display: 'none' }} id="corrPanCopyInput" />
            <label htmlFor="corrPanCopyInput" className="file-upload-btn-badge" style={{ padding: '4px 10px', fontSize: '11px', cursor: 'pointer' }}>
              {data.proofOfPanUrl ? '✅ Attached' : 'Browse'}
            </label>
          </div>

          <div className="file-upload-label" style={{ padding: '10px 14px' }}>
            <div className="file-upload-info-group">
              <span className="file-upload-icon">📄</span>
              <div>
                <div className="file-upload-title" style={{ fontSize: '12.5px' }}>Upload Other Supporting Document</div>
                <div className="file-upload-subtitle" style={{ fontSize: '10.5px' }}>Any additional proof (PDF/JPG)</div>
              </div>
            </div>
            <input type="file" accept="image/*,application/pdf" onChange={e => onFileChange(e, 'proofOfOtherUrl')} style={{ display: 'none' }} id="corrOtherInput" />
            <label htmlFor="corrOtherInput" className="file-upload-btn-badge" style={{ padding: '4px 10px', fontSize: '11px', cursor: 'pointer' }}>
              {data.proofOfOtherUrl ? '✅ Attached' : 'Browse'}
            </label>
          </div>
        </div>
      </div>

      <button type="button" onClick={onDownload} className="pancard-submit-btn" style={{ marginTop: '22px', background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)' }}>
        📥 Download Pre-Filled PAN CR PDF
      </button>

      <button type="submit" disabled={isSubmitting} className="pancard-submit-btn" style={{ marginTop: '14px' }}>
        {isSubmitting ? 'Submitting...' : '🚀 Submit Application'}
      </button>
    </form>
  );
};

export default PanCorrectionForm;
