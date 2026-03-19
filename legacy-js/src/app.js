/**
 * Main Application Entry Point
 * Unified Room Allocation and Lecture Hall Complex Management System
 * 
 * Features:
 * - User authentication and secure login (JWT)
 * - Role-Based Access Control (RBAC): Admin, Staff, Faculty, Students
 * - Department and room management
 * - Room inventory tracking
 * - Allocation policies and booking workflows
 * 
 * Based on SRS Document v2.3
 * Organization: Indian Institute of Technology Jodhpur
 */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const routes = require('./routes');
const { errorHandler, notFoundHandler } = require('./utils/errorHandler');
const logger = require('./utils/logger');
const { testConnection } = require('./config/database');

// Initialize Express app
const app = express();

// Security middleware
app.use(helmet()); // Set security HTTP headers

// CORS configuration
app.use(cors({
  origin: config.nodeEnv === 'production' 
    ? process.env.ALLOWED_ORIGINS?.split(',') 
    : '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Rate limiting (NFR-5.3.x: Security requirements)
const limiter = rateLimit({
  windowMs: config.security.rateLimitWindowMs,
  max: config.security.rateLimitMaxRequests,
  message: {
    success: false,
    error: 'Too many requests, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  // Use default in-memory store; ensure counter resets properly
  validate: { trustProxy: false, xForwardedForHeader: false },
});

// Stricter limiter only for auth-sensitive endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                   // 20 login/register attempts per window
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});

// API routes
app.use('/api', routes);

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      logger.error('Failed to connect to database. Server will start but database operations will fail.');
    }

    const server = app.listen(config.port, () => {
      logger.info(`
========================================
  Room Allocation System API Server
========================================
  Environment: ${config.nodeEnv}
  Port: ${config.port}
  Database: ${dbConnected ? 'Connected' : 'Disconnected'}
  API: http://localhost:${config.port}/api
========================================
      `);
    });

    // Graceful shutdown
    const shutdown = (signal) => {
      logger.info(`${signal} received. Shutting down gracefully...`);
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
});

// Start the server
startServer();

module.exports = app;
