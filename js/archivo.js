// archivo.js — todo lo que entra o sale del dispositivo (.sqlite y .csv).

import { exportBytes, loadFromBytes, idbGet, idbSet, query } from './db.js';
import { setStatus, toLocalIsoDate } from './ui.js';

const HANDLE_KEY = "libro_file_handle";
const canUseRealFile = 'showSaveFilePicker' in window;
let fsHandle = null;

async function loadHandle(){
  if (!canUseRealFile) return;
  try{
    const h = await idbGet(HANDLE_KEY);
    if (h && (await h.queryPermission({mode:'readwrite'})) === 'granted') fsHandle = h;
  }catch(e){ /* este navegador no permite guardar el handle; seguimos con descarga */ }
}

function currentFile(){
  return new File([exportBytes()], "libro-negocio.sqlite", { type: "application/x-sqlite3" });
}

// Descarga directa a la carpeta de descargas del usuario
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
    }catch(err){ /* canceló o falló: sigue abajo con descarga normal */ }
  }
  descargarCopiaDirecta();
  setStatus("copia .sqlite descargada a tu dispositivo");
}

function exportarTodoCsv(){
  const movs = query(`
    SELECT t.fecha, t.tipo, t.categoria, COALESCE(p.nombre, '') AS producto,
           COALESCE(t.cantidad, '') AS cantidad, t.forma_pago, COALESCE(t.nota, '') AS nota, t.monto
    FROM transacciones t
    LEFT JOIN productos p ON p.id = t.producto_id
    ORDER BY t.fecha DESC, t.id DESC
  `);

  const inv = query(`SELECT nombre, precio, stock, stock_minimo FROM productos ORDER BY nombre ASC`);
  const ctas = query(`SELECT contacto, tipo, monto, COALESCE(vencimiento, '') AS vencimiento, estado FROM cuentas ORDER BY id DESC`);

  const escapeCell = val => `"${String(val ?? '').replace(/"/g, '""')}"`;
  const formatLine = arr => arr.map(escapeCell).join(";");

  const lines = [
    formatLine(["REPORTE CONSOLIDADO DE NEGOCIO — LIBRO", toLocalIsoDate()]),
    "",
    formatLine(["=== 1. VENTAS Y GASTOS ==="]),
    formatLine(["Fecha", "Tipo", "Categoría", "Producto", "Cantidad", "Forma de pago", "Descripción", "Monto"]),
    ...movs.map(r => formatLine([r.fecha, r.tipo, r.categoria, r.producto, r.cantidad, r.forma_pago, r.nota, r.monto])),
    "",
    formatLine(["=== 2. INVENTARIO DE PRODUCTOS ==="]),
    formatLine(["Producto", "Precio", "Stock Actual", "Stock Mínimo"]),
    ...inv.map(r => formatLine([r.nombre, r.precio, r.stock, r.stock_minimo])),
    "",
    formatLine(["=== 3. CUENTAS (POR COBRAR / PAGAR) ==="]),
    formatLine(["Contacto", "Tipo", "Monto", "Vencimiento", "Estado"]),
    ...ctas.map(r => formatLine([r.contacto, r.tipo === 'por_cobrar' ? 'Me deben' : 'Debo', r.monto, r.vencimiento, r.estado]))
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

export function initArchivo(){
  loadHandle();

  document.getElementById("btn-export").addEventListener("click", guardarCopia);

  const btnExportAllCsv = document.getElementById("btn-export-csv-all");
  if (btnExportAllCsv) {
    btnExportAllCsv.addEventListener("click", exportarTodoCsv);
  }

  document.getElementById("file-import").addEventListener("change", async e=>{
    const file = e.target.files[0];
    if (!file) return;
    const buf = new Uint8Array(await file.arrayBuffer());
    await loadFromBytes(buf);
    setStatus(`archivo "${file.name}" importado y renderizado`);
  });

  document.getElementById("btn-share").addEventListener("click", async ()=>{
    const file = currentFile();

    // 1. Si el navegador soporta compartir el archivo nativamente (ej: móviles)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: "Libro de mi negocio",
          text: "Copia de respaldo de Libro"
        });
        setStatus("compartido — archivo enviado desde el menú del sistema");
        return;
      } catch (err) {
        if (err.name === 'AbortError') {
          setStatus("envío cancelado");
          return;
        }
      }
    }

    // 2. Si no es compatible (navegador en PC / Linux / Windows):
    descargarCopiaDirecta();
    setStatus("copia 'libro-negocio.sqlite' lista en tus Descargas para transferir");

    alert(
      "📦 Copia lista para transferir\n\n" +
      "Se ha descargado el archivo 'libro-negocio.sqlite' a tu carpeta de Descargas.\n\n" +
      "Para pasarlo a tu otro dispositivo:\n" +
      "1. Envíate el archivo por WhatsApp Web, Telegram, correo o Drive.\n" +
      "2. En el otro dispositivo, abre Libro.\n" +
      "3. Toca 'Abrir copia' y selecciona 'libro-negocio.sqlite'.\n\n" +
      "¡Se sincronizará todo tu negocio con tus fotos y movimientos!"
    );
  });
}
