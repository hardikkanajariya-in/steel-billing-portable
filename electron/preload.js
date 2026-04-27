const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('billingApi', {
  listInvoices: (filters) => ipcRenderer.invoke('invoices:list', filters),
  getInvoice: (id) => ipcRenderer.invoke('invoices:get', id),
  createInvoice: (payload) => ipcRenderer.invoke('invoices:create', payload),
  updateInvoice: (id, payload) => ipcRenderer.invoke('invoices:update', { id, payload }),
  deleteInvoice: (id) => ipcRenderer.invoke('invoices:delete', id),
  getNextBillNo: (date) => ipcRenderer.invoke('invoices:next-bill-no', date),
  generateInvoicePdf: (invoice) => ipcRenderer.invoke('invoices:generate-pdf', invoice),
  exportInvoicePdf: (invoice) => ipcRenderer.invoke('invoices:export-pdf', invoice),
  printInvoice: (invoice) => ipcRenderer.invoke('invoices:print', invoice),
  getAppInfo: () => ipcRenderer.invoke('app:info')
});
