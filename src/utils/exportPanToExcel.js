import * as XLSX from 'xlsx';

// Format date from ISO string or YYYY-MM-DD to DD/MM/YYYY
const fmtDate = (val) => {
  if (!val) return '';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return String(val); }
};

// Pick first non-empty value
const pick = (...vals) => {
  for (const v of vals) {
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
};

/**
 * Maps a single PanCardApplication into a flat object
 * where every key is a column header and the value is the cell value.
 */
const mapToColumns = (app) => {
  const d = app.details || {};
  return {
    // Submission Info
    'Ack Number':                     pick(app.ackNumber),
    'Retailer User ID':               pick(app.userId),
    'Application Type':               pick(app.applicationType),
    'Status':                         pick(app.status),
    'Fee Amount (₹)':                 String(app.feeAmount ?? 107),
    'Submitted On':                   fmtDate(app.createdAt),
    'Last Updated':                   fmtDate(app.updatedAt),
    'Retailer Remarks':               pick(app.remarks, d.remarks),
    'Admin Remarks':                  pick(app.adminRemarks),

    // Applicant Identity
    'Category':                       pick(d.category, d.applicantStatus),
    'Title':                          pick(d.title),
    'First Name':                     pick(d.firstName),
    'Middle Name':                    pick(d.middleName),
    'Last Name':                      pick(d.lastName),
    'Full Name (As per Aadhaar)':     pick(d.nameAsPerAadhaar, app.applicantName),
    'Other Name':                     pick(d.otherName),
    'Gender':                         pick(app.gender, d.gender),
    'Date of Birth':                  fmtDate(pick(app.dob, d.dob)),
    'Aadhaar Number':                 pick(app.aadhaarNumber, d.aadhaarNumber),
    'Existing PAN Number':            pick(app.panNumber, d.panNumber),
    'PAN Type':                       pick(app.panType),

    // Contact
    'Mobile Number':                  pick(app.mobileNumber, d.mobileNumber),
    'Email ID':                       pick(app.email, d.email),
    'Passport Number':                pick(d.passportNumber),

    // Father
    "Father's First Name":            pick(d.fatherFirstName),
    "Father's Middle Name":           pick(d.fatherMiddleName),
    "Father's Last Name":             pick(d.fatherLastName),
    "Father's Full Name":             pick(app.fatherName, d.fatherName),

    // Mother
    "Mother's First Name":            pick(d.motherFirstName),
    "Mother's Middle Name":           pick(d.motherMiddleName),
    "Mother's Last Name":             pick(d.motherLastName),
    'Single Parent?':                 pick(d.isSingleParent, d.isSingleMother),
    'Parent Name to Print on PAN':    pick(d.cardParentName, d.parentToPrint),

    // Address
    'Flat / Door / Block No':         pick(d.flatNo),
    'Premises / Building / Village':  pick(d.premises),
    'Road / Street / Post Office':    pick(d.roadStreet),
    'Area / Taluka / Sub Division':   pick(d.areaTaluka),
    'State':                          pick(d.state),
    'Town / District':                pick(d.district),
    'Pincode':                        pick(d.pincode),
    'Communication Address':          pick(d.commAddress, d.communicationAddress),

    // AO Codes
    'AO City':                        pick(d.aoCity),
    'AO Area Code':                   pick(d.aoAreaCode),
    'AO Type':                        pick(d.aoType),
    'AO Range Code':                  pick(d.aoRangeCode),
    'AO Number':                      pick(d.aoNo),

    // Proof Documents
    'Proof of Identity':              pick(d.proofOfIdentity),
    'Proof of Address':               pick(d.proofOfAddress),
    'Proof of DOB':                   pick(d.proofOfDob),

    // Income & Status
    'Income Source':                  pick(d.incomeSource),
    'Applicant Status':               pick(d.applicantStatus),

    // Verifier
    'Verifier Name':                  pick(d.verifierName),
    'Verifier Capacity':              pick(d.verifierCapacity),
    'Verifier Place':                 pick(d.verifierPlace),
    'Verifier Date':                  fmtDate(pick(d.verifierDate)),

    // Uploads
    'Photo Uploaded':                 app.photoUrl     ? 'Yes' : 'No',
    'Signature Uploaded':             app.signatureUrl ? 'Yes' : 'No',
    'Additional Docs':                Array.isArray(app.additionalDocuments) && app.additionalDocuments.length > 0
      ? app.additionalDocuments.map(doc => doc.name || 'Document').join(', ')
      : 'None',
  };
};

/**
 * Export a SINGLE PAN application as Excel.
 * One header row (all field names as columns) + one data row below it.
 */
export const exportSinglePanApplicationToExcel = (app) => { // eslint-disable-line no-unused-vars
  if (!app) return;

  const row = mapToColumns(app);
  const worksheet = XLSX.utils.json_to_sheet([row]);

  // Auto-fit column widths
  const keys = Object.keys(row);
  worksheet['!cols'] = keys.map((key) => ({
    wch: Math.min(Math.max(key.length, String(row[key] ?? '').length) + 2, 50)
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Application');

  const safeAck = (app.ackNumber || 'PAN_App').replace(/[^a-zA-Z0-9_]/g, '_');
  XLSX.writeFile(workbook, `${safeAck}_${app.userId || 'Retailer'}.xlsx`);
};
