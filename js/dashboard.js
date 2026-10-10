// dashboard.js — lectura y métricas multimoneda del resumen

import { db, query, getConfig, setConfig, convertCurrency, detectClientCurrency } from './db.js';
import { money, getDateRangePreset, getMonedasOptionsHtml } from './ui.js';

let currentPreset = 'mes';
let filterDesde = '';
let filterHasta = '';
let convertingCurrency = null;

const PRESET_LABELS = {
  hoy: 'hoy',
  semana: 'esta semana',
  mes: 'este mes',
  todo: 'todo el historial',
  custom: 'período seleccionado'
};

function formatPago(p){
  const map = {
    efectivo: 'Efectivo',
    transferencia: 'Transferencia',
    tarjeta_debito: 'T. Débito',
    tarjeta_credito: 'T. Crédito',
    otro: 'Otro'
  };
  return map[p] || (p ? p : 'Efectivo');
}

function updatePresetButtons(){
  document.querySelectorAll("#dash-presets button").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.period === currentPreset);
  });
}

function updateLabels(){
  const etiqueta = PRESET_LABELS[currentPreset] || 'período';
  const lblIng = document.getElementById("lbl-ing");
  const lblGas = document.getElementById("lbl-gas");
  const lblUtil = document.getElementById("lbl-util");
  if (lblIng) lblIng.textContent = `Ingresos (${etiqueta})`;
  if (lblGas) lblGas.textContent = `Gastos (${etiqueta})`;
  if (lblUtil) lblUtil.textContent = `Utilidad (${etiqueta})`;
}

// Renderiza un bloque de métricas considerando una o múltiples monedas
function renderMetricHtml(amountsByCurrency, isNet = false){
  const mainCur = getConfig('moneda_principal') || 'USD';
  const keys = Object.keys(amountsByCurrency);

  if (keys.length === 0) {
    return money(0, mainCur);
  }

  // Ordenar para que la moneda principal siempre aparezca primero
  const sorted = [mainCur, ...keys.filter(k => k !== mainCur)].filter(k => keys.includes(k));

  if (sorted.length === 1) {
    const k = sorted[0];
    return money(amountsByCurrency[k] || 0, k);
  }

  // Si hay más de una moneda, renderizamos el desglose ordenado
  return `<div class="metric-multicurrency">${sorted.map(k => `
    <div class="metric-subrow ${isNet && (amountsByCurrency[k] < 0) ? 'neg' : ''}">
      <span>${k}:</span>
      <strong>${money(amountsByCurrency[k] || 0)}</strong>
    </div>
  `).join("")}</div>`;
}

function render(){
  if (!db) return;

  const mainCur = getConfig('moneda_principal') || 'USD';

  // 1. Selector de moneda principal y selector en formularios
  const selMain = document.getElementById("sel-main-currency");
  if (selMain) {
    selMain.innerHTML = getMonedasOptionsHtml(mainCur);
  }

  document.querySelectorAll(".currency-select-live").forEach(sel => {
    if (!sel.dataset.userEdited) {
      sel.innerHTML = getMonedasOptionsHtml(sel.value || mainCur);
    }
  });

  // 2. Filtro dinámico de fechas
  let dateClause = "";
  let params = [];

  if (filterDesde && filterHasta) {
    dateClause = " AND fecha BETWEEN ? AND ?";
    params = [filterDesde, filterHasta];
  } else if (filterDesde) {
    dateClause = " AND fecha >= ?";
    params = [filterDesde];
  } else if (filterHasta) {
    dateClause = " AND fecha <= ?";
    params = [filterHasta];
  }

  // 3. Cálculos agrupados por moneda
  const ingRows = query(`SELECT COALESCE(moneda, ?) AS m, SUM(monto) AS t FROM transacciones WHERE tipo='venta'${dateClause} GROUP BY m`, [mainCur, ...params]);
  const gasRows = query(`SELECT COALESCE(moneda, ?) AS m, SUM(monto) AS t FROM transacciones WHERE tipo='gasto'${dateClause} GROUP BY m`, [mainCur, ...params]);
  const pendRows = query(`SELECT COALESCE(moneda, ?) AS m, SUM(monto) AS t FROM cuentas WHERE estado='pendiente' GROUP BY m`, [mainCur]);

  const ingMap = {};
  const gasMap = {};
  const utilMap = {};
  const pendMap = {};

  ingRows.forEach(r => { ingMap[r.m] = r.t; });
  gasRows.forEach(r => { gasMap[r.m] = r.t; });
  pendRows.forEach(r => { pendMap[r.m] = r.t; });

  const allCurrencies = Array.from(new Set([...Object.keys(ingMap), ...Object.keys(gasMap)]));
  allCurrencies.forEach(c => {
    utilMap[c] = (ingMap[c] || 0) - (gasMap[c] || 0);
  });

  const elIng = document.getElementById("m-ing");
  const elGas = document.getElementById("m-gas");
  const elUtil = document.getElementById("m-util");
  const elPend = document.getElementById("m-pend");

  if (elIng) elIng.innerHTML = renderMetricHtml(ingMap);
  if (elGas) elGas.innerHTML = renderMetricHtml(gasMap);
  if (elUtil) elUtil.innerHTML = renderMetricHtml(utilMap, true);
  if (elPend) elPend.innerHTML = renderMetricHtml(pendMap);

  updateLabels();

  // 4. Franja de resumen del mes actual
  const rangeMes = getDateRangePreset('mes');
  const mesIngRows = query("SELECT COALESCE(moneda, ?) AS m, SUM(monto) AS t FROM transacciones WHERE tipo='venta' AND fecha BETWEEN ? AND ? GROUP BY m", [mainCur, rangeMes.desde, rangeMes.hasta]);
  const mesGasRows = query("SELECT COALESCE(moneda, ?) AS m, SUM(monto) AS t FROM transacciones WHERE tipo='gasto' AND fecha BETWEEN ? AND ? GROUP BY m", [mainCur, rangeMes.desde, rangeMes.hasta]);

  const mesIngMap = {};
  const mesGasMap = {};
  const mesUtilMap = {};
  mesIngRows.forEach(r => mesIngMap[r.m] = r.t);
  mesGasRows.forEach(r => mesGasMap[r.m] = r.t);
  Array.from(new Set([...Object.keys(mesIngMap), ...Object.keys(mesGasMap)])).forEach(c => {
    mesUtilMap[c] = (mesIngMap[c] || 0) - (mesGasMap[c] || 0);
  });

  const elMesIng = document.getElementById("m-mes-ing");
  const elMesGas = document.getElementById("m-mes-gas");
  const elMesUtil = document.getElementById("m-mes-util");
  if (elMesIng) elMesIng.innerHTML = renderMetricHtml(mesIngMap);
  if (elMesGas) elMesGas.innerHTML = renderMetricHtml(mesGasMap);
  if (elMesUtil) elMesUtil.innerHTML = renderMetricHtml(mesUtilMap, true);

  // 5. Panel de divisas secundarias activas bajo el resumen
  renderSecondaryCurrenciesPanel();

  // 6. Tabla de movimientos recientes
  const rows = query(
    `SELECT * FROM transacciones WHERE 1=1 ${dateClause} ORDER BY fecha DESC, id DESC LIMIT 10`,
    params
  );

  const body = document.querySelector("#tabla-recientes tbody");
  if (body) {
    body.innerHTML = rows.length ? rows.map(r => `
      <tr>
        <td>${r.fecha}</td>
        <td>${r.tipo}</td>
        <td>${formatPago(r.forma_pago)}</td>
        <td>${r.nota || r.categoria}</td>
        <td class="amt ${r.tipo === 'venta' ? 'pos' : 'neg'}">
          ${r.tipo === 'venta' ? '+' : '-'}${money(r.monto, r.moneda || mainCur)}
        </td>
      </tr>
    `).join("") : `<tr><td colspan="5" class="empty">No hay movimientos en el período seleccionado.</td></tr>`;
  }
}

// Revisa si existen monedas secundarias registradas y muestra sus botones de conversión individual
function renderSecondaryCurrenciesPanel(){
  const mainCur = getConfig('moneda_principal') || 'USD';
  const container = document.getElementById("currency-secondary-wrap");
  if (!container) return;

  const used = query(`
    SELECT DISTINCT moneda FROM transacciones WHERE moneda IS NOT NULL AND moneda != ''
    UNION
    SELECT DISTINCT moneda FROM cuentas WHERE moneda IS NOT NULL AND moneda != ''
    UNION
    SELECT DISTINCT moneda FROM productos WHERE moneda IS NOT NULL AND moneda != ''
    UNION
    SELECT DISTINCT moneda FROM catalogo WHERE moneda IS NOT NULL AND moneda != ''
  `).map(r => r.moneda).filter(m => m !== mainCur);

  if (used.length === 0) {
    container.innerHTML = `<span style="color:#666; font-size:0.85rem;">Todas tus operaciones y productos están registrados en tu moneda principal (<strong>${mainCur}</strong>).</span>`;
    return;
  }

  container.innerHTML = `
    <div style="font-size:0.85rem; font-weight:600; color:#1F2B22; margin-bottom:0.4rem;">Divisas secundarias detectadas:</div>
    <div style="display:flex; flex-direction:column; gap:0.5rem;">
      ${used.map(secCur => {
        const count = query(`
          SELECT (
            (SELECT COUNT(*) FROM transacciones WHERE moneda=?) +
            (SELECT COUNT(*) FROM cuentas WHERE moneda=?) +
            (SELECT COUNT(*) FROM productos WHERE moneda=?) +
            (SELECT COUNT(*) FROM catalogo WHERE moneda=?)
          ) AS total
        `, [secCur, secCur, secCur, secCur])[0]?.total || 0;

        return `
          <div class="sec-currency-card">
            <span><strong>${secCur}</strong> (${count} registros cargados)</span>
            <button type="button" class="btn ghost btn-sm" data-btn-convert="${secCur}">
              Convertir ${secCur} a ${mainCur}
            </button>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

// Verificación segura de cambio de ubicación del navegador
export function checkLocationMismatch(){
  const currentMain = getConfig('moneda_principal');
  const detected = detectClientCurrency();
  const lastAsked = getConfig('moneda_preguntada');

  if (currentMain && detected && currentMain !== detected && lastAsked !== detected) {
    const modal = document.getElementById("modal-location");
    const txt = document.getElementById("modal-location-text");
    if (modal && txt) {
      txt.textContent = `Detectamos que la configuración regional de tu dispositivo cambió a una zona cuya moneda es ${detected}. ¿Deseas establecer ${detected} como tu nueva moneda principal?`;
      modal.classList.add("open");
    }
  }
}

export function initDashboard(){
  document.addEventListener('libro:changed', render);

  currentPreset = 'mes';
  const range = getDateRangePreset('mes');
  filterDesde = range.desde || '';
  filterHasta = range.hasta || '';

  const inputDesde = document.getElementById("dash-desde");
  const inputHasta = document.getElementById("dash-hasta");
  if (inputDesde) inputDesde.value = filterDesde;
  if (inputHasta) inputHasta.value = filterHasta;
  updatePresetButtons();

  // Presets de fecha
  document.getElementById("dash-presets")?.addEventListener("click", e => {
    const btn = e.target.closest("button[data-period]");
    if (!btn) return;
    currentPreset = btn.dataset.period;
    const r = getDateRangePreset(currentPreset);
    filterDesde = r.desde || '';
    filterHasta = r.hasta || '';
    if (inputDesde) inputDesde.value = filterDesde;
    if (inputHasta) inputHasta.value = filterHasta;
    updatePresetButtons();
    if (db) render();
  });

  const onManualDateChange = () => {
    filterDesde = inputDesde ? inputDesde.value : '';
    filterHasta = inputHasta ? inputHasta.value : '';
    currentPreset = 'custom';
    updatePresetButtons();
    if (db) render();
  };

  inputDesde?.addEventListener("change", onManualDateChange);
  inputHasta?.addEventListener("change", onManualDateChange);

  // Cambio voluntario de moneda principal
  document.getElementById("sel-main-currency")?.addEventListener("change", async e => {
    const nueva = e.target.value;
    await setConfig('moneda_principal', nueva);
    render();
  });

  // Clic en convertir divisa secundaria individual
  document.getElementById("currency-secondary-wrap")?.addEventListener("click", e => {
    const btn = e.target.closest("button[data-btn-convert]");
    if (!btn) return;
    convertingCurrency = btn.dataset.btnConvert;
    const mainCur = getConfig('moneda_principal') || 'USD';

    document.getElementById("modal-convert-title").textContent = `Convertir ${convertingCurrency} a ${mainCur}`;
    document.getElementById("modal-convert-desc").textContent = `Introduce el valor de cotización para calcular y unificar todos tus registros en ${convertingCurrency} hacia ${mainCur}.`;
    document.getElementById("modal-convert-label").textContent = `1 ${convertingCurrency} equivale a cuántos ${mainCur}:`;
    document.getElementById("modal-convert-rate").value = "";
    document.getElementById("modal-convert").classList.add("open");
  });

  document.getElementById("modal-convert-cancel")?.addEventListener("click", () => {
    document.getElementById("modal-convert").classList.remove("open");
    convertingCurrency = null;
  });

  document.getElementById("modal-convert-confirm")?.addEventListener("click", async () => {
    const rateVal = parseFloat(document.getElementById("modal-convert-rate").value);
    if (!rateVal || rateVal <= 0) {
      alert("Por favor ingresa un tipo de cambio válido mayor a 0.");
      return;
    }
    const mainCur = getConfig('moneda_principal') || 'USD';
    document.getElementById("modal-convert").classList.remove("open");
    await convertCurrency(convertingCurrency, mainCur, rateVal);
    convertingCurrency = null;
  });

  // Modal de advertencia de cambio de ubicación
  document.getElementById("modal-location-keep")?.addEventListener("click", async () => {
    const detected = detectClientCurrency();
    await setConfig('moneda_preguntada', detected);
    document.getElementById("modal-location").classList.remove("open");
  });

  document.getElementById("modal-location-change")?.addEventListener("click", async () => {
    const detected = detectClientCurrency();
    await setConfig('moneda_principal', detected);
    await setConfig('moneda_preguntada', detected);
    document.getElementById("modal-location").classList.remove("open");
    render();
  });
}
