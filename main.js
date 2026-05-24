const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

let mainWindow;

// Use a stable writable profile path for both dev and packaged app.
const baseUserData = app.isPackaged
  ? path.join(app.getPath('appData'), 'Print Care Plus')
  : path.join(__dirname, '.electron-userdata');
const localCache = path.join(baseUserData, 'Cache');
try {
  fs.mkdirSync(localCache, { recursive: true });
} catch (e) {}

app.setPath('userData', baseUserData);
app.commandLine.appendSwitch('user-data-dir', baseUserData);
app.commandLine.appendSwitch('disk-cache-dir', localCache);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    title: 'Print Care Plus',
    icon: path.join(__dirname, 'assets', 'logo.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false,
    backgroundColor: '#F4F7FE'
  });

  mainWindow.loadFile('index.html');

  // Show when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.maximize();
  });

  // Remove default menu bar
  Menu.setApplicationMenu(null);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

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

ipcMain.handle('printers:list', async () => {
  if (!mainWindow) return [];
  return await mainWindow.webContents.getPrintersAsync();
});

ipcMain.handle('labels:print', async (_event, html, options = {}) => {
  const printers = mainWindow ? await mainWindow.webContents.getPrintersAsync() : [];
  const labelPrinter = printers.find((printer) =>
    /label|barcode|sticker|thermal|zebra|dymo|brother|xprinter|pos/i.test(printer.name || '')
  );
  const defaultPrinter = printers.find((printer) => printer.isDefault);
  const deviceName = options.deviceName || labelPrinter?.name || defaultPrinter?.name;

  const labelWindow = new BrowserWindow({
    show: false,
    width: 360,
    height: 240,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  try {
    await labelWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await new Promise((resolve, reject) => {
      labelWindow.webContents.print(
        {
          silent: true,
          printBackground: true,
          deviceName: deviceName || undefined,
          margins: { marginType: 'none' }
        },
        (success, failureReason) => {
          if (success) resolve();
          else reject(new Error(failureReason || 'Print failed'));
        }
      );
    });
    return { ok: true, printer: deviceName || null };
  } finally {
    labelWindow.close();
  }
});
