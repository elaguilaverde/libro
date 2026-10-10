// db.js — todo lo relacionado a almacenar y consultar datos.

export let db = null;
const DB_KEY = "libro_sqlite_bytes";
let SQL;
let usingLocalSqlJs = false;

export function isUsingLocalEngine(){ return usingLocalSqlJs; }

// ---------- IndexedDB ----------
function idbOpen(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open("libro_db", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("kv");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGet(key){
  const conn = await idbOpen();
  return new Promise((resolve, reject)=>{
    const tx = conn.transaction("kv", "readonly").objectStore("kv").get(key);
    tx.onsuccess = () => resolve(tx.result);
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbSet(key, val){
  const conn = await idbOpen();
  return new Promise((resolve, reject)=>{
    const tx = conn.transaction("kv", "readwrite").objectStore("kv").put(val, key);
    tx.onsuccess = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- Cargar motor SQL ----------
function loadScriptTag(src){
  return new Promise((resolve, reject)=>{
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('no se pudo cargar ' + src));
    document.head.appendChild(s);
  });
}

async function loadSqlEngine(){
  try{
    await loadScriptTag('./vendor/sql-wasm.js');
    usingLocalSqlJs = true;
  }catch(e){
    await loadScriptTag('https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js');
    usingLocalSqlJs = false;
  }
}

// ---------- Detección de moneda local sin internet ----------
export function detectClientCurrency(){
  try {
    const lang = navigator.language || navigator.languages?.[0] || 'es-UY';
    const parts = lang.split('-');
    const country = (parts.length > 1 ? parts[parts.length - 1] : parts[0]).toUpperCase();
    const map = {
      UY: 'UYU', AR: 'ARS', US: 'USD', ES: 'EUR', MX: 'MXN',
      CL: 'CLP', CO: 'COP', BR: 'BRL', PE: 'PEN', PY: 'PYG',
      BO: 'BOB', EC: 'USD', PA: 'USD', VE: 'VES', GT: 'GTQ',
      CR: 'CRC', DO: 'DOP', DE: 'EUR', FR: 'EUR', IT: 'EUR',
      GB: 'GBP', CA: 'CAD'
    };
    return map[country] || 'USD';
  } catch(e) {
    return 'USD';
  }
}

// ---------- Configuración Key-Value en SQLite ----------
export function getConfig(key){
  if (!db) return null;
  const res = query("SELECT valor FROM config WHERE clave = ?", [key]);
  return res[0]?.valor || null;
}

export async function setConfig(key, val){
  if (!db) return;
  rawRun("INSERT OR REPLACE INTO config(clave, valor) VALUES (?, ?)", [key, val]);
  await commit();
}

// ---------- Migraciones de esquema ----------
function migrate(){
  db.run(`CREATE TABLE IF NOT EXISTS config (clave TEXT PRIMARY KEY, valor TEXT)`);

  const tCols = query("PRAGMA table_info(transacciones)").map(c => c.name);
  if (!tCols.includes('producto_id')) db.run("ALTER TABLE transacciones ADD COLUMN producto_id INTEGER");
  if (!tCols.includes('cantidad')) db.run("ALTER TABLE transacciones ADD COLUMN cantidad REAL");
  if (!tCols.includes('forma_pago')) db.run("ALTER TABLE transacciones ADD COLUMN forma_pago TEXT DEFAULT 'efectivo'");
  if (!tCols.includes('moneda')) db.run("ALTER TABLE transacciones ADD COLUMN moneda TEXT");

  const pCols = query("PRAGMA table_info(productos)").map(c => c.name);
  if (!pCols.includes('moneda')) db.run("ALTER TABLE productos ADD COLUMN moneda TEXT");

  const cCols = query("PRAGMA table_info(cuentas)").map(c => c.name);
  if (!cCols.includes('moneda')) db.run("ALTER TABLE cuentas ADD COLUMN moneda TEXT");

  db.run(`
    CREATE TABLE IF NOT EXISTS catalogo(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT,
      precio REAL,
      descripcion TEXT,
      foto TEXT,
      moneda TEXT
    );
  `);

  const catCols = query("PRAGMA table_info(catalogo)").map(c => c.name);
  if (!catCols.includes('moneda')) db.run("ALTER TABLE catalogo ADD COLUMN moneda TEXT");

  // Si no hay moneda principal guardada, detectamos la local del usuario
  let mainCur = getConfig('moneda_principal');
  if (!mainCur) {
    mainCur = detectClientCurrency();
    db.run("INSERT OR REPLACE INTO config(clave, valor) VALUES ('moneda_principal', ?)", [mainCur]);
  }

  // Registros antiguos sin moneda asignada se asocian a la principal
  db.run("UPDATE transacciones SET moneda = ? WHERE moneda IS NULL OR moneda = ''", [mainCur]);
  db.run("UPDATE productos SET moneda = ? WHERE moneda IS NULL OR moneda = ''", [mainCur]);
  db.run("UPDATE cuentas SET moneda = ? WHERE moneda IS NULL OR moneda = ''", [mainCur]);
  db.run("UPDATE catalogo SET moneda = ? WHERE moneda IS NULL OR moneda = ''", [mainCur]);
}

export async function initDb(){
  await loadSqlEngine();
  SQL = await window.initSqlJs({
    locateFile: f => usingLocalSqlJs ? `./vendor/${f}` : `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${f}`
  });
  const saved = await idbGet(DB_KEY);
  if (saved) {
    db = new SQL.Database(new Uint8Array(saved));
  } else {
    db = new SQL.Database();
    db.run(`
      CREATE TABLE config(clave TEXT PRIMARY KEY, valor TEXT);
      CREATE TABLE transacciones(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha TEXT,
        tipo TEXT,
        categoria TEXT,
        nota TEXT,
        monto REAL,
        producto_id INTEGER,
        cantidad REAL,
        forma_pago TEXT DEFAULT 'efectivo',
        moneda TEXT
      );
      CREATE TABLE productos(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT,
        precio REAL,
        stock INTEGER,
        stock_minimo INTEGER,
        moneda TEXT
      );
      CREATE TABLE cuentas(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contacto TEXT,
        tipo TEXT,
        monto REAL,
        vencimiento TEXT,
        estado TEXT DEFAULT 'pendiente',
        moneda TEXT
      );
      CREATE TABLE catalogo(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT,
        precio REAL,
        descripcion TEXT,
        foto TEXT,
        moneda TEXT
      );
    `);
  }
  migrate();
  await commit();
}

export async function loadFromBytes(bytes){
  db = new SQL.Database(bytes);
  migrate();
  await commit();
}

async function persist(){
  if (!db) return;
  const bytes = db.export();
  await idbSet(DB_KEY, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

export function query(sql, params=[]){
  if (!db) return [];
  const res = db.exec(sql, params);
  if (!res.length) return [];
  const [{columns, values}] = res;
  return values.map(row => Object.fromEntries(row.map((v,i)=>[columns[i],v])));
}

export function rawRun(sql, params=[]){
  if (!db) return;
  db.run(sql, params);
}

export async function commit(){
  await persist();
  document.dispatchEvent(new Event('libro:changed'));
}

export async function exec(sql, params=[]){
  rawRun(sql, params);
  await commit();
}

export function exportBytes(){
  return db ? db.export() : new Uint8Array();
}

// ---------- Conversión universal de una moneda a otra en todas las tablas ----------
export async function convertCurrency(fromCur, toCur, rate){
  if (!fromCur || !toCur || !rate || rate <= 0) return;
  rawRun("UPDATE transacciones SET monto = ROUND(monto * ?, 2), moneda = ? WHERE moneda = ?", [rate, toCur, fromCur]);
  rawRun("UPDATE cuentas SET monto = ROUND(monto * ?, 2), moneda = ? WHERE moneda = ?", [rate, toCur, fromCur]);
  rawRun("UPDATE productos SET precio = ROUND(precio * ?, 2), moneda = ? WHERE moneda = ?", [rate, toCur, fromCur]);
  rawRun("UPDATE catalogo SET precio = ROUND(precio * ?, 2), moneda = ? WHERE moneda = ?", [rate, toCur, fromCur]);
  await commit();
}
