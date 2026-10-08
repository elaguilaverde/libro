// catalogo.js — gestión de catálogo de productos independiente del stock y exportación a PDF.

import { query, exec } from './db.js';
import { money, buildFieldsHtml, showEditModal, toLocalIsoDate } from './ui.js';

let searchQuery = "";

// Comprime una imagen a máx 450px en JPEG 70% (~20-35 KB)
function comprimirImagen(file, maxDim = 450, quality = 0.7){
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      return reject(new Error('El archivo seleccionado no es una imagen.'));
    }
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        // Fondo blanco para evitar fondos negros en PNG transparentes
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('No se pudo decodificar la imagen.'));
      img.src = ev.target.result;
    };
    reader.onerror = () => reject(new Error('Error al leer el archivo.'));
    reader.readAsDataURL(file);
  });
}

const EDIT_FIELDS = [
  { name: 'nombre', label: 'Producto', type: 'text' },
  { name: 'precio', label: 'Precio', type: 'number', step: '0.01' },
  { name: 'descripcion', label: 'Descripción (opcional)', type: 'text' },
  {
    name: 'foto',
    label: 'Foto del producto',
    type: 'html',
    html: val => `
      <div style="display:flex; align-items:center; gap:8px;">
        <img id="modal-cat-preview" src="${val || ''}" style="width:40px;height:40px;object-fit:cover;border:1px solid #C9BFA0;border-radius:2px;${val ? '' : 'display:none;'}">
        <input type="file" id="modal-cat-file" accept="image/*" style="font-size:12px;flex:1;">
        <input type="hidden" name="foto" id="modal-cat-hidden" value="${val || ''}">
        ${val ? '<button type="button" id="modal-cat-del-img" class="del" style="font-size:11px;">quitar</button>' : ''}
      </div>
    `
  }
];

function render(){
  const allRows = query("SELECT * FROM catalogo ORDER BY id DESC");
  const q = searchQuery.toLowerCase();
  const rows = q ? allRows.filter(r =>
    (r.nombre && r.nombre.toLowerCase().includes(q)) ||
    (r.descripcion && r.descripcion.toLowerCase().includes(q))
  ) : allRows;

  const grid = document.getElementById("cat-grid");
  if (!grid) return;

  grid.innerHTML = rows.length ? rows.map(r => `
    <div class="cat-card">
      ${r.foto ? `<img src="${r.foto}" alt="${r.nombre}" class="cat-card-img" loading="lazy">` : `<div class="cat-card-placeholder">Sin foto</div>`}
      <div class="cat-card-body">
        <div class="cat-card-title">${r.nombre}</div>
        <div class="cat-card-price">${money(r.precio)}</div>
        ${r.descripcion ? `<div class="cat-card-desc">${r.descripcion}</div>` : ''}
        <div class="cat-card-actions">
          <button class="del" data-edit-cat="${r.id}">editar</button>
          <button class="del" data-del-cat="${r.id}">eliminar</button>
        </div>
      </div>
    </div>
  `).join("") : `<div class="empty" style="grid-column: 1 / -1;">${searchQuery ? 'No se encontraron productos en el catálogo con esa búsqueda.' : 'No hay productos en el catálogo todavía.'}</div>`;
}

function openEdit(id){
  const row = query("SELECT * FROM catalogo WHERE id=?", [id])[0];
  if (!row) return;

  showEditModal("Editar producto del catálogo", buildFieldsHtml(EDIT_FIELDS, row), values => {
    exec("UPDATE catalogo SET nombre=?, precio=?, descripcion=?, foto=? WHERE id=?",
      [values.nombre, parseFloat(values.precio), values.descripcion || '', values.foto || null, id]);
  });

  // Escuchadores dinámicos dentro del modal para cambiar o quitar foto
  const fileInput = document.getElementById("modal-cat-file");
  const hiddenInput = document.getElementById("modal-cat-hidden");
  const imgPreview = document.getElementById("modal-cat-preview");
  const btnDelImg = document.getElementById("modal-cat-del-img");

  if (fileInput) {
    fileInput.addEventListener("change", async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const base64 = await comprimirImagen(file);
        if (hiddenInput) hiddenInput.value = base64;
        if (imgPreview) {
          imgPreview.src = base64;
          imgPreview.style.display = "block";
        }
      } catch (err) {
        alert("Error al procesar la imagen: " + err.message);
      }
    });
  }

  if (btnDelImg) {
    btnDelImg.addEventListener("click", () => {
      if (hiddenInput) hiddenInput.value = "";
      if (imgPreview) {
        imgPreview.src = "";
        imgPreview.style.display = "none";
      }
      btnDelImg.style.display = "none";
    });
  }
}

function generarPdfCatalogo(){
  const jsPDF = window.jspdf?.jsPDF || window.jsPDF;
  if (!jsPDF) {
    alert("No se encontró la librería jsPDF. Asegúrate de tener ./vendor/jspdf.umd.min.js.");
    return;
  }

  const rows = query("SELECT * FROM catalogo ORDER BY nombre ASC");
  if (!rows.length) {
    alert("El catálogo no tiene productos para exportar.");
    return;
  }

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 15;
  const contentWidth = pageWidth - (margin * 2);

  // Encabezado
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(31, 43, 34); // #1F2B22
  doc.text("Catálogo de Productos", margin, 20);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(74, 90, 78); // #4A5A4E
  doc.text(`Lista de precios oficial · Emitido el ${toLocalIsoDate()}`, margin, 26);

  // Línea divisoria
  doc.setDrawColor(201, 191, 160); // #C9BFA0
  doc.setLineWidth(0.5);
  doc.line(margin, 30, pageWidth - margin, 30);

  let y = 38;
  const rowHeight = 24;

  rows.forEach(prod => {
    // Salto de página si nos acercamos al final
    if (y + rowHeight > pageHeight - 15) {
      doc.addPage();
      y = 20;
    }

    // Miniatura de foto o recuadro
    const imgSize = 18;
    if (prod.foto) {
      try {
        doc.addImage(prod.foto, 'JPEG', margin, y, imgSize, imgSize);
      } catch (e) {
        doc.setDrawColor(200, 200, 200);
        doc.rect(margin, y, imgSize, imgSize);
      }
    } else {
      doc.setDrawColor(215, 210, 200);
      doc.rect(margin, y, imgSize, imgSize);
      doc.setFontSize(7);
      doc.setTextColor(130, 130, 130);
      doc.text("Sin foto", margin + 3.5, y + 10);
    }

    // Nombre del producto
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(31, 43, 34);
    doc.text(prod.nombre, margin + imgSize + 5, y + 6);

    // Descripción
    if (prod.descripcion) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(80, 80, 80);
      const descLines = doc.splitTextToSize(prod.descripcion, contentWidth - imgSize - 45);
      doc.text(descLines.slice(0, 2), margin + imgSize + 5, y + 12);
    }

    // Precio
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(47, 107, 79); // #2F6B4F
    doc.text(money(prod.precio), pageWidth - margin, y + 7, { align: 'right' });

    // Separador entre filas
    doc.setDrawColor(230, 225, 215);
    doc.setLineWidth(0.3);
    doc.line(margin, y + imgSize + 3, pageWidth - margin, y + imgSize + 3);

    y += rowHeight;
  });

  doc.save(`catalogo_${toLocalIsoDate()}.pdf`);
}

export function initCatalogo(){
  document.addEventListener('libro:changed', render);

  const form = document.getElementById("form-cat");
  const fileInput = document.getElementById("cat-foto-input");
  const hiddenInput = document.getElementById("cat-foto-base64");
  const previewWrap = document.getElementById("cat-foto-preview-wrap");
  const previewImg = document.getElementById("cat-foto-preview");
  const btnRemovePhoto = document.getElementById("cat-foto-remove");

  // Procesar y comprimir foto al seleccionarla
  if (fileInput) {
    fileInput.addEventListener("change", async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const base64 = await comprimirImagen(file);
        if (hiddenInput) hiddenInput.value = base64;
        if (previewImg) previewImg.src = base64;
        if (previewWrap) previewWrap.style.display = "flex";
      } catch (err) {
        alert("No se pudo procesar la foto: " + err.message);
        fileInput.value = "";
      }
    });
  }

  // Quitar foto seleccionada
  if (btnRemovePhoto) {
    btnRemovePhoto.addEventListener("click", () => {
      if (fileInput) fileInput.value = "";
      if (hiddenInput) hiddenInput.value = "";
      if (previewWrap) previewWrap.style.display = "none";
      if (previewImg) previewImg.src = "";
    });
  }

  // Agregar nuevo producto al catálogo
  if (form) {
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const nombre = f.get("nombre");
      const precio = parseFloat(f.get("precio"));
      const descripcion = f.get("descripcion") || '';
      const foto = f.get("foto") || null;

      await exec("INSERT INTO catalogo(nombre, precio, descripcion, foto) VALUES (?,?,?,?)",
        [nombre, precio, descripcion, foto]);

      e.target.reset();
      if (fileInput) fileInput.value = "";
      if (hiddenInput) hiddenInput.value = "";
      if (previewWrap) previewWrap.style.display = "none";
      if (previewImg) previewImg.src = "";
    });
  }

  // Búsqueda en vivo
  const busq = document.getElementById("busq-cat");
  if (busq) {
    busq.addEventListener("input", e => {
      searchQuery = e.target.value.trim();
      render();
    });
  }

  // Descargar PDF
  const btnPdf = document.getElementById("btn-descargar-pdf-cat");
  if (btnPdf) {
    btnPdf.addEventListener("click", generarPdfCatalogo);
  }

  // Acciones de editar y eliminar
  document.body.addEventListener("click", e => {
    if (e.target.dataset.editCat) openEdit(e.target.dataset.editCat);
    if (e.target.dataset.delCat) {
      if (confirm("¿Deseas eliminar este producto del catálogo?")) {
        exec("DELETE FROM catalogo WHERE id=?", [e.target.dataset.delCat]);
      }
    }
  });
}
