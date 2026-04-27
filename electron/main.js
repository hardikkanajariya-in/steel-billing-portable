const path = require('path');
const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const db = require('./database');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 700,
    title: 'Steel Utensils Dispatch Book',
    backgroundColor: '#f8fafc',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.removeMenu();
  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

function registerIpc() {
  ipcMain.handle('invoices:list', (_e, filters) => db.listInvoices(filters));
  ipcMain.handle('invoices:get', (_e, id) => db.getInvoice(id));
  ipcMain.handle('invoices:create', (_e, payload) => db.createInvoice(payload));
  ipcMain.handle('invoices:update', (_e, args) => db.updateInvoice(args.id, args.payload));
  ipcMain.handle('invoices:delete', (_e, id) => db.deleteInvoice(id));
  ipcMain.handle('invoices:next-bill-no', (_e, date) => db.getNextBillInfo(date));
  ipcMain.handle('app:info', () => db.getAppInfo());
}

app.whenReady().then(async () => {
  await db.initDatabase();
  registerIpc();
  Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
