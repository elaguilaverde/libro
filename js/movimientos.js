// movimientos.js — dueño de la tabla `transacciones`.
// Depende de inventario.js para el selector de producto y para ajustar stock.

import { query, rawRun, commit } from './db.js';
import { money, buildFieldsHtml, showEditModal, toLocalIsoDate, downloadCsv } from './ui.js';
import { getProductoOptionsHtml, getPrecio, ajustarStockRaw } from './inventario.js';

let searchQuery = "";

const EDIT_FIELDS = [
  { name:'fecha', label:'Fecha', type:'date' },
  { name:'tipo', label:'Tipo', type:'select', options:[['venta','Venta / ingreso'],['gasto','Gasto']] },
  { name:'producto_id', label:'Producto (opcional)', type:'html', html: val => `<select name="producto_id">${getProductoOptionsHtml(val)}</select>` },
  { name:'cantidad', label:'Cantidad', type:'number' },
  { name:'forma_pago', label:'Forma de pago', type:'select', options:[
    ['efectivo','Efectivo'],
    ['transferencia','Transferencia'],
    ['tarjeta_debito','Tarjeta de débito'],
    ['tarjeta_credito','Tarjeta de crédito'],
    ['otro','Otro']
  ]},
  { name:'categoria', label:'Categoría', type:'text' },
  { name:'nota', label:'Descripción', type:'text' },
  { name:'monto', label:'Monto', type:'number', step:'0.01' }
];

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

// Actualiza las opciones sugeridas en el <datalist> con las categorías usadas
function updateCategoriasDatalist(){
  const dl = document.getElementById("lista-categorias");
  if (!dl) return;
  const cats = query("SELECT DISTINCT categoria FROM transacciones WHERE categoria IS NOT NULL AND TRIM(categoria) != '' ORDER BY categoria COLLATE NOCASE ASC");
  dl.innerHTML = cats.map(c => `<option value="${c.categoria}"></option>`).join("");
}

function render(){
  updateCategoriasDatalist();

  const allRows = query(`
    SELECT t.*, p.nombre AS producto_nombre
    FROM transacciones t
    LEFT JOIN productos p ON p.id = t.producto_id
    ORDER BY t.fecha DESC, t.id DESC
  `);

  const q = searchQuery.toLowerCase();
  const rows = q ? allRows.filter(r =>
    (r.categoria && r.categoria.toLowerCase().includes(q)) ||
    (r.nota && r.nota.toLowerCase().includes(q)) ||
    (r.producto_nombre && r.producto_nombre.toLowerCase().includes(q)) ||
    (r.tipo && r.tipo.toLowerCase().includes(q)) ||
    (r.forma_pago && r.forma_pago.toLowerCase().includes(q))
  ) : allRows;

  const body = document.querySelector("#tabla-mov tbody");
  body.innerHTML = rows.length ? rows.map(r => `
    <tr>
      <td>${r.fecha}</td>
      <td>${r.tipo}</td>
      <td>${r.categoria}</td>
      <td>${r.producto_nombre ? `${r.producto_nombre}${r.cantidad ? ` ×${r.cantidad}` : ''}` : '—'}</td>
      <td>${formatPago(r.forma_pago)}</td>
      <td>${r.nota || ""}</td>
      <td class="amt ${r.tipo === 'venta' ? 'pos' : 'neg'}">
        ${r.tipo === 'venta' ? '+' : '-'}${money(r.monto)}
      </td>
      <td>
        <button class="del" data-edit-mov="${r.id}">editar</button>
        <button class="del" data-del-mov="${r.id}">eliminar</button>
      </td>
    </tr>
  `).join("") : `<tr><td colspan="8" class="empty">${searchQuery ? 'No se encontraron movimientos con esa búsqueda.' : 'No hay ventas ni gastos registrados.'}</td></tr>`;
}

function openEdit(id){
  const row = query("SELECT * FROM transacciones WHERE id=?", [id])[0];
  if (!row) return;

  showEditModal("Editar movimiento", buildFieldsHtml(EDIT_FIELDS, row), async values => {
    // Revierte efecto de stock anterior
    if (row.tipo === 'venta' && row.producto_id) {
      ajustarStockRaw(row.producto_id, row.cantidad || 1);
    }

    const nuevoProductoId = values.producto_id || null;
    const nuevaCantidad = parseFloat(values.cantidad) || null;
    const nuevaFormaPago = values.forma_pago || 'efectivo';

    rawRun(
      "UPDATE transacciones SET fecha=?, tipo=?, categoria=?, nota=?, monto=?, producto_id=?, cantidad=?, forma_pago=? WHERE id=?",
      [values.fecha, values.tipo, values.categoria, values.nota, parseFloat(values.monto), nuevoProductoId, nuevaCantidad, nuevaFormaPago, id]
    );

    // Aplica nuevo efecto de stock
    if (values.tipo === 'venta' && nuevoProductoId) {
      ajustarStockRaw(nuevoProductoId, -(nuevaCantidad || 1));
    }

    await commit();
  });
}

function exportarMovimientosCsv(){
  const rows = query(`
    SELECT t.fecha, t.tipo, t.categoria, COALESCE(p.nombre, '') AS producto,
           COALESCE(t.cantidad, '') AS cantidad, t.forma_pago, COALESCE(t.nota, '') AS nota, t.monto
    FROM transacciones t
    LEFT JOIN productos p ON p.id = t.producto_id
    ORDER BY t.fecha DESC, t.id DESC
  `);

  const headers = ["Fecha", "Tipo", "Categoría", "Producto", "Cantidad", "Forma de pago", "Descripción", "Monto"];
  const data = rows.map(r => [
    r.fecha,
    r.tipo,
    r.categoria,
    r.producto,
    r.cantidad,
    formatPago(r.forma_pago),
    r.nota,
    r.monto
  ]);

  downloadCsv(`movimientos_${toLocalIsoDate()}.csv`, headers, data);
}

export function initMovimientos(){
  document.addEventListener('libro:changed', render);

  const form = document.getElementById("form-mov");
  const fechaInput = form.querySelector('[name=fecha]');
  if (fechaInput) fechaInput.value = toLocalIsoDate();

  // Autocompleta el monto sugerido al elegir producto/cantidad
  form.addEventListener("change", e => {
    if (e.target.name !== 'producto_id' && e.target.name !== 'cantidad') return;
    const pid = form.producto_id.value;
    const cant = parseFloat(form.cantidad.value) || 1;
    if (pid) {
      const precio = getPrecio(pid);
      if (precio != null) form.monto.value = (precio * cant).toFixed(2);
    }
  });

  // Guardar nuevo movimiento
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const tipo = f.get("tipo");
    const productoId = f.get("producto_id") || null;
    const cantidad = parseFloat(f.get("cantidad")) || null;
    const formaPago = f.get("forma_pago") || 'efectivo';

    rawRun(
      "INSERT INTO transacciones(fecha, tipo, categoria, nota, monto, producto_id, cantidad, forma_pago) VALUES (?,?,?,?,?,?,?,?)",
      [f.get("fecha") || toLocalIsoDate(), tipo, f.get("categoria"), f.get("nota"), parseFloat(f.get("monto")), productoId, cantidad, formaPago]
    );

    if (tipo === 'venta' && productoId) {
      ajustarStockRaw(productoId, -(cantidad || 1));
    }

    await commit();

    e.target.reset();
    if (fechaInput) fechaInput.value = toLocalIsoDate();
    form.querySelector('[name=cantidad]').value = 1;
    form.querySelector('[name=forma_pago]').value = 'efectivo';
  });

  // Búsqueda en vivo
  const inputBusq = document.getElementById("busq-mov");
  if (inputBusq) {
    inputBusq.addEventListener("input", e => {
      searchQuery = e.target.value.trim();
      render();
    });
  }

  // Exportar movimientos a CSV
  const btnCsv = document.getElementById("btn-export-csv-mov");
  if (btnCsv) {
    btnCsv.addEventListener("click", exportarMovimientosCsv);
  }

  // Clics para editar / eliminar
  document.body.addEventListener("click", async e => {
    if (e.target.dataset.editMov) openEdit(e.target.dataset.editMov);
    if (e.target.dataset.delMov) {
      const id = e.target.dataset.delMov;
      const row = query("SELECT tipo, producto_id, cantidad FROM transacciones WHERE id=?", [id])[0];
      if (row && row.tipo === 'venta' && row.producto_id) {
        ajustarStockRaw(row.producto_id, row.cantidad || 1);
      }
      rawRun("DELETE FROM transacciones WHERE id=?", [id]);
      await commit();
    }
  });
}
