# CAT1 4G Meter Listener Server

This is a production-ready TCP server designed to receive Base64-encoded CBOR payloads from 4G CAT1 smart utility meters (e.g., water meters). It decodes the messages, extracts structured data, and stores readings in a MySQL database.

---

## 🚀 Features

* TCP socket listener (default port: `5684`)
* String, Base64 decoding and CBOR parsing
* Structured data extraction
* MySQL storage with connection pool
* Scalable project structure with PM2 support
* Logging via Winston

---

## 📦 Folder Structure(in progress)

```
cat1-listener/
├── src/
│   ├── index.js                 # Index
|   |── server.js                # Main server
│   ├── config/                  # Configuration
│   ├── processors/              # Data processing
│   ├── services/                # Business logic
│   ├── utils/                   # Utilities
│   └── simulators/              # Test simulator
├── .env                      # Environment variables
├── ecosystem.config.js       # PM2 config
├── package.json
```

---

## ✅ Prerequisites

* Node.js v18 or higher
* MySQL Server (local or cloud)

---

## 🔧 Setup Instructions
## Option 1(easy Option)
### 1. Clone the repository
```bash
git clone https://github.com/fdemissie/cat1-listener.git
cd cat1-listener
```
### 2. Run deploy-cat1-listener.sh
```bash
sudo ./deploy-cat1-listener.sh
```
You should see this when deployment is finished
<img width="591" height="292" alt="image" src="https://github.com/user-attachments/assets/3906e6ab-4ff6-4003-91b8-4f8680fffaf8" />

### 3. Run pm2 status
<img width="641" height="94" alt="image" src="https://github.com/user-attachments/assets/113ed7d1-54cd-479b-9864-542dda3cb1b0" />


## Option 2( do it all manually)
### 1. Clone the repository

```bash
git clone https://github.com/fdemissie/cat1-listener.git
cd cat1-listener
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the root:

```ini
LISTEN_PORT=5684
DB_HOST=localhost
DB_USER=username
DB_PASSWORD=password         # (leave blank if no password)
DB_NAME=cat1_meters
```

### 4. Create the MySQL Database and Table

Login to MySQL and run:

```sql
CREATE DATABASE IF NOT EXISTS cat1_meters;
USE cat1_meters;

CREATE TABLE raw_meter_data (
  id INT AUTO_INCREMENT PRIMARY KEY,
  payload TEXT NOT NULL,
  client_address VARCHAR(255),
  received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX (received_at)
);

CREATE TABLE meter_readings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  raw_data_id INT,
  device_id VARCHAR(255),
  meter_reading DECIMAL(12,2),
  battery_level INT,
  valve_status TINYINT(1),
  additional_data JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (raw_data_id) REFERENCES raw_meter_data(id),
  INDEX (device_id),
  INDEX (created_at)
);
```

### 5. Run the Server with PM2

```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 logs cat1-listener
```

---

## 🧪 Send Test Data with the Simulator

```bash
# Send 5 basic messages with 2s delay
node src/simulator/sendTestPayload.js -t basic -c 5 -d 2000

# Test invalid payloads
node src/simulator/sendTestPayload.js -t invalid
```

You should see log output and a new row in your MySQL table.

---

## 🛠 Troubleshooting

### MySQL Error: Access Denied

* Ensure `.env` DB credentials match your local setup.


### Data is Empty

* Add `console.log(decoded)` in `server.js` to inspect payload
* Ensure the device sends Base64-encoded CBOR (or use the simulator)

---

## 🔐 Production Notes

* Run behind a firewall or VPN for secure port exposure
* Use fail2ban to limit brute-force connection attempts
* Consider TLS if meters support secure TCP

---

## 📄 License

MIT

---

## 👨‍💻 Maintainer

This system is maintained and tested for 4G CAT1 smart meter integrations. Reach out for support or integrations.
