// Electron main process for Graphite Scientific.
const { app, BrowserWindow, ipcMain, clipboard, Menu, screen, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

app.setName('Graphite Scientific');
if (process.platform === 'win32') app.setAppUserModelId('com.graphite.scientific');

// Software rendering: the UI is light, and this avoids graphics-driver problems that can leave an
// Electron window stuck invisible on some PCs. Set GRAPHITE_GPU=1 to use the GPU.
if (process.env.GRAPHITE_GPU !== '1') app.disableHardwareAcceleration();

// Startup log (%APPDATA%\Graphite Scientific\startup.log) to diagnose launch problems.
function log(...parts) {
  try {
    const dir = app.getPath('userData');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'startup.log');
    try { if (fs.statSync(file).size > 200_000) fs.unlinkSync(file); } catch { /* none yet */ }
    fs.appendFileSync(file, `${new Date().toISOString()} ${parts.map((p) => (p instanceof Error ? p.stack : String(p))).join(' ')}\n`);
  } catch { /* logging must never break startup */ }
}
process.on('uncaughtException', (e) => {
  log('uncaughtException', e);
  try { require('electron').dialog.showErrorBox('Graphite Scientific', `The calculator hit an error while starting:\n\n${e.message}`); } catch { /* ignore */ }
});
log('starting', app.getVersion(), process.platform, process.arch, process.execPath);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { log('another instance is already running; asking it to show its window'); app.quit(); }

let win = null;
const userDir = () => app.getPath('userData');
const stateFile = () => path.join(userDir(), 'state.json');
const boundsFile = () => path.join(userDir(), 'window.json');

function readJSON(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }
function writeAtomic(file, text) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, file);
  } catch (e) { console.error('save failed', e); }
}

function initialBounds() {
  const wa = screen.getPrimaryDisplay().workArea;
  const saved = readJSON(boundsFile());
  const def = { width: Math.min(1040, wa.width - 40), height: Math.min(940, wa.height - 40) };
  if (saved && saved.width && saved.height) {
    // make sure the window is visible on one of the displays
    const visible = screen.getAllDisplays().some((d) => {
      const a = d.workArea;
      return saved.x + 80 > a.x && saved.x < a.x + a.width - 80 && saved.y + 40 > a.y && saved.y < a.y + a.height - 40;
    });
    if (visible) return { ...saved, width: Math.max(400, saved.width), height: Math.max(620, saved.height) };
  }
  return def;
}

function createWindow() {
  const b = initialBounds();
  win = new BrowserWindow({
    ...b,
    minWidth: 400,
    minHeight: 620,
    frame: false,
    show: false,
    backgroundColor: '#0d0e10',
    title: 'Graphite Scientific',
    icon: path.join(__dirname, '..', '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged || process.env.GRAPHITE_DEVTOOLS === '1',
      spellcheck: false,
    },
  });
  if (b.maximized) win.maximize();
  const reveal = (why) => {
    if (!win || win.isDestroyed() || win.isVisible()) return;
    log('showing window:', why);
    win.show(); win.focus();
  };
  win.once('ready-to-show', () => reveal('ready-to-show'));
  win.webContents.once('did-finish-load', () => reveal('did-finish-load'));
  setTimeout(() => reveal('timeout fallback'), 4000); // never leave the app running invisibly
  win.webContents.on('did-fail-load', (_e, code, desc) => { log('did-fail-load', code, desc); reveal('load failed'); });
  win.webContents.on('render-process-gone', (_e, d) => {
    log('render-process-gone', JSON.stringify(d));
    if (d.reason !== 'clean-exit' && win && !win.isDestroyed()) win.reload();
  });
  win.on('unresponsive', () => log('window unresponsive'));
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html')).catch((e) => log('loadFile failed', e));

  const saveBounds = () => {
    if (!win || win.isDestroyed()) return;
    const nb = win.getNormalBounds();
    writeAtomic(boundsFile(), JSON.stringify({ ...nb, maximized: win.isMaximized() }));
  };
  win.on('close', saveBounds);
  // security: no navigation, no new windows
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.on('closed', () => { win = null; });
}

ipcMain.on('state:load', (e) => { try { e.returnValue = fs.readFileSync(stateFile(), 'utf8'); } catch { e.returnValue = null; } });
ipcMain.on('state:save', (_e, text) => { if (typeof text === 'string' && text.length < 20_000_000) writeAtomic(stateFile(), text); });
ipcMain.on('clip:copy', (_e, text) => clipboard.writeText(String(text)));
ipcMain.on('clip:paste', (e) => { e.returnValue = clipboard.readText(); });
ipcMain.on('app:version', (e) => { e.returnValue = app.getVersion(); });
ipcMain.on('win:min', () => win?.minimize());
ipcMain.on('win:max', () => { if (!win) return; if (win.isMaximized()) win.unmaximize(); else win.maximize(); });
ipcMain.on('win:close', () => win?.close());
ipcMain.on('win:ontop', (_e, on) => win?.setAlwaysOnTop(!!on));

app.on('second-instance', () => {
  log('second-instance: bringing the window forward');
  if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } else if (app.isReady()) createWindow();
});
app.on('child-process-gone', (_e, d) => log('child-process-gone', JSON.stringify(d)));
app.whenReady().then(() => {
  if (!gotLock) return;
  log('app ready');
  Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
