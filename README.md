# CH Watches

Independent watch retailer storefront. Product listings are intentionally empty until you upload your actual inventory and product photos.

## Run locally

Requires Node.js 24.15 or newer; SQLite is provided by Node's built-in `node:sqlite` module, so no package installation is needed.

In PowerShell, set a strong private admin password and start the server:

```powershell
$env:ADMIN_PASSWORD = 'use-a-unique-password-at-least-14-characters'
node server.mjs
```

Open `http://localhost:3000` for the storefront and `http://localhost:3000/admin` to manage products, orders, and store settings. The server creates `data/ch-watches.sqlite` on first run. Back up the database while the server is stopped.

## Before accepting orders

- In Store Admin, replace the WhatsApp placeholder with your business number in international digits only (for example, `961XXXXXXXX` with the X characters replaced).
- Set your currency, contact links, and delivery fee, then add watches using photos of the actual products you sell.
- WhatsApp checkout opens a message and does not save the request. The separate Save order in store option records a pending order in SQLite. Stock is reduced when you confirm an order and restored if you cancel it before shipping.
- Orders are not marked paid when submitted. This site does not process online payments or automatically confirm orders. Delivered orders are the only ones counted in sales totals.

## Hosting

For public use, deploy behind HTTPS on a maintained Node.js host, set `HOST=0.0.0.0`, keep `ADMIN_PASSWORD` as a private server secret, and arrange persistent storage and backups for `data/ch-watches.sqlite`. Product photos are stored in the database. This starter has no payment processor, verified shipping integration, or customer account system. Do not expose the local development server directly to the public internet.
