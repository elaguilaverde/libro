// inventario.js — dueño de la tabla `productos`

import { query, exec, rawRun, getConfig } from './db.js';
import { money, buildFieldsHtml, showEditModal, getMonedasOptionsHtml } from './ui.js';

let searchQuery = "";

const EDIT_FIELDS = [
  { name:'nombre', label:'Producto', type:'text' },
  { name:'precio', label:'Precio', type:'number', step:'0.01' },
  { name:'moneda', label:'Moneda', type:'html', html: val => `<select name="moneda">${getMonedasOptionsHtml(val)}</select>` },
  { name:'stock', label:'Stock', type:'number' },
  { name:'stock_minimo', label:'Stock mínimo', type:'number' }
];

export function getProductoOptionsHtml(selectedId){
  const productos = query("SELECT id,nombre,stock,moneda FROM productos ORDER BY nombre");
  return `<option value="">— sin producto —</option>` + productos.map(p =>
    `<option value="${p.id}" ${String(p.id)===String(selectedId)?'selected':''}>${p.nombre} (${p.moneda || ''} · stock: ${p.stock})</option>`
  ).join("");
}

export function getPrecio(productoId){
  const row = query("SELECT precio FROM productos WHERE id=?", [productoId])[0];
  return row ? row.precio : null;
}

export function ajustarStockRaw(productoId, delta){
  if (!productoId) return;
  rawRun("UPDATE productos SET stock = stock + ? WHERE id=?", [delta, productoId]);
}

function render(){
  const mainCur = getConfig('moneda_principal') || 'USD';
  const allRows = query("SELECT * FROM productos ORDER BY id DESC");
  const q = searchQuery.toLowerCase();
  const rows = q ? allRows.filter(r => r.nombre && r.nombre.toLowerCase().includes(q)) : allRows;

  const body = document.querySelector("#tabla-inv tbody");
  body.innerHTML = rows.length ? rows.map(r => `
    <tr>
      <td>${r.nombre}</td>
      <td>${money(r.precio, r.moneda || mainCur)}</td>
      <td class="${r.stock <= r.stock_minimo ? 'low' : ''}">
        ${r.stock}${r.stock <= r.stock_minimo ? ' · stock bajo' : ''}
      </td>
      <td>
        <button class="del" data-edit-inv="${r.id}">editar</button>
        <button class="del" data-del-inv="${r.id}">eliminar</button>
      </td>
    </tr>
  `).join("") : `<tr><td colspan="4" class="empty">${searchQuery ? 'No se encontraron productos con esa búsqueda.' : 'No hay productos cargados.'}</td></tr>`;

  document.querySelectorAll(".producto-select-live").forEach(sel => {
    const current = sel.value;
    sel.innerHTML = getProductoOptionsHtml(current);
  });
}

function openEdit(id){
  const row = query("SELECT * FROM productos WHERE id=?", [id])[0];
  if (!row) return;
  showEditModal("Editar producto", buildFieldsHtml(EDIT_FIELDS, row), values => {
    const moneda = values.moneda || getConfig('moneda_principal') || 'USD';
    exec("UPDATE productos SET nombre=?, precio=?, stock=?, stock_minimo=?, moneda=? WHERE id=?",
      [values.nombre, parseFloat(values.precio), parseInt(values.stock), parseInt(values.stock_minimo), moneda, id]);
  });
}

export function initInventario(){
  document.addEventListener('libro:changed', render);

  document.getElementById("form-inv").addEventListener("submit", e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const moneda = f.get("moneda") || getConfig('moneda_principal') || 'USD';
    exec("INSERT INTO productos(nombre, precio, stock, stock_minimo, moneda) VALUES (?,?,?,?,?)",
      [f.get("nombre"), parseFloat(f.get("precio")), parseInt(f.get("stock")), parseInt(f.get("stock_minimo") || 1), moneda]);
    e.target.reset();
  });

  const busq = document.getElementById("busq-inv");
  if (busq) {
    busq.addEventListener("input", e => {
      searchQuery = e.target.value.trim();
      render();
    });
  }

  document.body.addEventListener("click", e => {
    if (e.target.dataset.editInv) openEdit(e.target.dataset.editInv);
    if (e.target.dataset.delInv) exec("DELETE FROM productos WHERE id=?", [e.target.dataset.delInv]);
  });
}
