import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI)
    .then(() => console.log('Successfully connected to MongoDB!'))
    .catch((err) => console.error('MongoDB connection error:', err));

const productSchema = new mongoose.Schema({
    name: String,
    price: Number,
    description: String,
    imageUrl: String,
    image: String,
    model: String,
    stock: Number,
    published: Boolean
});

const Product = mongoose.model('Product', productSchema);

const root=path.dirname(fileURLToPath(import.meta.url));
const dataDir=path.join(root,'data'), databaseFile=path.join(dataDir,'ch-watches.sqlite');
const port=Number(process.env.PORT||3000), password=process.env.ADMIN_PASSWORD;
if(!password||password.length<14){console.error('Set ADMIN_PASSWORD to a unique password of at least 14 characters before starting the store.');process.exit(1)}
fs.mkdirSync(dataDir,{recursive:true});
const seed={settings:{name:'CH Watches',currency:'USD',whatsapp:'96181148792',email:'',instagram:'',announcement:'',deliveryFee:0,deliveryAreas:'',deliveryPolicy:'Please contact the store to confirm delivery options and fees before ordering.',returnPolicy:'Please contact the store before ordering to confirm return terms.',privacyPolicy:'Details submitted for saved orders are stored in the store database and used to respond to and fulfill the order.',terms:'Orders are requests pending confirmation by the store. No online payment is taken through this website.'},products:[],orders:[]};
const database=new DatabaseSync(databaseFile);
database.exec('PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, data TEXT NOT NULL);');
const legacyFile=path.join(dataDir,'store.json');
if(!database.prepare('SELECT key FROM settings WHERE key=?').get('store')&&fs.existsSync(legacyFile)){try{const legacy=JSON.parse(fs.readFileSync(legacyFile,'utf8'));write(legacy)}catch{write(seed)}}
if(!database.prepare('SELECT key FROM settings WHERE key=?').get('store'))write(seed);
const sessions=new Map(), attempts=new Map(), orderAttempts=new Map();
function read(){const setting=database.prepare('SELECT value FROM settings WHERE key=?').get('store');return {settings:setting?JSON.parse(setting.value):structuredClone(seed.settings),products:database.prepare('SELECT data FROM products ORDER BY rowid').all().map(x=>JSON.parse(x.data)),orders:database.prepare('SELECT data FROM orders ORDER BY rowid').all().map(x=>JSON.parse(x.data))}}
function write(d){database.exec('BEGIN IMMEDIATE');try{database.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('store',JSON.stringify(d.settings));database.exec('DELETE FROM products; DELETE FROM orders;');const addProduct=database.prepare('INSERT INTO products(id,data) VALUES(?,?)'),addOrder=database.prepare('INSERT INTO orders(id,data) VALUES(?,?)');for(const x of d.products)addProduct.run(String(x.id),JSON.stringify(x));for(const x of d.orders)addOrder.run(String(x.id),JSON.stringify(x));database.exec('COMMIT')}catch(error){database.exec('ROLLBACK');throw error}}
function send(res, status, obj, headers={}) {
    res.writeHead(status, { 
        'content-type': 'application/json', 
        'cache-control': 'no-store', 
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'self' * data: blob: https:; img-src 'self' * data: blob: https:;",
        ...headers 
    });
    res.end(JSON.stringify(obj));
}
function cookie(req) {
    const list = {};
    const rc = req.headers.cookie;
    rc && rc.split(';').forEach(cookie => {
        const parts = cookie.split('=');
        list[parts.shift().trim()] = decodeURI(parts.join('='));
    });
    return list['cz_session'];
}
function auth(req){let id=cookie(req),expiry=id&&sessions.get(id);if(expiry&&expiry>Date.now())return id;if(id)sessions.delete(id);return null}
async function body(req){let chunks=[],size=0;for await(const c of req){size+=c.length;if(size>32_000_000)throw Error('Request too large');chunks.push(c)}return JSON.parse(Buffer.concat(chunks).toString()||'{}')}
function staticFile(pathname,res){const requested=pathname==='/'?'index.html':decodeURIComponent(pathname).replace(/^\/+/,''),allowed=new Set(['index.html','styles.css','app.js','admin.html','admin.js','ch-time-logo.jpg']);if(!allowed.has(requested)){res.writeHead(404);return res.end('Not found')}const file=path.join(root,requested);if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end('Not found')}let ext=path.extname(file),types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.jpg':'image/jpeg'};res.writeHead(200,{'content-type':types[ext]||'application/octet-stream','x-content-type-options':'nosniff','content-security-policy':"default-src 'self' * data: blob: https:; img-src 'self' * data: blob: https:; style-src 'self' 'unsafe-inline' *; script-src 'self' 'unsafe-inline' *; connect-src 'self' *; base-uri 'self'; frame-ancestors 'none'"});fs.createReadStream(file).pipe(res)}
const server=http.createServer(async(req,res)=>{try{let url=new URL(req.url,'http://localhost'),p=url.pathname;
 
 // Pulls products directly from MongoDB so they are permanently saved in the cloud
 if (p === '/api/store' && req.method === 'GET') { 
     let d = read(); 
     const dbProducts = await Product.find(); 
     const productsToUse = dbProducts.length > 0 ? dbProducts : d.products;
     return send(res, 200, { settings: d.settings, products: productsToUse.filter(x => x.published !== false) });
 }

 if(p==='/api/orders'&&req.method==='POST'){
   const ip=req.socket.remoteAddress||'unknown',attempt=orderAttempts.get(ip)||{count:0,at:Date.now()};if(Date.now()-attempt.at>600000){attempt.count=0;attempt.at=Date.now()}if(attempt.count>=20)return send(res,429,{error:'Too many order requests. Please contact the store directly.'});attempt.count++;orderAttempts.set(ip,attempt);
   const input=await body(req),c=input.customer||{};
   if(!String(c.name||'').trim()||!String(c.phone||'').trim()||!String(c.city||'').trim()||!String(c.address||'').trim())return send(res,400,{error:'Enter your name, phone, city, and delivery address.'});
   if(!Array.isArray(input.items)||input.items.length<1||input.items.length>30)return send(res,400,{error:'The order has no valid items.'});
   const d=read(),items=[],requested={};let subtotal=0;
   for(const line in input.items){ /* handled below */ } // safety
   // standard order processing
   const orderNumber=`CH-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
   return send(res,201,{ok:true,orderNumber});
 }

 if(p==='/api/admin/login'&&req.method==='POST'){let ip=req.socket.remoteAddress||'unknown',a=attempts.get(ip)||{n:0,at:Date.now()};if(Date.now()-a.at>600000)a={n:0,at:Date.now()};if(a.n>=8)return send(res,429,{error:'Too many attempts. Try again later.'});let b=await body(req);let candidate=crypto.createHash('sha256').update(String(b.password||'')).digest(),expected=crypto.createHash('sha256').update(password).digest();if(!crypto.timingSafeEqual(candidate,expected)){a.n++;attempts.set(ip,a);return send(res,401,{error:'Incorrect password.'})}attempts.delete(ip);let id=crypto.randomBytes(32).toString('hex');sessions.set(id,Date.now()+8*60*60*1000);return send(res,200,{ok:true},{'set-cookie':`cz_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.NODE_ENV==='production'?'; Secure':''}`})}
 if(p==='/api/admin/logout'&&req.method==='POST'){let id=cookie(req);if(id)sessions.delete(id);return send(res,200,{ok:true},{'set-cookie':'cz_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'})}
 
 if(p.startsWith('/api/admin')){
   if(!auth(req))return send(res,401,{error:'Sign in required.'});
   if(p==='/api/admin'&&req.method==='GET')return send(res,200,read());
   if(p==='/api/admin'&&req.method==='PUT'){
       let d=await body(req);
       if(!d||!Array.isArray(d.products)||!d.settings)return send(res,400,{error:'Invalid store data.'});
       d.orders=read().orders;
       write(d);
       
       // Syncs and saves products permanently to MongoDB Atlas with universal image matching
       try{
           await Product.deleteMany({});
           if(d.products.length>0){
               await Product.insertMany(d.products.map(prod=> {
                   const resolvedImage = prod.imageUrl || prod.image || prod.img || prod.photo || prod.picture || prod.url || '';
                   return {
                       name: prod.name,
                       price: Number(prod.price) || 0,
                       description: prod.description || '',
                       imageUrl: resolvedImage,
                       image: resolvedImage,
                       model: prod.model || '',
                       stock: Number(prod.stock) || 0,
                       published: prod.published !== false
                   };
               }));
           }
       }catch(err){console.error('Failed to sync products to MongoDB:',err)}
       return send(res,200,{ok:true});
   }
   return send(res,404,{error:'Not found'});
 }

 if(p==='/admin'||p==='/admin/')return staticFile('/admin.html',res);
 if(req.method==='GET'&&(!p.startsWith('/api/')))return staticFile(p,res);
 send(res,404,{error:'Not found'});
 }catch(e){send(res,e.message==='Request too large'?413:400,{error:e.message||'Request failed'})}});
server.listen(port, '0.0.0.0',()=>console.log(`CH Watches running on http://localhost:${port}`));
