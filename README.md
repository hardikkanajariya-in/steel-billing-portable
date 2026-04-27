# Steel Billing Portable

Offline portable Windows billing/invoicing app for a simple steel industry customer slip.

## Features

- Fully offline desktop application
- Portable data: `data/billing.sqlite` stays beside the app/project folder
- Financial year style bill numbers: `2026-27/001`, `2026-27/002`, etc.
- Create, edit, view, delete, search, and print bills
- Multiple items per bill
- Multiple weight/pieces entries per item
- Single customer-facing print copy
- No login, no backup system, no printed-status restrictions

## Requirements

- Node.js 20+
- pnpm 10.32.1

## Run in development

```bash
pnpm install
pnpm dev
```

## Build portable Windows app

On a Windows machine:

```bash
pnpm install
pnpm dist
```

The portable EXE will be created in:

```text
release/SteelBillingPortable-1.0.0.exe
```

## Portable data behavior

During development, the database is stored at:

```text
data/billing.sqlite
```

For the packaged portable EXE, keep the app in a writable folder such as:

```text
D:\SteelBillingApp\
C:\BillingSoftware\
E:\SteelBillingApp\
```

Avoid placing it inside `C:\Program Files\` because Windows may block data writes.

## Print size

The print template is currently set to a small slip format close to A6 portrait. If your actual paper size is different, update this in `src/styles.css`:

```css
@page { size: 105mm 148mm; margin: 0; }
.print-page { width: 105mm; min-height: 148mm; }
```
