import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, Edit, Eye, Plus, Printer, Save, Search, Trash2, X } from 'lucide-react';
import './styles.css';

const api = window.billingApi;

function today() { return new Date().toISOString().slice(0, 10); }
function money(n) { return Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function qty(n) { return Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 }); }
function emptyItem() { return { item_name: '', rate: '', entries: [{ entry_type: 'weight', quantity: '' }] }; }
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
      rate: item.rate ?? '',
      entries: item.entries?.length ? item.entries.map(e => ({ entry_type: e.entry_type, quantity: e.quantity ?? '' })) : [{ entry_type: 'weight', quantity: '' }]
    })) : [emptyItem()]
  };
}
function calculateTotal(form) {
  return (form.items || []).reduce((sum, item) => {
    const rate = Number(item.rate || 0);
    return sum + (item.entries || []).reduce((s, e) => s + Number(e.quantity || 0) * rate, 0);
  }, 0);
}

function Button({ children, className = '', variant = 'primary', ...props }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed';
  const variants = {
    primary: 'bg-slate-950 text-white hover:bg-slate-800',
    secondary: 'bg-white text-slate-800 border border-slate-200 hover:bg-slate-50',
    danger: 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100',
    ghost: 'bg-transparent text-slate-700 hover:bg-slate-100'
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props}>{children}</button>;
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
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-black tracking-tight">Steel Billing Portable</h1>
            <p className="text-xs text-slate-500">Offline customer slip billing • Financial year numbering • Portable data folder</p>
          </div>
          {view !== 'list' ? <Button variant="secondary" onClick={goList}><ArrowLeft size={16}/> Back to List</Button> : <Button onClick={create}><Plus size={16}/> Create Bill</Button>}
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">
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

  async function load() { setRows(await api.listInvoices(filters)); }
  useEffect(() => { load(); api.getAppInfo().then(setAppInfo); }, [refreshKey]);

  const remove = async (id) => {
    if (!confirm('Delete this bill permanently from local data?')) return;
    await api.deleteInvoice(id);
    await load();
  };

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[280px] flex-1">
            <label className="label">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-3 text-slate-400" size={18}/>
              <input className="input pl-10" placeholder="Bill no, party, marka, buyer, LR, transport" value={filters.query} onChange={e => setFilters({ ...filters, query: e.target.value })}/>
            </div>
          </div>
          <div><label className="label">From</label><input className="input" type="date" value={filters.dateFrom} onChange={e => setFilters({ ...filters, dateFrom: e.target.value })}/></div>
          <div><label className="label">To</label><input className="input" type="date" value={filters.dateTo} onChange={e => setFilters({ ...filters, dateTo: e.target.value })}/></div>
          <Button onClick={load}><Search size={16}/> Search</Button>
          <Button variant="secondary" onClick={() => { setFilters({ query: '', dateFrom: '', dateTo: '' }); setTimeout(load, 0); }}><X size={16}/> Clear</Button>
        </div>
        {appInfo?.dbPath && <p className="mt-3 text-xs text-slate-500">Portable database: <span className="font-mono">{appInfo.dbPath}</span></p>}
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 p-5">
          <div><h2 className="text-lg font-black">Billing List</h2><p className="text-sm text-slate-500">Showing latest 500 bills</p></div>
          <Button onClick={onCreate}><Plus size={16}/> New Bill</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="th">Date</th><th className="th">Bill No</th><th className="th">Party Name</th><th className="th">Marka</th><th className="th">Buyer</th><th className="th">LR No</th><th className="th text-right">Total</th><th className="th text-right">Actions</th></tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="td">{row.date}</td><td className="td font-bold">{row.bill_no}</td><td className="td">{row.party_name}</td><td className="td">{row.marka}</td><td className="td">{row.buyer_name}</td><td className="td">{row.lr_number}</td><td className="td text-right font-bold">₹ {money(row.grand_total)}</td>
                  <td className="td"><div className="flex justify-end gap-2"><Button variant="secondary" className="px-3" onClick={() => onView(row.id)}><Eye size={15}/></Button><Button variant="secondary" className="px-3" onClick={() => onEdit(row.id)}><Edit size={15}/></Button><Button variant="danger" className="px-3" onClick={() => remove(row.id)}><Trash2 size={15}/></Button></div></td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan="8" className="py-12 text-center text-slate-500">No bills found. Create your first bill.</td></tr>}
            </tbody>
          </table>
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
  const addEntry = (i) => setForm(f => ({ ...f, items: f.items.map((it, idx) => idx === i ? { ...it, entries: [...it.entries, { entry_type: 'weight', quantity: '' }] } : it) }));
  const removeEntry = (i, j) => setForm(f => ({ ...f, items: f.items.map((it, idx) => idx === i ? { ...it, entries: it.entries.filter((_, eidx) => eidx !== j).length ? it.entries.filter((_, eidx) => eidx !== j) : [{ entry_type: 'weight', quantity: '' }] } : it) }));

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
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <div><h2 className="text-xl font-black">{isEdit ? 'Edit Bill' : 'Create Bill'}</h2><p className="text-sm text-slate-500">Bill No: <b>{nextBill?.bill_no}</b></p></div>
          <Button onClick={save}><Save size={16}/> Save Bill</Button>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Date"><input className="input" type="date" value={form.date} onChange={e => updateDate(e.target.value)}/></Field>
          <Field label="Party Name"><input className="input" value={form.party_name} onChange={e => update('party_name', e.target.value)} placeholder="Party name"/></Field>
          <Field label="Marka"><input className="input" value={form.marka} onChange={e => update('marka', e.target.value)} placeholder="Marka"/></Field>
          <Field label="Buyer Name"><input className="input" value={form.buyer_name} onChange={e => update('buyer_name', e.target.value)} placeholder="Buyer name"/></Field>
          <Field label="LR Number"><input className="input" value={form.lr_number} onChange={e => update('lr_number', e.target.value)} placeholder="LR number"/></Field>
          <Field label="Transport Name"><input className="input" value={form.transport_name} onChange={e => update('transport_name', e.target.value)} placeholder="Transport name"/></Field>
        </div>

        <div className="mt-8 space-y-5">
          <div className="flex items-center justify-between"><h3 className="font-black">Items</h3><Button variant="secondary" onClick={addItem}><Plus size={16}/> Add Item</Button></div>
          {form.items.map((item, i) => {
            const itemTotal = item.entries.reduce((s, e) => s + Number(e.quantity || 0) * Number(item.rate || 0), 0);
            return (
              <div key={i} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="grid gap-3 md:grid-cols-[1fr_160px_120px]">
                  <Field label="Item Name"><input className="input" value={item.item_name} onChange={e => updateItem(i, { item_name: e.target.value })} placeholder="MS Pipe / Steel Plate"/></Field>
                  <Field label="Rate"><input className="input" type="number" step="0.01" value={item.rate} onChange={e => updateItem(i, { rate: e.target.value })}/></Field>
                  <div className="flex items-end justify-end"><Button variant="danger" onClick={() => removeItem(i)}><Trash2 size={15}/> Item</Button></div>
                </div>
                <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <table className="w-full text-sm"><thead className="bg-white text-xs uppercase text-slate-500"><tr><th className="th">Type</th><th className="th">Weight / Pieces</th><th className="th text-right">Amount</th><th className="th text-right">Action</th></tr></thead>
                    <tbody>{item.entries.map((entry, j) => <tr key={j} className="border-t border-slate-100"><td className="td"><select className="input max-w-[160px]" value={entry.entry_type} onChange={e => updateEntry(i, j, { entry_type: e.target.value })}><option value="weight">Weight</option><option value="pieces">Pieces</option></select></td><td className="td"><input className="input max-w-[220px]" type="number" step="0.001" value={entry.quantity} onChange={e => updateEntry(i, j, { quantity: e.target.value })}/></td><td className="td text-right font-bold">₹ {money(Number(entry.quantity || 0) * Number(item.rate || 0))}</td><td className="td text-right"><Button variant="ghost" className="px-3" onClick={() => removeEntry(i, j)}><X size={15}/></Button></td></tr>)}</tbody>
                  </table>
                </div>
                <div className="mt-3 flex items-center justify-between"><Button variant="secondary" onClick={() => addEntry(i)}><Plus size={15}/> Add Weight/Pieces</Button><b>Item Total: ₹ {money(itemTotal)}</b></div>
              </div>
            );
          })}
        </div>
      </section>
      <aside className="no-print h-fit rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">Bill No</p><p className="text-2xl font-black">{nextBill?.bill_no}</p>
        <div className="my-5 border-t border-slate-200"></div>
        <p className="text-sm text-slate-500">Grand Total</p><p className="text-3xl font-black">₹ {money(grandTotal)}</p>
        <div className="mt-6 grid gap-3"><Button onClick={save}><Save size={16}/> Save Bill</Button><Button variant="secondary" onClick={onCancel}>Cancel</Button></div>
      </aside>
    </div>
  );
}

function Field({ label, children }) { return <label className="block"><span className="label">{label}</span>{children}</label>; }

function DetailsScreen({ id, onEdit, onBack }) {
  const [invoice, setInvoice] = useState(null);
  useEffect(() => { api.getInvoice(id).then(setInvoice); }, [id]);
  if (!invoice) return <div className="rounded-3xl bg-white p-8">Loading...</div>;

  const print = () => setTimeout(() => window.print(), 50);

  return (
    <div className="space-y-5">
      <div className="no-print flex items-center justify-between rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div><h2 className="text-xl font-black">Bill {invoice.bill_no}</h2><p className="text-sm text-slate-500">View customer-facing slip and print single copy</p></div>
        <div className="flex gap-3"><Button variant="secondary" onClick={onEdit}><Edit size={16}/> Edit</Button><Button onClick={print}><Printer size={16}/> Print</Button><Button variant="secondary" onClick={onBack}>Back</Button></div>
      </div>
      <InvoicePrint invoice={invoice} />
    </div>
  );
}

function InvoicePrint({ invoice }) {
  return (
    <section className="print-page mx-auto bg-white p-8 shadow-sm print:shadow-none">
      <div className="mb-5 text-center"><h1 className="text-2xl font-black uppercase tracking-wide">Customer Bill</h1><p className="text-sm text-slate-500">Steel Billing Slip</p></div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
        <Info label="Bill No" value={invoice.bill_no}/><Info label="Date" value={invoice.date}/><Info label="Party Name" value={invoice.party_name}/><Info label="Marka" value={invoice.marka}/><Info label="Buyer Name" value={invoice.buyer_name}/><Info label="LR Number" value={invoice.lr_number}/><Info label="Transport" value={invoice.transport_name}/>
      </div>
      <table className="mt-6 w-full border-collapse text-sm">
        <thead><tr><th className="print-th">Item Name</th><th className="print-th">Weight/Pcs</th><th className="print-th">Rate</th><th className="print-th text-right">Total</th></tr></thead>
        <tbody>{invoice.items.map(item => item.entries.map((entry, idx) => <tr key={`${item.id}-${entry.id}`}><td className="print-td">{idx === 0 ? item.item_name : ''}</td><td className="print-td">{qty(entry.quantity)} {entry.entry_type === 'pieces' ? 'Pcs' : 'Kg'}</td><td className="print-td">₹ {money(item.rate)}</td><td className="print-td text-right">₹ {money(entry.amount)}</td></tr>))}</tbody>
        <tfoot><tr><td className="print-total" colSpan="3">Grand Total</td><td className="print-total text-right">₹ {money(invoice.grand_total)}</td></tr></tfoot>
      </table>
      <div className="mt-8 flex justify-between text-xs text-slate-500"><span>Generated by Steel Billing Portable</span><span>Customer Copy</span></div>
    </section>
  );
}

function Info({ label, value }) { return <div className="border-b border-slate-200 py-1"><span className="font-bold">{label}: </span><span>{value || '-'}</span></div>; }

createRoot(document.getElementById('root')).render(<App />);
