import { initDb, isUsingLocalEngine } from './db.js';
import { initTabs, setStatus } from './ui.js';
import { initDashboard } from './dashboard.js';
import { initInventario } from './inventario.js';
import { initCatalogo } from './catalogo.js';
import { initMovimientos } from './movimientos.js';
import { initCuentas } from './cuentas.js';
import { initArchivo } from './archivo.js';

async function start(){
  initTabs();

  // Cada módulo se suscribe al evento 'libro:changed' y se pinta
  // automáticamente cuando la base de datos emite cambios.
  initDashboard();
  initInventario();
  initCatalogo();
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

// ---------- Service Worker: offline y aviso de nueva versión ----------
if ('serviceWorker' in navigator){
  navigator.serviceWorker.register('./service-worker.js').then(reg => {
    // Si ya había uno esperando activación antes de abrir la página
    if (reg.waiting && navigator.serviceWorker.controller) {
      document.getElementById('update-banner')?.classList.add('show');
    }

    reg.addEventListener('updatefound', () => {
      const nuevo = reg.installing;
      nuevo.addEventListener('statechange', () => {
        if (nuevo.state === 'installed' && navigator.serviceWorker.controller) {
          // Hay una versión nueva descargada esperando activarse
          document.getElementById('update-banner')?.classList.add('show');
        }
      });
    });
  });

  // Cuando el nuevo SW tome el control, recargamos la página limpia
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });

  const btnReload = document.getElementById('update-reload');
  if (btnReload) {
    btnReload.addEventListener('click', () => {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (reg?.waiting) {
          reg.waiting.postMessage('SKIP_WAITING');
        } else {
          window.location.reload();
        }
      });
    });
  }
}
