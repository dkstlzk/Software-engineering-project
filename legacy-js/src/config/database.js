/**
 * PostgreSQL Database Connection Pool
 * Provides database connection with error handling and logging
 */
const { Pool } = require('pg');
const config = require('./index');
const logger = require('../utils/logger');

const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.name,
  user: config.database.user,
  password: config.database.password,
  ssl: config.database.ssl,
  max: 20, // Maximum number of connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Event listeners for connection pool
pool.on('connect', () => {
  logger.debug('New client connected to database');
});

pool.on('error', (err, client) => {
  logger.error('Unexpected error on idle client', { error: err.message });
  process.exit(-1);
});

/**
 * Execute a query with automatic connection handling
 * @param {string} text - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} Query result
 */
const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug('Executed query', { 
      text: text.substring(0, 100), 
      duration, 
      rows: result.rowCount 
    });
    return result;
  } catch (error) {
    logger.error('Database query error', { 
      text: text.substring(0, 100), 
      error: error.message 
    });
    throw error;
  }
};

/**
 * Get a client from the pool for transactions
 * @returns {Promise<Object>} Database client
 */
const getClient = () => pool.connect();

/**
 * Test database connection
 * @returns {Promise<boolean>} Connection status
 */
const testConnection = async () => {
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    logger.info('Database connection successful');
    return true;
  } catch (error) {
    logger.error('Database connection failed', { error: error.message });
    return false;
  }
};

module.exports = {
  pool,
  query,
  getClient,
  testConnection,
};
