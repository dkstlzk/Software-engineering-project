/**
 * Room Inventory Service
 * Handles room equipment and inventory management
 */
const db = require('../config/database');
const logger = require('../utils/logger');
const { ApiError } = require('../utils/errorHandler');

class InventoryService {
  /**
   * Add item to room inventory
   * @param {string} roomId - Room ID
   * @param {Object} data - Item data
   * @param {string} userId - Creating user ID
   * @returns {Promise<Object>} Created inventory item
   */
  async addItem(roomId, data, userId) {
    // Verify room exists
    const roomCheck = await db.query('SELECT id FROM rooms WHERE id = $1', [roomId]);
    if (roomCheck.rows.length === 0) {
      throw ApiError.notFound('Room not found');
    }

    const {
      itemName,
      itemDescription,
      quantity,
      status,
      serialNumber,
      purchaseDate,
      warrantyExpiry,
      lastMaintenance,
      nextMaintenance,
    } = data;

    const result = await db.query(
      `INSERT INTO room_inventory (
        room_id, item_name, item_description, quantity, status,
        serial_number, purchase_date, warranty_expiry,
        last_maintenance, next_maintenance
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        roomId,
        itemName,
        itemDescription,
        quantity || 1,
        status || 'available',
        serialNumber,
        purchaseDate,
        warrantyExpiry,
        lastMaintenance,
        nextMaintenance,
      ]
    );

    const item = result.rows[0];
    await this.logAudit(userId, 'CREATE', item.id, null, item);
    logger.info('Inventory item added', { itemId: item.id, roomId, itemName });

    return item;
  }

  /**
   * Get all inventory items for a room
   * @param {string} roomId - Room ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Inventory list
   */
  async getByRoom(roomId, options = {}) {
    const { status, search } = options;
    const params = [roomId];
    const conditions = ['room_id = $1'];

    if (status) {
      conditions.push(`status = $${params.length + 1}`);
      params.push(status);
    }

    if (search) {
      conditions.push(`(item_name ILIKE $${params.length + 1} OR item_description ILIKE $${params.length + 1})`);
      params.push(`%${search}%`);
    }

    const result = await db.query(
      `SELECT * FROM room_inventory
       WHERE ${conditions.join(' AND ')}
       ORDER BY item_name`,
      params
    );

    return result.rows;
  }

  /**
   * Get inventory item by ID
   * @param {string} id - Item ID
   * @returns {Promise<Object>} Item data
   */
  async findById(id) {
    const result = await db.query(
      `SELECT ri.*, r.room_number, r.name as room_name
       FROM room_inventory ri
       JOIN rooms r ON ri.room_id = r.id
       WHERE ri.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      throw ApiError.notFound('Inventory item not found');
    }

    return result.rows[0];
  }

  /**
   * Update inventory item
   * @param {string} id - Item ID
   * @param {Object} data - Update data
   * @param {string} userId - Updating user ID
   * @returns {Promise<Object>} Updated item
   */
  async update(id, data, userId) {
    const current = await this.findById(id);

    const {
      itemName,
      itemDescription,
      quantity,
      status,
      serialNumber,
      purchaseDate,
      warrantyExpiry,
      lastMaintenance,
      nextMaintenance,
    } = data;

    const result = await db.query(
      `UPDATE room_inventory SET
        item_name = COALESCE($1, item_name),
        item_description = COALESCE($2, item_description),
        quantity = COALESCE($3, quantity),
        status = COALESCE($4, status),
        serial_number = COALESCE($5, serial_number),
        purchase_date = COALESCE($6, purchase_date),
        warranty_expiry = COALESCE($7, warranty_expiry),
        last_maintenance = COALESCE($8, last_maintenance),
        next_maintenance = COALESCE($9, next_maintenance),
        updated_at = NOW()
       WHERE id = $10
       RETURNING *`,
      [
        itemName,
        itemDescription,
        quantity,
        status,
        serialNumber,
        purchaseDate,
        warrantyExpiry,
        lastMaintenance,
        nextMaintenance,
        id,
      ]
    );

    const item = result.rows[0];
    await this.logAudit(userId, 'UPDATE', id, current, item);
    logger.info('Inventory item updated', { itemId: id });

    return item;
  }

  /**
   * Delete inventory item
   * @param {string} id - Item ID
   * @param {string} userId - Deleting user ID
   */
  async delete(id, userId) {
    const current = await this.findById(id);

    await db.query('DELETE FROM room_inventory WHERE id = $1', [id]);

    await this.logAudit(userId, 'DELETE', id, current, null);
    logger.info('Inventory item deleted', { itemId: id });
  }

  /**
   * Update item status (for maintenance tracking)
   * @param {string} id - Item ID
   * @param {string} status - New status
   * @param {string} userId - Updating user ID
   * @returns {Promise<Object>} Updated item
   */
  async updateStatus(id, status, userId) {
    const current = await this.findById(id);

    const result = await db.query(
      `UPDATE room_inventory SET
        status = $1,
        updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );

    const item = result.rows[0];
    await this.logAudit(userId, 'STATUS_CHANGE', id, { status: current.status }, { status });
    logger.info('Inventory status updated', { itemId: id, status });

    return item;
  }

  /**
   * Get items needing maintenance
   * @param {number} daysAhead - Days to look ahead
   * @returns {Promise<Array>} Items needing maintenance
   */
  async getMaintenanceDue(daysAhead = 30) {
    const result = await db.query(
      `SELECT ri.*, r.room_number, r.name as room_name, b.name as building_name
       FROM room_inventory ri
       JOIN rooms r ON ri.room_id = r.id
       JOIN buildings b ON r.building_id = b.id
       WHERE ri.next_maintenance IS NOT NULL
         AND ri.next_maintenance <= CURRENT_DATE + INTERVAL '${daysAhead} days'
         AND ri.status != 'maintenance'
       ORDER BY ri.next_maintenance`,
      []
    );

    return result.rows;
  }

  /**
   * Get inventory summary by room
   * @param {string} roomId - Room ID
   * @returns {Promise<Object>} Summary statistics
   */
  async getRoomSummary(roomId) {
    const result = await db.query(
      `SELECT 
        COUNT(*) as total_items,
        SUM(quantity) as total_quantity,
        COUNT(*) FILTER (WHERE status = 'available') as available_items,
        COUNT(*) FILTER (WHERE status = 'in_use') as in_use_items,
        COUNT(*) FILTER (WHERE status = 'maintenance') as maintenance_items,
        COUNT(*) FILTER (WHERE status = 'damaged') as damaged_items,
        COUNT(*) FILTER (WHERE warranty_expiry < CURRENT_DATE) as expired_warranty
       FROM room_inventory
       WHERE room_id = $1`,
      [roomId]
    );

    return result.rows[0];
  }

  /**
   * Log audit entry
   */
  async logAudit(userId, action, entityId, oldValues, newValues) {
    try {
      await db.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values)
         VALUES ($1, $2, 'room_inventory', $3, $4, $5)`,
        [
          userId,
          action,
          entityId,
          oldValues ? JSON.stringify(oldValues) : null,
          newValues ? JSON.stringify(newValues) : null,
        ]
      );
    } catch (error) {
      logger.error('Failed to log audit', { error: error.message });
    }
  }
}

module.exports = new InventoryService();
