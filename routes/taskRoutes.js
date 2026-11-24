const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Task = require('../models/Task');
const Employee = require('../models/Employee');
const { getNextTaskId } = require('../models/Counter');
const { logEmployeeActivity } = require('../models/EmployeeActivity');

/**
 * Helper to extract canonical Retailer ID
 */
function getReqRetailerId(req) {
  const fromHeader = req.headers['x-retailer-id'] || req.headers['x-user-id'];
  if (fromHeader && typeof fromHeader === 'string' && fromHeader.trim() && fromHeader.trim().toLowerCase() !== 'user' && fromHeader.trim().toLowerCase() !== 'admin') {
    let id = fromHeader.trim();
    if (id.includes('-EMP')) id = id.split('-EMP')[0].trim();
    return id;
  }
  const fromQuery = req.query.retailerId || req.query.userId;
  if (fromQuery && typeof fromQuery === 'string' && fromQuery.trim() && fromQuery.trim().toLowerCase() !== 'user' && fromQuery.trim().toLowerCase() !== 'admin') {
    let id = fromQuery.trim();
    if (id.includes('-EMP')) id = id.split('-EMP')[0].trim();
    return id;
  }
  const fromBody = req.body && (req.body.retailerId || req.body.userId);
  if (fromBody && typeof fromBody === 'string' && fromBody.trim() && fromBody.trim().toLowerCase() !== 'user' && fromBody.trim().toLowerCase() !== 'admin') {
    let id = fromBody.trim();
    if (id.includes('-EMP')) id = id.split('-EMP')[0].trim();
    return id;
  }
  if (req.user && (req.user.retailerId || req.user.userId)) {
    let id = req.user.retailerId || req.user.userId;
    if (id && String(id).trim().toLowerCase() !== 'user') {
      id = String(id).trim();
      if (id.includes('-EMP')) id = id.split('-EMP')[0].trim();
      return id;
    }
  }
  return 'MBTAR000010101';
}

/**
 * Helper to identify who is making the request (retailer vs employee)
 */
function getReqActor(req) {
  let employeeUid = req.headers['x-employee-uid'] || (req.user && req.user.employeeUid) || (req.body && req.body.employeeUid);
  let employeeName = req.headers['x-employee-name'] || (req.user && (req.user.fullName || req.user.name || req.user.employeeName)) || (req.body && (req.body.employeeName || req.body.fullName));

  const rawId = req.headers['x-employee-uid'] || req.headers['x-user-id'] || req.headers['x-retailer-id'] || req.query.employeeUid || req.query.userId || (req.user && req.user.userId);
  if (!employeeUid && typeof rawId === 'string' && rawId.includes('-EMP')) {
    employeeUid = rawId.trim();
  }

  if (employeeUid) {
    const cleanUid = String(employeeUid).trim();
    return {
      role: 'employee',
      uid: cleanUid,
      name: employeeName ? String(employeeName).trim() : cleanUid
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
 * Returns today's date formatted as YYYY-MM-DD
 */
function getTodayString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ======================================================================
// 1. GET /api/crm/tasks/employees - List retailer's employees for assignment
// ======================================================================
router.get('/employees', async (req, res) => {
  try {
    const retailerId = getReqRetailerId(req);
    const employees = await Employee.find({
      retailerId,
      status: 'Active'
    })
      .select('employeeUid fullName mobileNumber designation department status')
      .sort({ fullName: 1 })
      .lean();

    res.json({ success: true, employees });
  } catch (err) {
    console.error('Error fetching employees for task assignment:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ======================================================================
// 2. GET /api/crm/tasks/calendar - Events for Calendar View
// ======================================================================
router.get('/calendar', async (req, res) => {
  try {
    const retailerId = getReqRetailerId(req);
    const actor = getReqActor(req);
    const { month, startDate, endDate, employeeUid } = req.query;

    const andConditions = [{ retailerId }];

    // Employee isolation / Assignee filter
    if (actor.role === 'employee') {
      andConditions.push({
        $or: [
          { 'assignedEmployees.employeeUid': actor.uid },
          { assignedToUid: actor.uid },
          { 'createdBy.uid': actor.uid },
          { createdByUid: actor.uid }
        ]
      });
    } else if (employeeUid && employeeUid.trim() && employeeUid !== 'ALL') {
      if (employeeUid === 'myself') {
        andConditions.push({
          $or: [
            { assignmentType: 'myself' },
            { assignmentType: 'retailer' },
            { assignedToUid: retailerId }
          ]
        });
      } else {
        andConditions.push({
          $or: [
            { 'assignedEmployees.employeeUid': employeeUid.trim() },
            { assignedToUid: employeeUid.trim() }
          ]
        });
      }
    }

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [year, m] = month.split('-').map(Number);
      const startOfMonth = `${year}-${String(m).padStart(2, '0')}-01`;
      const lastDay = new Date(year, m, 0).getDate();
      const endOfMonth = `${year}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      andConditions.push({
        $or: [
          { startDate: { $gte: startOfMonth, $lte: endOfMonth } },
          { dueDate: { $gte: startOfMonth, $lte: endOfMonth } },
          {
            $and: [
              { startDate: { $lte: startOfMonth } },
              { dueDate: { $gte: endOfMonth } }
            ]
          }
        ]
      });
    } else if (startDate || endDate) {
      const dateFilter = {};
      if (startDate) dateFilter.$gte = startDate;
      if (endDate) dateFilter.$lte = endDate;
      andConditions.push({ dueDate: dateFilter });
    }

    const filter = andConditions.length === 1 ? andConditions[0] : { $and: andConditions };

    const tasks = await Task.find(filter)
      .sort({ dueDate: 1, dueTime: 1 })
      .lean();

    const todayStr = getTodayString();
    const enrichedTasks = tasks.map(t => ({
      ...t,
      isOverdue: Boolean(t.dueDate && t.dueDate < todayStr && !['Completed', 'Cancelled'].includes(t.workStatus))
    }));

    res.json({ success: true, tasks: enrichedTasks, events: enrichedTasks });
  } catch (err) {
    console.error('Error fetching calendar tasks:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ======================================================================
// 3. GET /api/crm/tasks/stats - Summary metrics & Google Forms-style reports
// ======================================================================
router.get('/stats', async (req, res) => {
  try {
    const retailerId = getReqRetailerId(req);
    const actor = getReqActor(req);
    const { range, startDate, endDate, employeeUid } = req.query;

    const baseFilter = { retailerId };

    if (actor.role === 'employee') {
      baseFilter.$or = [
        { 'assignedEmployees.employeeUid': actor.uid },
        { assignedToUid: actor.uid },
        { 'createdBy.uid': actor.uid },
        { createdByUid: actor.uid }
      ];
    } else if (employeeUid && employeeUid.trim() && employeeUid !== 'ALL') {
      if (employeeUid === 'myself') {
        baseFilter.assignmentType = 'myself';
      } else {
        baseFilter.$or = [
          { 'assignedEmployees.employeeUid': employeeUid.trim() },
          { assignedToUid: employeeUid.trim() }
        ];
      }
    }

    const todayStr = getTodayString();
    if (range === 'today') {
      baseFilter.dueDate = todayStr;
    } else if (range === 'week') {
      const now = new Date();
      const first = now.getDate() - now.getDay();
      const startOfWeek = new Date(now.setDate(first)).toISOString().slice(0, 10);
      const endOfWeek = new Date(now.setDate(first + 6)).toISOString().slice(0, 10);
      baseFilter.dueDate = { $gte: startOfWeek, $lte: endOfWeek };
    } else if (range === 'month') {
      const now = new Date();
      const year = now.getFullYear();
      const m = now.getMonth() + 1;
      const startMonth = `${year}-${String(m).padStart(2, '0')}-01`;
      const endMonth = `${year}-${String(m).padStart(2, '0')}-${new Date(year, m, 0).getDate()}`;
      baseFilter.dueDate = { $gte: startMonth, $lte: endMonth };
    } else if (startDate || endDate) {
      baseFilter.dueDate = {};
      if (startDate) baseFilter.dueDate.$gte = startDate;
      if (endDate) baseFilter.dueDate.$lte = endDate;
    }

    const allTasks = await Task.find(baseFilter).lean();

    let completedTasks = 0;
    let inProgressTasks = 0;
    let onHoldTasks = 0;
    let notStartedTasks = 0;
    let overdueTasks = 0;
    let cancelledTasks = 0;

    const priorityDistribution = { Urgent: 0, High: 0, Medium: 0, Low: 0 };
    const categoryDistribution = {};
    const employeeMap = {};

    allTasks.forEach(task => {
      const isOverdue = Boolean(task.dueDate && task.dueDate < todayStr && !['Completed', 'Cancelled'].includes(task.workStatus));
      if (isOverdue) overdueTasks++;

      if (task.workStatus === 'Completed') completedTasks++;
      else if (task.workStatus === 'In Progress') inProgressTasks++;
      else if (task.workStatus === 'On Hold') onHoldTasks++;
      else if (task.workStatus === 'Not Started') notStartedTasks++;
      else if (task.workStatus === 'Cancelled') cancelledTasks++;

      if (priorityDistribution[task.priority] !== undefined) {
        priorityDistribution[task.priority]++;
      }

      const cat = task.category || 'General';
      categoryDistribution[cat] = (categoryDistribution[cat] || 0) + 1;

      if (task.assignmentType === 'employee') {
        const emps = Array.isArray(task.assignedEmployees) && task.assignedEmployees.length > 0
          ? task.assignedEmployees
          : [{ employeeUid: task.assignedToUid, employeeName: task.assignedToName }];

        emps.forEach(emp => {
          if (!emp.employeeUid) return;
          if (!employeeMap[emp.employeeUid]) {
            employeeMap[emp.employeeUid] = {
              employeeUid: emp.employeeUid,
              employeeName: emp.employeeName || emp.employeeUid,
              totalAssigned: 0,
              completed: 0,
              inProgress: 0,
              onHold: 0,
              notStarted: 0,
              overdue: 0,
              cancelled: 0
            };
          }
          const rec = employeeMap[emp.employeeUid];
          rec.totalAssigned++;
          if (task.workStatus === 'Completed') rec.completed++;
          else if (task.workStatus === 'In Progress') rec.inProgress++;
          else if (task.workStatus === 'On Hold') rec.onHold++;
          else if (task.workStatus === 'Not Started') rec.notStarted++;
          else if (task.workStatus === 'Cancelled') rec.cancelled++;
          if (isOverdue) rec.overdue++;
        });
      }
    });

    const totalTasks = allTasks.length;
    const pendingTasks = notStartedTasks + inProgressTasks + onHoldTasks;
    const completionPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    const employeeStats = Object.values(employeeMap).map(e => ({
      ...e,
      pending: e.notStarted + e.inProgress + e.onHold,
      completionPercentage: e.totalAssigned > 0 ? Math.round((e.completed / e.totalAssigned) * 100) : 0,
      completionRate: e.totalAssigned > 0 ? Math.round((e.completed / e.totalAssigned) * 100) : 0
    })).sort((a, b) => b.totalAssigned - a.totalAssigned);

    const statsObj = {
      total: totalTasks,
      completed: completedTasks,
      pending: pendingTasks,
      inProgress: inProgressTasks,
      onHold: onHoldTasks,
      notStarted: notStartedTasks,
      overdue: overdueTasks,
      cancelled: cancelledTasks,
      completionRate: completionPercentage,
      statusBreakdown: {
        'Not Started': notStartedTasks,
        'In Progress': inProgressTasks,
        'On Hold': onHoldTasks,
        'Completed': completedTasks,
        'Cancelled': cancelledTasks
      },
      priorityBreakdown: priorityDistribution,
      categoryBreakdown: categoryDistribution,
      employeePerformance: employeeStats
    };

    res.json({
      success: true,
      stats: statsObj,
      summary: {
        totalTasks,
        completedTasks,
        pendingTasks,
        inProgressTasks,
        onHoldTasks,
        notStartedTasks,
        overdueTasks,
        cancelledTasks,
        completionPercentage
      },
      priorityDistribution,
      categoryDistribution,
      statusDistribution: statsObj.statusBreakdown,
      employeeStats
    });
  } catch (err) {
    console.error('Error calculating task statistics:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ======================================================================
// 4. GET /api/crm/tasks - List tasks with search, filter, and pagination
// ======================================================================
router.get('/', async (req, res) => {
  try {
    const retailerId = getReqRetailerId(req);
    const actor = getReqActor(req);

    const {
      page = 1,
      limit = 15,
      search = '',
      status = '',
      priority = '',
      category = '',
      view = 'all',
      employeeUid = '',
      startDate = '',
      endDate = ''
    } = req.query;

    const filter = { retailerId };

    // Strict employee role isolation
    if (actor.role === 'employee') {
      filter.$or = [
        { 'assignedEmployees.employeeUid': actor.uid },
        { assignedToUid: actor.uid },
        { 'createdBy.uid': actor.uid },
        { createdByUid: actor.uid }
      ];
    } else {
      if (view === 'my_tasks') {
        filter.$or = [
          { assignmentType: 'myself' },
          { assignmentType: 'retailer' },
          { assignedToUid: retailerId }
        ];
      } else if (view === 'assigned') {
        filter.$or = [
          { assignmentType: 'employee' },
          { 'assignedEmployees.0': { $exists: true } }
        ];
      }

      if (employeeUid && employeeUid.trim() && employeeUid !== 'ALL') {
        if (employeeUid === 'myself') {
          filter.$or = [
            { assignmentType: 'myself' },
            { assignmentType: 'retailer' },
            { assignedToUid: retailerId }
          ];
        } else {
          filter.$or = [
            { 'assignedEmployees.employeeUid': employeeUid.trim() },
            { assignedToUid: employeeUid.trim() }
          ];
        }
      }
    }

    const todayStr = getTodayString();

    // Status or View filter logic
    if (view === 'completed' || status === 'Completed') {
      filter.workStatus = 'Completed';
    } else if (view === 'pending' || status === 'Pending') {
      filter.workStatus = { $in: ['Not Started', 'In Progress', 'On Hold'] };
    } else if (view === 'in_progress' || status === 'In Progress') {
      filter.workStatus = 'In Progress';
    } else if (view === 'overdue' || status === 'Overdue') {
      filter.dueDate = { $lt: todayStr };
      filter.workStatus = { $nin: ['Completed', 'Cancelled'] };
    } else if (status && status !== 'ALL' && !filter.workStatus) {
      filter.workStatus = status;
    }

    // Priority filter
    if (priority && priority !== 'ALL') {
      filter.priority = priority;
    }

    // Category filter
    if (category && category !== 'ALL') {
      filter.category = category;
    }

    // Date range
    if (startDate || endDate) {
      if (!filter.dueDate) filter.dueDate = {};
      if (startDate) filter.dueDate.$gte = startDate;
      if (endDate) filter.dueDate.$lte = endDate;
    }

    // Text search
    if (search && search.trim()) {
      const q = search.trim();
      const searchRegex = new RegExp(q, 'i');
      const searchOr = [
        { taskId: searchRegex },
        { title: searchRegex },
        { description: searchRegex },
        { category: searchRegex },
        { notes: searchRegex },
        { assignedToName: searchRegex },
        { 'assignedEmployees.employeeName': searchRegex }
      ];
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: searchOr }];
        delete filter.$or;
      } else {
        filter.$or = searchOr;
      }
    }

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [tasks, total] = await Promise.all([
      Task.find(filter)
        .sort({ dueDate: 1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Task.countDocuments(filter)
    ]);

    const enrichedTasks = tasks.map(t => ({
      ...t,
      isOverdue: Boolean(t.dueDate && t.dueDate < todayStr && !['Completed', 'Cancelled'].includes(t.workStatus))
    }));

    // Calculate Top Tab Counters
    const baseCountFilter = { retailerId };
    if (actor.role === 'employee') {
      baseCountFilter.$or = [
        { 'assignedEmployees.employeeUid': actor.uid },
        { assignedToUid: actor.uid },
        { 'createdBy.uid': actor.uid },
        { createdByUid: actor.uid }
      ];
    }
    const myTasksCountFilter = actor.role === 'employee'
      ? { ...baseCountFilter, $or: [{ 'assignedEmployees.employeeUid': actor.uid }, { assignedToUid: actor.uid }] }
      : { ...baseCountFilter, $or: [{ assignmentType: 'myself' }, { assignmentType: 'retailer' }, { assignedToUid: retailerId }] };

    const assignedTasksCountFilter = actor.role === 'employee'
      ? { ...baseCountFilter, $or: [{ 'createdBy.uid': actor.uid }, { createdByUid: actor.uid }] }
      : { ...baseCountFilter, $or: [{ assignmentType: 'employee' }, { 'assignedEmployees.0': { $exists: true } }] };

    const [allCount, myCount, assignedCount, compCount, pendCount, inProgCount, ovCount] = await Promise.all([
      Task.countDocuments(baseCountFilter),
      Task.countDocuments(myTasksCountFilter),
      Task.countDocuments(assignedTasksCountFilter),
      Task.countDocuments({ ...baseCountFilter, workStatus: 'Completed' }),
      Task.countDocuments({ ...baseCountFilter, workStatus: { $in: ['Not Started', 'In Progress', 'On Hold'] } }),
      Task.countDocuments({ ...baseCountFilter, workStatus: 'In Progress' }),
      Task.countDocuments({ ...baseCountFilter, dueDate: { $lt: todayStr }, workStatus: { $nin: ['Completed', 'Cancelled'] } })
    ]);

    res.json({
      success: true,
      tasks: enrichedTasks,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum) || 1,
      counts: {
        all: allCount,
        myTasks: myCount,
        assigned: assignedCount,
        completed: compCount,
        pending: pendCount,
        inProgress: inProgCount,
        overdue: ovCount
      }
    });
  } catch (err) {
    console.error('Error listing tasks:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ======================================================================
// 5. POST /api/crm/tasks - Create new task
// ======================================================================
router.post('/', async (req, res) => {
  try {
    const retailerId = getReqRetailerId(req);
    const actor = getReqActor(req);

    const {
      title,
      description = '',
      category = 'General',
      startDate,
      dueDate,
      startTime = '',
      dueTime = '',
      priority = 'Medium',
      assignmentType = 'myself',
      assignedEmployeeUids = [],
      notes = '',
      reminderDateTime = ''
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Task Title is required' });
    }
    if (!startDate || !dueDate) {
      return res.status(400).json({ success: false, message: 'Start Date and Due Date are required' });
    }

    // Resolve assigned employees
    let assignedEmployees = [];
    let assignedToName = 'Retailer';
    let assignedToUid = retailerId;
    let finalAssignmentType = assignmentType || 'myself';

    if (assignmentType === 'retailer') {
      assignedToName = 'Retailer';
      assignedToUid = retailerId;
      assignedEmployees = [];
      finalAssignmentType = 'retailer';
    } else if (assignmentType === 'myself' && actor.role === 'employee') {
      // Employee assigning to myself
      assignedEmployees = [{
        employeeUid: actor.uid,
        employeeName: actor.name,
        assignedAt: new Date()
      }];
      assignedToName = actor.name;
      assignedToUid = actor.uid;
      finalAssignmentType = 'employee';
    } else if (assignmentType === 'employee') {
      const uids = Array.isArray(assignedEmployeeUids) ? assignedEmployeeUids : [assignedEmployeeUids];
      const validUids = uids.filter(Boolean);

      if (validUids.length === 0) {
        return res.status(400).json({ success: false, message: 'Please select at least one employee' });
      }

      const emps = await Employee.find({
        retailerId,
        employeeUid: { $in: validUids }
      }).select('employeeUid fullName').lean();

      if (emps.length > 0) {
        assignedEmployees = emps.map(e => ({
          employeeUid: e.employeeUid,
          employeeName: e.fullName,
          assignedAt: new Date()
        }));
        assignedToName = assignedEmployees.map(e => e.employeeName).join(', ');
        assignedToUid = assignedEmployees.map(e => e.employeeUid).join(', ');
      } else {
        assignedEmployees = validUids.map(uid => ({
          employeeUid: uid,
          employeeName: uid === actor.uid ? actor.name : uid,
          assignedAt: new Date()
        }));
        assignedToName = assignedEmployees.map(e => e.employeeName).join(', ');
        assignedToUid = assignedEmployees.map(e => e.employeeUid).join(', ');
      }
      finalAssignmentType = 'employee';
    } else {
      // Retailer myself
      assignedToName = 'Retailer';
      assignedToUid = retailerId;
      assignedEmployees = [];
      finalAssignmentType = 'myself';
    }

    // Generate atomic sequential Task ID
    const taskId = await getNextTaskId(retailerId);

    const newTask = new Task({
      taskId,
      retailerId,
      title: title.trim(),
      description: description ? description.trim() : '',
      category,
      startDate,
      dueDate,
      startTime,
      dueTime,
      priority,
      workStatus: 'Not Started',
      assignmentType: finalAssignmentType,
      assignedEmployees,
      assignedToName,
      assignedToUid,
      notes,
      reminderDateTime,
      createdBy: {
        uid: actor.uid,
        name: actor.name,
        role: actor.role
      },
      createdByName: actor.name,
      createdByRole: actor.role,
      createdByUid: actor.uid,
      statusHistory: [
        {
          fromStatus: null,
          toStatus: 'Not Started',
          changedAt: new Date(),
          changedByUid: actor.uid,
          changedByName: actor.name,
          changedByRole: actor.role,
          remarks: 'Task created'
        }
      ]
    });

    await newTask.save();

    // Log employee activity if actor is employee
    if (actor.role === 'employee') {
      logEmployeeActivity({
        retailerId,
        employeeUid: actor.uid,
        employeeName: actor.name,
        actionType: 'CRM_TASK_CREATE',
        actionLabel: 'Task Created',
        module: 'CRM_TASK',
        details: `Created task "${newTask.title}" (${newTask.taskId})`
      }).catch(e => console.warn('Activity log failed:', e.message));
    }

    res.status(201).json({
      success: true,
      message: 'Task created successfully',
      task: newTask
    });
  } catch (err) {
    console.error('Error creating task:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ======================================================================
// 6. GET /api/crm/tasks/:id - Single task details
// ======================================================================
router.get('/:id', async (req, res) => {
  try {
    const retailerId = getReqRetailerId(req);
    const actor = getReqActor(req);
    const id = req.params.id;

    const query = { retailerId };
    if (mongoose.Types.ObjectId.isValid(id)) {
      query.$or = [{ _id: id }, { taskId: id }];
    } else {
      query.taskId = id;
    }

    const task = await Task.findOne(query).lean();
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    // Role verification
    if (actor.role === 'employee') {
      const isAssigned = (task.assignedEmployees && task.assignedEmployees.some(e => e.employeeUid === actor.uid)) ||
                         task.assignedToUid === actor.uid;
      const isCreator = (task.createdBy && task.createdBy.uid === actor.uid) || task.createdByUid === actor.uid;
      if (!isAssigned && !isCreator) {
        return res.status(403).json({ success: false, message: 'Access denied: You are not assigned to or creator of this task' });
      }
    }

    const todayStr = getTodayString();
    const enriched = {
      ...task,
      isOverdue: Boolean(task.dueDate && task.dueDate < todayStr && !['Completed', 'Cancelled'].includes(task.workStatus))
    };

    res.json({ success: true, task: enriched });
  } catch (err) {
    console.error('Error fetching single task:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ======================================================================
// 7. PUT /api/crm/tasks/:id - Edit task
// ======================================================================
router.put('/:id', async (req, res) => {
  try {
    const retailerId = getReqRetailerId(req);
    const actor = getReqActor(req);
    const id = req.params.id;

    const query = { retailerId };
    if (mongoose.Types.ObjectId.isValid(id)) {
      query.$or = [{ _id: id }, { taskId: id }];
    } else {
      query.taskId = id;
    }

    const task = await Task.findOne(query);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    // Role check: employees can only edit tasks they created or are assigned to
    if (actor.role === 'employee') {
      const isAssigned = (task.assignedEmployees && task.assignedEmployees.some(e => e.employeeUid === actor.uid)) ||
                         task.assignedToUid === actor.uid;
      const isCreator = (task.createdBy && task.createdBy.uid === actor.uid) || task.createdByUid === actor.uid;
      if (!isAssigned && !isCreator) {
        return res.status(403).json({ success: false, message: 'Access denied: You cannot edit this task' });
      }
    } else if (actor.role === 'retailer') {
      // Retailer can only edit when involved in the task
      const isCreator = task.createdByRole === 'retailer' ||
                        (task.createdBy && task.createdBy.role === 'retailer') ||
                        task.createdByUid === retailerId ||
                        (task.createdBy && task.createdBy.uid === retailerId);
      const isAssignee = task.assignmentType === 'retailer' ||
                         task.assignmentType === 'myself' ||
                         task.assignedToUid === retailerId;
      if (!isCreator && !isAssignee) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: Retailer cannot edit tasks between employees when not directly involved'
        });
      }
    }

    const {
      title,
      description,
      category,
      startDate,
      dueDate,
      startTime,
      dueTime,
      priority,
      assignmentType,
      assignedEmployeeUids,
      notes,
      reminderDateTime
    } = req.body;

    if (title && title.trim()) task.title = title.trim();
    if (description !== undefined) task.description = description;
    if (category) task.category = category;
    if (startDate) task.startDate = startDate;
    if (dueDate) task.dueDate = dueDate;
    if (startTime !== undefined) task.startTime = startTime;
    if (dueTime !== undefined) task.dueTime = dueTime;
    if (priority) task.priority = priority;
    if (notes !== undefined) task.notes = notes;
    if (reminderDateTime !== undefined) task.reminderDateTime = reminderDateTime;

    // Handle reassignment (retailer or task creator)
    if (assignmentType) {
      const isCreator = (task.createdBy && task.createdBy.uid === actor.uid) || task.createdByUid === actor.uid;
      if (actor.role !== 'employee' || isCreator) {
        const oldAssignee = task.assignedToName;
        task.assignmentType = assignmentType;

        if (assignmentType === 'retailer') {
          task.assignedEmployees = [];
          task.assignedToName = 'Retailer';
          task.assignedToUid = retailerId;
        } else if (assignmentType === 'myself' && actor.role === 'employee') {
          task.assignedEmployees = [{
            employeeUid: actor.uid,
            employeeName: actor.name,
            assignedAt: new Date()
          }];
          task.assignedToName = actor.name;
          task.assignedToUid = actor.uid;
          task.assignmentType = 'employee';
        } else if (assignmentType === 'myself') {
          task.assignedEmployees = [];
          task.assignedToName = 'Retailer';
          task.assignedToUid = retailerId;
        } else if (assignmentType === 'employee' && Array.isArray(assignedEmployeeUids)) {
          const emps = await Employee.find({
            retailerId,
            employeeUid: { $in: assignedEmployeeUids }
          }).select('employeeUid fullName').lean();

          if (emps.length > 0) {
            task.assignedEmployees = emps.map(e => ({
              employeeUid: e.employeeUid,
              employeeName: e.fullName,
              assignedAt: new Date()
            }));
            task.assignedToName = task.assignedEmployees.map(e => e.employeeName).join(', ');
            task.assignedToUid = task.assignedEmployees.map(e => e.employeeUid).join(', ');
          }
        }

        if (oldAssignee !== task.assignedToName) {
          task.assignmentHistory.push({
            fromAssignee: oldAssignee,
            toAssignee: task.assignedToName,
            reassignedAt: new Date(),
            reassignedBy: actor.name
          });
        }
      }
    }

    await task.save();

    res.json({
      success: true,
      message: 'Task updated successfully',
      task
    });
  } catch (err) {
    console.error('Error editing task:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ======================================================================
// 8. PATCH /api/crm/tasks/:id/status - Update work status
// ======================================================================
router.patch('/:id/status', async (req, res) => {
  try {
    const retailerId = getReqRetailerId(req);
    const actor = getReqActor(req);
    const id = req.params.id;
    const { workStatus, remarks = '' } = req.body;

    const allowedStatuses = ['Not Started', 'In Progress', 'On Hold', 'Completed', 'Cancelled'];
    if (!allowedStatuses.includes(workStatus)) {
      return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${allowedStatuses.join(', ')}` });
    }

    const query = { retailerId };
    if (mongoose.Types.ObjectId.isValid(id)) {
      query.$or = [{ _id: id }, { taskId: id }];
    } else {
      query.taskId = id;
    }

    const task = await Task.findOne(query);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    // Role check: employees can only update their own assigned tasks or tasks they created
    if (actor.role === 'employee') {
      const isAssigned = (task.assignedEmployees && task.assignedEmployees.some(e => e.employeeUid === actor.uid)) ||
                         task.assignedToUid === actor.uid;
      const isCreator = (task.createdBy && task.createdBy.uid === actor.uid) || task.createdByUid === actor.uid;
      if (!isAssigned && !isCreator) {
        return res.status(403).json({ success: false, message: 'Access denied: You are not assigned to this task' });
      }
    } else if (actor.role === 'retailer') {
      // Retailer can only update status when involved in the task
      const isCreator = task.createdByRole === 'retailer' ||
                        (task.createdBy && task.createdBy.role === 'retailer') ||
                        task.createdByUid === retailerId ||
                        (task.createdBy && task.createdBy.uid === retailerId);
      const isAssignee = task.assignmentType === 'retailer' ||
                         task.assignmentType === 'myself' ||
                         task.assignedToUid === retailerId;
      if (!isCreator && !isAssignee) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: Retailer cannot update status of tasks between employees when not directly involved'
        });
      }
    }

    const oldStatus = task.workStatus;
    task.workStatus = workStatus;

    if (workStatus === 'Completed') {
      task.completedAt = new Date();
      task.completedBy = { uid: actor.uid, name: actor.name };
      task.completedByName = actor.name;
      task.completedByUid = actor.uid;
      if (remarks) task.completionRemarks = remarks;
    } else {
      task.completedAt = null;
      task.completedBy = { uid: '', name: '' };
      task.completedByName = '';
      task.completedByUid = '';
    }

    task.statusHistory.push({
      fromStatus: oldStatus,
      toStatus: workStatus,
      changedAt: new Date(),
      changedByUid: actor.uid,
      changedByName: actor.name,
      changedByRole: actor.role,
      remarks: remarks || ''
    });

    await task.save();

    // Log employee activity if actor is employee
    if (actor.role === 'employee') {
      logEmployeeActivity({
        retailerId,
        employeeUid: actor.uid,
        employeeName: actor.name,
        actionType: 'CRM_TASK_STATUS_UPDATE',
        actionLabel: 'Task Status Updated',
        module: 'CRM_TASK',
        details: `Updated task "${task.title}" status from "${oldStatus}" to "${workStatus}". Remarks: ${remarks || 'None'}`
      }).catch(e => console.warn('Activity log failed:', e.message));
    }

    res.json({
      success: true,
      message: `Task status updated to "${workStatus}"`,
      task
    });
  } catch (err) {
    console.error('Error updating task status:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ======================================================================
// 9. DELETE /api/crm/tasks/:id - Delete task (Retailer only)
// ======================================================================
router.delete('/:id', async (req, res) => {
  try {
    const retailerId = getReqRetailerId(req);
    const actor = getReqActor(req);

    if (actor.role === 'employee') {
      return res.status(403).json({ success: false, message: 'Access denied: Employees cannot delete tasks' });
    }

    const id = req.params.id;
    const query = { retailerId };
    if (mongoose.Types.ObjectId.isValid(id)) {
      query.$or = [{ _id: id }, { taskId: id }];
    } else {
      query.taskId = id;
    }

    const task = await Task.findOne(query);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    if (actor.role === 'retailer') {
      const isCreator = task.createdByRole === 'retailer' ||
                        (task.createdBy && task.createdBy.role === 'retailer') ||
                        task.createdByUid === retailerId ||
                        (task.createdBy && task.createdBy.uid === retailerId);
      const isAssignee = task.assignmentType === 'retailer' ||
                         task.assignmentType === 'myself' ||
                         task.assignedToUid === retailerId;
      if (!isCreator && !isAssignee) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: Retailer cannot delete tasks between employees when not directly involved'
        });
      }
    }

    await Task.deleteOne({ _id: task._id });

    res.json({ success: true, message: 'Task deleted successfully' });
  } catch (err) {
    console.error('Error deleting task:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
