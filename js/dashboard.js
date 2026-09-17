// dashboard.js — solo lee de las demás tablas para armar el resumen. No escribe nada.

import { query } from './db.js';
import { money } from './ui.js';

function render(){
  const ing = query("SELECT COALESCE(SUM(monto),0) t FROM transacciones WHERE tipo='venta'")[0].t;
  const gas = query("SELECT COALESCE(SUM(monto),0) t FROM transacciones WHERE tipo='gasto'")[0].t;
  const pend = query("SELECT COALESCE(SUM(monto),0) t FROM cuentas WHERE estado='pendiente'")[0].t;
  document.getElementById("m-ing").textContent = money(ing);
  document.getElementById("m-gas").textContent = money(gas);
  document.getElementById("m-util").textContent = money(ing-gas);
  document.getElementById("m-pend").textContent = money(pend);

  const rows = query("SELECT * FROM transacciones ORDER BY id DESC LIMIT 6");
  const body = document.querySelector("#tabla-recientes tbody");
  body.innerHTML = rows.length ? rows.map(r=>`
    <tr><td>${r.fecha}</td><td>${r.tipo}</td><td>${r.nota||r.categoria}</td>
    <td class="amt ${r.tipo==='venta'?'pos':'neg'}">${r.tipo==='venta'?'+':'-'}${money(r.monto)}</td></tr>
  `).join("") : `<tr><td colspan="4" class="empty">Sin movimientos todavía. Registra tu primera venta o gasto.</td></tr>`;
}

export function initDashboard(){
  document.addEventListener('libro:changed', render);
}
