const STORE_KEY = 'ch-watches-store-v1';
const CART_KEY = 'ch-watches-cart-v1';
const defaults = { settings: { name: 'CH Watches', currency: 'USD', whatsapp: '96181148792', deliveryFee: 0 }, products: [] };
let db = read(STORE_KEY, defaults);
let cart = read(CART_KEY, []);
let limit = 8;
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || structuredClone(fallback); }
  catch { return structuredClone(fallback); }
}
function save() {
  localStorage.setItem(STORE_KEY, JSON.stringify(db));
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}
function esc(value = '') {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function money(value) {
  const currency = db.settings.currency || 'USD';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: currency === 'LBP' ? 0 : 2 }).format(Number(value) || 0);
}
function deliveryFee(method = $('#deliveryMethod')?.value || '') { return method.startsWith('Delivery') ? Number(db.settings.deliveryFee) || 0 : 0; }
function cartSubtotal() { return cart.reduce((total, row) => { const p = db.products.find((item) => item.id === row.id); return total + (p ? Number(p.price) * row.qty : 0); }, 0); }
function updateCheckoutTotal() { if ($('#checkoutSubtotal')) $('#checkoutSubtotal').textContent = money(cartSubtotal() + deliveryFee()); }
function watchArt() {
  return '<div class="image-placeholder"><div class="mini-watch"><div class="mini-strap"></div><div class="mini-face"></div></div></div>';
}
function getProductImageUrl(product) {
  if (!product) return '';
  if (Array.isArray(product.images) && product.images[0]) return product.images[0];
  return product.imageUrl || product.image || product.img || product.photo || product.picture || product.url || '';
}
function getAllProductImages(product) {
  if (!product) return [];
  if (Array.isArray(product.images) && product.images.length > 0) return product.images;
  const single = getProductImageUrl(product);
  return single ? [single] : [];
}
function image(product) {
  const url = getProductImageUrl(product);
  return url ? `<img src="${esc(url)}" alt="${esc(product.name)}">` : watchArt();
}
function populateCatalogFilters() {
  for (const [selector, values] of [['#brandFilter', db.products.map((p) => p.brand).filter(Boolean)], ['#colorFilter', db.products.flatMap((p) => p.colors || [])]]) {
    const control = $(selector), selected = control.value;
    control.innerHTML = `<option value="">${selector === '#brandFilter' ? 'All brands' : 'All colors'}</option>${[...new Set(values)].sort().map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('')}`;
    if ([...control.options].some((o) => o.value === selected)) control.value = selected;
  }
}

function renderProducts() {
  const query = $('#search').value.trim().toLowerCase();
  const category = $('#category').value;
  const brand = $('#brandFilter').value;
  const color = $('#colorFilter').value;
  const highlight = $('#highlights').value;
  const minPrice = Number($('#minPrice').value);
  const maxPrice = Number($('#maxPrice').value);
  const availability = $('#availability').value;
  const sort = $('#sort').value;
  const products = db.products.filter((p) => p.published !== false
    && (!query || `${p.name} ${p.brand} ${p.model}`.toLowerCase().includes(query))
    && (!category || p.categories?.includes(category))
    && (!brand || p.brand === brand)
    && (!color || p.colors?.includes(color))
    && (!highlight || (highlight === 'featured' ? p.featured : p.isNew))
    && (!$('#minPrice').value || p.price >= minPrice)
    && (!$('#maxPrice').value || p.price <= maxPrice)
    && (!availability || (availability === 'in' ? p.stock > 0 : p.stock <= 0)));
  if (sort === 'low') products.sort((a, b) => a.price - b.price);
  if (sort === 'high') products.sort((a, b) => b.price - a.price);
  if (sort === 'new') products.sort((a, b) => (b.created || 0) - (a.created || 0));
  if (sort === 'featured') products.sort((a, b) => Number(b.featured) - Number(a.featured));
  $('#products').innerHTML = products.slice(0, limit).map((p) => `
    <article class="product-card" data-id="${esc(p.id)}">
      <div class="product-image">${image(p)}${p.isNew ? '<span class="product-tag">New arrival</span>' : ''}${p.stock <= 0 ? '<span class="product-tag sold-tag">Sold out</span>' : ''}</div>
      <div class="product-info"><span class="brand-label">${esc(p.brand || 'Watch')}</span><h3>${esc(p.name)}</h3>
      <span class="model">${p.model ? `Model ${esc(p.model)}` : 'Details confirmed on request'}</span>
      <div class="product-bottom"><span class="price">${money(p.price)}${p.previousPrice && p.previousPrice > p.price ? ` <s class="old-price">${money(p.previousPrice)}</s>` : ''}</span><button class="quick-add" data-add="${esc(p.id)}" ${p.stock <= 0 ? 'disabled' : ''}>${p.stock > 0 ? 'Quick add +' : 'Unavailable'}</button></div></div>
    </article>`).join('');
  $('#empty').classList.toggle('hidden', products.length > 0);
  $('#loadMore').classList.toggle('hidden', products.length <= limit);
  $$('.product-card').forEach((el) => { el.onclick = (e) => { if (!e.target.closest('[data-add]')) openProduct(el.dataset.id); }; });
  $$('[data-add]').forEach((button) => { button.onclick = (e) => { e.stopPropagation(); add(button.dataset.add); }; });
}

function openProduct(id, updateUrl = true) {
  const product = db.products.find((p) => p.id === id);
  if (!product) return;
  if (updateUrl) history.pushState({}, '', `#product-${encodeURIComponent(id)}`);
  const specs = product.specs || {};
  const allImages = getAllProductImages(product);
  const thumbnails = allImages.length > 1 ? `<div class="detail-thumbnails">${allImages.map((src, i) => `<button type="button" data-thumb="${i}" aria-label="View image ${i + 1}"><img src="${esc(src)}" alt=""></button>`).join('')}</div>` : '';
  $('#productDetail').innerHTML = `<div class="product-detail"><div><div class="detail-image">${image(product)}</div>${thumbnails}</div><div class="detail-copy">
    <p class="eyebrow">${esc(product.brand || 'WATCH')} ${product.model ? `- ${esc(product.model)}` : ''}</p><h2>${esc(product.name)}</h2><b class="price">${money(p.price)}${product.previousPrice && product.previousPrice > product.price ? ` <s class="old-price">${money(product.previousPrice)}</s>` : ''}</b>
    <p>${esc(product.description || 'Contact us to confirm product details and availability.')}</p>
    <p>${product.stock > 0 ? `${product.stock} available in stock` : 'Currently unavailable'}${product.colors?.length ? ` - ${esc(product.colors.join(', '))}` : ''}</p>
    <dl>${Object.entries(specs).filter(([, v]) => v).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    <label>Color / variant <select id="detailColor">${product.colors?.length ? product.colors.map((color) => `<option value="${esc(color)}">${esc(color)}</option>`).join('') : '<option value="">Not specified</option>'}</select></label>
    <label>Quantity <select id="detailQty">${Array.from({ length: Math.min(20, product.stock) }, (_, i) => `<option>${i + 1}</option>`).join('')}</select></label>
    <div class="detail-actions"><button class="button button-dark" id="detailAdd" ${product.stock <= 0 ? 'disabled' : ''}>Add to cart</button><button class="button button-outline" id="detailWa" ${product.stock <= 0 ? 'disabled' : ''}>Order on WhatsApp</button></div>
    </div></div>`;
  $('#productModal').classList.remove('hidden');
  $('#overlay').classList.remove('hidden');
  $('#detailAdd')?.addEventListener('click', () => { add(id, Number($('#detailQty').value), $('#detailColor').value); closeModals(); });
  $('#detailWa')?.addEventListener('click', () => goWhatsApp(productMessage(product, Number($('#detailQty').value), $('#detailColor').value)));
  $$('[data-thumb]').forEach((button) => { button.onclick = () => { const imgEl = $('.detail-image img'); if (imgEl) imgEl.src = allImages[Number(button.dataset.thumb)] || ''; }; });
  const img = $('.detail-image img');
  if (img) img.onclick = () => img.classList.toggle('zoomed');
}

function add(id, quantity = 1, color) {
  const product = db.products.find((p) => p.id === id);
  if (!product || product.stock <= 0) return;
  if (color === undefined) color = product.colors?.[0] || '';
  const row = cart.find((x) => x.id === id && (x.color || '') === color);
  if (row) row.qty = Math.min(product.stock, row.qty + quantity);
  else cart.push({ id, color, qty: Math.min(product.stock, quantity) });
  save(); renderCart();
}
function changeQty(id, delta, color = '') {
  const row = cart.find((x) => x.id === id && (x.color || '') === color);
  const product = db.products.find((p) => p.id === id);
  if (!row || !product) return;
  row.qty = Math.min(product.stock, row.qty + delta);
  if (row.qty <= 0) cart = cart.filter((x) => x !== row);
  save(); renderCart();
}
function renderCart() {
  let subtotal = 0;
  const count = cart.reduce((sum, row) => sum + row.qty, 0);
  $('#cartCount').textContent = count;
  $('#drawerCount').textContent = `(${count})`;
  $('#cartItems').innerHTML = cart.map((row) => {
    const p = db.products.find((item) => item.id === row.id);
    if (!p) return '';
    subtotal += p.price * row.qty;
    const cartImgUrl = getProductImageUrl(p);
    return `<div class="cart-row"><div class="cart-thumb">${cartImgUrl ? `<img src="${esc(cartImgUrl)}" alt="" style="width:100%;height:100%;object-fit:cover">` : watchArt()}</div>
      <div><h3>${esc(p.name)}</h3><p>${money(p.price)}${p.model ? ` - ${esc(p.model)}` : ''}${row.color ? ` - ${esc(row.color)}` : ''}</p><div class="qty"><button data-qty="${p.id}" data-color="${esc(row.color || '')}" data-delta="-1">-</button><span>${row.qty}</span><button data-qty="${p.id}" data-color="${esc(row.color || '')}" data-delta="1">+</button></div></div>
      <button class="remove" data-remove="${p.id}" data-color="${esc(row.color || '')}">Remove</button></div>`;
  }).join('') || '<p class="muted">Your cart is waiting for a good watch.</p>';
  $('#subtotal').textContent = money(subtotal);
  updateCheckoutTotal();
  $$('[data-qty]').forEach((b) => { b.onclick = () => changeQty(b.dataset.qty, Number(b.dataset.delta), b.dataset.color); });
  $$('[data-remove]').forEach((b) => { b.onclick = () => { const row = cart.find((x) => x.id === b.dataset.remove && (x.color || '') === b.dataset.color); cart = cart.filter((x) => x !== row); save(); renderCart(); }; });
}
function productMessage(p, quantity = 1, color = '') {
  const url = `${location.href.split('#')[0]}#product-${encodeURIComponent(p.id)}`;
  return `Hello ${db.settings.name}! I would like to order the following watch:\n\nProduct: ${p.name}\nModel: ${p.model || 'Not listed'}\nPrice: ${money(p.price)}\nColor: ${color || 'Please advise'}\nQuantity: ${quantity}\nProduct Link: ${url}\n\nPlease confirm availability and delivery details.`;
}
function goWhatsApp(message) {
  const number = (db.settings.whatsapp || '').replace(/\D/g, '');
  if (!number || number.includes('X')) { alert('WhatsApp ordering is not configured yet. Please set your business number in Store Admin.'); return; }
  window.open(`https://wa.me/${number}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
}
function toggleCart(open) { $('#cartDrawer').classList.toggle('open', open); $('#overlay').classList.toggle('hidden', !open); }
function closeModals() {
  $('#productModal').classList.add('hidden'); $('#checkoutModal').classList.add('hidden'); $('#policyModal').classList.add('hidden');
  if (location.hash.startsWith('#product-')) history.replaceState({}, '', `${location.pathname}${location.search}`);
  if (!$('#cartDrawer').classList.contains('open')) $('#overlay').classList.add('hidden');
}
window.addEventListener('hashchange', () => {
  if (location.hash.startsWith('#product-')) openProduct(decodeURIComponent(location.hash.slice(9)), false);
  else if (!$('#productModal').classList.contains('hidden')) closeModals();
});
function checkoutPayload(d) {
  return { customer: { name: d.name, phone: d.phone, city: d.city, address: d.address, deliveryMethod: d.deliveryMethod || '', email: d.email || '', notes: d.notes || '' }, items: cart.map((x) => ({ productId: x.id, quantity: x.qty, color: x.color || '' })) };
}
function clearAfterOrder() { cart = []; save(); renderCart(); $('#checkoutForm').reset(); closeModals(); toggleCart(false); }

$('#searchToggle').onclick = () => { const wrap = $('#searchWrap'); wrap.classList.toggle('shown'); $('#search').focus(); };
$('#search').oninput = renderProducts;
$('#category').onchange = renderProducts;
$('#brandFilter').onchange = renderProducts;
$('#colorFilter').onchange = renderProducts;
$('#highlights').onchange = renderProducts;
$('#minPrice').oninput = renderProducts;
$('#maxPrice').oninput = renderProducts;
$('#availability').onchange = renderProducts;
$('#sort').onchange = renderProducts;
$('#clearFilters').onclick = (e) => { e.preventDefault(); $('#category').value = ''; $('#brandFilter').value = ''; $('#colorFilter').value = ''; $('#highlights').value = ''; $('#minPrice').value = ''; $('#maxPrice').value = ''; $('#availability').value = ''; $('#search').value = ''; renderProducts(); };
$('#loadMore').onclick = () => { limit += 8; renderProducts(); };
$('#cartOpen').onclick = () => toggleCart(true);
$('#cartClose').onclick = () => toggleCart(false);
$('#overlay').onclick = () => { toggleCart(false); closeModals(); };
$('#productClose').onclick = closeModals;
$('#checkoutClose').onclick = closeModals;
$('#clearCart').onclick = () => { cart = []; save(); renderCart(); };
$('#checkoutOpen').onclick = () => { if (!cart.length) return alert('Your cart is empty.'); $('#checkoutModal').classList.remove('hidden'); $('#overlay').classList.remove('hidden'); };
$('#deliveryMethod').onchange = updateCheckoutTotal;
$('#checkoutForm').onsubmit = (e) => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.currentTarget));
  const lines = cart.map((x) => { const p = db.products.find((y) => y.id === x.id); return p ? `${p.name}${p.model ? ` (${p.model})` : ""}${x.color ? ` - ${x.color}` : ""} - ${x.qty} x ${money(p.price)}\n${location.href.split('#')[0]}#product-${encodeURIComponent(p.id)}` : ""; }).filter(Boolean);
  goWhatsApp(`Hello ${db.settings.name}! I would like to request an order.\n\n${lines.join('\n')}\n\nItems total: ${money(cartSubtotal())}\nDelivery fee estimate: ${money(deliveryFee(d.deliveryMethod))}\nEstimated total: ${money(cartSubtotal() + deliveryFee(d.deliveryMethod))}\n\nName: ${d.name}\nPhone: ${d.phone}\nCity: ${d.city}\nDelivery address: ${d.address}\nDelivery method: ${d.deliveryMethod}\nEmail: ${d.email || 'Not provided'}\nNotes: ${d.notes || 'None'}\n\nPlease confirm availability and delivery details. I understand this request is pending confirmation.`);
};
$('#saveOrder').onclick = async () => {
  const form = $('#checkoutForm');
  if (!form.reportValidity()) return;
  const d = Object.fromEntries(new FormData(form));
  try {
    const response = await fetch('/api/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(checkoutPayload(d)) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not save order');
    alert(`Order request ${result.orderNumber} saved. The store will confirm availability and delivery with you.`);
    clearAfterOrder();
  } catch (err) { alert(err.message); }
};
const contactStore = (e) => { e.preventDefault(); goWhatsApp(`Hello ${db.settings.name}! I have a question about your watches.`); };
$('#footerWa').onclick = contactStore; $('#floatWa').onclick = contactStore;
$$('[data-policy]').forEach((link) => { link.onclick = (event) => {
  event.preventDefault();
  const key = link.dataset.policy;
  const titles = { deliveryPolicy: 'Delivery information', privacyPolicy: 'Privacy policy', terms: 'Terms and conditions' };
  const fallback = { deliveryPolicy: 'Please contact the store to confirm delivery options, fees, and coverage before ordering.', privacyPolicy: 'Details submitted for a saved order are stored in the store database and used to respond to and fulfill that order.', terms: 'Orders are requests pending confirmation by the store. No online payment is taken through this website.' };
  $('#policyTitle').textContent = titles[key];
  const areas = key === 'deliveryPolicy' && db.settings.deliveryAreas ? `Delivery areas: ${db.settings.deliveryAreas}\n\n` : '';
  const deliveryText = key === 'deliveryPolicy' ? `${db.settings.deliveryPolicy || fallback.deliveryPolicy}\n\nReturns: ${db.settings.returnPolicy || 'Please contact the store before ordering to confirm return terms.'}` : (db.settings[key] || fallback[key]);
  $('#policyContent').textContent = areas + deliveryText;
  $('#policyModal').classList.remove('hidden'); $('#overlay').classList.remove('hidden');
}; });
$('#policyClose').onclick = closeModals;
$('#menuToggle').onclick = () => $('#nav').classList.toggle('open');
$$('[data-filter]').forEach((x) => { x.onclick = () => { $('#category').value = x.dataset.filter; renderProducts(); }; });
$('#year').textContent = new Date().getFullYear();
function applySettings() {
  const name = db.settings.name || 'CH Watches';
  $$('.brand:not(.brand-footer) span:nth-child(2),.brand-footer span:nth-child(2)').forEach((e) => { e.innerHTML = `${esc(name.toUpperCase())}<small>YOUR TIME. YOUR STYLE.</small>`; });
  document.title = `${name} - Your Time. Your Style.`;
  if (db.settings.announcement) $('.announcement').textContent = db.settings.announcement;
  const instagram = $('#footerInstagram');
  instagram.href = db.settings.instagram || '#';
  instagram.classList.toggle('hidden', !db.settings.instagram);
  const email = $('#footerEmail');
  email.href = db.settings.email ? `mailto:${encodeURIComponent(db.settings.email)}` : '#';
  email.classList.toggle('hidden', !db.settings.email);
}
applySettings(); populateCatalogFilters(); renderProducts(); renderCart();
fetch('/api/store').then((r) => r.ok ? r.json() : null).then((remote) => {
  if (!remote) return;
  db = remote; applySettings(); populateCatalogFilters(); renderProducts(); renderCart();
  if (location.hash.startsWith('#product-')) openProduct(decodeURIComponent(location.hash.slice(9)), false);
}).catch(() => {});
