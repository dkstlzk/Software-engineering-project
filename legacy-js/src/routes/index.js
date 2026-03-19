/**
 * Routes Index
 * Aggregates all API routes
 */
const express = require('express');
const router = express.Router();

const authRoutes = require('./auth');
const departmentRoutes = require('./departments');
const roomRoutes = require('./rooms');
const inventoryRoutes = require('./inventory');
const buildingsRoutes = require('./buildings');
const allocationRoutes = require('./allocations');
const usersRoutes = require('./users');
const slotSystemRoutes = require('./slotSystems');
const courseRoutes = require('./courses');
const timetableRoutes = require('./timetables');
const preallocationRoutes = require('./preallocations');
const bookingRoutes = require('./bookings');
const notificationRoutes = require('./notifications');

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

// API version info
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Unified Room Allocation and LHC Management System API',
    version: '1.0.0',
    documentation: '/api/docs',
  });
});

// Mount routes
router.use('/auth', authRoutes);
router.use('/departments', departmentRoutes);
router.use('/rooms', roomRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/buildings', buildingsRoutes);
router.use('/allocations', allocationRoutes);
router.use('/users', usersRoutes);
router.use('/slot-systems', slotSystemRoutes);
router.use('/courses', courseRoutes);
router.use('/timetables', timetableRoutes);
router.use('/preallocations', preallocationRoutes);
router.use('/booking', bookingRoutes);
router.use('/notifications', notificationRoutes);

module.exports = router;
