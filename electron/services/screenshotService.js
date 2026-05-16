import dgram from 'dgram';
import path from 'path';
import fs from 'fs-extra';
import screenshot from 'screenshot-desktop';
import { v4 as uuidv4 } from 'uuid';

class ScreenshotService {
  constructor() {
    this.client = dgram.createSocket('udp4');
    this.xpIp = '127.0.0.1';
    this.xpPort = 49000;
    this.datarefs = {
      latitude: 'sim/flightmodel/position/latitude',
      longitude: 'sim/flightmodel/position/longitude',
      aircraft: 'sim/aircraft/view/acf_desc',
      zulu_time: 'sim/time/zulu_time_sec',
      elevation: 'sim/flightmodel/position/elevation' // Altitude in meters
    };
    this.currentData = { lat: 0, lng: 0, zulu: 0, alt: 0, aircraft: 'X-Plane' };
    
    this.client.on('error', (err) => {
      console.error(`UDP Error: ${err.stack}`);
      this.client.close();
    });

    this.client.on('message', (msg) => {
      const header = msg.slice(0, 4).toString();
      if (header === 'RREF') {
        for (let i = 5; i < msg.length; i += 8) {
          if (i + 8 > msg.length) break;
          const id = msg.readInt32LE(i);
          const value = msg.readFloatLE(i + 4);
          this.handleDatarefUpdate(id, value);
        }
      }
    });

    this.client.bind(0);
  }

  handleDatarefUpdate(id, value) {
    if (id === 1) this.currentData.lat = value;
    if (id === 2) this.currentData.lng = value;
    if (id === 3) this.currentData.zulu = value;
    if (id === 5) this.currentData.alt = value * 3.28084; // Convert meters to feet
  }

  async startListening() {
    console.log('Starting X-Plane UDP listener...');
    this.sendRref(1, this.datarefs.latitude, 1);
    this.sendRref(2, this.datarefs.longitude, 1);
    this.sendRref(3, this.datarefs.zulu_time, 1);
    this.sendRref(5, this.datarefs.elevation, 1);
  }

  sendRref(id, dataref, freq) {
    const buffer = Buffer.alloc(413);
    buffer.write('RREF', 0);
    buffer.writeInt32LE(freq, 5);
    buffer.writeInt32LE(id, 9);
    buffer.write(dataref, 13);
    this.client.send(buffer, 0, buffer.length, this.xpPort, this.xpIp);
  }

  async takeScreenshot(xplanePath, customDir = null) {
    const screenshotDir = customDir || path.join(xplanePath, 'Assistant_Screenshots');
    try {
      await fs.ensureDir(screenshotDir);
      
      const lat = this.currentData.lat.toFixed(4);
      const lng = this.currentData.lng.toFixed(4);
      const alt = Math.round(this.currentData.alt);
      const aircraft = this.currentData.aircraft.replace(/[^a-z0-9]/gi, '_');
      
      const fileName = `${lat}__${lng}__${aircraft}__${alt}ft.jpg`;
      const filePath = path.join(screenshotDir, fileName);
      
      await screenshot({ filename: filePath });
      
      const metadata = {
        id: uuidv4(),
        fileName,
        timestamp: new Date().toISOString(),
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        alt,
        aircraft: this.currentData.aircraft
      };
      
      const dbPath = path.join(screenshotDir, 'screenshots.json');
      let db = [];
      if (await fs.pathExists(dbPath)) {
        db = await fs.readJson(dbPath);
      }
      db.push(metadata);
      await fs.writeJson(dbPath, db, { spaces: 2 });
      console.log('Metadata saved to JSON');
      
      return metadata;
    } catch (e) {
      console.error('ScreenshotService failed:', e);
      throw e;
    }
  }
}

export default new ScreenshotService();
