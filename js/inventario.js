// inventario.js — dueño de la tabla `productos`. movimientos.js depende de
// este módulo (no al revés) para mostrar el selector de producto y ajustar stock.

import { query, exec, rawRun } from './db.js';
import { money, buildFieldsHtml, showEditModal } from './ui.js';

const EDIT_FIELDS = [
  { name:'nombre', label:'Producto', type:'text' },
  { name:'precio', label:'Precio', type:'number', step:'0.01' },
  { name:'stock', label:'Stock', type:'number' },
  { name:'stock_minimo', label:'Stock mínimo', type:'number' }
];

// Usado por movimientos.js para su selector de "Producto (opcional)"
export function getProductoOptionsHtml(selectedId){
  const productos = query("SELECT id,nombre,stock FROM productos ORDER BY nombre");
  return `<option value="">— sin producto —</option>` + productos.map(p =>
    `<option value="${p.id}" ${String(p.id)===String(selectedId)?'selected':''}>${p.nombre} (stock: ${p.stock})</option>`
  ).join("");
}

export function getPrecio(productoId){
  const row = query("SELECT precio FROM productos WHERE id=?", [productoId])[0];
  return row ? row.precio : null;
}

// delta negativo = descuenta (venta), positivo = repone (borrar/editar venta)
export function ajustarStockRaw(productoId, delta){
  if (!productoId) return;
  rawRun("UPDATE productos SET stock = stock + ? WHERE id=?", [delta, productoId]);
}

function render(){
  const rows = query("SELECT * FROM productos ORDER BY id DESC");
  const body = document.querySelector("#tabla-inv tbody");
  body.innerHTML = rows.length ? rows.map(r => `
    <tr><td>${r.nombre}</td><td>${money(r.precio)}</td>
    <td class="${r.stock<=r.stock_minimo?'low':''}">${r.stock}${r.stock<=r.stock_minimo?' · stock bajo':''}</td>
    <td>
      <button class="del" data-edit-inv="${r.id}">editar</button>
      <button class="del" data-del-inv="${r.id}">eliminar</button>
    </td></tr>
  `).join("") : `<tr><td colspan="4" class="empty">No hay productos cargados.</td></tr>`;

  // Actualiza cualquier selector de producto que exista en la página (ej: el de ventas)
  document.querySelectorAll(".producto-select-live").forEach(sel=>{
    const current = sel.value;
    sel.innerHTML = getProductoOptionsHtml(current);
  });
}

function openEdit(id){
  const row = query("SELECT * FROM productos WHERE id=?", [id])[0];
  if (!row) return;
  showEditModal("Editar producto", buildFieldsHtml(EDIT_FIELDS, row), values=>{
    exec("UPDATE productos SET nombre=?, precio=?, stock=?, stock_minimo=? WHERE id=?",
      [values.nombre, parseFloat(values.precio), parseInt(values.stock), parseInt(values.stock_minimo), id]);
  });
}

export function initInventario(){
  document.addEventListener('libro:changed', render);

  document.getElementById("form-inv").addEventListener("submit", e=>{
    e.preventDefault();
    const f = new FormData(e.target);
    exec("INSERT INTO productos(nombre,precio,stock,stock_minimo) VALUES (?,?,?,?)",
      [f.get("nombre"), parseFloat(f.get("precio")), parseInt(f.get("stock")), parseInt(f.get("stock_minimo")||1)]);
    e.target.reset();
  });

  document.body.addEventListener("click", e=>{
    if (e.target.dataset.editInv) openEdit(e.target.dataset.editInv);
    if (e.target.dataset.delInv) exec("DELETE FROM productos WHERE id=?", [e.target.dataset.delInv]);
  });
}
