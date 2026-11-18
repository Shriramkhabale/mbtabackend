const express = require('express');
const router = express.Router();
const Employee = require('../models/Employee');
const EmployeeField = require('../models/EmployeeField');
const { EmployeeActivity, logEmployeeActivity } = require('../models/EmployeeActivity');
const User = require('../models/User');
const { getNextRetailerEmployeeUid } = require('../models/Counter');
const {
  PERMISSION_CATALOG,
  getRetailerAuthorizedPermissionIds,
  sanitizeEmployeePermissions
} = require('../utils/employeePermissions');
const { createSessionToken } = require('../utils/sessionToken');

/**
 * Helper to extract canonical Retailer ID from headers, query, body, or session
 */
function getReqRetailerId(req) {
  const fromHeader = req.headers['x-retailer-id'] || req.headers['x-user-id'];
  if (fromHeader && typeof fromHeader === 'string' && fromHeader.trim() && fromHeader.trim().toLowerCase() !== 'user' && fromHeader.trim().toLowerCase() !== 'admin') {
    return fromHeader.trim();
  }
  const fromQuery = req.query.retailerId || req.query.userId;
  if (fromQuery && typeof fromQuery === 'string' && fromQuery.trim() && fromQuery.trim().toLowerCase() !== 'user' && fromQuery.trim().toLowerCase() !== 'admin') {
    return fromQuery.trim();
  }
  const fromBody = req.body && (req.body.retailerId || req.body.userId);
  if (fromBody && typeof fromBody === 'string' && fromBody.trim() && fromBody.trim().toLowerCase() !== 'user' && fromBody.trim().toLowerCase() !== 'admin') {
    return fromBody.trim();
  }
  if (req.user && (req.user.retailerId || req.user.userId)) {
    const id = req.user.retailerId || req.user.userId;
    if (id && String(id).trim().toLowerCase() !== 'user') return String(id).trim();
  }
  return 'MBTAR000010101';
}

/**
 * Helper to identify who is making the request (retailer vs employee)
 */
function getReqActor(req) {
  const employeeUid = req.headers['x-employee-uid'] || (req.user && req.user.employeeUid) || (req.body && req.body.employeeUid);
  const employeeName = req.headers['x-employee-name'] || (req.user && req.user.employeeName) || (req.body && req.body.employeeName);
  if (employeeUid) {
    return {
      role: 'employee',
      uid: String(employeeUid).trim(),
      name: employeeName ? String(employeeName).trim() : String(employeeUid).trim()
    };
  }
  const retailerId = getReqRetailerId(req);
  return {
    role: 'retailer',
    uid: retailerId,
    name: 'Retailer'
  };
}

/**
 * Auto-seed default fields for a retailer if not yet configured
 */
async function seedDefaultFieldsForRetailer(retailerId) {
  const count = await EmployeeField.countDocuments({ retailerId });
  if (count === 0) {
    const defaultFields = EmployeeField.DEFAULT_EMPLOYEE_FIELDS.map(df => ({
      ...df,
      retailerId
    }));
    try {
      await EmployeeField.insertMany(defaultFields, { ordered: false });
    } catch (_) {
      // Ignore race conditions on unique compound index
    }
  }
}

// ======================================================================
// 1. DYNAMIC FORM FIELDS SETTINGS (Section 4)
// ======================================================================

// GET /api/crm/employees/fields - Get all form fields for this retailer
router.get('/fields', async (req, res) => {
  try {
    const retailerId = getReqRetailerId(req);
    await seedDefaultFieldsForRetailer(retailerId);

    const fields = await EmployeeField.find({ retailerId }).sort({ order: 1, createdAt: 1 }).lean();
    res.json({
      success: true,
      fields
    });
  } catch (err) {
    console.error('Error fetching employee fields:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/crm/employees/fields - Add custom form field
router.post('/fields', async (req, res) => {
  try {
    const retailerId = getReqRetailerId(req);
    const { name, label, type = 'text', required = false, options = [], placeholder = '', icon = '📝' } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Field identifier/name is required.' });
    }
    if (!label || !label.trim()) {
      return res.status(400).json({ success: false, message: 'Field label is required.' });
    }

    const cleanName = name.trim().replace(/[^a-zA-Z0-9_]/g, '');
    const exists = await EmployeeField.findOne({ retailerId, name: cleanName });
    if (exists) {
      return res.status(400).json({ success: false, message: `Field '${cleanName}' already exists for your shop.` });
    }

    const maxOrderField = await EmployeeField.findOne({ retailerId }).sort({ order: -1 }).lean();
    const nextOrder = (maxOrderField && typeof maxOrderField.order === 'number') ? maxOrderField.order + 1 : 0;

    const newField = new EmployeeField({
      retailerId,
      name: cleanName,
      label: label.trim(),
      type,
      required: Boolean(required),
      hidden: false,
      options: Array.isArray(options) ? options.map(o => String(o).trim()).filter(Boolean) : [],
      placeholder: (placeholder || '').trim(),
      icon: (icon || '📝').trim(),
      order: nextOrder,
      isSystem: false
    });

    await newField.save();

    res.status(201).json({
      success: true,
      message: 'Custom field added successfully.',
      field: newField
    });
  } catch (err) {
    console.error('Error adding employee field:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/crm/employees/fields/:id - Update form field
router.put('/fields/:id', async (req, res) => {
  try {
    const retailerId = getReqRetailerId(req);
    const field = await EmployeeField.findOne({ _id: req.params.id, retailerId });
    if (!field) {
      return res.status(404).json({ success: false, message: 'Field not found or access denied.' });
    }

    const { label, type, required, options, placeholder, icon } = req.body;
    if (label && label.trim()) field.label = label.trim();
    if (type && !field.isSystem) field.type = type; // system field types are protected
    if (required !== undefined) field.required = Boolean(required);
    if (Array.isArray(options)) field.options = options.map(o => String(o).trim()).filter(Boolean);
    if (placeholder !== undefined) field.placeholder = String(placeholder).trim();
    if (icon !== undefined) field.icon = String(icon).trim();

    await field.save();

    res.json({
      success: true,
      message: 'Field updated successfully.',
      field
    });
  } catch (err) {
    console.error('Error updating employee field:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/crm/employees/fields/:id/toggle - Toggle hidden/active
router.patch('/fields/:id/toggle', async (req, res) => {
  try {
    const retailerId = getReqRetailerId(req);
    const field = await EmployeeField.findOne({ _id: req.params.id, retailerId });
    if (!field) {
      return res.status(404).json({ success: false, message: 'Field not found.' });
    }

    field.hidden = !field.hidden;
    await field.save();

    res.json({
      success: true,
      message: field.hidden ? 'Field disabled.' : 'Field enabled.',
      field
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/crm/employees/fields/:id - Delete custom field
router.delete('/fields/:id', async (req, res) => {
  try {
    const retailerId = getReqRetailerId(req);
    const field = await EmployeeField.findOne({ _id: req.params.id, retailerId });
    if (!field) {
      return res.status(404).json({ success: false, message: 'Field not found.' });
    }
    if (field.isSystem) {
      return res.status(400).json({ success: false, message: 'Default system fields cannot be deleted. You may hide them instead.' });
    }

    await EmployeeField.deleteOne({ _id: req.params.id, retailerId });
    res.json({ success: true, message: 'Custom field deleted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/crm/employees/fields/reorder - Bulk reorder fields
router.post('/fields/reorder', async (req, res) => {
  try {
    const retailerId = getReqRetailerId(req);
    const { fieldIds } = req.body;
    if (!Array.isArray(fieldIds)) {
      return res.status(400).json({ success: false, message: 'fieldIds array is required.' });
    }

    const bulkOps = fieldIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id, retailerId },
        update: { $set: { order: index } }
      }
    }));

    if (bulkOps.length > 0) {
      await EmployeeField.bulkWrite(bulkOps);
    }

    res.json({ success: true, message: 'Fields reordered successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ======================================================================
// 2. EMPLOYEE ACTIVITY TRACKING (Section 9)
// ======================================================================

// GET /api/crm/employees/activities - List activity history
router.get('/activities', async (req, res) => {
  try {
    const retailerId = getReqRetailerId(req);
    const { employeeUid, serviceName, action, startDate, endDate, search, limit = 200, skip = 0 } = req.query;

    const filter = { retailerId };
    if (employeeUid && employeeUid.trim() && employeeUid !== 'ALL') {
      filter.employeeUid = employeeUid.trim();
    }
    if (serviceName && serviceName.trim() && serviceName !== 'ALL') {
      filter.serviceName = serviceName.trim();
    }
    if (action && action.trim() && action !== 'ALL') {
      filter.action = { $regex: action.trim(), $options: 'i' };
    }

    if (startDate || endDate) {
      filter.activityDate = {};
      if (startDate) filter.activityDate.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.activityDate.$lte = end;
      }
    }

    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { employeeUid: { $regex: q, $options: 'i' } },
        { employeeName: { $regex: q, $options: 'i' } },
        { action: { $regex: q, $options: 'i' } },
        { recordId: { $regex: q, $options: 'i' } },
        { moduleName: { $regex: q, $options: 'i' } }
      ];
    }

    const total = await EmployeeActivity.countDocuments(filter);
    const activities = await EmployeeActivity.find(filter)
      .sort({ activityDate: -1, createdAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit))
      .lean();

    res.json({
      success: true,
      total,
      activities
    });
  } catch (err) {
    console.error('Error fetching employee activities:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/crm/employees/activities - Log activity
router.post('/activities', async (req, res) => {
  try {
    const retailerId = getReqRetailerId(req);
    const { employeeUid, employeeName, serviceName, moduleName, action, recordId, status, details } = req.body;

    const logged = await logEmployeeActivity({
      employeeUid,
      employeeName,
      retailerId,
      serviceName,
      moduleName,
      action,
      recordId,
      status,
      details,
      req
    });

    res.status(201).json({ success: true, activity: logged });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ======================================================================
// 3. EMPLOYEE AUTHENTICATION & INDEPENDENT LOGIN (Section 6)
// ======================================================================

// POST /api/crm/employees/login - Authenticate Employee
router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: 'Please enter Employee UID / Mobile and Password.' });
    }

    const cleanQuery = String(identifier).trim();
    const cleanMobile = cleanQuery.replace(/^\+91/, '').replace(/^0/, '');

    // Look up employee by employeeUid or mobileNumber
    const employee = await Employee.findOne({
      $or: [
        { employeeUid: { $regex: new RegExp(`^${cleanQuery}$`, 'i') } },
        { mobileNumber: cleanQuery },
        { mobileNumber: cleanMobile }
      ]
    });

    if (!employee) {
      return res.status(401).json({ success: false, message: 'Invalid Employee UID / Mobile number or Password.' });
    }

    // Verify Password
    if (employee.password !== password) {
      return res.status(401).json({ success: false, message: 'Invalid Employee UID / Mobile number or Password.' });
    }

    // Check Account Status
    if (employee.status === 'Inactive' || employee.loginEnabled === false) {
      return res.status(403).json({
        success: false,
        message: 'Your employee account is deactivated by the retailer. Please contact your manager.'
      });
    }

    // Verify Parent Retailer Status
    const retailer = await User.findOne({
      $or: [{ userId: employee.retailerId }, { retailerId: employee.retailerId }]
    });

    if (retailer && retailer.status === 'Rejected') {
      return res.status(403).json({ success: false, message: 'Parent retailer account is rejected or suspended.' });
    }

    // Calculate Effective Permissions:
    // Effective = Parent Retailer Authorized Permissions AND Employee's Assigned Permissions
    const effectivePermissions = sanitizeEmployeePermissions(employee.permissions, retailer);

    // Update last login
    employee.lastLoginAt = new Date();
    await employee.save();

    // Log Activity
    await logEmployeeActivity({
      employeeUid: employee.employeeUid,
      employeeName: employee.fullName,
      retailerId: employee.retailerId,
      serviceName: 'Authentication',
      moduleName: 'Employee Login',
      action: 'Successful Employee Login',
      status: 'Success',
      details: `Logged in via ${cleanQuery.includes('-EMP') ? 'Employee UID' : 'Mobile Number'}`,
      req
    });

    // Create session token
    const token = createSessionToken({
      userId: employee.employeeUid,
      employeeUid: employee.employeeUid,
      employeeName: employee.fullName,
      retailerId: employee.retailerId,
      role: 'employee',
      permissions: effectivePermissions
    });

    res.json({
      success: true,
      message: `Welcome back, ${employee.fullName}!`,
      token,
      employee: employee.toSafeObject(),
      effectivePermissions,
      parentRetailer: {
        retailerId: employee.retailerId,
        shopName: retailer ? retailer.shopName : '',
        name: retailer ? retailer.name : ''
      }
    });
  } catch (err) {
    console.error('Employee Login Error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ======================================================================
// 4. EMPLOYEE CRUD & MANAGEMENT (Sections 2, 3, 5, 11, 12, 13)
// ======================================================================

// GET /api/crm/employees - List employees for this retailer
router.get('/', async (req, res) => {
  try {
    const retailerId = getReqRetailerId(req);
    const { search, status, limit = 200, skip = 0 } = req.query;

    const filter = { retailerId };
    if (status && status !== 'ALL') {
      filter.status = status;
    }

    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { employeeUid: { $regex: q, $options: 'i' } },
        { fullName: { $regex: q, $options: 'i' } },
        { mobileNumber: { $regex: q, $options: 'i' } },
        { designation: { $regex: q, $options: 'i' } },
        { department: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } }
      ];
    }

    const total = await Employee.countDocuments(filter);
    const employees = await Employee.find(filter)
      .sort({ createdAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit))
      .lean();

    const safeEmployees = employees.map(e => {
      const copy = { ...e };
      delete copy.password;
      return copy;
    });

    // Summary statistics for retailer
    const totalEmployees = await Employee.countDocuments({ retailerId });
    const activeEmployees = await Employee.countDocuments({ retailerId, status: 'Active' });
    const inactiveEmployees = await Employee.countDocuments({ retailerId, status: 'Inactive' });
    const loginAccessCount = await Employee.countDocuments({ retailerId, loginEnabled: true, status: 'Active' });

    res.json({
      success: true,
      total,
      employees: safeEmployees,
      summary: {
        totalEmployees,
        activeEmployees,
        inactiveEmployees,
        loginAccessCount
      }
    });
  } catch (err) {
    console.error('Error fetching employees:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/crm/employees - Register new employee
router.post('/', async (req, res) => {
  try {
    const retailerId = getReqRetailerId(req);
    const actor = getReqActor(req);
    const {
      fullName,
      mobileNumber,
      email,
      dob,
      gender,
      address,
      city,
      state,
      pinCode,
      joiningDate,
      designation,
      department,
      photo,
      emergencyContact,
      status = 'Active',
      password = '123456',
      permissions = [],
      dynamicFields = {}
    } = req.body;

    // 1. Mandatory Validations
    if (!fullName || !fullName.trim()) {
      return res.status(400).json({ success: false, message: 'Employee full name is required.' });
    }
    if (!mobileNumber || !mobileNumber.trim()) {
      return res.status(400).json({ success: false, message: 'Employee mobile number is required.' });
    }
    const cleanMobile = mobileNumber.trim().replace(/\D/g, '');
    if (cleanMobile.length !== 10) {
      return res.status(400).json({ success: false, message: 'Mobile number must be exactly 10 digits.' });
    }

    // Check duplicate mobile under same retailer
    const existingMobile = await Employee.findOne({ retailerId, mobileNumber: cleanMobile });
    if (existingMobile) {
      return res.status(400).json({
        success: false,
        message: `An employee with mobile number ${cleanMobile} already exists under your account (${existingMobile.employeeUid} - ${existingMobile.fullName}).`
      });
    }

    // 2. Validate Active Required Custom Fields for this retailer
    await seedDefaultFieldsForRetailer(retailerId);
    const requiredFields = await EmployeeField.find({
      retailerId,
      required: true,
      hidden: false,
      isSystem: false
    }).lean();

    for (const reqF of requiredFields) {
      const val = dynamicFields[reqF.name];
      if (val === undefined || val === null || String(val).trim() === '') {
        return res.status(400).json({
          success: false,
          message: `Mandatory field '${reqF.label}' is required.`
        });
      }
    }

    // 3. Generate Sequential Atomic Employee UID (e.g. MBTAR000010101-EMP001)
    const employeeUid = await getNextRetailerEmployeeUid(retailerId);

    // 4. Sanitize requested permissions against parent retailer's permissions
    const retailerUser = await User.findOne({
      $or: [{ userId: retailerId }, { retailerId }]
    });
    const sanitizedPermissions = sanitizeEmployeePermissions(permissions, retailerUser);

    // 5. Create Employee
    const newEmployee = new Employee({
      employeeUid,
      retailerId,
      fullName: fullName.trim(),
      mobileNumber: cleanMobile,
      email: (email || '').trim(),
      dob: (dob || '').trim(),
      gender: gender || '',
      address: (address || '').trim(),
      city: (city || '').trim(),
      state: (state || '').trim(),
      pinCode: (pinCode || '').trim(),
      joiningDate: joiningDate ? new Date(joiningDate) : new Date(),
      designation: (designation || '').trim(),
      department: (department || '').trim(),
      photo: (photo || '').trim(),
      emergencyContact: (emergencyContact || '').trim(),
      status: ['Active', 'Inactive'].includes(status) ? status : 'Active',
      password: (password || '123456').trim(),
      permissions: sanitizedPermissions,
      dynamicFields: dynamicFields || {},
      loginEnabled: status === 'Active',
      createdBy: actor.uid
    });

    await newEmployee.save();

    // Log Activity
    await logEmployeeActivity({
      employeeUid: newEmployee.employeeUid,
      employeeName: newEmployee.fullName,
      retailerId,
      serviceName: 'CRM',
      moduleName: 'Employee Management',
      action: 'Created Employee Account',
      recordId: newEmployee.employeeUid,
      status: 'Success',
      details: `Added ${newEmployee.fullName} (${newEmployee.designation || 'Staff'}) with ${sanitizedPermissions.length} permissions`,
      req
    });

    res.status(201).json({
      success: true,
      message: `Employee ${newEmployee.fullName} (${newEmployee.employeeUid}) created successfully.`,
      employee: newEmployee.toSafeObject()
    });
  } catch (err) {
    console.error('Error creating employee:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/crm/employees/:id - Get single employee details
router.get('/:id', async (req, res) => {
  try {
    const retailerId = getReqRetailerId(req);
    const emp = await Employee.findOne({
      $or: [{ _id: req.params.id }, { employeeUid: req.params.id }],
      retailerId
    });

    if (!emp) {
      return res.status(404).json({ success: false, message: 'Employee not found or access denied.' });
    }

    res.json({
      success: true,
      employee: emp.toSafeObject()
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/crm/employees/:id - Update employee
router.put('/:id', async (req, res) => {
  try {
    const retailerId = getReqRetailerId(req);
    const actor = getReqActor(req);

    const emp = await Employee.findOne({
      $or: [{ _id: req.params.id }, { employeeUid: req.params.id }],
      retailerId
    });

    if (!emp) {
      return res.status(404).json({ success: false, message: 'Employee not found or access denied.' });
    }

    const {
      fullName,
      mobileNumber,
      email,
      dob,
      gender,
      address,
      city,
      state,
      pinCode,
      joiningDate,
      designation,
      department,
      photo,
      emergencyContact,
      status,
      password,
      dynamicFields
    } = req.body;

    if (fullName && fullName.trim()) emp.fullName = fullName.trim();
    if (mobileNumber && mobileNumber.trim()) {
      const cleanMob = mobileNumber.trim().replace(/\D/g, '');
      if (cleanMob.length === 10) emp.mobileNumber = cleanMob;
    }
    if (email !== undefined) emp.email = String(email).trim();
    if (dob !== undefined) emp.dob = String(dob).trim();
    if (gender !== undefined) emp.gender = gender;
    if (address !== undefined) emp.address = String(address).trim();
    if (city !== undefined) emp.city = String(city).trim();
    if (state !== undefined) emp.state = String(state).trim();
    if (pinCode !== undefined) emp.pinCode = String(pinCode).trim();
    if (joiningDate) emp.joiningDate = new Date(joiningDate);
    if (designation !== undefined) emp.designation = String(designation).trim();
    if (department !== undefined) emp.department = String(department).trim();
    if (photo !== undefined) emp.photo = String(photo).trim();
    if (emergencyContact !== undefined) emp.emergencyContact = String(emergencyContact).trim();

    if (status && ['Active', 'Inactive'].includes(status)) {
      emp.status = status;
      emp.loginEnabled = (status === 'Active');
    }

    if (password && String(password).trim().length >= 4) {
      emp.password = String(password).trim();
    }

    if (dynamicFields && typeof dynamicFields === 'object') {
      emp.dynamicFields = {
        ...(emp.dynamicFields || {}),
        ...dynamicFields
      };
    }

    await emp.save();

    // Log Activity
    await logEmployeeActivity({
      employeeUid: emp.employeeUid,
      employeeName: emp.fullName,
      retailerId,
      serviceName: 'CRM',
      moduleName: 'Employee Management',
      action: 'Updated Employee Details',
      recordId: emp.employeeUid,
      status: 'Success',
      details: `Profile updated by ${actor.name}`,
      req
    });

    res.json({
      success: true,
      message: 'Employee updated successfully.',
      employee: emp.toSafeObject()
    });
  } catch (err) {
    console.error('Error updating employee:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/crm/employees/:id/status - Toggle employee status (Active/Inactive)
router.patch('/:id/status', async (req, res) => {
  try {
    const retailerId = getReqRetailerId(req);
    const actor = getReqActor(req);

    const emp = await Employee.findOne({
      $or: [{ _id: req.params.id }, { employeeUid: req.params.id }],
      retailerId
    });

    if (!emp) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    emp.status = (emp.status === 'Active') ? 'Inactive' : 'Active';
    emp.loginEnabled = (emp.status === 'Active');
    await emp.save();

    await logEmployeeActivity({
      employeeUid: emp.employeeUid,
      employeeName: emp.fullName,
      retailerId,
      serviceName: 'CRM',
      moduleName: 'Employee Management',
      action: `Status Changed to ${emp.status}`,
      recordId: emp.employeeUid,
      status: 'Success',
      details: `Account ${emp.status === 'Active' ? 'Activated' : 'Deactivated'} by ${actor.name}`,
      req
    });

    res.json({
      success: true,
      message: `Employee account is now ${emp.status}.`,
      status: emp.status
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/crm/employees/:id/reset-password - Reset password / PIN
router.patch('/:id/reset-password', async (req, res) => {
  try {
    const retailerId = getReqRetailerId(req);
    const actor = getReqActor(req);
    const { newPassword } = req.body;

    if (!newPassword || String(newPassword).trim().length < 4) {
      return res.status(400).json({ success: false, message: 'Password must be at least 4 characters long.' });
    }

    const emp = await Employee.findOne({
      $or: [{ _id: req.params.id }, { employeeUid: req.params.id }],
      retailerId
    });

    if (!emp) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    emp.password = String(newPassword).trim();
    await emp.save();

    await logEmployeeActivity({
      employeeUid: emp.employeeUid,
      employeeName: emp.fullName,
      retailerId,
      serviceName: 'CRM',
      moduleName: 'Employee Management',
      action: 'Password Reset',
      recordId: emp.employeeUid,
      status: 'Success',
      details: `Password reset by ${actor.name}`,
      req
    });

    res.json({
      success: true,
      message: `Password for ${emp.fullName} has been reset successfully.`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/crm/employees/:id - Delete employee record
router.delete('/:id', async (req, res) => {
  try {
    const retailerId = getReqRetailerId(req);
    const actor = getReqActor(req);

    const emp = await Employee.findOne({
      $or: [{ _id: req.params.id }, { employeeUid: req.params.id }],
      retailerId
    });

    if (!emp) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    await Employee.deleteOne({ _id: emp._id });

    await logEmployeeActivity({
      employeeUid: emp.employeeUid,
      employeeName: emp.fullName,
      retailerId,
      serviceName: 'CRM',
      moduleName: 'Employee Management',
      action: 'Deleted Employee Record',
      recordId: emp.employeeUid,
      status: 'Success',
      details: `Employee deleted by ${actor.name}`,
      req
    });

    res.json({ success: true, message: `Employee ${emp.fullName} (${emp.employeeUid}) removed.` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ======================================================================
// 5. EMPLOYEE PERMISSIONS CONFIGURATION (Section 7)
// ======================================================================

// GET /api/crm/employees/:id/permissions - Get employee permissions & authorized catalog
router.get('/:id/permissions', async (req, res) => {
  try {
    const retailerId = getReqRetailerId(req);
    const emp = await Employee.findOne({
      $or: [{ _id: req.params.id }, { employeeUid: req.params.id }],
      retailerId
    });

    if (!emp) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    const retailerUser = await User.findOne({
      $or: [{ userId: retailerId }, { retailerId }]
    });

    const authorizedPermissionIds = getRetailerAuthorizedPermissionIds(retailerUser);

    const normalizedCatalog = PERMISSION_CATALOG.map(c => ({
      ...c,
      name: c.title || c.name,
      items: c.permissions || c.items || []
    }));

    res.json({
      success: true,
      employeeUid: emp.employeeUid,
      employeeName: emp.fullName,
      assignedPermissions: emp.permissions || [],
      authorizedPermissionIds,
      catalog: normalizedCatalog
    });
  } catch (err) {
    console.error('Error fetching employee permissions:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/crm/employees/:id/permissions - Update employee permissions
router.put('/:id/permissions', async (req, res) => {
  try {
    const retailerId = getReqRetailerId(req);
    const actor = getReqActor(req);
    const { permissions = [] } = req.body;

    const emp = await Employee.findOne({
      $or: [{ _id: req.params.id }, { employeeUid: req.params.id }],
      retailerId
    });

    if (!emp) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    // STRICT PERMISSION RULE: An employee can receive ONLY those permissions the retailer holds!
    const retailerUser = await User.findOne({
      $or: [{ userId: retailerId }, { retailerId }]
    });

    const sanitizedPermissions = sanitizeEmployeePermissions(permissions, retailerUser);

    emp.permissions = sanitizedPermissions;
    await emp.save();

    await logEmployeeActivity({
      employeeUid: emp.employeeUid,
      employeeName: emp.fullName,
      retailerId,
      serviceName: 'CRM',
      moduleName: 'Employee Management',
      action: 'Updated Service Permissions',
      recordId: emp.employeeUid,
      status: 'Success',
      details: `Permissions updated to ${sanitizedPermissions.length} active rights by ${actor.name}`,
      req
    });

    res.json({
      success: true,
      message: `Permissions updated for ${emp.fullName} (${sanitizedPermissions.length} services enabled).`,
      permissions: sanitizedPermissions
    });
  } catch (err) {
    console.error('Error updating employee permissions:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

