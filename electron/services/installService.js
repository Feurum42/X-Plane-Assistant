import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';
import path from 'path';
import unzipper from 'unzipper';
const execAsync = promisify(exec);

export async function extractMod(zipPath, vaultPath, modId, originalName = null) {
  const extractDest = path.join(vaultPath, modId);
  
  try {
    // Clear existing mod folder in vault if it exists
    if (await fs.pathExists(extractDest)) {
      await fs.remove(extractDest);
    }
    await fs.ensureDir(extractDest);

    const ext = path.extname(zipPath).toLowerCase();

    // Validate file before extraction
    const stats = await fs.stat(zipPath);
    if (stats.size < 1000) { // Less than 1KB is likely an error page
      const content = await fs.readFile(zipPath, 'utf8');
      if (content.includes('<!DOCTYPE html>') || content.includes('<html>') || content.startsWith('----')) {
        throw new Error("The downloaded file is an error page or an invalid response from the website. Please check if you are logged in or if the link is correct.");
      }
    }

    const fd = await fs.open(zipPath, 'r');
    const { buffer: sigBuffer } = await fs.read(fd, Buffer.alloc(6), 0, 6, 0);
    await fs.close(fd);
    const signature = sigBuffer.toString('hex');
    
    const finalFileName = originalName || path.basename(zipPath);

    if (process.platform === 'win32') {
      if (ext === '.7z' || signature.startsWith('377abc')) {
        const { path7za } = await import('7zip-bin');
        await execAsync(`"${path7za}" x "${zipPath}" -o"${extractDest}" -y`);
        return extractDest;
      }

      if (ext === '.zip') {
        const psCommand = `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDest}' -Force"`;
        await execAsync(psCommand);
        return extractDest;
      }
    }

    if (ext === '.lua' || signature.startsWith('2d2d')) {
       await fs.move(zipPath, path.join(extractDest, finalFileName));
       return extractDest;
    } else {
      await fs.createReadStream(zipPath).pipe(unzipper.Extract({ path: extractDest })).promise();
      return extractDest;
    }
    
    // Clean up zip if it still exists (in case of unzipper fallback)
    if (await fs.pathExists(zipPath)) {
      await fs.remove(zipPath);
    }

    // Verify if extraction actually worked (check if folder is not empty)
    const files = await fs.readdir(extractDest);
    if (files.length === 0) {
      throw new Error("Extraction failed: Folder is empty.");
    }

    return extractDest;
  } catch (error) {
    // Cleanup the folder if extraction failed so we don't have a ghost mod
    if (await fs.pathExists(extractDest)) {
      await fs.remove(extractDest);
    }
    throw error;
  }
}

export async function enableMod(vaultModPath, xplanePath, modType) {
  let targetDir = '';
  if (modType === 'plugin') targetDir = path.join(xplanePath, 'Resources', 'plugins');
  else if (modType === 'aircraft') targetDir = path.join(xplanePath, 'Aircraft');
  else if (modType === 'scenery' || modType === 'library') targetDir = path.join(xplanePath, 'Custom Scenery');
  else if (modType === 'script') targetDir = path.join(xplanePath, 'Resources', 'plugins', 'FlyWithLua', 'Scripts');
  else throw new Error(`Unknown mod type: ${modType}`);

  await fs.ensureDir(targetDir);

  const payloads = [];

  const scanForPayloads = async (currentPath, type) => {
    const items = await fs.readdir(currentPath);
    const filtered = items.filter(f => f !== 'vault_meta.json');
    
    let isThisPayload = false;
    // Check if THIS folder is a payload
    if (type === 'aircraft' && items.some(f => f.toLowerCase().endsWith('.acf'))) isThisPayload = true;
    if (type === 'plugin' && (items.includes('64') || items.includes('win.xpl'))) isThisPayload = true;
    if (type === 'scenery' && items.includes('Earth nav data')) isThisPayload = true;
    if (type === 'script' && items.some(f => f.toLowerCase().endsWith('.lua'))) isThisPayload = true;

    if (isThisPayload) {
      payloads.push(currentPath);
      return; // Stop searching deeper in this branch
    }

    // If not a payload, look deeper
    for (const item of filtered) {
      const itemPath = path.join(currentPath, item);
      const stat = await fs.lstat(itemPath).catch(() => null);
      if (stat && stat.isDirectory()) {
        await scanForPayloads(itemPath, type);
      } else if (stat && stat.isFile() && type === 'script' && item.toLowerCase().endsWith('.lua')) {
        payloads.push(itemPath);
      }
    }
  };

  await scanForPayloads(vaultModPath, modType);

  if (payloads.length === 0) {
    // Fallback: just link everything at the root if we found nothing specific
    const rootItems = (await fs.readdir(vaultModPath)).filter(f => f !== 'vault_meta.json');
    for (const item of rootItems) {
      const lower = item.toLowerCase();
      if (lower.endsWith('.md') || lower.endsWith('.txt') || lower.endsWith('.pdf') || lower === 'license') continue;
      
      const source = path.join(vaultModPath, item);
      const dest = path.join(targetDir, item);
      if (await fs.pathExists(dest)) await fs.remove(dest);
      await fs.symlink(source, dest, (await fs.stat(source)).isDirectory() ? 'junction' : 'file');
    }
  } else {
    for (const payloadPath of payloads) {
      const itemName = path.basename(payloadPath);
      const destPath = path.join(targetDir, itemName);
      
      if (await fs.pathExists(destPath)) {
        const lstat = await fs.lstat(destPath).catch(() => null);
        if (lstat && lstat.isSymbolicLink()) await fs.remove(destPath);
        else continue; 
      }

      const stat = await fs.stat(payloadPath);
      if (stat.isDirectory()) {
        await fs.symlink(payloadPath, destPath, 'junction');
      } else {
        await fs.symlink(payloadPath, destPath, 'file');
      }
    }
  }

  // Handle scenery priority if needed
  if (modType === 'scenery' || modType === 'library') {
    await registerSceneryInIni(xplanePath, path.basename(vaultModPath));
  }

  return targetDir;
}

async function registerSceneryInIni(xplanePath, folderName) {
  const iniPath = path.join(xplanePath, 'Custom Scenery', 'scenery_packs.ini');
  try {
    if (!await fs.pathExists(iniPath)) return;

    let content = await fs.readFile(iniPath, 'utf8');
    // More robust filtering: only keep SCENERY_PACK lines for sorting
    let lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => {
      const lower = l.toLowerCase();
      return l !== '' && 
             l !== 'I' && 
             l !== '1000 Version' && 
             lower !== 'scenery' &&
             l.startsWith('SCENERY_PACK');
    });
    
    const entry = `SCENERY_PACK Custom Scenery/${folderName}/`;
    
    // Remove the entry if it exists to re-add it in the correct position
    lines = lines.filter(l => !l.includes(folderName));

    const airportLines = [];
    const libraryLines = [];
    const orthoLines = [];
    const meshLines = [];

    lines.forEach(line => {
      const lower = line.toLowerCase();
      if (lower.includes('airport') || /^[A-Z]{4}/.test(path.basename(line.replace(/\/$/, '')))) {
        airportLines.push(line);
      } else if (lower.includes('library') || lower.includes('lib') || lower.includes('sam_')) {
        libraryLines.push(line);
      } else if (lower.includes('ortho') || lower.includes('photo') || lower.includes('z_')) {
        orthoLines.push(line);
      } else if (lower.includes('mesh') || lower.includes('y_')) {
        meshLines.push(line);
      } else {
        airportLines.push(line); // Default to airports/top
      }
    });

    // Add new entry to appropriate group
    const lowerEntry = folderName.toLowerCase();
    if (lowerEntry.includes('library') || lowerEntry.includes('lib') || lowerEntry.includes('sam_')) {
      libraryLines.unshift(entry);
    } else if (lowerEntry.includes('mesh') || lowerEntry.includes('y_')) {
      meshLines.unshift(entry);
    } else if (lowerEntry.includes('ortho') || lowerEntry.includes('photo') || lowerEntry.includes('z_')) {
      orthoLines.unshift(entry);
    } else {
      airportLines.unshift(entry);
    }

    const newContent = [
      'I',
      '1000 Version',
      'SCENERY',
      '',
      ...airportLines,
      ...libraryLines,
      ...orthoLines,
      ...meshLines
    ].join('\n');

    await fs.writeFile(iniPath, newContent);
  } catch (err) {
    console.error("Failed to update scenery_packs.ini:", err);
  }
}

export async function disableMod(vaultModPath, xplanePath, modType) {
  const targetDirs = [
    path.join(xplanePath, 'Resources', 'plugins'),
    path.join(xplanePath, 'Aircraft'),
    path.join(xplanePath, 'Custom Scenery'),
    path.join(xplanePath, 'Resources', 'plugins', 'FlyWithLua', 'Scripts')
  ];

  const payloads = [];
  const scanForPayloads = async (currentPath, type) => {
    const items = await fs.readdir(currentPath).catch(() => []);
    if (items.includes('64') || items.includes('win.xpl') || items.some(f => f.toLowerCase().endsWith('.acf')) || items.includes('Earth nav data') || items.some(f => f.toLowerCase().endsWith('.lua'))) {
       payloads.push(currentPath);
       return;
    }
    for (const item of items) {
      if (item === 'vault_meta.json') continue;
      const itemPath = path.join(currentPath, item);
      if ((await fs.stat(itemPath).catch(() => ({isDirectory:()=>false}))).isDirectory()) {
        await scanForPayloads(itemPath, type);
      } else if (item.toLowerCase().endsWith('.lua')) {
        payloads.push(itemPath);
      }
    }
  };

  await scanForPayloads(vaultModPath, modType);
  
  // If no payloads found, use root items as fallback for cleanup
  if (payloads.length === 0) {
    const rootItems = (await fs.readdir(vaultModPath).catch(() => [])).filter(f => f !== 'vault_meta.json');
    for (const item of rootItems) {
      payloads.push(path.join(vaultModPath, item));
    }
  }

  for (const payloadPath of payloads) {
    const itemName = path.basename(payloadPath);
    for (const targetDir of targetDirs) {
      const destPath = path.join(targetDir, itemName);
      if (await fs.pathExists(destPath)) {
        await fs.remove(destPath);
        console.log(`Removed: ${destPath}`);
      }
    }
  }
}
