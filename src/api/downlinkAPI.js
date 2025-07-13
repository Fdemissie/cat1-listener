const express = require('express');
const router = express.Router();
const DownlinkService = require('../services/downlinkService');
const MeterServer = require('../server');

router.post('/command', async (req, res) => {
  try {
    const { deviceId, command } = req.body;
    
    // Try immediate delivery
    const immediateSuccess = await MeterServer.getInstance().sendCommand(deviceId, command);
    
    if (!immediateSuccess) {
      // Queue if device not connected
      await DownlinkService.queueMessage(deviceId, command);
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;