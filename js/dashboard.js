// dashboard.js — solo lee de las demás tablas para armar el resumen. No escribe nada.

import { db, query } from './db.js';
import { money, getDateRangePreset } from './ui.js';

let currentPreset = 'mes';
let filterDesde = '';
let filterHasta = '';

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

function render(){
  // Blindaje: si la base de datos aún no terminó de iniciar, no consultamos todavía
  if (!db) return;

  // 1. Métricas fijas del mes en curso
  const rangeMes = getDateRangePreset('mes');
  const resMesIng = query(
    "SELECT COALESCE(SUM(monto),0) t FROM transacciones WHERE tipo='venta' AND fecha BETWEEN ? AND ?",
    [rangeMes.desde, rangeMes.hasta]
  );
  const resMesGas = query(
    "SELECT COALESCE(SUM(monto),0) t FROM transacciones WHERE tipo='gasto' AND fecha BETWEEN ? AND ?",
    [rangeMes.desde, rangeMes.hasta]
  );

  const mesIng = resMesIng[0]?.t || 0;
  const mesGas = resMesGas[0]?.t || 0;

  const elMesIng = document.getElementById("m-mes-ing");
  const elMesGas = document.getElementById("m-mes-gas");
  const elMesUtil = document.getElementById("m-mes-util");
  if (elMesIng) elMesIng.textContent = money(mesIng);
  if (elMesGas) elMesGas.textContent = money(mesGas);
  if (elMesUtil) elMesUtil.textContent = money(mesIng - mesGas);

  // 2. Filtro dinámico de las tarjetas principales
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

  const resIng = query(`SELECT COALESCE(SUM(monto),0) t FROM transacciones WHERE tipo='venta'${dateClause}`, params);
  const resGas = query(`SELECT COALESCE(SUM(monto),0) t FROM transacciones WHERE tipo='gasto'${dateClause}`, params);
  const resPend = query("SELECT COALESCE(SUM(monto),0) t FROM cuentas WHERE estado='pendiente'");

  const ing = resIng[0]?.t || 0;
  const gas = resGas[0]?.t || 0;
  const pend = resPend[0]?.t || 0;

  const elIng = document.getElementById("m-ing");
  const elGas = document.getElementById("m-gas");
  const elUtil = document.getElementById("m-util");
  const elPend = document.getElementById("m-pend");

  if (elIng) elIng.textContent = money(ing);
  if (elGas) elGas.textContent = money(gas);
  if (elUtil) elUtil.textContent = money(ing - gas);
  if (elPend) elPend.textContent = money(pend);
  updateLabels();

  // 3. Tabla de movimientos recientes del período
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
          ${r.tipo === 'venta' ? '+' : '-'}${money(r.monto)}
        </td>
      </tr>
    `).join("") : `<tr><td colspan="5" class="empty">No hay movimientos en el período seleccionado.</td></tr>`;
  }
}

function aplicarPreset(preset){
  currentPreset = preset;
  const range = getDateRangePreset(preset);
  filterDesde = range.desde || '';
  filterHasta = range.hasta || '';

  const inputDesde = document.getElementById("dash-desde");
  const inputHasta = document.getElementById("dash-hasta");
  if (inputDesde) inputDesde.value = filterDesde;
  if (inputHasta) inputHasta.value = filterHasta;

  updatePresetButtons();
  if (db) render();
}

export function initDashboard(){
  document.addEventListener('libro:changed', render);

  // Inicializa los valores visuales en "Este mes" sin lanzar consultas prematuras
  currentPreset = 'mes';
  const range = getDateRangePreset('mes');
  filterDesde = range.desde || '';
  filterHasta = range.hasta || '';

  const inputDesde = document.getElementById("dash-desde");
  const inputHasta = document.getElementById("dash-hasta");
  if (inputDesde) inputDesde.value = filterDesde;
  if (inputHasta) inputHasta.value = filterHasta;
  updatePresetButtons();

  // Clic en botones rápidos (Hoy, Semana, Mes, Todo)
  const presetsContainer = document.getElementById("dash-presets");
  if (presetsContainer) {
    presetsContainer.addEventListener("click", e => {
      const btn = e.target.closest("button[data-period]");
      if (!btn) return;
      aplicarPreset(btn.dataset.period);
    });
  }

  // Cambio manual de fechas
  const onManualDateChange = () => {
    filterDesde = inputDesde ? inputDesde.value : '';
    filterHasta = inputHasta ? inputHasta.value : '';
    currentPreset = 'custom';
    updatePresetButtons();
    if (db) render();
  };

  if (inputDesde) inputDesde.addEventListener("change", onManualDateChange);
  if (inputHasta) inputHasta.addEventListener("change", onManualDateChange);
}
