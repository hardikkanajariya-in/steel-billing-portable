function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeEntryType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'pieces' || normalized === 'piece' || normalized === 'pcs' ? 'pieces' : 'weight';
}

function slipQtyValue(value) {
  return Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 4
  });
}

function qtyValue(value) {
  return Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4
  });
}

function rateValue(value) {
  return Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4
  });
}

function infoRow(label, value) {
  return `<div class="info-row"><span class="info-label">${escapeHtml(label)}: </span><span>${escapeHtml(value || '-')}</span></div>`;
}

function itemTable(item, index) {
  const entries = Array.isArray(item?.entries) ? item.entries : [];
  const itemUnit = normalizeEntryType(item?.entry_type || entries[0]?.entry_type) === 'pieces' ? 'Pcs' : 'Kg';
  const itemTotalQuantity = entries.reduce((sum, entry) => sum + Number(entry?.quantity || 0), 0);

  const rows = entries.map((entry) => (
    `<tr><td class="print-td text-center">${escapeHtml(slipQtyValue(entry?.quantity))}</td></tr>`
  )).join('');

  return `
    <table class="item-table" data-item-index="${index}">
      <thead>
        <tr>
          <th class="print-th text-center">${escapeHtml(item?.item_name || '')}</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <tr>
          <td class="print-total text-center">Total: ${escapeHtml(qtyValue(itemTotalQuantity))} ${escapeHtml(itemUnit)} | ₹ ${escapeHtml(rateValue(item?.rate))}</td>
        </tr>
      </tbody>
    </table>
  `;
}

function buildInvoicePdfHtml(invoice, appName) {
  const items = Array.isArray(invoice?.items) ? invoice.items : [];

  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${escapeHtml(invoice?.bill_no || 'Dispatch Slip')}</title>
      <style>
        :root {
          color-scheme: light;
          font-family: Tahoma, "Segoe UI", Arial, sans-serif;
        }

        * {
          box-sizing: border-box;
        }

        html, body {
          margin: 0;
          padding: 0;
          background: #ffffff;
          color: #0f172a;
        }

        body {
          font-family: Tahoma, "Segoe UI", Arial, sans-serif;
        }

        .print-page {
          width: 105mm;
          min-height: 148mm;
          padding: 6mm;
        }

        .title-block {
          margin-bottom: 5mm;
          text-align: center;
        }

        .title-block h1 {
          margin: 0;
          font-size: 24px;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .title-block p {
          margin: 6px 0 0;
          font-size: 13px;
          color: #64748b;
        }

        .info-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px 18px;
          font-size: 13px;
        }

        .info-row {
          border-bottom: 1px solid #e2e8f0;
          padding: 4px 0;
        }

        .info-label {
          font-weight: 700;
        }

        .items-shell {
          margin-top: 6mm;
        }

        .item-table {
          width: 100%;
          margin-top: 4mm;
          border-collapse: collapse;
          font-size: 13px;
        }

        .item-table:first-child {
          margin-top: 0;
        }

        .print-th {
          border: 1px solid #94a3b8;
          background: #f1f5f9;
          padding: 8px 12px;
          font-weight: 900;
          text-align: left;
        }

        .print-td {
          border: 1px solid #cbd5e1;
          padding: 8px 12px;
        }

        .print-total {
          border: 1px solid #94a3b8;
          background: #f1f5f9;
          padding: 10px 12px;
          font-size: 15px;
          font-weight: 900;
        }

        .text-center {
          text-align: center;
        }

        @page {
          size: 105mm 148mm;
          margin: 0;
        }
      </style>
    </head>
    <body>
      <section class="print-page">
        <div class="title-block">
          <h1>Dispatch Slip</h1>
          <p>${escapeHtml(appName)}</p>
        </div>
        <div class="info-grid">
          ${infoRow('Dispatch No', invoice?.bill_no)}
          ${infoRow('Date', invoice?.date)}
          ${infoRow('Party Name', invoice?.party_name)}
          ${infoRow('Marka', invoice?.marka)}
          ${infoRow('LR Number', invoice?.lr_number)}
          ${infoRow('Transport', invoice?.transport_name)}
        </div>
        <div class="items-shell">
          ${items.map((item, index) => itemTable(item, index)).join('')}
        </div>
      </section>
    </body>
  </html>`;
}

module.exports = { buildInvoicePdfHtml };
