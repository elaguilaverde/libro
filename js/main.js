import { initDb, isUsingLocalEngine } from './db.js';
import { initTabs, setStatus } from './ui.js';
import { initDashboard } from './dashboard.js';
import { initInventario } from './inventario.js';
import { initMovimientos } from './movimientos.js';
import { initCuentas } from './cuentas.js';
import { initArchivo } from './archivo.js';

async function start(){
  initTabs();
  // Cada módulo se suscribe al evento 'libro:changed' y se pinta solo
  // cuando la base de datos cambia (ver db.js → commit()).
  initDashboard();
  initInventario();
  initMovimientos();
  initCuentas();
  initArchivo();

  setStatus("cargando motor de base de datos…");
  await initDb();
  setStatus(
    ('showSaveFilePicker' in window ? "escribe directo a un archivo en tu disco" : "guarda copias por descarga (normal en iPhone y Android)")
    + " · motor SQL: " + (isUsingLocalEngine() ? "local, funciona sin internet" : "cargado desde internet (CDN)")
  );
}

start();

// ---------- Service Worker: habilita el uso offline y avisa cuando hay una versión nueva ----------
if ('serviceWorker' in navigator){
  navigator.serviceWorker.register('./service-worker.js').then(reg=>{
    reg.addEventListener('updatefound', ()=>{
      const nuevo = reg.installing;
      nuevo.addEventListener('statechange', ()=>{
        if (nuevo.state === 'installed' && navigator.serviceWorker.controller){
          // Hay una versión nueva ya descargada y lista, esperando activarse.
          document.getElementById('update-banner').classList.add('show');
        }
      });
    });
  });

  document.getElementById('update-reload').addEventListener('click', ()=>{
    navigator.serviceWorker.getRegistration().then(reg=>{
      reg.waiting?.postMessage('SKIP_WAITING');
      location.reload();
    });
  });
}
