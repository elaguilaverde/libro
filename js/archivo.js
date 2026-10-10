// archivo.js — entrada y salida del dispositivo (.sqlite y .csv)

import { exportBytes, loadFromBytes, idbGet, idbSet, query, getConfig } from './db.js';
import { setStatus, toLocalIsoDate } from './ui.js';

const HANDLE_KEY = "libro_file_handle";
const canUseRealFile = 'showSaveFilePicker' in window;
let fsHandle = null;

function esDispositivoMovil(){
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || 
         (navigator.maxTouchPoints > 0 && window.innerWidth < 1024);
}

async function loadHandle(){
  if (!canUseRealFile) return;
  try{
    const h = await idbGet(HANDLE_KEY);
    if (h && (await h.queryPermission({mode:'readwrite'})) === 'granted') fsHandle = h;
  }catch(e){ /* fallback a descarga */ }
}

function currentFile(){
  return new File([exportBytes()], "libro-negocio.sqlite", { type: "application/x-sqlite3" });
}

function descargarCopiaDirecta(){
  const file = currentFile();
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function guardarCopia(){
  if (canUseRealFile){
    try{
      if (!fsHandle){
        fsHandle = await window.showSaveFilePicker({
          suggestedName: "libro-negocio.sqlite",
          types: [{ description:"Base de datos SQLite", accept:{"application/x-sqlite3":[".sqlite"]} }]
        });
        try{ await idbSet(HANDLE_KEY, fsHandle); }catch(e){}
      }
      if ((await fsHandle.requestPermission({mode:'readwrite'})) !== 'granted') throw new Error('permiso denegado');
      const writable = await fsHandle.createWritable();
      await writable.write(exportBytes());
      await writable.close();
      setStatus("archivo actualizado directamente en tu disco (mismo archivo cada vez)");
      return;
    }catch(err){}
  }
  descargarCopiaDirecta();
  setStatus("copia .sqlite descargada a tu dispositivo");
}

function exportarTodoCsv(){
  const mainCur = getConfig('moneda_principal') || 'USD';

  const movs = query(`
    SELECT t.fecha, t.tipo, t.categoria, COALESCE(p.nombre, '') AS producto,
           COALESCE(t.cantidad, '') AS cantidad, t.forma_pago, COALESCE(t.nota, '') AS nota, t.monto, COALESCE(t.moneda, '${mainCur}') AS moneda
    FROM transacciones t
    LEFT JOIN productos p ON p.id = t.producto_id
    ORDER BY t.fecha DESC, t.id DESC
  `);

  const inv = query(`SELECT nombre, precio, COALESCE(moneda, '${mainCur}') AS moneda, stock, stock_minimo FROM productos ORDER BY nombre ASC`);
  const ctas = query(`SELECT contacto, tipo, monto, COALESCE(moneda, '${mainCur}') AS moneda, COALESCE(vencimiento, '') AS vencimiento, estado FROM cuentas ORDER BY id DESC`);

  const escapeCell = val => `"${String(val ?? '').replace(/"/g, '""')}"`;
  const formatLine = arr => arr.map(escapeCell).join(";");

  const lines = [
    formatLine(["REPORTE CONSOLIDADO DE NEGOCIO — LIBRO", toLocalIsoDate()]),
    "",
    formatLine(["=== 1. VENTAS Y GASTOS ==="]),
    formatLine(["Fecha", "Tipo", "Categoría", "Producto", "Cantidad", "Forma de pago", "Descripción", "Monto", "Moneda"]),
    ...movs.map(r => formatLine([r.fecha, r.tipo, r.categoria, r.producto, r.cantidad, r.forma_pago, r.nota, r.monto, r.moneda])),
    "",
    formatLine(["=== 2. INVENTARIO DE PRODUCTOS ==="]),
    formatLine(["Producto", "Precio", "Moneda", "Stock Actual", "Stock Mínimo"]),
    ...inv.map(r => formatLine([r.nombre, r.precio, r.moneda, r.stock, r.stock_minimo])),
    "",
    formatLine(["=== 3. CUENTAS (POR COBRAR / PAGAR) ==="]),
    formatLine(["Contacto", "Tipo", "Monto", "Moneda", "Vencimiento", "Estado"]),
    ...ctas.map(r => formatLine([r.contacto, r.tipo === 'por_cobrar' ? 'Me deben' : 'Debo', r.monto, r.moneda, r.vencimiento, r.estado]))
  ];

  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `libro_completo_${toLocalIsoDate()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  setStatus("reporte completo exportado a CSV exitosamente");
}

function abrirModalOpciones(){
  const modal = document.getElementById("modal-share");
  if (!modal) return;

  const esMovil = esDispositivoMovil();
  const btnWa = document.getElementById("share-opt-wa");
  const btnTg = document.getElementById("share-opt-tg");
  const btnBt = document.getElementById("share-opt-bt");
  const btnNative = document.getElementById("share-opt-native");
  const instruccion = document.getElementById("share-instruccion");

  if (esMovil) {
    if (btnNative) btnNative.style.display = "block";
    if (btnBt) btnBt.style.display = "block";
    if (btnWa) btnWa.textContent = "💬 Abrir app de WhatsApp";
    if (btnTg) btnTg.textContent = "✈️ Abrir app de Telegram";
    if (instruccion) {
      instruccion.innerHTML = "💡 <strong>En tu celular:</strong> Puedes usar el menú del sistema (para Bluetooth o Quick Share) o abrir directamente tus aplicaciones instaladas.";
    }
  } else {
    if (btnNative) btnNative.style.display = "none";
    if (btnBt) btnBt.style.display = "none";
    if (btnWa) btnWa.textContent = "💬 Enviar por WhatsApp Web";
    if (btnTg) btnTg.textContent = "✈️ Enviar por Telegram Web";
    if (instruccion) {
      instruccion.innerHTML = "💡 <strong>En PC:</strong> Se descargará el archivo y se abrirá WhatsApp Web o Telegram Web en tu navegador para que lo arrastres a tu chat.";
    }
  }

  modal.classList.add("open");
}

function cerrarModalOpciones(){
  const modal = document.getElementById("modal-share");
  if (modal) modal.classList.remove("open");
}

async function intentarCompartirNativo(){
  if (!navigator.share) return false;
  const bytes = exportBytes();

  try {
    const fileSqlite = new File([bytes], "libro-negocio.sqlite", { type: "application/x-sqlite3" });
    if (!navigator.canShare || navigator.canShare({ files: [fileSqlite] })) {
      await navigator.share({ files: [fileSqlite], title: "Libro de mi negocio" });
      setStatus("compartido desde el menú del celular");
      return true;
    }
  } catch(e) {
    if (e.name === 'AbortError') return true;
  }

  try {
    const fileTxt = new File([bytes], "libro-negocio.txt", { type: "text/plain" });
    await navigator.share({ files: [fileTxt], title: "Libro de mi negocio" });
    setStatus("compartido desde el menú del celular");
    return true;
  } catch(e) {
    if (e.name === 'AbortError') return true;
  }

  return false;
}

export function initArchivo(){
  loadHandle();

  document.getElementById("btn-export").addEventListener("click", guardarCopia);
  document.getElementById("btn-export-csv-all")?.addEventListener("click", exportarTodoCsv);

  document.getElementById("file-import").addEventListener("change", async e=>{
    const file = e.target.files[0];
    if (!file) return;
    const buf = new Uint8Array(await file.arrayBuffer());
    await loadFromBytes(buf);
    setStatus(`archivo "${file.name}" importado y renderizado`);
  });

  document.getElementById("btn-share").addEventListener("click", async ()=>{
    if (esDispositivoMovil()) {
      const compartido = await intentarCompartirNativo();
      if (compartido) return;
    }
    abrirModalOpciones();
  });

  document.getElementById("modal-share-close")?.addEventListener("click", cerrarModalOpciones);

  document.getElementById("share-opt-native")?.addEventListener("click", async () => {
    cerrarModalOpciones();
    await intentarCompartirNativo();
  });

  document.getElementById("share-opt-wa")?.addEventListener("click", () => {
    descargarCopiaDirecta();
    if (esDispositivoMovil()) {
      window.location.href = "whatsapp://send?text=" + encodeURIComponent("Copia de respaldo de Libro");
    } else {
      window.open("https://web.whatsapp.com", "_blank");
    }
    setStatus("descargado — listo para enviar por WhatsApp");
  });

  document.getElementById("share-opt-tg")?.addEventListener("click", () => {
    descargarCopiaDirecta();
    if (esDispositivoMovil()) {
      window.location.href = "tg://msg?text=" + encodeURIComponent("Copia de respaldo de Libro");
    } else {
      window.open("https://web.telegram.org", "_blank");
    }
    setStatus("descargado — listo para enviar por Telegram");
  });

  document.getElementById("share-opt-bt")?.addEventListener("click", () => {
    descargarCopiaDirecta();
    alert(
      "🔵 Para enviar por Bluetooth:\n\n" +
      "1. Ya se descargó 'libro-negocio.sqlite' en tu celular.\n" +
      "2. Baja la barra de notificaciones y toca la descarga completada (o entra a tu carpeta Descargas).\n" +
      "3. Toca 'Compartir' y elige 'Bluetooth' o 'Quick Share'.\n" +
      "4. En el otro dispositivo, abre Libro y presiona 'Abrir copia'."
    );
    setStatus("archivo listo en Descargas para enviar por Bluetooth");
  });

  document.getElementById("share-opt-descargar")?.addEventListener("click", () => {
    descargarCopiaDirecta();
    setStatus("copia descargada");
  });
}
