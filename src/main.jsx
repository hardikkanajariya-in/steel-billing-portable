import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, ArrowUpDown, ChevronDown, ChevronUp, Edit, Eye, Plus, Printer, Save, Search, Trash2, X } from 'lucide-react';
import './styles.css';

const api = window.billingApi;
const APP_NAME = 'Steel Utensils Dispatch Book';
const APP_TAGLINE = 'Offline dispatch register';

function today() { return new Date().toISOString().slice(0, 10); }
function money(n) { return Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function qty(n) { return Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 }); }
function emptyItem() { return { item_name: '', entry_type: 'weight', rate: '', entries: [{ quantity: '' }] }; }
function blankForm() { return { date: today(), party_name: '', marka: '', buyer_name: '', lr_number: '', transport_name: '', items: [emptyItem()] }; }
function toForm(invoice) {
  return {
    date: invoice.date,
    party_name: invoice.party_name || '',
    marka: invoice.marka || '',
    buyer_name: invoice.buyer_name || '',
    lr_number: invoice.lr_number || '',
    transport_name: invoice.transport_name || '',
    items: invoice.items?.length ? invoice.items.map(item => ({
      item_name: item.item_name || '',
      entry_type: item.entries?.[0]?.entry_type === 'pieces' ? 'pieces' : 'weight',
      rate: item.rate ?? '',
      entries: item.entries?.length ? item.entries.map(e => ({ quantity: e.quantity ?? '' })) : [{ quantity: '' }]
    })) : [emptyItem()]
  };
}
function calculateTotal(form) {
  return (form.items || []).reduce((sum, item) => {
    const rate = Number(item.rate || 0);
    return sum + (item.entries || []).reduce((s, e) => s + Number(e.quantity || 0) * rate, 0);
  }, 0);
}
function compareValues(a, b) {
  if (typeof a === 'number' || typeof b === 'number') return Number(a || 0) - Number(b || 0);
  return String(a || '').localeCompare(String(b || ''), 'en', { numeric: true, sensitivity: 'base' });
}

function Button({ children, className = '', variant = 'primary', ...props }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';
  const variants = {
    primary: 'border-blue-900 bg-blue-900 text-white hover:bg-blue-800',
    secondary: 'border-blue-200 bg-white text-blue-950 hover:bg-blue-50',
    danger: 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100',
    ghost: 'border-transparent bg-transparent text-blue-900 hover:bg-blue-100'
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props}>{children}</button>;
}

function SortHeader({ label, column, sortConfig, onToggle, align = 'left' }) {
  const active = sortConfig.key === column;
  const Icon = active ? (sortConfig.direction === 'asc' ? ChevronUp : ChevronDown) : ArrowUpDown;

  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1 font-inherit ${align === 'right' ? 'ml-auto' : ''}`}
      onClick={() => onToggle(column)}
    >
      <span>{label}</span>
      <Icon size={14} />
    </button>
  );
}

function App() {
  const [view, setView] = useState('list');
  const [selectedId, setSelectedId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const goList = () => { setView('list'); setSelectedId(null); setRefreshKey(k => k + 1); };
  const create = () => { setSelectedId(null); setView('form'); };
  const edit = (id) => { setSelectedId(id); setView('form'); };
  const details = (id) => { setSelectedId(id); setView('details'); };

  return (
    <div className="min-h-screen text-slate-950">
      <header className="no-print sticky top-0 z-30 border-b-4 border-amber-300 bg-[linear-gradient(180deg,#173b82_0%,#0c2558_100%)] text-white shadow-[0_8px_24px_rgba(7,18,48,0.28)]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-amber-200">Dispatch Management</p>
            <h1 className="text-2xl font-black tracking-tight">{APP_NAME}</h1>
            <p className="text-xs text-blue-100">{APP_TAGLINE}</p>
          </div>

        </div>
        <div className="border-t border-white/10 bg-blue-950/25">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-2 text-[11px] uppercase tracking-[0.18em] text-blue-100">
            <span>{view === 'list' ? 'Dispatch Register' : view === 'form' ? 'Dispatch Entry' : 'Dispatch Preview'}</span>
            <span>{new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-5 py-5">
        {view === 'list' && <ListScreen refreshKey={refreshKey} onCreate={create} onEdit={edit} onView={details} />}
        {view === 'form' && <FormScreen id={selectedId} onSaved={(invoice) => { setSelectedId(invoice.id); setView('details'); }} onCancel={goList} />}
        {view === 'details' && <DetailsScreen id={selectedId} onEdit={() => edit(selectedId)} onBack={goList} />}
      </main>
    </div>
  );
}

function ListScreen({ refreshKey, onCreate, onEdit, onView }) {
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({ query: '', dateFrom: '', dateTo: '' });
  const [appInfo, setAppInfo] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  async function load(nextFilters = filters) {
    setRows(await api.listInvoices(nextFilters));
  }
  useEffect(() => { load(); api.getAppInfo().then(setAppInfo); }, [refreshKey]);

  const remove = async (id) => {
    if (!confirm('Delete this dispatch entry permanently from local data?')) return;
    await api.deleteInvoice(id);
    await load();
  };

  const stats = useMemo(() => {
    const todayRows = rows.filter((row) => row.date === today());
    return {
      entries: rows.length,
      todayEntries: todayRows.length,
      totalAmount: rows.reduce((sum, row) => sum + Number(row.grand_total || 0), 0),
      todayAmount: todayRows.reduce((sum, row) => sum + Number(row.grand_total || 0), 0)
    };
  }, [rows]);

  const sortedRows = useMemo(() => {
    if (!sortConfig.key) return rows;

    return [...rows].sort((left, right) => {
      const leftValue = sortConfig.key === 'grand_total' ? Number(left[sortConfig.key] || 0) : left[sortConfig.key];
      const rightValue = sortConfig.key === 'grand_total' ? Number(right[sortConfig.key] || 0) : right[sortConfig.key];
      const result = compareValues(leftValue, rightValue);
      return sortConfig.direction === 'asc' ? result : -result;
    });
  }, [rows, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageRows = sortedRows.slice(pageStart, pageStart + pageSize);
  const fillerRowCount = Math.max(pageSize - pageRows.length, 0);

  useEffect(() => {
    if (page !== currentPage) setPage(currentPage);
  }, [page, currentPage]);

  const runSearch = async () => {
    setPage(1);
    await load(filters);
  };

  const clearFilters = async () => {
    const nextFilters = { query: '', dateFrom: '', dateTo: '' };
    setFilters(nextFilters);
    setPage(1);
    await load(nextFilters);
  };

  const toggleSort = (key) => {
    setPage(1);
    setSortConfig((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  return (
    <div className="space-y-5">
      <section className="tally-panel p-5">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="tally-caption">Overview</p>
            <h2 className="text-xl font-black text-blue-950">Dispatch Register Dashboard</h2>
            <p className="text-sm text-slate-600">Quick totals and search controls for your daily steel utensils dispatch book.</p>
          </div>
          <Button onClick={onCreate}><Plus size={16} /> Add Dispatch</Button>
        </div>
        <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total Entries" value={stats.entries} />
          <StatCard label="Today Entries" value={stats.todayEntries} />
          <StatCard label="Register Total" value={`₹ ${money(stats.totalAmount)}`} />
          <StatCard label="Today Total" value={`₹ ${money(stats.todayAmount)}`} />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[280px] flex-1">
            <label className="label">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-3 text-slate-400" size={18} />
              <input className="input pl-10" placeholder="Dispatch no, party, marka, buyer, LR, transport" value={filters.query} onChange={e => setFilters({ ...filters, query: e.target.value })} />
            </div>
          </div>
          <div><label className="label">From</label><input className="input" type="date" value={filters.dateFrom} onChange={e => setFilters({ ...filters, dateFrom: e.target.value })} /></div>
          <div><label className="label">To</label><input className="input" type="date" value={filters.dateTo} onChange={e => setFilters({ ...filters, dateTo: e.target.value })} /></div>
          <Button onClick={runSearch}><Search size={16} /> Search</Button>
          <Button variant="secondary" onClick={clearFilters}><X size={16} /> Clear</Button>
        </div>
      </section>

      <section className="tally-table-shell">
        <div className="tally-ribbon flex items-center justify-between p-4">
          <div><h2 className="text-lg font-black">Dispatch Register</h2><p className="text-sm text-blue-100/90">Showing {sortedRows.length ? `${pageStart + 1}-${Math.min(pageStart + pageRows.length, sortedRows.length)}` : '0'} of {sortedRows.length} dispatch entries</p></div>
          <div className="flex items-end gap-3">
            <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-[0.16em] text-blue-100">
              <span>Rows</span>
              <select
                className="input min-w-[92px] border-white/20 bg-white text-blue-950"
                value={pageSize}
                onChange={(e) => {
                  const nextSize = Math.max(10, Number(e.target.value) || 10);
                  setPageSize(nextSize);
                  setPage(1);
                }}
              >
                {[10, 20, 30, 50].map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
          </div>
          {/* <Button onClick={onCreate}><Plus size={16}/> New Dispatch</Button> */}
        </div>
        <div className="overflow-x-auto">
          <table className="dispatch-list-table w-full text-left text-sm">
            <thead className="bg-blue-50 text-xs uppercase tracking-wide text-blue-900">
              <tr>
                <th className="th"><SortHeader label="Date" column="date" sortConfig={sortConfig} onToggle={toggleSort} /></th>
                <th className="th"><SortHeader label="Dispatch No" column="bill_no" sortConfig={sortConfig} onToggle={toggleSort} /></th>
                <th className="th"><SortHeader label="Party Name" column="party_name" sortConfig={sortConfig} onToggle={toggleSort} /></th>
                <th className="th"><SortHeader label="Marka" column="marka" sortConfig={sortConfig} onToggle={toggleSort} /></th>
                <th className="th"><SortHeader label="Buyer" column="buyer_name" sortConfig={sortConfig} onToggle={toggleSort} /></th>
                <th className="th"><SortHeader label="LR No" column="lr_number" sortConfig={sortConfig} onToggle={toggleSort} /></th>
                <th className="th text-right"><SortHeader label="Total" column="grand_total" sortConfig={sortConfig} onToggle={toggleSort} align="right" /></th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map(row => (
                <tr key={row.id} className="border-t border-blue-100 hover:bg-amber-50/60">
                  <td className="td">{row.date}</td><td className="td font-bold">{row.bill_no}</td><td className="td">{row.party_name}</td><td className="td">{row.marka}</td><td className="td">{row.buyer_name}</td><td className="td">{row.lr_number}</td><td className="td text-right font-bold">₹ {money(row.grand_total)}</td>
                  <td className="td"><div className="flex justify-end gap-2"><Button variant="secondary" className="px-3" onClick={() => onView(row.id)}><Eye size={15} /></Button><Button variant="secondary" className="px-3" onClick={() => onEdit(row.id)}><Edit size={15} /></Button><Button variant="danger" className="px-3" onClick={() => remove(row.id)}><Trash2 size={15} /></Button></div></td>
                </tr>
              ))}
              {!sortedRows.length && <tr><td colSpan="8" className="py-12 text-center text-slate-500">No dispatch entries found. Create your first dispatch.</td></tr>}
              {!!sortedRows.length && Array.from({ length: fillerRowCount }).map((_, index) => (
                <tr key={`filler-${index}`} className="border-t border-blue-100">
                  <td colSpan="8" className="td h-[57px] bg-white"></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 border-t border-blue-100 bg-white px-4 py-3 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
          <p>Page {currentPage} of {totalPages}</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 1}>Previous</Button>
            <Button variant="secondary" onClick={() => setPage(currentPage + 1)} disabled={currentPage === totalPages || !sortedRows.length}>Next</Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function FormScreen({ id, onSaved, onCancel }) {
  const isEdit = Boolean(id);
  const [form, setForm] = useState(blankForm());
  const [loading, setLoading] = useState(true);
  const [nextBill, setNextBill] = useState(null);
  const grandTotal = useMemo(() => calculateTotal(form), [form]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      if (isEdit) {
        const invoice = await api.getInvoice(id);
        setForm(toForm(invoice));
        setNextBill({ bill_no: invoice.bill_no });
      } else {
        const initial = blankForm();
        setForm(initial);
        setNextBill(await api.getNextBillNo(initial.date));
      }
      setLoading(false);
    }
    load();
  }, [id]);

  const update = (key, value) => setForm(f => ({ ...f, [key]: value }));
  const updateDate = async (value) => { update('date', value); if (!isEdit) setNextBill(await api.getNextBillNo(value)); };
  const updateItem = (i, patch) => setForm(f => ({ ...f, items: f.items.map((it, idx) => idx === i ? { ...it, ...patch } : it) }));
  const updateEntry = (i, j, patch) => setForm(f => ({ ...f, items: f.items.map((it, idx) => idx === i ? { ...it, entries: it.entries.map((en, eidx) => eidx === j ? { ...en, ...patch } : en) } : it) }));
  const addItem = () => setForm(f => ({ ...f, items: [...f.items, emptyItem()] }));
  const removeItem = (i) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i).length ? f.items.filter((_, idx) => idx !== i) : [emptyItem()] }));
  const addEntry = (i) => setForm(f => ({ ...f, items: f.items.map((it, idx) => idx === i ? { ...it, entries: [...it.entries, { quantity: '' }] } : it) }));
  const removeEntry = (i, j) => setForm(f => ({ ...f, items: f.items.map((it, idx) => idx === i ? { ...it, entries: it.entries.filter((_, eidx) => eidx !== j).length ? it.entries.filter((_, eidx) => eidx !== j) : [{ quantity: '' }] } : it) }));

  const save = async () => {
    if (!form.date) return alert('Date is required.');
    if (!form.party_name.trim()) return alert('Party Name is required.');
    const hasItem = form.items.some(it => it.item_name.trim() && it.entries.some(e => Number(e.quantity) > 0));
    if (!hasItem) return alert('Add at least one item with quantity/weight.');
    const saved = isEdit ? await api.updateInvoice(id, form) : await api.createInvoice(form);
    onSaved(saved);
  };

  if (loading) return <div className="rounded-3xl bg-white p-8">Loading...</div>;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <section className="tally-panel p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="tally-caption">Dispatch Entry</p>
            <h2 className="text-xl font-black text-blue-950">{isEdit ? 'Edit Dispatch' : 'Create Dispatch'}</h2>
            <p className="text-sm text-slate-600">Dispatch No: <b className="text-blue-950">{nextBill?.bill_no}</b></p>
          </div>
          {/* <Button onClick={save}><Save size={16}/> Save Dispatch</Button> */}
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Date"><input className="input" type="date" value={form.date} onChange={e => updateDate(e.target.value)} /></Field>
          <Field label="Party Name"><input className="input" value={form.party_name} onChange={e => update('party_name', e.target.value)} placeholder="Party name" /></Field>
          <Field label="Marka"><input className="input" value={form.marka} onChange={e => update('marka', e.target.value)} placeholder="Marka" /></Field>
          {/* <Field label="Buyer Name"><input className="input" value={form.buyer_name} onChange={e => update('buyer_name', e.target.value)} placeholder="Buyer name" /></Field> */}
          <Field label="LR Number"><input className="input" value={form.lr_number} onChange={e => update('lr_number', e.target.value)} placeholder="LR number" /></Field>
          <Field label="Transport Name"><input className="input" value={form.transport_name} onChange={e => update('transport_name', e.target.value)} placeholder="Transport name" /></Field>
        </div>

        <div className="mt-8 space-y-5">
          <div className="flex items-center justify-between"><h3 className="font-black text-blue-950">Dispatch Items</h3><Button variant="secondary" onClick={addItem}><Plus size={16} /> Add Item</Button></div>
          {form.items.map((item, i) => {
            const itemTotal = item.entries.reduce((s, e) => s + Number(e.quantity || 0) * Number(item.rate || 0), 0);
            return (
              <div key={i} className="rounded-md border border-blue-200 bg-white p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                <div className="grid gap-3 md:grid-cols-[1fr_160px_120px]">
                  <Field label="Item Name"><input className="input" value={item.item_name} onChange={e => updateItem(i, { item_name: e.target.value })} placeholder="MS Pipe / Steel Plate" /></Field>
                  <Field label="Type">
                    <select className="input" value={item.entry_type} onChange={e => updateItem(i, { entry_type: e.target.value })}>
                      <option value="weight">Weight</option>
                      <option value="pieces">Pieces</option>
                    </select>
                  </Field>
                  <div className="flex items-end justify-end"><Button variant="danger" onClick={() => removeItem(i)}><Trash2 size={15} /> Item</Button></div>
                </div>
                <div className="mt-4 overflow-hidden rounded-md border border-blue-200 bg-white">
                  <table className="w-full text-sm"><thead className="bg-blue-50 text-xs uppercase text-blue-900"><tr><th className="th">Weight / Pieces</th><th className="th">Rate</th><th className="th text-right hidden">Amount</th><th className="th text-right">Action</th></tr></thead>
                    <tbody>{item.entries.map((entry, j) => {
                      const isLastRow = j === item.entries.length - 1;
                      return (
                        <tr key={j} className="border-t border-blue-100">
                          <td className="td"><input className="input max-w-[220px]" type="number" step="0.001" value={entry.quantity} onChange={e => updateEntry(i, j, { quantity: e.target.value })} /></td>
                          <td className="td">
                            {isLastRow ? <input className="input max-w-[160px]" type="number" step="0.01" value={item.rate} onChange={e => updateItem(i, { rate: e.target.value })} /> : <div className="h-[42px]" />}
                          </td>
                          <td className="td text-right font-bold hidden">₹ {money(Number(entry.quantity || 0) * Number(item.rate || 0))}</td>
                          <td className="td text-right"><Button variant="ghost" className="px-3" onClick={() => removeEntry(i, j)}><X size={15} /></Button></td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                </div>
                <div className="mt-3 flex items-center justify-between"><Button variant="secondary" onClick={() => addEntry(i)}><Plus size={15} /> Add Weight/Pieces</Button>
                  {/* <b>Item Total: ₹ {money(itemTotal)}</b> */}
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <aside className="tally-sidebar no-print h-fit p-6">
        <p className="tally-caption">Dispatch Summary</p>
        <h3 className="mb-5 text-lg font-black text-blue-950">Voucher Totals</h3>
        <div className="space-y-3">
          <MetaRow label="Dispatch No" value={nextBill?.bill_no} />
          <MetaRow label="Date" value={form.date} />
          <MetaRow label="Party" value={form.party_name || '-'} />
          {/* <MetaRow label="Entries" value={String(form.items.reduce((sum, item) => sum + item.entries.length, 0))} /> */}
        </div>
        <div className="my-5 border-t border-blue-200"></div>
        <p className="text-sm font-bold uppercase tracking-[0.14em] text-blue-800 hidden">Grand Total</p>
        <p className="mt-1 text-3xl font-black text-blue-950 hidden">₹ {money(grandTotal)}</p>
        <div className="mt-6 grid gap-3"><Button onClick={save}><Save size={16} /> Save Dispatch</Button><Button variant="secondary" onClick={onCancel}>Cancel</Button></div>
      </aside>
    </div>
  );
}

function Field({ label, children }) { return <label className="block"><span className="label">{label}</span>{children}</label>; }
function StatCard({ label, value }) { return <div className="tally-stat-card"><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-700">{label}</p><p className="mt-2 text-2xl font-black text-blue-950">{value}</p></div>; }
function MetaRow({ label, value }) { return <div className="flex items-center justify-between gap-4 border-b border-blue-100 pb-2 text-sm"><span className="font-bold uppercase tracking-[0.12em] text-blue-800">{label}</span><span className="font-semibold text-slate-700">{value}</span></div>; }

function DetailsScreen({ id, onEdit, onBack }) {
  const [invoice, setInvoice] = useState(null);
  useEffect(() => { api.getInvoice(id).then(setInvoice); }, [id]);
  if (!invoice) return <div className="rounded-3xl bg-white p-8">Loading...</div>;

  const print = () => setTimeout(() => window.print(), 50);

  return (
    <div className="space-y-5">
      <div className="tally-panel no-print flex items-center justify-between p-5">
        <div><p className="tally-caption">Dispatch Preview</p><h2 className="text-xl font-black text-blue-950">Dispatch {invoice.bill_no}</h2><p className="text-sm text-slate-600">Review the dispatch slip and print one customer copy.</p></div>
        <div className="flex gap-3"><Button variant="secondary" onClick={onEdit}><Edit size={16} /> Edit</Button><Button onClick={print}><Printer size={16} /> Print</Button><Button variant="secondary" onClick={onBack}>Back</Button></div>
      </div>
      <InvoicePrint invoice={invoice} />
    </div>
  );
}

function InvoicePrint({ invoice }) {
  return (
    <section className="print-page mx-auto bg-white p-8 shadow-sm print:shadow-none">
      <div className="mb-5 text-center"><h1 className="text-2xl font-black uppercase tracking-wide">Dispatch Slip</h1><p className="text-sm text-slate-500">{APP_NAME}</p></div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
        <Info label="Dispatch No" value={invoice.bill_no} /><Info label="Date" value={invoice.date} /><Info label="Party Name" value={invoice.party_name} /><Info label="Marka" value={invoice.marka} />
        {/* <Info label="Buyer Name" value={invoice.buyer_name} /> */}
        <Info label="LR Number" value={invoice.lr_number} /><Info label="Transport" value={invoice.transport_name} />
      </div>
      <table className="mt-6 w-full border-collapse text-sm">
        <thead><tr><th className="print-th">Item Name</th><th className="print-th">Weight/Pcs</th><th className="print-th">Rate</th>
        {/* <th className="print-th text-right">Total</th> */}
        </tr>
        </thead>
        <tbody>{invoice.items.flatMap(item => item.entries.map((entry, idx) => <tr key={`${item.id}-${entry.id}`}>
          {idx === 0 && <td className="print-td align-middle text-center font-semibold" rowSpan={item.entries.length}>{item.item_name}</td>}
          <td className="print-td">{qty(entry.quantity)} {entry.entry_type === 'pieces' ? 'Pcs' : 'Kg'}</td>
          {idx === 0 && <td className="print-td align-middle text-center font-semibold" rowSpan={item.entries.length}>₹ {money(item.rate)}</td>}
          {/* <td className="print-td text-right">₹ {money(entry.amount)}</td> */}
        </tr>))}
        </tbody>
        {/* <tfoot><tr><td className="print-total" colSpan="3">Grand Total</td><td className="print-total text-right">₹ {money(invoice.grand_total)}</td></tr></tfoot> */}
      </table>
      {/* <div className="mt-8 flex justify-between text-xs text-slate-500"><span>Generated by {APP_NAME}</span><span>Customer Copy</span></div> */}
    </section>
  );
}

function Info({ label, value }) { return <div className="border-b border-slate-200 py-1"><span className="font-bold">{label}: </span><span>{value || '-'}</span></div>; }

createRoot(document.getElementById('root')).render(<App />);
