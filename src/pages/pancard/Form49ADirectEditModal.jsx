import React, { useState, useEffect } from 'react';
import { API_URL } from '../../utils/apiClient';
import { getCleanLastName, getIndividualCapacity } from './Form49APdfGenerator';

export const Form49ADirectEditModal = ({ selectedPanAppDetails, onClose, onSaveSuccess, handleDownloadPdf }) => {
  const [editPanData, setEditPanData] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (selectedPanAppDetails) {
      const app = selectedPanAppDetails;
      const d = app.details || {};
      const nameParts = (app.applicantName || d.nameAsPerAadhaar || '').trim().split(' ');
      const rawLName = d.lastName || (nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0] || '');
      const fName = d.firstName || (nameParts.length > 1 ? nameParts[0] : '');
      const isIndiv = (d.applicantStatus || app.applicantStatus || 'INDIVIDUAL') === 'INDIVIDUAL';
      const cleanLName = isIndiv ? getCleanLastName(rawLName, fName, app.applicantName || d.nameAsPerAadhaar) : rawLName;
      const genderVal = (app.gender || d.gender || (['SMT', 'KUMARI'].includes(String(d.title || '').toUpperCase()) ? 'FEMALE' : 'MALE')).toUpperCase();
      const isMinor = Boolean(app.isMinor || d.isMinor);
      const capVal = isIndiv ? getIndividualCapacity({ ...d, ...app, gender: genderVal }, isMinor) : (d.verifierCapacity || 'DIRECTOR');

      setEditPanData({
        _id: app._id,
        title: d.title || (genderVal === 'FEMALE' ? 'SMT' : 'SHRI'),
        lastName: cleanLName,
        firstName: fName,
        middleName: d.middleName || (nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : ''),
        nameAsPerAadhaar: d.nameAsPerAadhaar || app.applicantName || '',
        otherName: d.otherName || 'NO',
        gender: genderVal,
        dob: app.dob || d.dob || '',
        isSingleMother: d.isSingleMother || 'NO',
        fatherLastName: d.fatherLastName || (app.fatherName || '').split(' ').pop() || '',
        fatherFirstName: d.fatherFirstName || (app.fatherName || '').split(' ')[0] || '',
        fatherMiddleName: d.fatherMiddleName || '',
        motherLastName: d.motherLastName || '',
        motherFirstName: d.motherFirstName || '',
        motherMiddleName: d.motherMiddleName || '',
        cardParentName: d.cardParentName || 'FATHER',
        aoAreaCode: d.aoAreaCode || 'PNE',
        aoType: d.aoType || 'C',
        aoRangeCode: d.aoRangeCode || '94',
        aoNo: d.aoNo || '1',
        flatNo: d.flatNo || '',
        premises: d.premises || '',
        roadStreet: d.roadStreet || '',
        areaTaluka: d.areaTaluka || '',
        district: d.district || '',
        state: d.state || 'MAHARASHTRA',
        pincode: d.pincode || '',
        commAddress: d.commAddress || 'RESIDENCE',
        mobileNumber: app.mobileNumber || d.mobileNumber || '',
        email: app.email || d.email || '',
        aadhaarNumber: app.aadhaarNumber || d.aadhaarNumber || '',
        panNumber: app.panNumber || d.panNumber || '',
        applicantStatus: d.applicantStatus || 'INDIVIDUAL',
        incomeSource: d.incomeSource || d.sourceofincome || d.sourceOfIncome || 'NO INCOME',
        proofOfIdentity: d.proofOfIdentity || 'AADHAAR CARD',
        proofOfAddress: d.proofOfAddress || 'AADHAAR CARD',
        proofOfDob: d.proofOfDob || 'AADHAAR CARD',
        verifierName: d.verifierName || app.applicantName || '',
        verifierCapacity: capVal,
        verifierPlace: d.verifierPlace || d.district || 'PUNE',
        verifierDate: d.verifierDate || new Date().toISOString().split('T')[0],
        photoUrl: app.photoUrl || d.photoUrl || '',
        signatureUrl: app.signatureUrl || d.signatureUrl || '',
        applicationType: app.applicationType || 'Manual New PAN',
        ackNumber: app.ackNumber || '',
        userId: app.userId || ''
      });
    }
  }, [selectedPanAppDetails]);

  if (!editPanData) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const isIndiv = (editPanData.applicantStatus || 'INDIVIDUAL') === 'INDIVIDUAL';
      const cleanLast = isIndiv ? getCleanLastName(editPanData.lastName, editPanData.firstName, editPanData.nameAsPerAadhaar) : editPanData.lastName;
      const updatedDetails = {
        ...editPanData,
        lastName: cleanLast
      };
      const fullApplicantName = `${editPanData.title || ''} ${editPanData.firstName || ''} ${editPanData.middleName || ''} ${cleanLast}`.trim() || editPanData.nameAsPerAadhaar;
      const fullFatherName = `${editPanData.fatherFirstName || ''} ${editPanData.fatherMiddleName || ''} ${editPanData.fatherLastName || ''}`.trim();

      const payload = {
        applicantName: fullApplicantName,
        fatherName: fullFatherName,
        dob: editPanData.dob,
        gender: editPanData.gender,
        mobileNumber: editPanData.mobileNumber,
        email: editPanData.email,
        aadhaarNumber: editPanData.aadhaarNumber,
        panNumber: editPanData.panNumber,
        details: updatedDetails
      };

      const res = await fetch(`${API_URL}/api/pancard/update-application/${editPanData._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success) {
        alert('✅ Form 49A changes saved successfully to database!');
        setEditPanData(updatedDetails);
        if (onSaveSuccess) onSaveSuccess(updatedDetails);
      } else {
        alert('Error updating application: ' + data.message);
      }
    } catch (err) {
      alert('Failed to save changes: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    fontFamily: 'monospace, "Courier New", Courier, monospace',
    fontWeight: 'bold',
    fontSize: '11.5px',
    color: '#000',
    background: '#f8fafc',
    border: '1px solid #000',
    padding: '3px 6px',
    textTransform: 'uppercase',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'all 0.15s ease'
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(6px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px' }}>
      
      <div style={{ background: '#f1f5f9', width: '100%', maxWidth: '890px', height: '96vh', borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', border: '1px solid #cbd5e1' }}>
        
        {/* EXECUTIVE SLEEK HEADER BAR */}
        <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', color: '#fff', padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', boxShadow: '0 2px 10px rgba(0,0,0,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: '#2563eb', color: '#fff', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 'bold' }}>
              📄
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 800, letterSpacing: '-0.2px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                Form No. 49A Direct Editor
                <span style={{ fontSize: '11px', background: '#3b82f620', color: '#60a5fa', border: '1px solid #3b82f640', padding: '1px 8px', borderRadius: '12px', fontWeight: 600 }}>Interactive Document</span>
              </div>
              <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '1px' }}>
                Ack: <strong style={{ color: '#cbd5e1', fontFamily: 'monospace' }}>{editPanData.ackNumber}</strong> &bull; Retailer: <strong style={{ color: '#cbd5e1' }}>{editPanData.userId}</strong>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: '#fff', border: 'none', padding: '7px 18px', borderRadius: '7px', fontWeight: 700, fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 6px rgba(37,99,235,0.3)', transition: 'all 0.2s ease' }}
            >
              {saving ? 'Saving...' : '💾 Save Changes'}
            </button>
            <button
              onClick={() => handleDownloadPdf(editPanData)}
              style={{ background: 'linear-gradient(135deg, #059669, #047857)', color: '#fff', border: 'none', padding: '7px 18px', borderRadius: '7px', fontWeight: 700, fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 6px rgba(5,150,105,0.3)', transition: 'all 0.2s ease' }}
            >
              📥 Download PDF
            </button>
            <button
              onClick={onClose}
              title="Close Editor"
              style={{ background: '#334155', color: '#cbd5e1', border: '1px solid #475569', width: '32px', height: '32px', borderRadius: '8px', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* SCROLLABLE OFFICIAL FORM 49A CANVAS */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#cbd5e1' }}>
          
          {/* PAGE 1: OFFICIAL FORM 49A CONTAINER */}
          <div style={{ width: '794px', background: '#ffffff', color: '#000000', fontFamily: 'Arial, sans-serif', fontSize: '9.5px', padding: '14px', border: '2px solid #000', boxSizing: 'border-box', boxShadow: '0 10px 30px rgba(0,0,0,0.15)', marginBottom: '24px' }}>
            
            <div style={{ border: '1.8px solid #000', padding: '6px', boxSizing: 'border-box' }}>
              
              {/* Header & Photo Boxes */}
              <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 130px', gap: '6px', marginBottom: '8px' }}>
                
                {/* Left Photo Box */}
                <div style={{ border: '1.2px solid #000', height: '145px', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2px', textAlign: 'center' }}>
                  {editPanData.photoUrl ? (
                    <img src={editPanData.photoUrl} alt="Applicant" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ fontSize: '8px', color: '#444', fontWeight: 'bold' }}>
                      Only 'Individuals' to affix recent photograph<br/>(3.5 cm x 2.5 cm)
                    </div>
                  )}
                  {editPanData.signatureUrl && (
                    <img src={editPanData.signatureUrl} alt="Sig" style={{ position: 'absolute', bottom: '10px', left: '-10px', width: '115px', height: '36px', transform: 'rotate(-10deg)', opacity: 0.85 }} />
                  )}
                  <div style={{ position: 'absolute', bottom: '-14px', left: 0, fontSize: '7px', width: '100%', textAlign: 'center', fontWeight: 'bold' }}>
                    Signature/Left thumb impression across this photo
                  </div>
                </div>

                {/* Form Title & AO Code */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                    Form No. 49A / {(editPanData.applicantStatus === 'INDIVIDUAL' || !editPanData.applicantStatus) ? 'Form No. 93' : 'Form No. 94'}
                  </div>
                  <div style={{ fontSize: '11.5px', fontWeight: 'bold' }}>Application for Allotment of Permanent Account Number</div>
                  <div style={{ fontSize: '8.5px', fontWeight: 'bold', margin: '2px 0' }}>
                    [{(editPanData.applicantStatus === 'INDIVIDUAL' || !editPanData.applicantStatus) ? 'In the case of Indian Citizens / Individuals (Form No. 93)' : 'In the case of Non-Individual Entities / Companies / Firms / Trusts (Form No. 94)'}]
                  </div>
                  <div style={{ fontSize: '8.5px', fontStyle: 'italic', marginBottom: '6px' }}>See Rule 114</div>

                  {/* AO CODE DIRECT EDIT TABLE - Only for Form 94 Non-Individuals */}
                  {(editPanData.applicantStatus && editPanData.applicantStatus !== 'INDIVIDUAL') && (
                    <div style={{ border: '1.2px solid #000', margin: '0 auto', maxWidth: '430px', padding: '4px', background: '#fff' }}>
                      <div style={{ fontSize: '9.5px', fontWeight: 'bold', borderBottom: '1px solid #000', paddingBottom: '2px', textTransform: 'uppercase' }}>
                        ASSESSING OFFICER (AO CODE)
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', fontSize: '9px', textAlign: 'center', marginTop: '4px' }}>
                        <div style={{ borderRight: '1px solid #000', padding: '0 4px' }}>
                          <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>Area code</div>
                          <input
                            type="text"
                            value={editPanData.aoAreaCode}
                            onChange={e => setEditPanData({...editPanData, aoAreaCode: e.target.value.toUpperCase()})}
                            style={{ ...inputStyle, width: '100%', textAlign: 'center', letterSpacing: '2px' }}
                          />
                        </div>
                        <div style={{ borderRight: '1px solid #000', padding: '0 4px' }}>
                          <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>AO type</div>
                          <input
                            type="text"
                            value={editPanData.aoType}
                            onChange={e => setEditPanData({...editPanData, aoType: e.target.value.toUpperCase()})}
                            style={{ ...inputStyle, width: '100%', textAlign: 'center', letterSpacing: '2px' }}
                          />
                        </div>
                        <div style={{ borderRight: '1px solid #000', padding: '0 4px' }}>
                          <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>Range code</div>
                          <input
                            type="text"
                            value={editPanData.aoRangeCode}
                            onChange={e => setEditPanData({...editPanData, aoRangeCode: e.target.value.toUpperCase()})}
                            style={{ ...inputStyle, width: '100%', textAlign: 'center', letterSpacing: '2px' }}
                          />
                        </div>
                        <div style={{ padding: '0 4px' }}>
                          <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>AO No.</div>
                          <input
                            type="text"
                            value={editPanData.aoNo}
                            onChange={e => setEditPanData({...editPanData, aoNo: e.target.value.toUpperCase()})}
                            style={{ ...inputStyle, width: '100%', textAlign: 'center', letterSpacing: '2px' }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Photo Box */}
                <div style={{ border: '1.2px solid #000', height: '145px', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2px', textAlign: 'center' }}>
                  {editPanData.photoUrl ? (
                    <img src={editPanData.photoUrl} alt="Applicant" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ fontSize: '8px', color: '#444', fontWeight: 'bold' }}>
                      Only 'Individuals' to affix recent photograph<br/>(3.5 cm x 2.5 cm)
                    </div>
                  )}
                  <div style={{ position: 'absolute', bottom: '-26px', right: 0, width: '130px', height: '24px', border: '1px solid #000', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {editPanData.signatureUrl ? (
                      <img src={editPanData.signatureUrl} alt="Sig" style={{ maxHeight: '20px', maxWidth: '120px' }} />
                    ) : (
                      <span style={{ fontSize: '7.5px', color: '#666', fontWeight: 'bold' }}>Signature/Left Thumb Impression</span>
                    )}
                  </div>
                </div>

              </div>

              {/* Declaration Note */}
              <div style={{ fontSize: '9px', margin: '10px 0 6px 0', fontWeight: '500' }}>
                Sir, I/We hereby request that a permanent account number be allotted to me/us.<br/>
                I/We give below necessary particulars:
              </div>

              {/* 1. FULL NAME */}
              <div style={{ borderTop: '1.2px solid #000', paddingTop: '4px', marginBottom: '6px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '10px', marginBottom: '3px' }}>
                  1 Full Name (Full expanded name to be mentioned as appearing in proof of identity/address documents: initials are not permitted)
                </div>
                
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '4px', fontSize: '9.5px', fontWeight: 'bold' }}>
                  <span>Please select title, as applicable:</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="title"
                      checked={editPanData.title === 'SHRI'}
                      onChange={() => {
                        const isIndiv = (editPanData.applicantStatus || 'INDIVIDUAL') === 'INDIVIDUAL';
                        setEditPanData({
                          ...editPanData,
                          title: 'SHRI',
                          gender: isIndiv ? 'MALE' : editPanData.gender,
                          verifierCapacity: isIndiv ? 'HIMSELF' : editPanData.verifierCapacity
                        });
                      }}
                    /> Shri
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="title"
                      checked={editPanData.title === 'SMT'}
                      onChange={() => {
                        const isIndiv = (editPanData.applicantStatus || 'INDIVIDUAL') === 'INDIVIDUAL';
                        setEditPanData({
                          ...editPanData,
                          title: 'SMT',
                          gender: isIndiv ? 'FEMALE' : editPanData.gender,
                          verifierCapacity: isIndiv ? 'HERSELF' : editPanData.verifierCapacity
                        });
                      }}
                    /> Smt.
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="title"
                      checked={editPanData.title === 'KUMARI'}
                      onChange={() => {
                        const isIndiv = (editPanData.applicantStatus || 'INDIVIDUAL') === 'INDIVIDUAL';
                        setEditPanData({
                          ...editPanData,
                          title: 'KUMARI',
                          gender: isIndiv ? 'FEMALE' : editPanData.gender,
                          verifierCapacity: isIndiv ? 'HERSELF' : editPanData.verifierCapacity
                        });
                      }}
                    /> Kumari
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="title"
                      checked={editPanData.title === 'M/S'}
                      onChange={() => setEditPanData({ ...editPanData, title: 'M/S' })}
                    /> M/s
                  </label>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', alignItems: 'center' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '9.5px' }}>Last Name / Surname</span>
                    <input type="text" value={editPanData.lastName} onChange={e => setEditPanData({...editPanData, lastName: e.target.value.toUpperCase()})} style={inputStyle} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', alignItems: 'center' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '9.5px' }}>First Name</span>
                    <input type="text" value={editPanData.firstName} onChange={e => setEditPanData({...editPanData, firstName: e.target.value.toUpperCase()})} style={inputStyle} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', alignItems: 'center' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '9.5px' }}>Middle Name</span>
                    <input type="text" value={editPanData.middleName} onChange={e => setEditPanData({...editPanData, middleName: e.target.value.toUpperCase()})} style={inputStyle} />
                  </div>
                </div>
              </div>

              {/* 2. ABBREVIATIONS OF NAME ON PAN CARD */}
              <div style={{ borderTop: '1.2px solid #000', paddingTop: '4px', marginBottom: '6px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '10px', marginBottom: '3px' }}>
                  2 Abbreviations of the above name, as you would like it to be printed on the PAN card
                </div>
                <input
                  type="text"
                  value={editPanData.nameAsPerAadhaar}
                  onChange={e => setEditPanData({...editPanData, nameAsPerAadhaar: e.target.value.toUpperCase()})}
                  style={{ ...inputStyle, width: '100%', color: '#1d4ed8' }}
                />
              </div>

              {/* 3. OTHER NAME (Only for Form 94 Non-Individuals) */}
              {(editPanData.applicantStatus && editPanData.applicantStatus !== 'INDIVIDUAL') && (
                <div style={{ borderTop: '1.2px solid #000', paddingTop: '4px', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '10px' }}>3 Have you ever been known by any other name?</span>
                    <div style={{ display: 'flex', gap: '12px', fontSize: '9.5px', fontWeight: 'bold' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer' }}>
                        <input type="radio" name="otherName" checked={editPanData.otherName === 'YES'} onChange={() => setEditPanData({...editPanData, otherName: 'YES'})} /> Yes
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer' }}>
                        <input type="radio" name="otherName" checked={editPanData.otherName !== 'YES'} onChange={() => setEditPanData({...editPanData, otherName: 'NO'})} /> No
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* 2. GENDER */}
              <div style={{ borderTop: '1.2px solid #000', paddingTop: '4px', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '10px' }}>2. Gender:</span>
                  <div style={{ display: 'flex', gap: '16px', fontSize: '9.5px', fontWeight: 'bold' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="gender"
                        checked={editPanData.gender === 'MALE'}
                        onChange={() => {
                          const isIndiv = (editPanData.applicantStatus || 'INDIVIDUAL') === 'INDIVIDUAL';
                          setEditPanData({
                            ...editPanData,
                            gender: 'MALE',
                            title: isIndiv && ['SMT', 'KUMARI'].includes(editPanData.title) ? 'SHRI' : editPanData.title,
                            verifierCapacity: isIndiv ? 'HIMSELF' : editPanData.verifierCapacity
                          });
                        }}
                      /> Male
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="gender"
                        checked={editPanData.gender === 'FEMALE'}
                        onChange={() => {
                          const isIndiv = (editPanData.applicantStatus || 'INDIVIDUAL') === 'INDIVIDUAL';
                          setEditPanData({
                            ...editPanData,
                            gender: 'FEMALE',
                            title: isIndiv && editPanData.title === 'SHRI' ? 'SMT' : editPanData.title,
                            verifierCapacity: isIndiv ? 'HERSELF' : editPanData.verifierCapacity
                          });
                        }}
                      /> Female
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="gender"
                        checked={editPanData.gender === 'TRANSGENDER'}
                        onChange={() => setEditPanData({ ...editPanData, gender: 'TRANSGENDER' })}
                      /> Transgender
                    </label>
                  </div>
                </div>
              </div>

              {/* 3. DATE OF BIRTH */}
              <div style={{ borderTop: '1.2px solid #000', paddingTop: '4px', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '10px' }}>3. Date of Birth</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '9.5px', fontWeight: 'bold' }}>DOB (YYYY-MM-DD):</span>
                    <input
                      type="text"
                      value={editPanData.dob}
                      onChange={e => setEditPanData({...editPanData, dob: e.target.value})}
                      placeholder="YYYY-MM-DD"
                      style={{ ...inputStyle, width: '130px', textAlign: 'center' }}
                    />
                  </div>
                </div>
              </div>

              {/* 6. DETAILS OF PARENTS */}
              <div style={{ borderTop: '1.2px solid #000', paddingTop: '4px', marginBottom: '6px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '10px', marginBottom: '2px' }}>
                  PART C - Details of Parents (applicable only for Individual applicants)
                </div>
                
                <div style={{ display: 'flex', gap: '12px', fontSize: '9px', marginBottom: '4px' }}>
                  <span>Whether mother is a single parent and you wish to apply for PAN by furnishing name of mother only?</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '3px', fontWeight: 'bold', cursor: 'pointer' }}>
                    <input type="radio" name="singleMother" checked={editPanData.isSingleMother === 'YES'} onChange={() => setEditPanData({...editPanData, isSingleMother: 'YES'})} /> Yes
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '3px', fontWeight: 'bold', cursor: 'pointer' }}>
                    <input type="radio" name="singleMother" checked={editPanData.isSingleMother !== 'YES'} onChange={() => setEditPanData({...editPanData, isSingleMother: 'NO'})} /> No
                  </label>
                </div>

                <div style={{ fontWeight: 'bold', fontSize: '9px', marginBottom: '2px' }}>13. Father's Name (Mandatory except where mother is single parent)</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '4px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', alignItems: 'center' }}>
                    <span style={{ fontSize: '9px', fontWeight: 'bold' }}>13. Father's First Name</span>
                    <input type="text" value={editPanData.fatherFirstName} onChange={e => setEditPanData({...editPanData, fatherFirstName: e.target.value.toUpperCase()})} style={inputStyle} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', alignItems: 'center' }}>
                    <span style={{ fontSize: '9px' }}>Father's Middle Name</span>
                    <input type="text" value={editPanData.fatherMiddleName} onChange={e => setEditPanData({...editPanData, fatherMiddleName: e.target.value.toUpperCase()})} style={inputStyle} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', alignItems: 'center' }}>
                    <span style={{ fontSize: '9px' }}>Father's Last Name / Surname</span>
                    <input type="text" value={editPanData.fatherLastName} onChange={e => setEditPanData({...editPanData, fatherLastName: e.target.value.toUpperCase()})} style={inputStyle} />
                  </div>
                </div>

                <div style={{ fontWeight: 'bold', fontSize: '9px', marginBottom: '2px' }}>14. Mother's Name (Optional)</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '4px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', alignItems: 'center' }}>
                    <span style={{ fontSize: '9px', fontWeight: 'bold' }}>14. Mother's First Name</span>
                    <input type="text" value={editPanData.motherFirstName} onChange={e => setEditPanData({...editPanData, motherFirstName: e.target.value.toUpperCase()})} style={inputStyle} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', alignItems: 'center' }}>
                    <span style={{ fontSize: '9px' }}>Mother's Middle Name</span>
                    <input type="text" value={editPanData.motherMiddleName} onChange={e => setEditPanData({...editPanData, motherMiddleName: e.target.value.toUpperCase()})} style={inputStyle} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', alignItems: 'center' }}>
                    <span style={{ fontSize: '9px' }}>Mother's Last Name / Surname</span>
                    <input type="text" value={editPanData.motherLastName} onChange={e => setEditPanData({...editPanData, motherLastName: e.target.value.toUpperCase()})} style={inputStyle} />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '16px', alignItems: 'center', fontSize: '9px', fontWeight: 'bold' }}>
                  <span>Select name of parent to be printed on PAN card:</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer' }}>
                    <input type="radio" name="cardParent" checked={editPanData.cardParentName === 'FATHER'} onChange={() => setEditPanData({...editPanData, cardParentName: 'FATHER'})} /> Father's Name
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer' }}>
                    <input type="radio" name="cardParent" checked={editPanData.cardParentName === 'MOTHER'} onChange={() => setEditPanData({...editPanData, cardParentName: 'MOTHER'})} /> Mother's Name
                  </label>
                </div>
              </div>

              {/* 7. RESIDENCE ADDRESS PARTICULARS */}
              <div style={{ borderTop: '1.2px solid #000', paddingTop: '4px', marginBottom: '6px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '10px', textAlign: 'center', marginBottom: '4px' }}>
                  7 Address - Residence Address
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', alignItems: 'center' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '9px' }}>Flat / Room / Door / Block No.</span>
                    <input type="text" value={editPanData.flatNo} onChange={e => setEditPanData({...editPanData, flatNo: e.target.value.toUpperCase()})} style={inputStyle} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', alignItems: 'center' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '9px' }}>Name of Premises / Building / Village</span>
                    <input type="text" value={editPanData.premises} onChange={e => setEditPanData({...editPanData, premises: e.target.value.toUpperCase()})} style={inputStyle} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', alignItems: 'center' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '9px' }}>Road / Street / Lane / Post Office</span>
                    <input type="text" value={editPanData.roadStreet} onChange={e => setEditPanData({...editPanData, roadStreet: e.target.value.toUpperCase()})} style={inputStyle} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', alignItems: 'center' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '9px' }}>Area / Locality / Taluka / Sub-Division</span>
                    <input type="text" value={editPanData.areaTaluka} onChange={e => setEditPanData({...editPanData, areaTaluka: e.target.value.toUpperCase()})} style={inputStyle} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', alignItems: 'center' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '9px' }}>Town / City / District</span>
                    <input type="text" value={editPanData.district} onChange={e => setEditPanData({...editPanData, district: e.target.value.toUpperCase()})} style={inputStyle} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', alignItems: 'center' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '9px' }}>State / Union Territory</span>
                    <input type="text" value={editPanData.state} onChange={e => setEditPanData({...editPanData, state: e.target.value.toUpperCase()})} style={inputStyle} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', alignItems: 'center' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '9px' }}>Pincode / Zip Code | Country</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input type="text" value={editPanData.pincode} onChange={e => setEditPanData({...editPanData, pincode: e.target.value})} style={{ ...inputStyle, width: '130px' }} />
                      <input type="text" value="INDIA" disabled style={{ ...inputStyle, width: '100px', background: '#e2e8f0' }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* 8. ADDRESS FOR COMMUNICATION */}
              <div style={{ borderTop: '1.2px solid #000', paddingTop: '4px', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '10px' }}>8 Address for Communication</span>
                  <div style={{ display: 'flex', gap: '16px', fontSize: '9.5px', fontWeight: 'bold' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                      <input type="radio" name="commAddress" checked={editPanData.commAddress === 'RESIDENCE'} onChange={() => setEditPanData({...editPanData, commAddress: 'RESIDENCE'})} /> Residence
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                      <input type="radio" name="commAddress" checked={editPanData.commAddress === 'OFFICE'} onChange={() => setEditPanData({...editPanData, commAddress: 'OFFICE'})} /> Office
                    </label>
                  </div>
                </div>
              </div>

              {/* 9. TELEPHONE & EMAIL */}
              <div style={{ borderTop: '1.2px solid #000', paddingTop: '4px', marginBottom: '6px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '10px', marginBottom: '3px' }}>9 Telephone Number & Email ID Details</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '9px' }}>Mobile No:</span>
                    <input type="text" value={editPanData.mobileNumber} onChange={e => setEditPanData({...editPanData, mobileNumber: e.target.value})} style={{ ...inputStyle, flex: 1 }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '9px' }}>Email:</span>
                    <input type="text" value={editPanData.email} onChange={e => setEditPanData({...editPanData, email: e.target.value})} style={{ ...inputStyle, flex: 1, textTransform: 'none' }} />
                  </div>
                </div>
              </div>

              {/* 10. STATUS OF APPLICANT */}
              <div style={{ borderTop: '1.2px solid #000', paddingTop: '4px', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '10px' }}>10 Status of Applicant:</span>
                  <select
                    value={editPanData.applicantStatus}
                    onChange={e => {
                      const newStatus = e.target.value;
                      const isIndiv = newStatus === 'INDIVIDUAL';
                      const isFem = editPanData.gender === 'FEMALE' || ['SMT', 'KUMARI'].includes(editPanData.title);
                      setEditPanData({
                        ...editPanData,
                        applicantStatus: newStatus,
                        verifierCapacity: isIndiv ? (isFem ? 'HERSELF' : 'HIMSELF') : (['HIMSELF', 'HERSELF', 'HIMSELF/HERSELF'].includes(editPanData.verifierCapacity) ? 'DIRECTOR' : editPanData.verifierCapacity)
                      });
                    }}
                    style={{ ...inputStyle, width: '200px' }}
                  >
                    <option value="INDIVIDUAL">Individual</option>
                    <option value="HUF">Hindu Undivided Family</option>
                    <option value="COMPANY">Company</option>
                    <option value="FIRM">Firm</option>
                    <option value="TRUST">Trust</option>
                    <option value="BODY OF INDIVIDUALS">Body of Individuals</option>
                  </select>
                </div>
              </div>

              {/* 11. 12-DIGIT AADHAAR NUMBER */}
              <div style={{ borderTop: '1.2px solid #000', paddingTop: '4px', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '10px' }}>12 Aadhaar Number (for Individuals):</span>
                  <input type="text" value={editPanData.aadhaarNumber} onChange={e => setEditPanData({...editPanData, aadhaarNumber: e.target.value})} style={{ ...inputStyle, width: '220px', letterSpacing: '1px' }} />
                </div>
              </div>

              {/* 12. SOURCE OF INCOME */}
              <div style={{ borderTop: '1.2px solid #000', paddingTop: '4px', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '10px' }}>13 Source of Income:</span>
                  <select value={editPanData.incomeSource} onChange={e => setEditPanData({...editPanData, incomeSource: e.target.value})} style={{ ...inputStyle, width: '220px' }}>
                    <option value="NO INCOME">No Income</option>
                    <option value="SALARY">Salary</option>
                    <option value="INCOME FROM BUSINESS/PROFESSION">Income from Business/Profession</option>
                    <option value="INCOME FROM HOUSE PROPERTY">Income from House Property</option>
                    <option value="CAPITAL GAINS">Capital Gains</option>
                    <option value="INCOME FROM OTHER SOURCES">Income from Other Sources</option>
                  </select>
                </div>
              </div>

              {/* 13. PROOF DOCUMENTS */}
              <div style={{ borderTop: '1.2px solid #000', paddingTop: '4px', marginBottom: '6px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '10px', marginBottom: '3px' }}>15 Documents Submitted as Proof of Identity, Address & DOB</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                  <div>
                    <div style={{ fontSize: '8.5px', fontWeight: 'bold' }}>Proof of Identity</div>
                    <input type="text" value={editPanData.proofOfIdentity} onChange={e => setEditPanData({...editPanData, proofOfIdentity: e.target.value.toUpperCase()})} style={{ ...inputStyle, width: '100%' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: '8.5px', fontWeight: 'bold' }}>Proof of Address</div>
                    <input type="text" value={editPanData.proofOfAddress} onChange={e => setEditPanData({...editPanData, proofOfAddress: e.target.value.toUpperCase()})} style={{ ...inputStyle, width: '100%' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: '8.5px', fontWeight: 'bold' }}>Proof of DOB</div>
                    <input type="text" value={editPanData.proofOfDob} onChange={e => setEditPanData({...editPanData, proofOfDob: e.target.value.toUpperCase()})} style={{ ...inputStyle, width: '100%' }} />
                  </div>
                </div>
              </div>

              {/* 14. VERIFICATION DECLARATION */}
              <div style={{ borderTop: '1.2px solid #000', paddingTop: '4px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '10px', marginBottom: '3px' }}>16 Verification Declaration</div>
                <div style={{ fontSize: '9px', lineHeight: '1.4' }}>
                  I/We <input type="text" value={editPanData.verifierName} onChange={e => setEditPanData({...editPanData, verifierName: e.target.value.toUpperCase()})} style={{ ...inputStyle, width: '220px', display: 'inline-block' }} />, 
                  the applicant, in the capacity of <input type="text" value={editPanData.verifierCapacity} onChange={e => setEditPanData({...editPanData, verifierCapacity: e.target.value.toUpperCase()})} style={{ ...inputStyle, width: '130px', display: 'inline-block' }} /> 
                  do hereby declare that what is stated above is true to the best of my/our information and belief.
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                  <div style={{ display: 'flex', gap: '15px' }}>
                    <div>Place: <input type="text" value={editPanData.verifierPlace} onChange={e => setEditPanData({...editPanData, verifierPlace: e.target.value.toUpperCase()})} style={{ ...inputStyle, width: '110px' }} /></div>
                    <div>Date: <input type="text" value={editPanData.verifierDate} onChange={e => setEditPanData({...editPanData, verifierDate: e.target.value})} style={{ ...inputStyle, width: '100px' }} /></div>
                  </div>
                  <div style={{ fontWeight: 'bold', fontSize: '9px', borderBottom: '1px solid #000', paddingBottom: '2px' }}>
                    Signature / Left Thumb Impression of Applicant
                  </div>
                </div>
              </div>

            </div>

          </div>

        </div>

      </div>

    </div>
  );
};
