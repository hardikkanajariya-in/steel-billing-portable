const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

let db;
let dbPath;
let dataDir;
let dataLocation;

function getElectronApp() {
  try {
    const electron = require('electron');
    if (!electron || typeof electron === 'string') return null;
    return electron.app || null;
  } catch {
    return null;
  }
}

function getBaseDir() {
  const electronApp = getElectronApp();
  if (!electronApp?.isPackaged) {
    return {
      baseDir: path.join(__dirname, '..'),
      source: 'project-root'
    };
  }

  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  if (portableDir) {
    return {
      baseDir: portableDir,
      source: 'portable-executable-dir'
    };
  }

  const portableFile = process.env.PORTABLE_EXECUTABLE_FILE;
  if (portableFile) {
    return {
      baseDir: path.dirname(portableFile),
      source: 'portable-executable-file'
    };
  }

  const exePath = typeof electronApp.getPath === 'function' ? electronApp.getPath('exe') : process.execPath;
  return {
    baseDir: path.dirname(exePath),
    source: 'exe-path'
  };
}

function getWasmPath() {
  const packaged = path.join(process.resourcesPath || '', 'sql-wasm.wasm');
  if (fs.existsSync(packaged)) return packaged;
  return path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
}

async function initDatabase() {
  dataLocation = getBaseDir();
  dataDir = path.join(dataLocation.baseDir, 'data');
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
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
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
function normalizeEntryType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'pieces' || normalized === 'piece' || normalized === 'pcs' ? 'pieces' : 'weight';
}

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

function getMeta(key) {
  return one('SELECT value FROM app_meta WHERE key = ?', [key])?.value || null;
}

function setMeta(key, value) {
  db.run(
    'INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, String(value)]
  );
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
    const entryType = normalizeEntryType(item.entry_type || item.entries?.[0]?.entry_type);
    const entries = (item.entries || [])
      .filter((e) => num(e.quantity) > 0)
      .map((e, entryIndex) => ({
        entry_type: normalizeEntryType(e.entry_type || entryType),
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

function insertInvoiceRecord(input, ts = nowIso()) {
  const bill = getNextBillInfo(input.date);
  db.run(`INSERT INTO invoices (financial_year, serial_no, bill_no, date, party_name, marka, buyer_name, lr_number, transport_name, grand_total, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [bill.financial_year, bill.serial_no, bill.bill_no, input.date, input.party_name, input.marka, input.buyer_name, input.lr_number, input.transport_name, input.grand_total, ts, ts]);
  const id = Number(one('SELECT last_insert_rowid() AS id').id);
  insertItems(id, input.items);
  return id;
}

function getDemoSeedPayloads() {
  return [
    {
      date: '2026-04-02',
      party_name: 'Shree Ram Kitchen House',
      marka: 'SR-Red',
      buyer_name: 'Mahesh Traders',
      lr_number: 'LR240315',
      transport_name: 'Patel Roadways',
      items: [
        { item_name: 'Steel Dinner Plate 12"', rate: 112, entries: [{ entry_type: 'pieces', quantity: 36 }] },
        { item_name: 'Steel Glass Regular', rate: 28, entries: [{ entry_type: 'pieces', quantity: 72 }] }
      ]
    },
    {
      date: '2026-04-03',
      party_name: 'Jay Bhavani Metals',
      marka: 'JBM-Prime',
      buyer_name: 'Rudra Distributors',
      lr_number: 'LR240327',
      transport_name: 'Shreenath Transport',
      items: [
        { item_name: 'Steel Tope No. 4', rate: 168, entries: [{ entry_type: 'pieces', quantity: 24 }] },
        { item_name: 'Steel Bowl Medium', rate: 34, entries: [{ entry_type: 'pieces', quantity: 96 }] }
      ]
    },
    {
      date: '2026-04-05',
      party_name: 'Krishna Steel Center',
      marka: 'KSC-Gold',
      buyer_name: 'Hariom Agency',
      lr_number: 'LR240361',
      transport_name: 'Vishwakarma Cargo',
      items: [
        { item_name: 'Steel Patila 5 Ltr', rate: 388, entries: [{ entry_type: 'pieces', quantity: 14 }] },
        { item_name: 'Steel Tray Heavy', rate: 198, entries: [{ entry_type: 'pieces', quantity: 18 }] }
      ]
    },
    {
      date: '2026-04-06',
      party_name: 'Ganesh Bartan Bhandar',
      marka: 'GBB-Silver',
      buyer_name: 'Asha Kitchen Point',
      lr_number: 'LR240372',
      transport_name: 'Maruti Freight',
      items: [
        { item_name: 'Steel Spoon Set', rate: 9.5, entries: [{ entry_type: 'pieces', quantity: 240 }] },
        { item_name: 'Steel Serving Spoon', rate: 26, entries: [{ entry_type: 'pieces', quantity: 80 }] }
      ]
    },
    {
      date: '2026-04-08',
      party_name: 'Om Enterprises',
      marka: 'OM-Classic',
      buyer_name: 'Shivam Retail',
      lr_number: 'LR240398',
      transport_name: 'New India Transport',
      items: [
        { item_name: 'Steel Bucket 15 Ltr', rate: 486, entries: [{ entry_type: 'pieces', quantity: 10 }] },
        { item_name: 'Steel Mug', rate: 42, entries: [{ entry_type: 'pieces', quantity: 60 }] }
      ]
    },
    {
      date: '2026-04-09',
      party_name: 'Mahavir Stainless',
      marka: 'MS-Blue',
      buyer_name: 'Kailash Wholesale',
      lr_number: 'LR240411',
      transport_name: 'Narmada Logistics',
      items: [
        { item_name: 'Steel Handi 3 Ltr', rate: 214, entries: [{ entry_type: 'pieces', quantity: 28 }] },
        { item_name: 'Steel Lid Heavy', rate: 38, entries: [{ entry_type: 'pieces', quantity: 70 }] }
      ]
    },
    {
      date: '2026-04-10',
      party_name: 'Radhe Trading Company',
      marka: 'RTC-Metro',
      buyer_name: 'City Home Needs',
      lr_number: 'LR240425',
      transport_name: 'Express Parcel Service',
      items: [
        { item_name: 'Steel Lunch Box 3 Tier', rate: 176, entries: [{ entry_type: 'pieces', quantity: 26 }] },
        { item_name: 'Steel Water Jug', rate: 264, entries: [{ entry_type: 'pieces', quantity: 12 }] }
      ]
    },
    {
      date: '2026-04-12',
      party_name: 'Tulsi Utensils Mart',
      marka: 'TUL-Plus',
      buyer_name: 'Milan Stores',
      lr_number: 'LR240447',
      transport_name: 'Patel Road Carriers',
      items: [
        { item_name: 'Steel Plate Deep', rate: 96, entries: [{ entry_type: 'pieces', quantity: 60 }] },
        { item_name: 'Steel Katori', rate: 18, entries: [{ entry_type: 'pieces', quantity: 180 }] }
      ]
    },
    {
      date: '2026-04-14',
      party_name: 'Bansi Metal Works',
      marka: 'BMW-Trade',
      buyer_name: 'Navkar Sales',
      lr_number: 'LR240468',
      transport_name: 'Ashapura Transport',
      items: [
        { item_name: 'Steel Drum 25 Kg', rate: 149, entries: [{ entry_type: 'weight', quantity: 78.5 }] },
        { item_name: 'Steel Scrap Return', rate: 91, entries: [{ entry_type: 'weight', quantity: 42.25 }] }
      ]
    },
    {
      date: '2026-04-15',
      party_name: 'Pooja Kitchenware',
      marka: 'PK-New',
      buyer_name: 'Anand Traders',
      lr_number: 'LR240479',
      transport_name: 'Saurashtra Cargo Movers',
      items: [
        { item_name: 'Steel Casserole Set', rate: 420, entries: [{ entry_type: 'pieces', quantity: 9 }] },
        { item_name: 'Steel Bowl Set', rate: 122, entries: [{ entry_type: 'pieces', quantity: 24 }] }
      ]
    },
    {
      date: '2026-04-17',
      party_name: 'Nitya Houseware',
      marka: 'NHM-Urban',
      buyer_name: 'Modern Retail Hub',
      lr_number: 'LR240502',
      transport_name: 'Fast Track Roadlines',
      items: [
        { item_name: 'Steel Fry Pan', rate: 308, entries: [{ entry_type: 'pieces', quantity: 16 }] },
        { item_name: 'Steel Tadka Pan', rate: 144, entries: [{ entry_type: 'pieces', quantity: 22 }] }
      ]
    },
    {
      date: '2026-04-18',
      party_name: 'Laxmi Bartan Depot',
      marka: 'LBD-Royal',
      buyer_name: 'Bhakti Sales',
      lr_number: 'LR240516',
      transport_name: 'Secure Parcel Line',
      items: [
        { item_name: 'Steel Tea Strainer', rate: 22, entries: [{ entry_type: 'pieces', quantity: 150 }] },
        { item_name: 'Steel Masala Box', rate: 198, entries: [{ entry_type: 'pieces', quantity: 14 }] }
      ]
    },
    {
      date: '2026-04-20',
      party_name: 'Universal Steel Traders',
      marka: 'UST-Max',
      buyer_name: 'Royal Department Store',
      lr_number: 'LR240539',
      transport_name: 'National Surface',
      items: [
        { item_name: 'Steel Container 10 Kg', rate: 312, entries: [{ entry_type: 'pieces', quantity: 20 }] },
        { item_name: 'Steel Container 5 Kg', rate: 218, entries: [{ entry_type: 'pieces', quantity: 24 }] }
      ]
    },
    {
      date: '2026-04-21',
      party_name: 'Heena Kitchen Store',
      marka: 'HKS-Select',
      buyer_name: 'Arihant Super Store',
      lr_number: 'LR240548',
      transport_name: 'Shiv Shakti Roadways',
      items: [
        { item_name: 'Steel Lemon Set', rate: 86, entries: [{ entry_type: 'pieces', quantity: 40 }] },
        { item_name: 'Steel Salt Pepper Set', rate: 74, entries: [{ entry_type: 'pieces', quantity: 36 }] }
      ]
    },
    {
      date: '2026-04-23',
      party_name: 'Rajasthan Bartan House',
      marka: 'RBH-Store',
      buyer_name: 'Mateshwari Trading',
      lr_number: 'LR240572',
      transport_name: 'Golden Goods Carrier',
      items: [
        { item_name: 'Steel Rice Pot', rate: 356, entries: [{ entry_type: 'pieces', quantity: 11 }] },
        { item_name: 'Steel Serving Bowl', rate: 126, entries: [{ entry_type: 'pieces', quantity: 30 }] }
      ]
    },
    {
      date: '2026-04-24',
      party_name: 'Paras Industries',
      marka: 'PI-Bulk',
      buyer_name: 'Shreeji Home Collection',
      lr_number: 'LR240587',
      transport_name: 'Western Freight Movers',
      items: [
        { item_name: 'Steel Disc Raw', rate: 154, entries: [{ entry_type: 'weight', quantity: 92.75 }] },
        { item_name: 'Steel Rim Cut', rate: 132, entries: [{ entry_type: 'weight', quantity: 38.5 }] }
      ]
    },
    {
      date: '2026-04-25',
      party_name: 'Akshar Utensils',
      marka: 'AKU-Daily',
      buyer_name: 'Pavan Mart',
      lr_number: 'LR240601',
      transport_name: 'Reliable Carriers',
      items: [
        { item_name: 'Steel Tiffin 4 Tier', rate: 224, entries: [{ entry_type: 'pieces', quantity: 18 }] },
        { item_name: 'Steel Glass Hammered', rate: 44, entries: [{ entry_type: 'pieces', quantity: 54 }] }
      ]
    },
    {
      date: '2026-04-26',
      party_name: 'Shiv Stainless Supply',
      marka: 'SSS-Prime',
      buyer_name: 'Deepak Sales Agency',
      lr_number: 'LR240618',
      transport_name: 'Om Logistics',
      items: [
        { item_name: 'Steel Patila 10 Ltr', rate: 598, entries: [{ entry_type: 'pieces', quantity: 8 }] },
        { item_name: 'Steel Bucket Heavy', rate: 520, entries: [{ entry_type: 'pieces', quantity: 7 }] }
      ]
    }
  ];
}

function createInvoice(payload) {
  const input = normalize(payload);
  const ts = nowIso();
  db.run('BEGIN TRANSACTION');
  try {
    const id = insertInvoiceRecord(input, ts);
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

function getAppInfo() {
  return {
    dbPath,
    dataDir,
    dataLocation: dataLocation?.source || null,
    isPackaged: Boolean(getElectronApp()?.isPackaged)
  };
}

function seedDemoData() {
  const seedKey = 'demo_seed_v1';
  if (getMeta(seedKey)) return { seeded: false, inserted: 0, reason: 'already-seeded' };

  const payloads = getDemoSeedPayloads();
  const ts = nowIso();

  db.run('BEGIN TRANSACTION');
  try {
    for (const payload of payloads) {
      insertInvoiceRecord(normalize(payload), ts);
    }
    setMeta(seedKey, ts);
    db.run('COMMIT');
    saveDatabase();
    return { seeded: true, inserted: payloads.length, reason: 'ok' };
  } catch (e) {
    db.run('ROLLBACK');
    throw e;
  }
}

module.exports = { initDatabase, listInvoices, getInvoice, createInvoice, updateInvoice, deleteInvoice, getNextBillInfo, getAppInfo, seedDemoData };
