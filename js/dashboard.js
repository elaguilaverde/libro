// dashboard.js — solo lee de las demás tablas para armar el resumen. No escribe nada.

import { query } from './db.js';
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
  document.getElementById("lbl-ing").textContent = `Ingresos (${etiqueta})`;
  document.getElementById("lbl-gas").textContent = `Gastos (${etiqueta})`;
  document.getElementById("lbl-util").textContent = `Utilidad (${etiqueta})`;
}

function render(){
  // 1. Métricas fijas del mes en curso
  const rangeMes = getDateRangePreset('mes');
  const mesIng = query(
    "SELECT COALESCE(SUM(monto),0) t FROM transacciones WHERE tipo='venta' AND fecha BETWEEN ? AND ?",
    [rangeMes.desde, rangeMes.hasta]
  )[0].t;
  const mesGas = query(
    "SELECT COALESCE(SUM(monto),0) t FROM transacciones WHERE tipo='gasto' AND fecha BETWEEN ? AND ?",
    [rangeMes.desde, rangeMes.hasta]
  )[0].t;

  document.getElementById("m-mes-ing").textContent = money(mesIng);
  document.getElementById("m-mes-gas").textContent = money(mesGas);
  document.getElementById("m-mes-util").textContent = money(mesIng - mesGas);

  // 2. Construcción del filtro para las tarjetas principales
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

  const ing = query(`SELECT COALESCE(SUM(monto),0) t FROM transacciones WHERE tipo='venta'${dateClause}`, params)[0].t;
  const gas = query(`SELECT COALESCE(SUM(monto),0) t FROM transacciones WHERE tipo='gasto'${dateClause}`, params)[0].t;
  const pend = query("SELECT COALESCE(SUM(monto),0) t FROM cuentas WHERE estado='pendiente'")[0].t;

  document.getElementById("m-ing").textContent = money(ing);
  document.getElementById("m-gas").textContent = money(gas);
  document.getElementById("m-util").textContent = money(ing - gas);
  document.getElementById("m-pend").textContent = money(pend);
  updateLabels();

  // 3. Tabla de movimientos recientes del período seleccionado
  const rows = query(
    `SELECT * FROM transacciones WHERE 1=1 ${dateClause} ORDER BY fecha DESC, id DESC LIMIT 10`,
    params
  );

  const body = document.querySelector("#tabla-recientes tbody");
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
  render();
}

export function initDashboard(){
  document.addEventListener('libro:changed', render);

  // Inicializar en "Este mes" por defecto
  aplicarPreset('mes');

  // Clic en botones rápidos (Hoy, Semana, Mes, Todo)
  const presetsContainer = document.getElementById("dash-presets");
  if (presetsContainer) {
    presetsContainer.addEventListener("click", e => {
      const btn = e.target.closest("button[data-period]");
      if (!btn) return;
      aplicarPreset(btn.dataset.period);
    });
  }

  // Cambio manual en selectores de fecha
  const inputDesde = document.getElementById("dash-desde");
  const inputHasta = document.getElementById("dash-hasta");

  const onManualDateChange = () => {
    filterDesde = inputDesde.value;
    filterHasta = inputHasta.value;
    currentPreset = 'custom';
    updatePresetButtons();
    render();
  };

  if (inputDesde) inputDesde.addEventListener("change", onManualDateChange);
  if (inputHasta) inputHasta.addEventListener("change", onManualDateChange);
}
