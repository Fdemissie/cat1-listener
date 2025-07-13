const db = require('../config/db');
const logger = require('../utils/logger');
const crypto = require('crypto');

class DownlinkService {
  /**
   * Signs a downlink message with HMAC-SHA256
   * @param {object} message - The message to sign
   * @returns {object} Signed message with signature
   */
  static signMessage(message) {
    if (!process.env.DOWNLINK_SECRET) {
      throw new Error('DOWNLINK_SECRET environment variable not set');
    }

    const hmac = crypto.createHmac('sha256', process.env.DOWNLINK_SECRET);
    hmac.update(JSON.stringify(message));
    return {
      ...message,
      signature: hmac.digest('hex'),
      signed_at: new Date().toISOString()
    };
  }

  /**
   * Verifies a signed message
   * @param {object} message - The message with signature
   * @returns {boolean} True if valid
   */
  static verifyMessage(message) {
    if (!message.signature) return false;
    
    const { signature, ...unsignedMessage } = message;
    const hmac = crypto.createHmac('sha256', process.env.DOWNLINK_SECRET);
    hmac.update(JSON.stringify(unsignedMessage));
    return hmac.digest('hex') === signature;
  }

  /**
   * Queues a downlink message for a device
   * @param {string} deviceId - Target device ID
   * @param {object} message - The message to send
   * @param {object} [options] - Optional settings
   * @param {boolean} [options.sign=true] - Whether to sign the message
   * @returns {Promise<number>} Queue insert ID
   */
  static async queueMessage(deviceId, message, { sign = true } = {}) {
    try {
      const messageToStore = sign ? this.signMessage(message) : message;
      
      const [result] = await db.execute(
        `INSERT INTO downlink_queue 
         (device_id, message, created_at, status, message_type)
         VALUES (?, ?, NOW(), 'queued', ?)`,
        [
          deviceId, 
          JSON.stringify(messageToStore),
          message.type || 'unknown'
        ]
      );
      
      logger.debug(`Queued message for ${deviceId}`, {
        messageId: result.insertId,
        type: message.type
      });
      
      return result.insertId;
    } catch (error) {
      logger.error('Failed to queue message:', {
        error: error.message,
        deviceId,
        messageType: message.type
      });
      throw error;
    }
  }

  /**
   * Retrieves queued messages for a device
   * @param {string} deviceId - Target device ID
   * @param {object} [options] - Optional settings
   * @param {boolean} [options.verify=true] - Verify message signatures
   * @returns {Promise<object|null>} The message or null if none
   */
  static async checkForMessages(deviceId, { verify = true } = {}) {
    try {
      const [rows] = await db.execute(
        `SELECT * FROM downlink_queue 
         WHERE device_id = ? AND status = 'queued'
         ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED`,
        [deviceId]
      );

      if (rows.length === 0) return null;

      const message = JSON.parse(rows[0].message);
      
      if (verify && !this.verifyMessage(message)) {
        await this.markMessageFailed(rows[0].id, 'invalid_signature');
        throw new Error(`Invalid signature for message ${rows[0].id}`);
      }

      await db.execute(
        `UPDATE downlink_queue SET 
         status = 'sent',
         sent_at = NOW()
         WHERE id = ?`,
        [rows[0].id]
      );

      return message;
    } catch (error) {
      logger.error('Failed to check for messages:', {
        error: error.message,
        deviceId
      });
      throw error;
    }
  }

  /**
   * Marks a message as failed
   * @param {number} messageId - Queue message ID
   * @param {string} reason - Failure reason
   */
  static async markMessageFailed(messageId, reason) {
    await db.execute(
      `UPDATE downlink_queue SET 
       status = 'failed',
       error = ?,
       sent_at = NOW()
       WHERE id = ?`,
      [reason, messageId]
    );
  }
}

module.exports = DownlinkService;