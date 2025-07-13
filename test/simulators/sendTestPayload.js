require('dotenv').config();
const net = require('net');
const cbor = require('cbor');
const chalk = require('chalk'); // For colored console output
const { program } = require('commander'); // For CLI arguments


// Configure CLI options
program
  .option('-t, --type <type>', 'Meter type (basic|advanced|invalid|array)', 'basic')
  .option('-c, --count <number>', 'Number of messages to send', 1)
  .option('-d, --delay <ms>', 'Delay between messages (ms)', 1000)
  .parse(process.argv);

const options = program.opts();

// Meter payload templates
const PAYLOADS = {
  basic: {
    serial_number: `BASIC-${Math.floor(1000 + Math.random() * 9000)}`,
    meter_reading: Math.floor(Math.random() * 10000),
    battery_level: Math.floor(20 + Math.random() * 80),
    valve_status: Math.random() > 0.5 ? 1 : 0
  },
  advanced: {
    device_id: `ADV-${Math.floor(1000 + Math.random() * 9000)}`,
    consumption: {
      current: Math.random() * 100,
      total: Math.floor(Math.random() * 10000)
    },
    diagnostics: {
      battery: Math.floor(10 + Math.random() * 90),
      temperature: 20 + Math.floor(Math.random() * 15),
      signal_strength: Math.floor(Math.random() * 5)
    }
  },
  array: [
    { serial_number: `ARRAY-${Math.floor(1000 + Math.random() * 9000)}` },
    { meter_reading: Math.floor(Math.random() * 10000) },
    { battery_level: Math.floor(20 + Math.random() * 80) },
    { valve_status: Math.random() > 0.5 ? 1 : 0 }
  ],
  invalid: {
    random_data: "This won't parse correctly",
    junk: [1, 2, "three"]
  }
};

class MeterSimulator {
  constructor() {
    this.client = new net.Socket();
    this.messageCount = 0;
  }

  async sendPayload(payloadType) {
    const payload = PAYLOADS[payloadType] || PAYLOADS.basic;
    const encoded = cbor.encode(payload);
    const base64Payload = encoded.toString('base64');

    console.log(chalk.blue(`\nSending ${payloadType} payload:`));
    console.log(chalk.gray('Original:'), payload);
    console.log(chalk.green('CBOR:  '), encoded);
    console.log(chalk.gray('Base64:  '), base64Payload);

    return new Promise((resolve, reject) => {
      this.client.connect(process.env.LISTEN_PORT, '127.0.0.1', () => {
        console.log(`Connected to listener on port ${process.env.LISTEN_PORT}`);
        this.client.write(base64Payload);
        this.client.end();
        this.messageCount++;
        console.log(chalk.green(`Sent payload ${this.messageCount}/${options.count}`));
        resolve();
      });

      this.client.on('error', (err) => {
        console.error(chalk.red('Connection error:'), err.message);
        reject(err);
      });
    });
  }

  async run() {
    try {
      for (let i = 0; i < options.count; i++) {
        await this.sendPayload(options.type);
        if (i < options.count - 1) {
          await new Promise(resolve => setTimeout(resolve, options.delay));
        }
      }
    } catch (err) {
      console.error(chalk.red('Simulation failed:'), err);
    } finally {
      process.exit();
    }
  }
}

// Run the simulator
new MeterSimulator().run();