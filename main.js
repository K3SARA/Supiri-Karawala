const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

let mainWindow;

// Use a stable writable profile path for both dev and packaged app.
const baseUserData = app.isPackaged
  ? path.join(app.getPath('appData'), 'Supiri Karawala')
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
    title: 'Supiri Karawala',
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
  const labelPrinter = printers.find((printer) => {
    const text = `${printer.name || ''} ${printer.description || ''}`;
    return /label|barcode|sticker|thermal|zebra|zdesigner|dymo|brother|xprinter|pos/i.test(text);
  });
  const defaultPrinter = printers.find((printer) => printer.isDefault);
  const deviceName = options.deviceName || labelPrinter?.name || defaultPrinter?.name;
  console.log('[labels:print] printers found:', printers.map(p => `${p.name}${p.isDefault ? ' [DEFAULT]' : ''}`));
  console.log('[labels:print] selected:', deviceName || '(none)');

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
    // Give Chromium one tick to finish layout after load before printing
    await new Promise(r => setTimeout(r, 100));
    const labelWMm = parseFloat(options.labelW) || 50;
    const labelHMm = parseFloat(options.labelH) || 30;
    const labelCols = Math.max(1, parseInt(options.labelColumns) || 1);
    await new Promise((resolve, reject) => {
      labelWindow.webContents.print(
        {
          silent: true,
          printBackground: true,
          deviceName: deviceName || undefined,
          margins: { marginType: 'none' },
          // pageSize in microns tells the Windows spooler/driver the exact paper dimensions.
          // Without this the spooler defaults to A4/Letter, which causes Zebra drivers to
          // hold or discard the job silently because the paper size doesn't match the label stock.
          pageSize: { width: Math.round(labelWMm * labelCols * 1000), height: Math.round(labelHMm * 1000) }
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

function runPowerShell(script) {
  return new Promise((resolve, reject) => {
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error((stderr || stdout || error.message).trim()));
          return;
        }
        resolve(stdout);
      }
    );
  });
}

async function getDrawerPrinterName(options = {}) {
  if (options.deviceName) return options.deviceName;
  const printers = mainWindow ? await mainWindow.webContents.getPrintersAsync() : [];
  const defaultPrinter = printers.find((printer) => printer.isDefault);
  return defaultPrinter?.name || printers[0]?.name || '';
}

async function openCashDrawer(options = {}) {
  if (process.platform !== 'win32') {
    throw new Error('Cash drawer pulse is only available in the Windows desktop app');
  }

  const printerName = await getDrawerPrinterName(options);
  if (!printerName) {
    throw new Error('No receipt printer is available for the cash drawer');
  }

  const printerLiteral = JSON.stringify(printerName);
  const script = `
$printerName = ${printerLiteral}
$bytes = [byte[]](0x1B, 0x70, 0x00, 0x19, 0xFA, 0x1B, 0x70, 0x01, 0x19, 0xFA)
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class RawPrinterHelper {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }
  [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
  [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, Int32 dwCount, out Int32 dwWritten);
}
"@
$printerHandle = [IntPtr]::Zero
if (-not [RawPrinterHelper]::OpenPrinter($printerName, [ref]$printerHandle, [IntPtr]::Zero)) { throw "Could not open printer: $printerName" }
try {
  $docInfo = New-Object RawPrinterHelper+DOCINFOA
  $docInfo.pDocName = "Open Cash Drawer"
  $docInfo.pDataType = "RAW"
  if (-not [RawPrinterHelper]::StartDocPrinter($printerHandle, 1, $docInfo)) { throw "Could not start raw print job" }
  try {
    if (-not [RawPrinterHelper]::StartPagePrinter($printerHandle)) { throw "Could not start raw print page" }
    try {
      $written = 0
      if (-not [RawPrinterHelper]::WritePrinter($printerHandle, $bytes, $bytes.Length, [ref]$written)) { throw "Could not write drawer pulse" }
      if ($written -ne $bytes.Length) { throw "Incomplete drawer pulse write" }
    } finally {
      [RawPrinterHelper]::EndPagePrinter($printerHandle) | Out-Null
    }
  } finally {
    [RawPrinterHelper]::EndDocPrinter($printerHandle) | Out-Null
  }
} finally {
  [RawPrinterHelper]::ClosePrinter($printerHandle) | Out-Null
}
`;

  await runPowerShell(script);
  return { ok: true, printer: printerName };
}

ipcMain.handle('cash-drawer:open', async (_event, options = {}) => {
  return await openCashDrawer(options);
});
