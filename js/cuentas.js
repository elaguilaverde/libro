// cuentas.js — dueño de la tabla `cuentas` (deudas por cobrar/pagar).

import { query, exec } from './db.js';
import { money, buildFieldsHtml, showEditModal } from './ui.js';

const EDIT_FIELDS = [
  { name:'contacto', label:'Contacto', type:'text' },
  { name:'tipo', label:'Tipo', type:'select', options:[['por_cobrar','Me deben'],['por_pagar','Debo']] },
  { name:'monto', label:'Monto', type:'number', step:'0.01' },
  { name:'vencimiento', label:'Vence', type:'date' },
  { name:'estado', label:'Estado', type:'select', options:[['pendiente','Pendiente'],['pagado','Pagado']] }
];

function render(){
  const rows = query("SELECT * FROM cuentas ORDER BY id DESC");
  const body = document.querySelector("#tabla-cta tbody");
  body.innerHTML = rows.length ? rows.map(r=>`
    <tr><td>${r.contacto}</td><td>${r.tipo==='por_cobrar'?'me deben':'debo'}</td><td>${money(r.monto)}</td>
    <td>${r.vencimiento||"—"}</td><td>${r.estado}</td>
    <td>
      ${r.estado==='pendiente'?`<button class="del" data-pay-cta="${r.id}">marcar pagado</button>`:""}
      <button class="del" data-edit-cta="${r.id}">editar</button>
      <button class="del" data-del-cta="${r.id}">eliminar</button>
    </td></tr>
  `).join("") : `<tr><td colspan="6" class="empty">No hay cuentas por cobrar ni por pagar.</td></tr>`;
}

function openEdit(id){
  const row = query("SELECT * FROM cuentas WHERE id=?", [id])[0];
  if (!row) return;
  showEditModal("Editar cuenta", buildFieldsHtml(EDIT_FIELDS, row), values=>{
    exec("UPDATE cuentas SET contacto=?, tipo=?, monto=?, vencimiento=?, estado=? WHERE id=?",
      [values.contacto, values.tipo, parseFloat(values.monto), values.vencimiento, values.estado, id]);
  });
}

export function initCuentas(){
  document.addEventListener('libro:changed', render);

  document.getElementById("form-cta").addEventListener("submit", e=>{
    e.preventDefault();
    const f = new FormData(e.target);
    exec("INSERT INTO cuentas(contacto,tipo,monto,vencimiento) VALUES (?,?,?,?)",
      [f.get("contacto"), f.get("tipo"), parseFloat(f.get("monto")), f.get("vencimiento")]);
    e.target.reset();
  });

  document.body.addEventListener("click", e=>{
    if (e.target.dataset.editCta) openEdit(e.target.dataset.editCta);
    if (e.target.dataset.payCta) exec("UPDATE cuentas SET estado='pagado' WHERE id=?", [e.target.dataset.payCta]);
    if (e.target.dataset.delCta) exec("DELETE FROM cuentas WHERE id=?", [e.target.dataset.delCta]);
  });
}
