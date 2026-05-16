import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { app } from 'electron';

export async function downloadMod(url, destFolder, modId, cookieString = '', onProgress = null) {
  const tempZipPath = path.join(destFolder, `${modId}_temp.zip`);
  
  try {
    const config = {
      responseType: 'stream',
      headers: {}
    };

    if (cookieString) {
      config.headers['Cookie'] = cookieString;
      config.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    }

    const response = await axios.get(url, config);
    
    const contentType = response.headers['content-type'];
    if (contentType && contentType.includes('text/html')) {
      throw new Error("Received an HTML page instead of a file. Authentication might have failed or the link is not a direct download link.");
    }

    const totalLength = response.headers['content-length'];
    let downloadedLength = 0;

    const writer = fs.createWriteStream(tempZipPath);
    
    response.data.on('data', (chunk) => {
      downloadedLength += chunk.length;
      if (onProgress && totalLength) {
        const progress = Math.floor((downloadedLength / totalLength) * 100);
        onProgress(progress);
      }
    });

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(tempZipPath));
      writer.on('error', reject);
    });
  } catch (error) {
    // Clean up on failure
    if (await fs.pathExists(tempZipPath)) {
      await fs.remove(tempZipPath);
    }
    throw error;
  }
}
