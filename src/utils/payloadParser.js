const cbor = require('cbor');
const logger = require('./logger');

/**
 * Parses and validates incoming meter payloads
 */
class PayloadParser {
  /**
   * Parse raw Base64/CBOR payload
   * @param {string} rawData - Base64 encoded CBOR data
   * @returns {Promise<object>} - Decoded meter data
   */
  static async parsePayload(rawData) {
    try {
      // Step 1: Validate input
      if (!rawData || typeof rawData !== 'string') {
        throw new Error('Invalid payload: must be non-empty string');
      }
      logger.info('Raw Payload:',rawData);
      // Step 2: Base64 decode
      const cborBuffer = this._base64ToBuffer(rawData);
      
      // Step 3: CBOR decode
      const decoded = await this._decodeCbor(cborBuffer);
      
      // Step 4: Validate structure
      return this._validatePayload(decoded);
    } catch (error) {
      logger.error('Payload parsing failed:', error);
      throw new Error(`Payload processing error: ${error.message}`);
    }
  }

  static _base64ToBuffer(base64String) {
    try {
      return Buffer.from(base64String, 'base64');
    } catch (error) {
      throw new Error(`Base64 decoding failed: ${error.message}`);
    }
  }

  static async _decodeCbor(buffer) {
    try {
      return await cbor.decodeFirst(buffer);
    } catch (error) {
      throw new Error(`CBOR decoding failed: ${error.message}`);
    }
  }

  static _validatePayload(data) {
    if (!data) {
      throw new Error('Decoded payload is empty');
    }

    // Convert array of objects to single object if needed
    const normalized = Array.isArray(data) 
      ? Object.assign({}, ...data) 
      : data;

    // Basic field validation
    const requiredFields = ['serial_number', 'meter_reading'];
    const missingFields = requiredFields.filter(field => !(field in normalized));

    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }

    return normalized;
  }
}

module.exports = { parsePayload: PayloadParser.parsePayload.bind(PayloadParser) };