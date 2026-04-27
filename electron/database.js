const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const { app } = require('electron');

let db;
let dbPath;
let dataDir;

function getBaseDir() {
  if (app.isPackaged) return path.dirname(process.execPath);
  return path.join(__dirname, '..');
}

function getWasmPath() {
  const packaged = path.join(process.resourcesPath || '', 'sql-wasm.wasm');
  if (fs.existsSync(packaged)) return packaged;
  return path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
}

async function initDatabase() {
  dataDir = path.join(getBaseDir(), 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  dbPath = path.join(dataDir, 'billing.sqlite');
  const SQL = await initSqlJs({ locateFile: () => getWasmPath() });
  db = fs.existsSync(dbPath) ? new SQL.Database(fs.readFileSync(dbPath)) : new SQL.Database();
  runMigrations();
  saveDatabase();
}

function saveDatabase() {
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
}

function runMigrations() {
  db.run(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      financial_year TEXT NOT NULL,
      serial_no INTEGER NOT NULL,
      bill_no TEXT NOT NULL UNIQUE,
      date TEXT NOT NULL,
      party_name TEXT NOT NULL DEFAULT '',
      marka TEXT NOT NULL DEFAULT '',
      buyer_name TEXT NOT NULL DEFAULT '',
      lr_number TEXT NOT NULL DEFAULT '',
      transport_name TEXT NOT NULL DEFAULT '',
      grand_total REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      item_name TEXT NOT NULL DEFAULT '',
      rate REAL NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS invoice_item_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_item_id INTEGER NOT NULL,
      entry_type TEXT NOT NULL CHECK(entry_type IN ('weight', 'pieces')),
      quantity REAL NOT NULL DEFAULT 0,
      amount REAL NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(invoice_item_id) REFERENCES invoice_items(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(date);
    CREATE INDEX IF NOT EXISTS idx_invoices_bill_no ON invoices(bill_no);
    CREATE INDEX IF NOT EXISTS idx_invoices_financial_year ON invoices(financial_year);
  `);
}

function select(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function one(sql, params = []) {
  return select(sql, params)[0] || null;
}

function nowIso() { return new Date().toISOString(); }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

function getFinancialYear(dateString) {
  const date = dateString ? new Date(`${dateString}T00:00:00`) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error('Invalid bill date.');
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

function formatBillNo(fy, serial) {
  return `${fy}/${String(serial).padStart(3, '0')}`;
}

function getNextBillInfo(dateString) {
  const fy = getFinancialYear(dateString);
  const row = one('SELECT MAX(serial_no) AS max_serial FROM invoices WHERE financial_year = ?', [fy]);
  const serial = Number(row?.max_serial || 0) + 1;
  return { financial_year: fy, serial_no: serial, bill_no: formatBillNo(fy, serial) };
}

function total(items = []) {
  return items.reduce((sum, item) => {
    const rate = num(item.rate);
    return sum + (item.entries || []).reduce((s, e) => s + num(e.quantity) * rate, 0);
  }, 0);
}

function normalize(payload) {
  if (!payload) throw new Error('Invoice data missing.');
  const items = (payload.items || []).map((item, itemIndex) => {
    const rate = num(item.rate);
    const entries = (item.entries || [])
      .filter((e) => num(e.quantity) > 0)
      .map((e, entryIndex) => ({
        entry_type: e.entry_type === 'pieces' ? 'pieces' : 'weight',
        quantity: num(e.quantity),
        amount: num(e.quantity) * rate,
        sort_order: entryIndex
      }));
    return {
      item_name: String(item.item_name || '').trim(),
      rate,
      sort_order: itemIndex,
      entries
    };
  }).filter((item) => item.item_name || item.entries.length);

  return {
    date: payload.date || new Date().toISOString().slice(0, 10),
    party_name: String(payload.party_name || '').trim(),
    marka: String(payload.marka || '').trim(),
    buyer_name: String(payload.buyer_name || '').trim(),
    lr_number: String(payload.lr_number || '').trim(),
    transport_name: String(payload.transport_name || '').trim(),
    items,
    grand_total: total(items)
  };
}

function insertItems(invoiceId, items) {
  for (const item of items) {
    db.run('INSERT INTO invoice_items (invoice_id, item_name, rate, sort_order) VALUES (?, ?, ?, ?)', [invoiceId, item.item_name, item.rate, item.sort_order]);
    const itemId = Number(one('SELECT last_insert_rowid() AS id').id);
    for (const entry of item.entries) {
      db.run('INSERT INTO invoice_item_entries (invoice_item_id, entry_type, quantity, amount, sort_order) VALUES (?, ?, ?, ?, ?)', [itemId, entry.entry_type, entry.quantity, entry.amount, entry.sort_order]);
    }
  }
}

function createInvoice(payload) {
  const input = normalize(payload);
  const bill = getNextBillInfo(input.date);
  const ts = nowIso();
  db.run('BEGIN TRANSACTION');
  try {
    db.run(`INSERT INTO invoices (financial_year, serial_no, bill_no, date, party_name, marka, buyer_name, lr_number, transport_name, grand_total, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [bill.financial_year, bill.serial_no, bill.bill_no, input.date, input.party_name, input.marka, input.buyer_name, input.lr_number, input.transport_name, input.grand_total, ts, ts]);
    const id = Number(one('SELECT last_insert_rowid() AS id').id);
    insertItems(id, input.items);
    db.run('COMMIT');
    saveDatabase();
    return getInvoice(id);
  } catch (e) { db.run('ROLLBACK'); throw e; }
}

function updateInvoice(id, payload) {
  const invoiceId = Number(id);
  if (!one('SELECT id FROM invoices WHERE id = ?', [invoiceId])) throw new Error('Invoice not found.');
  const input = normalize(payload);
  db.run('BEGIN TRANSACTION');
  try {
    db.run(`UPDATE invoices SET date=?, party_name=?, marka=?, buyer_name=?, lr_number=?, transport_name=?, grand_total=?, updated_at=? WHERE id=?`,
      [input.date, input.party_name, input.marka, input.buyer_name, input.lr_number, input.transport_name, input.grand_total, nowIso(), invoiceId]);
    db.run('DELETE FROM invoice_items WHERE invoice_id = ?', [invoiceId]);
    insertItems(invoiceId, input.items);
    db.run('COMMIT');
    saveDatabase();
    return getInvoice(invoiceId);
  } catch (e) { db.run('ROLLBACK'); throw e; }
}

function getInvoice(id) {
  const invoice = one('SELECT * FROM invoices WHERE id = ?', [Number(id)]);
  if (!invoice) return null;
  const items = select('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order, id', [invoice.id]).map((item) => ({
    ...item,
    entries: select('SELECT * FROM invoice_item_entries WHERE invoice_item_id = ? ORDER BY sort_order, id', [item.id])
  }));
  return { ...invoice, items };
}

function listInvoices(filters = {}) {
  const params = [];
  const where = [];
  const q = String(filters?.query || '').trim();
  if (q) {
    where.push('(bill_no LIKE ? OR party_name LIKE ? OR marka LIKE ? OR buyer_name LIKE ? OR lr_number LIKE ? OR transport_name LIKE ?)');
    params.push(...Array(6).fill(`%${q}%`));
  }
  if (filters?.dateFrom) { where.push('date >= ?'); params.push(filters.dateFrom); }
  if (filters?.dateTo) { where.push('date <= ?'); params.push(filters.dateTo); }
  return select(`SELECT * FROM invoices ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY date DESC, id DESC LIMIT 500`, params);
}

function deleteInvoice(id) {
  db.run('DELETE FROM invoices WHERE id = ?', [Number(id)]);
  saveDatabase();
  return { success: true };
}

function getAppInfo() { return { dbPath, dataDir, isPackaged: app.isPackaged }; }

module.exports = { initDatabase, listInvoices, getInvoice, createInvoice, updateInvoice, deleteInvoice, getNextBillInfo, getAppInfo };
