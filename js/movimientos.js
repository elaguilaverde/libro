// movimientos.js — dueño de la tabla `transacciones`.
// Depende de inventario.js para el selector de producto y para ajustar stock.

import { query, exec, rawRun, commit } from './db.js';
import { money, buildFieldsHtml, showEditModal } from './ui.js';
import { getProductoOptionsHtml, getPrecio, ajustarStockRaw } from './inventario.js';

function todayStr(){ return new Date().toISOString().slice(0,10); }

const EDIT_FIELDS = [
  { name:'fecha', label:'Fecha', type:'date' },
  { name:'tipo', label:'Tipo', type:'select', options:[['venta','Venta / ingreso'],['gasto','Gasto']] },
  { name:'producto_id', label:'Producto (opcional)', type:'html', html: val => `<select name="producto_id">${getProductoOptionsHtml(val)}</select>` },
  { name:'cantidad', label:'Cantidad', type:'number' },
  { name:'categoria', label:'Categoría', type:'text' },
  { name:'nota', label:'Descripción', type:'text' },
  { name:'monto', label:'Monto', type:'number', step:'0.01' }
];

function render(){
  const rows = query(`SELECT t.*, p.nombre AS producto_nombre FROM transacciones t
                       LEFT JOIN productos p ON p.id = t.producto_id ORDER BY t.id DESC`);
  const body = document.querySelector("#tabla-mov tbody");
  body.innerHTML = rows.length ? rows.map(r=>`
    <tr><td>${r.fecha}</td><td>${r.tipo}</td><td>${r.categoria}</td>
    <td>${r.producto_nombre ? r.producto_nombre + (r.cantidad?` ×${r.cantidad}`:'') : '—'}</td>
    <td>${r.nota||""}</td>
    <td class="amt ${r.tipo==='venta'?'pos':'neg'}">${r.tipo==='venta'?'+':'-'}${money(r.monto)}</td>
    <td>
      <button class="del" data-edit-mov="${r.id}">editar</button>
      <button class="del" data-del-mov="${r.id}">eliminar</button>
    </td></tr>
  `).join("") : `<tr><td colspan="7" class="empty">No hay ventas ni gastos registrados.</td></tr>`;
}

function openEdit(id){
  const row = query("SELECT * FROM transacciones WHERE id=?", [id])[0];
  if (!row) return;
  showEditModal("Editar movimiento", buildFieldsHtml(EDIT_FIELDS, row), async values=>{
    // revierte el efecto en stock de la venta anterior
    if (row.tipo === 'venta' && row.producto_id) ajustarStockRaw(row.producto_id, row.cantidad || 1);
    const nuevoProductoId = values.producto_id || null;
    const nuevaCantidad = parseFloat(values.cantidad) || null;
    rawRun("UPDATE transacciones SET fecha=?, tipo=?, categoria=?, nota=?, monto=?, producto_id=?, cantidad=? WHERE id=?",
      [values.fecha, values.tipo, values.categoria, values.nota, parseFloat(values.monto), nuevoProductoId, nuevaCantidad, id]);
    // aplica el nuevo efecto
    if (values.tipo === 'venta' && nuevoProductoId) ajustarStockRaw(nuevoProductoId, -(nuevaCantidad || 1));
    await commit();
  });
}

export function initMovimientos(){
  document.addEventListener('libro:changed', render);

  const form = document.getElementById("form-mov");
  form.querySelector('[name=fecha]').value = todayStr();

  // Autocompleta el monto sugerido al elegir producto/cantidad (se puede editar igual)
  form.addEventListener("change", e=>{
    if (e.target.name !== 'producto_id' && e.target.name !== 'cantidad') return;
    const pid = form.producto_id.value;
    const cant = parseFloat(form.cantidad.value) || 1;
    if (pid){
      const precio = getPrecio(pid);
      if (precio != null) form.monto.value = (precio * cant).toFixed(2);
    }
  });

  form.addEventListener("submit", async e=>{
    e.preventDefault();
    const f = new FormData(e.target);
    const tipo = f.get("tipo");
    const productoId = f.get("producto_id") || null;
    const cantidad = parseFloat(f.get("cantidad")) || null;
    rawRun("INSERT INTO transacciones(fecha,tipo,categoria,nota,monto,producto_id,cantidad) VALUES (?,?,?,?,?,?,?)",
      [f.get("fecha") || todayStr(), tipo, f.get("categoria"), f.get("nota"), parseFloat(f.get("monto")), productoId, cantidad]);
    if (tipo === 'venta' && productoId) ajustarStockRaw(productoId, -(cantidad || 1));
    await commit();
    e.target.reset();
    form.querySelector('[name=fecha]').value = todayStr();
    form.querySelector('[name=cantidad]').value = 1;
  });

  document.body.addEventListener("click", async e=>{
    if (e.target.dataset.editMov) openEdit(e.target.dataset.editMov);
    if (e.target.dataset.delMov){
      const id = e.target.dataset.delMov;
      const row = query("SELECT tipo,producto_id,cantidad FROM transacciones WHERE id=?", [id])[0];
      if (row && row.tipo === 'venta' && row.producto_id) ajustarStockRaw(row.producto_id, row.cantidad || 1);
      rawRun("DELETE FROM transacciones WHERE id=?", [id]);
      await commit();
    }
  });
}
