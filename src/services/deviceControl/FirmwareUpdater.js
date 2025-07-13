const BaseController = require('./BaseController');
const db = require('../../config/db');
const axios = require('axios');
const crypto = require('crypto');

class FirmwareUpdater extends BaseController {
  constructor() {
    super();
    this.commandRegistry.set('firmware_update', this.updateFirmware.bind(this));
  }

  async updateFirmware(command) {
    this.validateCommand(command, ['deviceId', 'version', 'url']);
    
    // 1. Download firmware
    const firmware = await this.downloadFirmware(command.url);
    
    // 2. Verify checksum if provided
    if (command.checksum) {
      this.verifyChecksum(firmware, command.checksum);
    }
    
    // 3. Initiate update process
    await this.sendToDevice(command.deviceId, {
      type: 'firmware_update',
      size: firmware.length,
      chunks: Math.ceil(firmware.length / 1024) // 1KB chunks
    });
    
    // 4. Track update status
    await db.execute(
      `INSERT INTO firmware_updates
       (device_id, version, status, started_at)
       VALUES (?, ?, 'initiated', NOW())`,
      [command.deviceId, command.version]
    );
    
    return { success: true, chunks: Math.ceil(firmware.length / 1024) };
  }

  async downloadFirmware(url) {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000
    });
    return response.data;
  }

  verifyChecksum(data, expectedChecksum) {
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    if (hash !== expectedChecksum) {
      throw new Error(`Checksum mismatch: expected ${expectedChecksum}, got ${hash}`);
    }
  }
}

module.exports = FirmwareUpdater;