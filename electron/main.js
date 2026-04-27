const path = require('path');
const fs = require('fs/promises');
const { app, BrowserWindow, dialog, ipcMain, Menu } = require('electron');
const db = require('./database');
const { buildInvoicePdfHtml } = require('./print-template');

let appBootState = 'loading';
let ipcRegistered = false;
const APP_NAME = 'Steel Utensils Dispatch Book';

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
  void win.loadFile(path.join(__dirname, 'loading.html'));
  return win;
}

function loadApp(win) {
  if (win.isDestroyed()) return Promise.resolve();
  if (process.env.VITE_DEV_SERVER_URL) return win.loadURL(process.env.VITE_DEV_SERVER_URL);
  return win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

function loadStartupError(win, error) {
  if (win.isDestroyed()) return Promise.resolve();

  const message = String(error?.message || 'Unexpected startup error.')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const html = `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Startup Error</title>
        <style>
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            font-family: "Segoe UI", Arial, sans-serif;
            background: linear-gradient(180deg, #fff7ed 0%, #ffedd5 100%);
            color: #7c2d12;
          }
          .panel {
            width: min(520px, calc(100vw - 32px));
            padding: 28px;
            border-radius: 20px;
            background: rgba(255, 255, 255, 0.96);
            border: 1px solid rgba(194, 65, 12, 0.16);
            box-shadow: 0 20px 50px rgba(124, 45, 18, 0.16);
          }
          h1 {
            margin: 0 0 10px;
            font-size: 28px;
          }
          p {
            margin: 0 0 12px;
            line-height: 1.6;
          }
          code {
            display: block;
            margin-top: 12px;
            padding: 12px 14px;
            border-radius: 12px;
            background: #fff7ed;
            color: #9a3412;
            white-space: pre-wrap;
            word-break: break-word;
          }
        </style>
      </head>
      <body>
        <main class="panel">
          <h1>Application could not start</h1>
          <p>The local billing database could not be prepared.</p>
          <p>Close the app and try again. If the problem continues, share this message.</p>
          <code>${message}</code>
        </main>
      </body>
    </html>`;

  return win.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`);
}

function registerIpc() {
  if (ipcRegistered) return;
  ipcMain.handle('invoices:list', (_e, filters) => db.listInvoices(filters));
  ipcMain.handle('invoices:get', (_e, id) => db.getInvoice(id));
  ipcMain.handle('invoices:create', (_e, payload) => db.createInvoice(payload));
  ipcMain.handle('invoices:update', (_e, args) => db.updateInvoice(args.id, args.payload));
  ipcMain.handle('invoices:delete', (_e, id) => db.deleteInvoice(id));
  ipcMain.handle('invoices:next-bill-no', (_e, date) => db.getNextBillInfo(date));
  ipcMain.handle('invoices:generate-pdf', (_e, invoice) => generateInvoicePdf(invoice));
  ipcMain.handle('invoices:export-pdf', (_e, invoice) => exportInvoicePdf(invoice));
  ipcMain.handle('invoices:print', (_e, invoice) => printInvoice(invoice));
  ipcMain.handle('app:info', () => db.getAppInfo());
  ipcRegistered = true;
}

function sanitizeFileName(value) {
  return String(value || 'dispatch-slip')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

async function generateInvoicePdf(invoice) {
  const pdfWindow = createPrintWindow();

  try {
    await loadInvoiceIntoPrintWindow(pdfWindow, invoice);
    const pdfBuffer = await pdfWindow.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 }
    });

    return {
      base64: pdfBuffer.toString('base64'),
      fileName: `${sanitizeFileName(invoice?.bill_no)}.pdf`
    };
  } finally {
    if (!pdfWindow.isDestroyed()) pdfWindow.destroy();
  }
}

function createPrintWindow() {
  return new BrowserWindow({
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff'
  });
}

async function loadInvoiceIntoPrintWindow(win, invoice) {
  const html = buildInvoicePdfHtml(invoice, APP_NAME);
  await win.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`);
  await win.webContents.executeJavaScript(
    'document.fonts ? document.fonts.ready.then(() => true) : true',
    true
  ).catch(() => true);
}

async function exportInvoicePdf(invoice) {
  const { base64, fileName } = await generateInvoicePdf(invoice);
  const defaultPath = path.join(app.getPath('documents'), fileName);
  const result = await dialog.showSaveDialog({
    title: 'Export Dispatch PDF',
    defaultPath,
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  await fs.writeFile(result.filePath, Buffer.from(base64, 'base64'));
  return { canceled: false, filePath: result.filePath };
}

async function printInvoice(invoice) {
  const printWindow = createPrintWindow();

  try {
    await loadInvoiceIntoPrintWindow(printWindow, invoice);
    return await new Promise((resolve, reject) => {
      printWindow.webContents.print(
        {
          silent: false,
          printBackground: true
        },
        (success, failureReason) => {
          if (!success && failureReason === 'Print job canceled') {
            resolve({ success: false, canceled: true });
            return;
          }
          if (!success && failureReason) {
            reject(new Error(failureReason));
            return;
          }
          resolve({ success, canceled: false });
        }
      );
    });
  } finally {
    if (!printWindow.isDestroyed()) printWindow.destroy();
  }
}

async function bootstrapApplication(win) {
  try {
    await db.initDatabase();
    registerIpc();
    appBootState = 'ready';
    await loadApp(win);
  } catch (error) {
    appBootState = 'error';
    console.error('Failed to initialize application database.', error);
    await loadStartupError(win, error);
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  const win = createWindow();
  void bootstrapApplication(win);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length !== 0) return;
    const nextWindow = createWindow();
    if (appBootState === 'ready') {
      void loadApp(nextWindow);
      return;
    }
    if (appBootState === 'error') {
      void loadStartupError(nextWindow, new Error('Database initialization failed on the previous startup attempt.'));
    }
  });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
