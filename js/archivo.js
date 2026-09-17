// archivo.js — todo lo que entra o sale del dispositivo como archivo .sqlite.

import { exportBytes, loadFromBytes, idbGet, idbSet } from './db.js';
import { setStatus } from './ui.js';

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
    }catch(err){ /* canceló o falló: sigue abajo */ }
  }
  const file = currentFile();
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url; a.download = file.name;
  a.click();
  URL.revokeObjectURL(url);
  setStatus("copia .sqlite descargada a tu dispositivo");
}

export function initArchivo(){
  loadHandle();

  document.getElementById("btn-export").addEventListener("click", guardarCopia);

  document.getElementById("file-import").addEventListener("change", async e=>{
    const file = e.target.files[0];
    if (!file) return;
    const buf = new Uint8Array(await file.arrayBuffer());
    await loadFromBytes(buf);
    setStatus(`archivo "${file.name}" importado y renderizado`);
  });

  document.getElementById("btn-share").addEventListener("click", async ()=>{
    const file = currentFile();
    if (navigator.canShare && navigator.canShare({ files:[file] })){
      try{
        await navigator.share({ files:[file], title:"Libro de mi negocio" });
        setStatus("compartido — elige Bluetooth, WiFi Direct, WhatsApp o correo en el panel del sistema");
      }catch(err){ setStatus("envío cancelado"); }
    } else {
      setStatus("este navegador no soporta compartir archivos: se descargó una copia para enviar manualmente");
      guardarCopia();
    }
  });
}
