let store = null;
let editing = null;
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}
function esc(value = '') {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function money(value) {
  const currency = store?.settings?.currency || 'USD';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: currency === 'LBP' ? 0 : 2 }).format(Number(value) || 0);
}
function setForm(form, data) {
  for (const input of form.elements) {
    if (!input.name) continue;
    const value = data[input.name];
    if (input.type === 'checkbox') input.checked = Boolean(value);
    else if (value !== undefined && input.type !== 'file') input.value = Array.isArray(value) ? value.join(', ') : value;
  }
}
function showDashboard(data) {
  store = data;
  $('#login').classList.add('admin-hidden');
  $('#dashboard').classList.remove('admin-hidden');
  setForm($('#settingsForm'), data.settings);
  renderAll();
}
async function refresh() { showDashboard(await api('/api/admin')); }

$('#loginForm').onsubmit = async (event) => {
  event.preventDefault(); $('#loginError').textContent = '';
  try {
    const password = new FormData(event.currentTarget).get('password');
    await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password }) });
    await refresh();
  } catch (error) { $('#loginError').textContent = error.message; }
};
$('#logout').onclick = async () => { await api('/api/admin/logout', { method: 'POST' }); location.reload(); };

$$('[data-tab]').forEach((button) => {
  button.onclick = () => {
    $$('.admin-tabs button').forEach((tab) => tab.classList.toggle('active', tab === button));
    ['overview', 'products', 'orders', 'settings'].forEach((name) => { $(`#${name}Tab`).hidden = button.dataset.tab !== name; });
  };
});
function renderAll() { renderStats(); renderProducts(); renderOrders(); }
function renderStats() {
  const products = store.products;
  const orders = store.orders;
  const delivered = orders.filter((o) => o.status === 'Delivered');
  const salesByCurrency = delivered.reduce((totals, o) => { const currency = o.currency || store.settings.currency || 'USD'; totals[currency] = (totals[currency] || 0) + Number(o.total || 0); return totals; }, {});
  const sales = Object.entries(salesByCurrency).map(([currency, total]) => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(total)).join(' / ') || money(0);
  const cards = [
    ['Total products', products.length], ['Published', products.filter((p) => p.published).length],
    ['Low stock (1-3)', products.filter((p) => p.stock > 0 && p.stock <= 3).length], ['Out of stock', products.filter((p) => p.stock <= 0).length],
    ['Pending orders', orders.filter((o) => o.status === 'Pending').length], ['Confirmed orders', orders.filter((o) => o.status === 'Confirmed').length],
    ['Delivered sales', sales], ['Delivered orders', delivered.length],
  ];
  $('#stats').innerHTML = cards.map(([label, value]) => `<div class="stat"><small>${label}</small><b>${value}</b></div>`).join('');
}
function renderProducts() {
  const query = $('#productSearch').value.toLowerCase();
  const products = store.products.filter((p) => `${p.name} ${p.model || ''}`.toLowerCase().includes(query));
  $('#productTable').innerHTML = `<table class="admin-table"><thead><tr><th>Watch</th><th>Model</th><th>Price</th><th>Stock</th><th>State</th><th>Actions</th></tr></thead><tbody>${products.map((p) => `
    <tr><td>${esc(p.name)}</td><td>${esc(p.model || '-')}</td><td>${money(p.price)}</td><td>${p.stock}</td><td><span class="pill">${p.stock <= 0 ? 'Out of stock' : p.stock <= 3 ? 'Low stock' : 'In stock'}</span> ${p.published ? 'Published' : 'Draft'}</td>
    <td><button data-edit="${esc(p.id)}">Edit</button><button data-copy="${esc(p.id)}">Duplicate</button><button data-delete="${esc(p.id)}">Delete</button></td></tr>`).join('') || '<tr><td colspan="6">No products yet. Add your first watch above.</td></tr>'}</tbody></table>`;
  $$('[data-edit]').forEach((button) => { button.onclick = () => edit(store.products.find((p) => p.id === button.dataset.edit)); });
  $$('[data-copy]').forEach((button) => { button.onclick = () => { const product = structuredClone(store.products.find((p) => p.id === button.dataset.copy)); product.id = ''; product.name += ' copy'; edit(product); }; });
  $$('[data-delete]').forEach((button) => { button.onclick = async () => { if (!confirm('Delete this product?')) return; store.products = store.products.filter((p) => p.id !== button.dataset.delete); try { await saveStore(); renderAll(); } catch (error) { alert(error.message); } }; });
}
function renderOrders() {
  const filter = $('#orderFilter').value;
  const query = $('#orderSearch').value.trim().toLowerCase();
  const orders = store.orders.filter((o) => (!filter || o.status === filter) && (!query || `${o.orderNumber} ${o.customer?.name} ${o.customer?.phone}`.toLowerCase().includes(query))).slice().reverse();
  $('#orderTable').innerHTML = `<table class="admin-table"><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th><th>Notes / action</th></tr></thead><tbody>${orders.map((o) => {
    const details = `${esc(o.customer?.phone || '')}<br>${esc(o.customer?.city || '')}, ${esc(o.customer?.address || '')}`;
    const items = (o.items || []).map((i) => `${esc(i.name)}${i.color ? ` - ${esc(i.color)}` : ''} x ${i.quantity}`).join('<br>');
    const next = { Pending: ['Confirmed', 'Cancelled'], Confirmed: ['Preparing', 'Cancelled'], Preparing: ['Shipped', 'Cancelled'], Shipped: ['Delivered', 'Cancelled'], Delivered: [], Cancelled: [] }[o.status] || [];
    return `<tr><td><b>${esc(o.orderNumber)}</b><br><small>${esc(new Date(o.createdAt).toLocaleString())}</small><br><span class="pill">${esc(o.source || 'Database checkout')}</span></td><td>${esc(o.customer?.name || '')}<br>${details}<br><small>${esc(o.customer?.deliveryMethod || '')}</small></td><td>${items}</td><td>${money(o.total)}</td><td>${esc(o.status)}<br><small>${esc(o.paymentStatus || 'Not recorded')}</small></td><td class="order-notes">${esc(o.customer?.notes || '')}<br><input data-order-notes="${esc(o.id)}" value="${esc(o.adminNotes || '')}" placeholder="Internal note"><br><select data-order-status="${esc(o.id)}"><option value="">Keep status</option>${next.map((v) => `<option>${v}</option>`).join('')}</select> <button data-order-save="${esc(o.id)}">Save</button></td></tr>`;
  }).join('') || '<tr><td colspan="6">No stored orders match this filter.</td></tr>'}</tbody></table>`;
  $$('[data-order-save]').forEach((button) => { button.onclick = async () => {
    const id = button.dataset.orderSave;
    const status = $(`[data-order-status="${CSS.escape(id)}"]`).value;
    const notes = $(`[data-order-notes="${CSS.escape(id)}"]`).value;
    try { await api(`/api/admin/orders/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status, notes }) }); await refresh(); }
    catch (error) { alert(error.message); }
  }; });
}
function edit(product) {
  editing = product;
  const specs = product.specs || {};
  setForm($('#productForm'), { ...product, caseSize: specs['Case size'], strapMaterial: specs['Strap material'], displayType: specs['Display type'], waterResistance: specs['Water resistance'] });
  $('#productForm').elements.id.value = product.id || '';
  $('#formTitle').textContent = product.id ? 'Edit a watch' : 'Add a watch';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
$('#cancelEdit').onclick = () => { editing = null; $('#productForm').reset(); $('#productForm').elements.id.value = ''; $('#formTitle').textContent = 'Add a watch'; };
$('#productSearch').oninput = renderProducts;
$('#orderFilter').onchange = renderOrders;
$('#orderSearch').oninput = renderOrders;
function fileData(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); }); }

$('#productForm').onsubmit = async (event) => {
  event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form)); const id = values.id || crypto.randomUUID();
  try {
    let images = editing?.images || [];
    const files = [...form.elements.photos.files];
    if (files.length) {
      images = await Promise.all(files.map(fileData));
    }
    const primaryImage = images[0] || editing?.imageUrl || editing?.image || '';
    const product = {
      id, name: values.name, brand: values.brand, model: values.model, price: Number(values.price), previousPrice: values.previousPrice ? Number(values.previousPrice) : null,
      stock: Number(values.stock) || 0, categories: values.categories.split(',').map((x) => x.trim()).filter(Boolean), colors: values.colors.split(',').map((x) => x.trim()).filter(Boolean),
      description: values.description, specs: { 'Case size': values.caseSize, 'Strap material': values.strapMaterial, 'Display type': values.displayType, 'Water resistance': values.waterResistance },
      featured: form.elements.featured.checked, isNew: form.elements.isNew.checked, published: form.elements.published.checked, 
      images, imageUrl: primaryImage, image: primaryImage,
      created: editing?.created || Date.now(),
    };
    const index = store.products.findIndex((p) => p.id === id);
    if (index < 0) store.products.push(product); else store.products[index] = product;
    await saveStore(); $('#productMessage').textContent = 'Product saved.'; form.reset(); editing = null; $('#formTitle').textContent = 'Add a watch'; renderAll();
  } catch (error) { $('#productMessage').textContent = error.message; }
};

$('#settingsForm').onsubmit = async (event) => {
  event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget));
  store.settings = { ...store.settings, ...values, deliveryFee: Number(values.deliveryFee) || 0 };
  try { await saveStore(); $('#settingsMessage').textContent = 'Settings saved.'; }
  catch (error) { $('#settingsMessage').textContent = error.message; }
};
async function saveStore() { await api('/api/admin', { method: 'PUT', credentials:'include', body: JSON.stringify(store) }); }

api('/api/admin', { credentials: 'include' }).then(showDashboard).catch(() => {});
