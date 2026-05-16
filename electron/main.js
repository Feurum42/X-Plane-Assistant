import { app, BrowserWindow, ipcMain, session, dialog, shell, globalShortcut, protocol } from 'electron';
import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs-extra';
import https from 'https';
import { spawn, exec } from 'child_process';
import { downloadMod } from './services/downloadService.js';
import { extractMod, enableMod, disableMod } from './services/installService.js';
import screenshotService from './services/screenshotService.js';
import { getUnifiedFeed, fetchSingleProductPrice } from './aggregator.js';
import { sendDiscordNotification, sendTelegramNotification, sendEmailNotification } from './services/notificationService.js';
import { autoUpdater } from 'electron-updater';

// Configure Auto Updater
autoUpdater.autoDownload = false; // We'll let the user decide
autoUpdater.logger = console;

let watcher = null;

async function getDirSize(dirPath) {
  let size = 0;
  const files = await fs.readdir(dirPath);
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stats = await fs.lstat(filePath);
    if (stats.isDirectory()) {
      size += await getDirSize(filePath);
    } else {
      size += stats.size;
    }
  }
  return size;
}

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function setupWatcher(windowRef, xplanePath) {
  if (watcher) watcher.close();
  
  const sPath = customScreenshotPath || path.join(xplanePath, 'Assistant_Screenshots');
  if (!fs.existsSync(sPath)) fs.ensureDirSync(sPath);

  watcher = chokidar.watch(sPath, { persistent: true, ignoreInitial: false });
  
  watcher.on('all', (event, filePath) => {
    if (filePath.endsWith('screenshots.json') || filePath.endsWith('.jpg')) {
      if (windowRef && !windowRef.isDestroyed()) {
        windowRef.webContents.send('screenshots-updated');
      }
    }
  });
}

function registerMediaProtocol() {
  protocol.registerFileProtocol('assistant-media', (request, callback) => {
    let filePath = request.url.replace('assistant-media://', '');
    filePath = decodeURIComponent(filePath);
    
    // On Windows, the path might start with a slash like /C:/... 
    // We need to remove that leading slash for Node to find the file
    if (process.platform === 'win32' && filePath.startsWith('/')) {
      filePath = filePath.substring(1);
    }
    
    try {
      return callback(path.normalize(filePath));
    } catch (error) {
      console.error('Protocol error:', error);
    }
  });
}

let screenshotHotkey = 'CommandOrControl+Shift+S';
let customScreenshotPath = null;

function registerScreenshotHotkey(windowRef, xplanePath) {
  globalShortcut.unregisterAll();
  console.log('Registering hotkey:', screenshotHotkey);
  try {
    const success = globalShortcut.register(screenshotHotkey, async () => {
      console.log('Hotkey triggered!');
      try {
        const meta = await screenshotService.takeScreenshot(xplanePath, customScreenshotPath);
        console.log('Screenshot meta received in main:', meta.id);
        if (windowRef && !windowRef.isDestroyed()) {
          windowRef.webContents.send('screenshot-captured', meta);
        }
      } catch (e) {
        console.error('Screenshot logic failed:', e);
      }
    });
    console.log('Registration success:', success);
  } catch (e) {
    console.error('Failed to register global shortcut:', e);
  }
}

// In CommonJS, __dirname and __filename are already defined.
process.env.DIST = path.join(__dirname, '../dist');
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '../public');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#0F172A', // Tailwind slate-900
  });

  win.maximize();

  // Auto Updater Events
  autoUpdater.on('update-available', (info) => {
    win.webContents.send('update-available', info);
  });

  autoUpdater.on('download-progress', (progressObj) => {
    win.webContents.send('update-download-progress', progressObj.percent);
  });

  autoUpdater.on('update-downloaded', () => {
    win.webContents.send('update-downloaded');
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
    // win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(process.env.DIST, 'index.html'));
  }

  // Check for updates after window is ready
  win.webContents.on('did-finish-load', () => {
    if (!process.env.VITE_DEV_SERVER_URL) {
      autoUpdater.checkForUpdatesAndNotify().catch(err => console.error('Update check failed:', err));
    }
  });
}

// IPC for manual update actions
ipcMain.handle('download-update', () => {
  return autoUpdater.downloadUpdate();
});

ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle('get-wishlist', async (event, xplanePath) => {
  try {
    const wishlistPath = path.join(xplanePath, 'ModVault', 'wishlist.json');
    if (await fs.pathExists(wishlistPath)) {
      return await fs.readJson(wishlistPath);
    }
    return { items: [], settings: { checkIntervalHours: 6 } };
  } catch (err) {
    return { items: [], settings: { checkIntervalHours: 6 } };
  }
});

ipcMain.handle('save-wishlist', async (event, { xplanePath, wishlist }) => {
  try {
    const wishlistPath = path.join(xplanePath, 'ModVault', 'wishlist.json');
    await fs.writeJson(wishlistPath, wishlist, { spaces: 2 });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

let priceMonitorInterval = null;
async function checkWishlistPrices(xplanePath) {
  try {
    const wishlistPath = path.join(xplanePath, 'ModVault', 'wishlist.json');
    if (!await fs.pathExists(wishlistPath)) return;
    
    const wishlist = await fs.readJson(wishlistPath);
    const settings = wishlist.settings || {};
    let changesFound = false;

    for (let item of wishlist.items) {
      const currentData = await fetchSingleProductPrice(item.link);
      if (currentData && currentData.price) {
        const lastPriceNum = parseFloat(item.lastPrice?.replace(/[^\d.]/g, '') || '0');
        const currentPriceNum = parseFloat(currentData.price?.replace(/[^\d.]/g, '') || '0');

        if (currentPriceNum < lastPriceNum) {
          console.log(`[Wishlist] Price drop detected for ${item.title}: ${item.lastPrice} -> ${currentData.price}`);
          
          const productForNotif = { 
            name: item.title, 
            price: currentData.price, 
            oldPrice: item.lastPrice, 
            link: item.link, 
            image: item.image 
          };

          if (settings.discordWebhook) await sendDiscordNotification(settings.discordWebhook, productForNotif);
          if (settings.telegramBotToken && settings.telegramChatId) {
            await sendTelegramNotification(settings.telegramBotToken, settings.telegramChatId, productForNotif);
          }
          if (settings.emailRecipient) await sendEmailNotification(settings, productForNotif);
          
          item.lastPrice = currentData.price;
          changesFound = true;
        }
      }
    }

    if (changesFound) {
      await fs.writeJson(wishlistPath, wishlist, { spaces: 2 });
    }
  } catch (err) {
    console.error('Wishlist check failed:', err);
  }
}

ipcMain.handle('start-wishlist-monitor', async (event, xplanePath) => {
  if (priceMonitorInterval) clearInterval(priceMonitorInterval);
  
  const wishlistPath = path.join(xplanePath, 'ModVault', 'wishlist.json');
  let intervalHours = 6;
  try {
    if (await fs.pathExists(wishlistPath)) {
      const data = await fs.readJson(wishlistPath);
      intervalHours = data.settings?.checkIntervalHours || 6;
    }
  } catch (e) {}

  console.log(`Starting Wishlist Monitor. Every ${intervalHours} hours.`);
  priceMonitorInterval = setInterval(() => checkWishlistPrices(xplanePath), intervalHours * 3600000);
  
  // Initial check
  checkWishlistPrices(xplanePath);
  return { success: true };
});

app.on('ready', () => {
  registerMediaProtocol();
  createWindow();
});

ipcMain.handle('delete-mod', async (event, { xplanePath, modId, modType }) => {
  try {
    const vaultPath = path.join(xplanePath, 'ModVault');
    const modFolderPath = path.join(vaultPath, modId);
    
    // Always try to disable first to remove symlinks
    try {
      await disableMod(modFolderPath, xplanePath, modType);
    } catch (e) {
      console.warn('Could not disable mod before deletion (might already be disabled):', e);
    }

    await fs.remove(modFolderPath);
    return { success: true };
  } catch (e) {
    console.error('Failed to delete mod:', e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('delete-custom-addon', async (event, { xplanePath, id }) => {
  try {
    const dbPath = path.join(xplanePath, 'Assistant_Custom_Catalog.json');
    if (await fs.pathExists(dbPath)) {
      let catalog = await fs.readJson(dbPath);
      catalog = catalog.filter(a => a.id !== id);
      await fs.writeJson(dbPath, catalog, { spaces: 2 });
    }
    return { success: true };
  } catch (e) {
    console.error('Failed to delete custom addon:', e);
    return { success: false, error: e.message };
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handlers for file system operations
ipcMain.handle('check-path', async (event, targetPath) => {
  try {
    const isXPlane = await fs.pathExists(path.join(targetPath, 'X-Plane.exe')) || await fs.pathExists(path.join(targetPath, 'X-Plane.app'));
    if (isXPlane) {
      // Ensure ModVault exists
      const vaultPath = path.join(targetPath, 'ModVault');
      await fs.ensureDir(vaultPath);
      return { success: true, vaultPath };
    }
    return { success: false, error: 'X-Plane executable not found in this folder.' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Directory selection
ipcMain.handle('select-directory', async (event) => {
  const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow(), {
    properties: ['openDirectory'],
    title: 'Select X-Plane 12 Directory'
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// Example handler to list mods in ModVault vs installed
ipcMain.handle('get-mods', async (event, xplanePath) => {
  const vaultPath = path.join(xplanePath, 'ModVault');
  const cachePath = path.join(app.getPath('userData'), 'mod-cache.json');
  await fs.ensureDir(vaultPath);

  let sizeCache = {};
  try {
    if (await fs.pathExists(cachePath)) {
      sizeCache = await fs.readJson(cachePath);
    }
  } catch (e) {}

  const getSmartSize = async (dirPath) => {
    try {
      const stats = await fs.lstat(dirPath);
      const mtime = stats.mtimeMs;
      if (sizeCache[dirPath] && sizeCache[dirPath].mtime === mtime) {
        return sizeCache[dirPath].size;
      }
      const sizeBytes = stats.isDirectory() ? await getDirSize(dirPath) : stats.size;
      const formattedSize = formatSize(sizeBytes);
      sizeCache[dirPath] = { mtime, size: formattedSize };
      return formattedSize;
    } catch (e) { return 'Unknown'; }
  };

  const mods = [];
  const managedIds = new Set();

  // 1. Scan ModVault
  const vaultContents = await fs.readdir(vaultPath);
  for (const modFolder of vaultContents) {
    const modPath = path.join(vaultPath, modFolder);
    const stat = await fs.stat(modPath);
    if (stat.isDirectory()) {
      let meta = { id: modFolder, type: 'plugin', enabled: false };
      try {
        meta = await fs.readJson(path.join(modPath, 'vault_meta.json'));
      } catch (e) { }

      // Check if enabled
      let targetDirs = [
        path.join(xplanePath, 'Resources', 'plugins'),
        path.join(xplanePath, 'Aircraft'),
        path.join(xplanePath, 'Custom Scenery'),
        path.join(xplanePath, 'Resources', 'plugins', 'FlyWithLua', 'Scripts')
      ];

      const payloads = [];
      const scanForPayloads = async (currentPath, type) => {
        try {
          const items = await fs.readdir(currentPath);
          let isThisPayload = false;
          if (type === 'aircraft' && items.some(f => f.toLowerCase().endsWith('.acf'))) isThisPayload = true;
          if (type === 'plugin' && (items.includes('64') || items.includes('win.xpl'))) isThisPayload = true;
          if (type === 'scenery' || type === 'library') {
            if (items.includes('Earth nav data') || items.includes('library.txt') || items.includes('objects')) isThisPayload = true;
          }
          if (type === 'script' && items.some(f => f.toLowerCase().endsWith('.lua'))) isThisPayload = true;

          if (isThisPayload) {
            payloads.push(currentPath);
            return;
          }

          for (const item of items) {
            if (item === 'vault_meta.json') continue;
            const itemPath = path.join(currentPath, item);
            if ((await fs.lstat(itemPath)).isDirectory()) await scanForPayloads(itemPath, type);
            else if (type === 'script' && item.toLowerCase().endsWith('.lua')) payloads.push(itemPath);
          }
        } catch (e) {}
      };

      await scanForPayloads(modPath, meta.type);

      // Fallback if no specific payload found
      if (payloads.length === 0) {
        const rootItems = (await fs.readdir(modPath)).filter(f => f !== 'vault_meta.json');
        for (const item of rootItems) payloads.push(path.join(modPath, item));
      }

      for (const payloadPath of payloads) {
        const itemName = path.basename(payloadPath);
        for (const targetDir of targetDirs) {
          const destPath = path.join(targetDir, itemName);
          if (await fs.pathExists(destPath)) {
            meta.enabled = true;
            break;
          }
        }
        if (meta.enabled) break;
      }

      const actualSize = await getSmartSize(modPath);

      mods.push({
        id: meta.id,
        name: meta.name || meta.id,
        type: meta.type,
        enabled: meta.enabled,
        path: modPath,
        size: actualSize,
        isManaged: true
      });
      managedIds.add(meta.id);
    }
  }

  // 2. Scan live folders for manual installs
  const scanTargets = [
    { dir: path.join(xplanePath, 'Resources', 'plugins'), type: 'plugin' },
    { dir: path.join(xplanePath, 'Aircraft'), type: 'aircraft' },
    { dir: path.join(xplanePath, 'Custom Scenery'), type: 'scenery' },
    { dir: path.join(xplanePath, 'Resources', 'plugins', 'FlyWithLua', 'Scripts'), type: 'script' }
  ];

  const blacklist = [
    'FlyWithLua', 'Commands.txt', 'DataRefs.txt', // Core FlyWithLua
    'PluginAdmin', 'Plugin Admin', 'AutoUpdate', 'X-Plane', // Default plugins
    'Laminar Research', 'Extra Aircraft', 'Default Aircraft', // Default Aircraft folders
    'Aerosoft', // Aerosoft default sceneries
    'Global Scenery', 'X-Plane Landmarks', // Default Scenery
    'README.txt', 'instructions.txt', 'scenery_packs.ini',
    'XPLM', 'XPWidgets' // Core libraries
  ];

  for (const target of scanTargets) {
    if (!await fs.pathExists(target.dir)) continue;
    const contents = await fs.readdir(target.dir);
    for (const item of contents) {
      const lowerItem = item.toLowerCase();
      if (blacklist.some(b => lowerItem.includes(b.toLowerCase()))) continue; 
      // Skip common config/aux files in manual scan
      if (lowerItem.endsWith('.prf') || lowerItem.endsWith('.ini') || lowerItem.endsWith('.cfg') || lowerItem.endsWith('.txt') || lowerItem.endsWith('.pdf') || lowerItem.endsWith('.md')) continue;

      const itemPath = path.join(target.dir, item);
      const lstat = await fs.lstat(itemPath);
      
      if (!lstat.isSymbolicLink()) {
        let modId = `manual_${item}`;
        let modName = item;
        let modType = target.type;

        let actualSize = 'Unknown';
        try {
          actualSize = await getSmartSize(itemPath);
        } catch (e) {}

        // Special handling for Zibo 737
        const isZibo = /b737-800x|zibo|737|b738/i.test(item);
        if (isZibo) {
          modId = 'zibo737'; 
          let version = '';
          try {
            const files = await fs.readdir(itemPath);
            const vFile = files.find(f => f.toLowerCase().includes('version'));
            if (vFile) {
              const content = await fs.readFile(path.join(itemPath, vFile), 'utf8');
              version = content.trim().split('\n')[0].replace(/[^0-9.]/g, ''); 
            }
          } catch (e) {}
          
          modName = `Zibo Mod 737-800 ${version ? 'v' + version : ''}`.trim();
          modId = 'zibo737'; // Double ensure ID is catalog-linked
          
          if (!mods.some(m => m.id === modId)) {
            mods.push({
              id: modId,
              name: modName,
              version: version || "4.0",
              size: actualSize,
              description: "The high-fidelity Boeing 737-800 modification for X-Plane.",
              type: 'aircraft',
              enabled: true,
              path: itemPath,
              isManaged: false
            });
          }
        } else if (!mods.some(m => m.id === modId || m.name === modName)) {
          // General manual mod detection
          mods.push({
            id: modId,
            name: modName,
            type: modType,
            enabled: true,
            path: itemPath,
            size: actualSize,
            isManaged: false
          });
        }
      }
    }
  }

  // Deduplicate: If a manual mod has the same name as a managed mod, prefer the managed one
  const uniqueMods = [];
  const managedNames = mods.filter(m => m.isManaged).map(m => ({
    name: m.name.toLowerCase(),
    id: m.id.toLowerCase()
  }));
  
  for (const mod of mods) {
    if (!mod.isManaged) {
      const lowerName = mod.name.toLowerCase();
      const baseName = lowerName.replace(/\.(lua|xpl|txt|pdf|md|prf|ini|cfg)$/i, '');
      
      // Fuzzy match: if baseName is part of a managed mod's name or ID
      const isDuplicate = managedNames.some(m => 
        m.name.includes(baseName) || 
        baseName.includes(m.id) ||
        m.id.includes(baseName)
      );

      if (isDuplicate) continue; 
    }
    uniqueMods.push(mod);
  }

  // Save cache for next time
  try {
    await fs.writeJson(cachePath, sizeCache);
  } catch (e) {}

  return uniqueMods;
});

ipcMain.handle('toggle-mod', async (event, { vaultPath, xplanePath, modId, modType, enable, isManaged }) => {
  try {
    if (!isManaged && !enable) {
      // Manual mod being disabled -> Move to vault to "take control"
      const manualName = modId.replace('manual_', '');
      let targetDir = '';
      if (modType === 'plugin') targetDir = path.join(xplanePath, 'Resources', 'plugins');
      else if (modType === 'aircraft') targetDir = path.join(xplanePath, 'Aircraft');
      else if (modType === 'scenery' || modType === 'library') targetDir = path.join(xplanePath, 'Custom Scenery');
      else if (modType === 'script') targetDir = path.join(xplanePath, 'Resources', 'plugins', 'FlyWithLua', 'Scripts');

      const sourcePath = path.join(targetDir, manualName);
      const vaultModPath = path.join(vaultPath, manualName);

      if (await fs.pathExists(sourcePath)) {
        await fs.ensureDir(vaultModPath);
        await fs.move(sourcePath, path.join(vaultModPath, manualName));
        await fs.writeJson(path.join(vaultModPath, 'vault_meta.json'), {
          id: manualName,
          name: manualName,
          type: modType,
          isManaged: true
        });
      }
      return { success: true };
    }

    const modFolderPath = path.join(vaultPath, modId);
    if (enable) {
      await enableMod(modFolderPath, xplanePath, modType);
    } else {
      await disableMod(modFolderPath, xplanePath, modType);
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-unified-feed', async () => {
  try {
    return await getUnifiedFeed();
  } catch (err) {
    console.error('Failed to get unified feed:', err);
    return [];
  }
});

ipcMain.handle('open-article', async (event, url) => {
  const articleWin = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    title: 'X-Plane Assistant - Reader Mode',
    autoHideMenuBar: true,
    backgroundColor: '#0F172A',
    webPreferences: {
      partition: 'persist:reader',
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  articleWin.maximize();
  articleWin.show();
  
  // Set Threshold Night Mode via native toggle/localStorage
  if (url.includes('thresholdx.net')) {
    // 1. Set localStorage immediately when navigation starts
    articleWin.webContents.on('did-start-navigation', () => {
      articleWin.webContents.executeJavaScript(`
        localStorage.setItem('thx-theme', 'dark');
        document.documentElement.classList.add('dark');
        document.body && document.body.classList.add('dark');
      `).catch(() => {});
    });

    // 2. Fallback: Ensure it's set after load finishes
    articleWin.webContents.on('did-finish-load', () => {
      articleWin.webContents.executeJavaScript(`
        if (localStorage.getItem('thx-theme') !== 'dark') {
          localStorage.setItem('thx-theme', 'dark');
          location.reload(); // Force reload if it wasn't set correctly
        }
        document.documentElement.classList.add('dark');
      `).catch(() => {});
    });
  }

  articleWin.loadURL(url);
});

let sessionCookies = {
  org: '',
  to: ''
};

// Shared session for all web interactions
const SHARED_PARTITION = 'persist:mod_manager';

ipcMain.handle('login-xplane-org', async (event) => {
  return new Promise((resolve) => {
    const ses = session.fromPartition(SHARED_PARTITION);
    const authWin = new BrowserWindow({
      width: 1000,
      height: 800,
      title: 'Login to X-Plane.org',
      webPreferences: { session: ses }
    });

    authWin.maximize();
    authWin.loadURL('https://forums.x-plane.org/index.php?/login/');

    authWin.on('close', async () => {
      const cookies = await ses.cookies.get({ url: 'https://forums.x-plane.org' });
      sessionCookies.org = cookies.map(c => `${c.name}=${c.value}`).join('; ');
      resolve({ success: true });
    });
  });
});

ipcMain.handle('login-xplane-to', async (event) => {
  return new Promise((resolve) => {
    const ses = session.fromPartition(SHARED_PARTITION);
    const authWin = new BrowserWindow({
      width: 1000,
      height: 800,
      title: 'Login to X-Plane.to',
      webPreferences: { session: ses }
    });

    authWin.maximize();
    authWin.loadURL('https://flightsim.to/login');

    authWin.on('close', async () => {
      const cookies = await ses.cookies.get({ url: 'https://flightsim.to' });
      sessionCookies.to = cookies.map(c => `${c.name}=${c.value}`).join('; ');
      resolve({ success: true });
    });
  });
});

ipcMain.handle('download-and-install-mod', async (event, { url, xplanePath, modId, modType, requiresAuth, source, name }) => {
  try {
    const vaultPath = path.join(xplanePath, 'ModVault');
    await fs.ensureDir(vaultPath);

    let cookieStr = '';
    if (requiresAuth) {
      if (source === 'X-Plane.to') cookieStr = sessionCookies.to;
      else cookieStr = sessionCookies.org;
    }

    // 1. Resolve URL dynamically if GitHub
    let finalUrl = url;
    if (source === 'GitHub' && url.includes('github.com')) {
      const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (match) {
        const owner = match[1];
        const repo = match[2];
        try {
          finalUrl = await new Promise((resolve, reject) => {
            https.get(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, { headers: { 'User-Agent': 'X-Plane-Mod-Manager' } }, res => {
              let body = '';
              res.on('data', d => body += d);
              res.on('end', () => {
                try {
                  const data = JSON.parse(body);
                  if (data.assets && data.assets.length > 0) {
                    resolve(data.assets[0].browser_download_url);
                  } else {
                    resolve(url); // fallback
                  }
                } catch (e) {
                  resolve(url);
                }
              });
            }).on('error', () => resolve(url));
          });
        } catch (e) {
          console.error("Failed to fetch latest GitHub release:", e);
        }
      }
    }

    // 2. Download
    const zipPath = await downloadMod(finalUrl, vaultPath, modId, cookieStr, (progress) => {
      if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send('download-progress', { modId, progress, stage: 'downloading' });
      }
    });

    // 2. Extract
    if (event.sender && !event.sender.isDestroyed()) {
      event.sender.send('download-progress', { modId, progress: 0, stage: 'extracting' });
    }
    const modFolderPath = await extractMod(zipPath, vaultPath, modId);

    // Write meta
    if (event.sender && !event.sender.isDestroyed()) {
      event.sender.send('download-progress', { modId, progress: 50, stage: 'enabling' });
    }
    await fs.writeJson(path.join(modFolderPath, 'vault_meta.json'), { 
      id: modId, 
      type: modType,
      name: name || modId 
    });

    // 3. Enable (Symlink)
    await enableMod(modFolderPath, xplanePath, modType);

    if (event.sender && !event.sender.isDestroyed()) {
      event.sender.send('download-progress', { modId, progress: 100, stage: 'finished' });
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('download-interactive', async (event, { url, xplanePath, modId, modType, name }) => {
  return new Promise((resolve) => {
    let isFinished = false;
    try {
      const vaultPath = path.join(xplanePath, 'ModVault');
      fs.ensureDirSync(vaultPath);

      const ses = session.fromPartition(SHARED_PARTITION);
      const dWin = new BrowserWindow({
        width: 1000,
        height: 800,
        title: 'X-Plane Assistant - Manual Download',
        autoHideMenuBar: true,
        webPreferences: { session: ses }
      });

      dWin.maximize();
      dWin.loadURL(url);

      const handleDownload = async (e, item, webContents) => {
        const originalName = item.getFilename();
        const ext = path.extname(originalName) || '.zip';
        const tempPath = path.join(vaultPath, `${modId}_temp${ext}`);
        item.setSavePath(tempPath);
        
        dWin.setTitle('Download started... Please wait.');
        
        item.on('updated', (event, state) => {
          if (state === 'progressing' && !dWin.isDestroyed()) {
            const progress = Math.floor((item.getReceivedBytes() / item.getTotalBytes()) * 100);
            dWin.setTitle(`Downloading: ${progress}% - Please do not close`);
            // Also notify main window
            if (win && !win.isDestroyed()) {
              win.webContents.send('download-progress', { modId, progress, stage: 'downloading' });
            }
          }
        });

        item.once('done', async (e, state) => {
          if (dWin.isDestroyed()) return;
          dWin.hide(); 

          if (state === 'completed') {
            try {
              if (win && !win.isDestroyed()) {
                win.webContents.send('download-progress', { modId, progress: 0, stage: 'extracting' });
              }
              const modFolderPath = await extractMod(tempPath, vaultPath, modId, originalName);
              
              if (win && !win.isDestroyed()) {
                win.webContents.send('download-progress', { modId, progress: 50, stage: 'enabling' });
              }
              await fs.writeJson(path.join(modFolderPath, 'vault_meta.json'), { 
                id: modId, 
                type: modType,
                name: name || modId 
              });
              await enableMod(modFolderPath, xplanePath, modType);
              
              if (win && !win.isDestroyed()) {
                win.webContents.send('download-progress', { modId, progress: 100, stage: 'finished' });
              }
              isFinished = true;
              dWin.close();
              resolve({ success: true });
            } catch (err) {
              isFinished = true;
              dWin.close();
              resolve({ success: false, error: err.message });
            }
          } else {
            isFinished = true;
            dWin.close();
            resolve({ success: false, error: `Download failed: ${state}` });
          }
        });
      };

      ses.on('will-download', handleDownload);

      dWin.on('close', () => {
        ses.removeListener('will-download', handleDownload);
        if (!isFinished) {
          resolve({ success: false, error: 'User closed the window before downloading.' });
        }
      });

      dWin.webContents.setWindowOpenHandler(({ url }) => {
        dWin.loadURL(url);
        return { action: 'deny' };
      });
    } catch (error) {
      resolve({ success: false, error: error.message });
    }
  });
});

ipcMain.handle('open-folder', async (event, folderPath) => {
  try {
    const normalizedPath = path.normalize(folderPath);
    fs.ensureDirSync(normalizedPath); // Make sure it exists first
    const errorMessage = await shell.openPath(normalizedPath);
    if (errorMessage) {
      // Fallback for Windows
      if (process.platform === 'win32') {
        exec(`start "" "${normalizedPath}"`);
        return { success: true };
      }
      return { success: false, error: errorMessage };
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('launch-game', async (event, xplanePath) => {
  try {
    const exePath = path.join(xplanePath, 'X-Plane.exe');
    if (!fs.existsSync(exePath)) {
      return { success: false, error: 'X-Plane.exe not found in the selected directory.' };
    }
    
    // Launch the game asynchronously and don't wait for it to close
    spawn(exePath, [], {
      cwd: xplanePath,
      detached: true,
      stdio: 'ignore'
    }).unref();
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-custom-catalog', async (event, xplanePath) => {
  try {
    const catalogPath = path.join(xplanePath, 'ModVault', 'custom_catalog.json');
    if (fs.existsSync(catalogPath)) {
      return await fs.readJson(catalogPath);
    }
    return [];
  } catch (error) {
    console.error('Failed to read custom catalog:', error);
    return [];
  }
});

ipcMain.handle('save-custom-catalog', async (event, { xplanePath, customCatalog }) => {
  try {
    const vaultPath = path.join(xplanePath, 'ModVault');
    fs.ensureDirSync(vaultPath);
    const catalogPath = path.join(vaultPath, 'custom_catalog.json');
    await fs.writeJson(catalogPath, customCatalog, { spaces: 2 });
    return { success: true };
  } catch (error) {
    console.error('Failed to save custom catalog:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('update-screenshot-settings', (event, { hotkey, xplanePath, customPath }) => {
  screenshotHotkey = hotkey;
  customScreenshotPath = customPath;
  registerScreenshotHotkey(win, xplanePath);
  setupWatcher(win, xplanePath);
  return { success: true };
});

ipcMain.handle('get-screenshots', async (event, { xplanePath }) => {
  try {
    const sPath = customScreenshotPath || path.join(xplanePath, 'Assistant_Screenshots');
    if (!await fs.pathExists(sPath)) return [];

    const dbPath = path.join(sPath, 'screenshots.json');
    let db = [];
    if (await fs.pathExists(dbPath)) {
      db = await fs.readJson(dbPath);
    }

    // Scan folder for files and parse those not in DB
    const files = await fs.readdir(sPath);
    const jpgFiles = files.filter(f => f.toLowerCase().endsWith('.jpg'));

    const parsedScreenshots = jpgFiles.map(file => {
      // Check if already in DB
      const existing = db.find(d => d.fileName === file);
      if (existing) return existing;

      // Try to parse filename: 45.1234__-122.5678__X-Plane__35000ft.jpg
      try {
        const parts = file.replace('.jpg', '').split('__');
        if (parts.length >= 4) {
          return {
            id: file,
            fileName: file,
            lat: parseFloat(parts[0]),
            lng: parseFloat(parts[1]),
            aircraft: parts[2].replace(/_/g, ' '),
            alt: parseInt(parts[3].replace('ft', '')),
            timestamp: fs.statSync(path.join(sPath, file)).mtime.toISOString(),
            isParsed: true
          };
        }
      } catch (e) {
        console.error('Failed to parse filename:', file);
      }
      return null;
    }).filter(s => s !== null);

    return parsedScreenshots;
  } catch (e) {
    console.error('get-screenshots error:', e);
    return [];
  }
});

ipcMain.handle('start-screenshot-service', async (event, { xplanePath }) => {
  screenshotService.startListening();
  registerScreenshotHotkey(win, xplanePath);
  setupWatcher(win, xplanePath);
  return { success: true };
});

ipcMain.handle('fetch-mod-metadata', async (event, { url }) => {
  const ses = session.fromPartition(SHARED_PARTITION);
  const dWin = new BrowserWindow({
    width: 800,
    height: 600,
    show: false, // Keep it hidden
    webPreferences: { session: ses }
  });

  try {
    await dWin.loadURL(url);
    
    // Give it a moment to load dynamic content
    await new Promise(res => setTimeout(res, 3000));

    const metadata = await dWin.webContents.executeJavaScript(`
      (function() {
        let data = { author: 'Unknown', downloads: '0', rating: 0, image: null };
        
        if (window.location.host.includes('x-plane.org')) {
          const authorEl = document.querySelector('.cAuthorPane_author a') || document.querySelector('.ipsType_break a');
          const dlEl = document.querySelectorAll('.ipsDataItem_stats_number');
          const imgEl = document.querySelector('.ipsDataItem_main img');
          const stars = document.querySelectorAll('.ipsRating_active').length;

          if (authorEl) data.author = authorEl.innerText.trim();
          if (dlEl && dlEl.length > 0) data.downloads = dlEl[0].innerText.trim();
          if (imgEl) data.image = imgEl.src;
          data.rating = stars || 0;
        } else if (window.location.host.includes('x-plane.to')) {
          const authorEl = document.querySelector('[itemprop="author"] span') || document.querySelector('.author-name');
          const dlEl = document.querySelector('.download-count') || Array.from(document.querySelectorAll('span')).find(s => s.innerText.includes('Downloads'));
          const imgEl = document.querySelector('.main-image img') || document.querySelector('.card-img-top');
          
          if (authorEl) data.author = authorEl.innerText.trim();
          if (dlEl) data.downloads = dlEl.innerText.replace('Downloads', '').trim();
          if (imgEl) data.image = imgEl.src;
          data.rating = 4.5; // Default for .to as it's hard to parse
        }
        
        return data;
      })()
    `);

    dWin.close();
    return metadata;
  } catch (e) {
    if (!dWin.isDestroyed()) dWin.close();
    console.error('Metadata fetch failed:', e);
    return null;
  }
});
