// main.js

import { initDb, isUsingLocalEngine } from './db.js';
import { initTabs, setStatus } from './ui.js';
import { initDashboard, checkLocationMismatch } from './dashboard.js';
import { initInventario } from './inventario.js';
import { initCatalogo } from './catalogo.js';
import { initMovimientos } from './movimientos.js';
import { initCuentas } from './cuentas.js';
import { initArchivo } from './archivo.js';

async function start(){
  initTabs();

  initDashboard();
  initInventario();
  initCatalogo();
  initMovimientos();
  initCuentas();
  initArchivo();

  setStatus("cargando motor de base de datos…");
  await initDb();
  
  // Revisa si el navegador cambió de región o país para consultar al usuario
  checkLocationMismatch();

  setStatus(
    ('showSaveFilePicker' in window ? "escribe directo a un archivo en tu disco" : "guarda copias por descarga (normal en iPhone y Android)")
    + " · motor SQL: " + (isUsingLocalEngine() ? "local, funciona sin internet" : "cargado desde internet (CDN)")
  );
}

start();

if ('serviceWorker' in navigator){
  navigator.serviceWorker.register('./service-worker.js').then(reg => {
    if (reg.waiting && navigator.serviceWorker.controller) {
      document.getElementById('update-banner')?.classList.add('show');
    }

    reg.addEventListener('updatefound', () => {
      const nuevo = reg.installing;
      nuevo.addEventListener('statechange', () => {
        if (nuevo.state === 'installed' && navigator.serviceWorker.controller) {
          document.getElementById('update-banner')?.classList.add('show');
        }
      });
    });
  });

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });

  document.getElementById('update-reload')?.addEventListener('click', () => {
    navigator.serviceWorker.getRegistration().then(reg => {
      if (reg?.waiting) {
        reg.waiting.postMessage('SKIP_WAITING');
      } else {
        window.location.reload();
      }
    });
  });
}
