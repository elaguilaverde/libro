// db.js — todo lo relacionado a almacenar y consultar datos.
// Ningún otro módulo debería tocar IndexedDB o sql.js directamente: pasan por acá.

export let db = null;
const DB_KEY = "libro_sqlite_bytes";
let SQL;
let usingLocalSqlJs = false;

export function isUsingLocalEngine(){ return usingLocalSqlJs; }

// ---------- IndexedDB (clave-valor simple) ----------
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
    const tx = conn.transaction("kv","readonly").objectStore("kv").get(key);
    tx.onsuccess = () => resolve(tx.result);
    tx.onerror = () => reject(tx.error);
  });
}
export async function idbSet(key, val){
  const conn = await idbOpen();
  return new Promise((resolve, reject)=>{
    const tx = conn.transaction("kv","readwrite").objectStore("kv").put(val, key);
    tx.onsuccess = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- Cargar el motor SQL: local primero, CDN como respaldo ----------
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

// ---------- Migraciones (para bases guardadas con un esquema más viejo) ----------
function migrate(){
  const cols = query("PRAGMA table_info(transacciones)").map(c => c.name);
  if (!cols.includes('producto_id')) db.run("ALTER TABLE transacciones ADD COLUMN producto_id INTEGER");
  if (!cols.includes('cantidad')) db.run("ALTER TABLE transacciones ADD COLUMN cantidad REAL");
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
      CREATE TABLE transacciones(id INTEGER PRIMARY KEY AUTOINCREMENT, fecha TEXT, tipo TEXT, categoria TEXT, nota TEXT, monto REAL, producto_id INTEGER, cantidad REAL);
      CREATE TABLE productos(id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT, precio REAL, stock INTEGER, stock_minimo INTEGER);
      CREATE TABLE cuentas(id INTEGER PRIMARY KEY AUTOINCREMENT, contacto TEXT, tipo TEXT, monto REAL, vencimiento TEXT, estado TEXT DEFAULT 'pendiente');
    `);
  }
  migrate();
  await commit();
}

// Reemplaza la base actual por una importada desde un archivo .sqlite
export async function loadFromBytes(bytes){
  db = new SQL.Database(bytes);
  migrate();
  await commit();
}

async function persist(){
  const bytes = db.export();
  await idbSet(DB_KEY, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

// ---------- Lectura / escritura ----------
export function query(sql, params=[]){
  const res = db.exec(sql, params);
  if (!res.length) return [];
  const [{columns, values}] = res;
  return values.map(row => Object.fromEntries(row.map((v,i)=>[columns[i],v])));
}

// Ejecuta sin guardar todavía — útil para agrupar varios pasos (ej: insertar
// una venta + descontar stock) y guardar/avisar una sola vez con commit().
export function rawRun(sql, params=[]){ db.run(sql, params); }

// Guarda en IndexedDB y avisa a todos los módulos que algo cambió,
// para que cada uno se repinte solo (patrón publicar/suscribir).
export async function commit(){
  await persist();
  document.dispatchEvent(new Event('libro:changed'));
}

// Atajo para el caso común: una sola sentencia + guardar + avisar.
export async function exec(sql, params=[]){
  rawRun(sql, params);
  await commit();
}

export function exportBytes(){ return db.export(); }
