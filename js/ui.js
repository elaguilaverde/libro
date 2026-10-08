// ui.js — piezas de interfaz que cualquier módulo puede reutilizar.
// No sabe nada de ventas, inventario ni cuentas: solo de tabs, formato, modal, fechas y exportación CSV.

export function money(n){
  return "$" + Number(n).toLocaleString("es", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function setStatus(t){
  const el = document.getElementById("status");
  if (el) el.textContent = t;
}

export function initTabs(){
  document.querySelectorAll("nav.tabs button").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      document.querySelectorAll("nav.tabs button").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      const targetPanel = document.getElementById("panel-" + btn.dataset.tab);
      if (targetPanel) targetPanel.classList.add("active");
    });
  });
}

// Convierte un objeto Date a string "YYYY-MM-DD" en hora local (no UTC)
export function toLocalIsoDate(d = new Date()){
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Devuelve { desde, hasta } según el período elegido
export function getDateRangePreset(preset){
  const now = new Date();
  if (preset === 'hoy'){
    const hoyStr = toLocalIsoDate(now);
    return { desde: hoyStr, hasta: hoyStr };
  }
  if (preset === 'semana'){
    // Semana de Lunes a Domingo
    const day = now.getDay(); // 0: Dom, 1: Lun, ..., 6: Sab
    const diffToMon = day === 0 ? -6 : 1 - day;
    const lunes = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMon);
    const domingo = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMon + 6);
    return { desde: toLocalIsoDate(lunes), hasta: toLocalIsoDate(domingo) };
  }
  if (preset === 'mes'){
    const primerDia = new Date(now.getFullYear(), now.getMonth(), 1);
    const ultimoDia = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { desde: toLocalIsoDate(primerDia), hasta: toLocalIsoDate(ultimoDia) };
  }
  return { desde: null, hasta: null }; // 'todo'
}

// Exporta una matriz de datos a archivo CSV compatible 100% con Excel en español
export function downloadCsv(filename, headers, rows){
  const formatCell = val => {
    if (val == null) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const headerLine = headers.map(formatCell).join(";");
  const dataLines = rows.map(row => row.map(formatCell).join(";"));
  const csvContent = "\uFEFF" + [headerLine, ...dataLines].join("\r\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Construye los <div class="field"> de un formulario a partir de una configuración declarativa.
export function buildFieldsHtml(fields, row){
  return fields.map(fld=>{
    const val = row[fld.name] ?? '';
    if (fld.type === 'select'){
      return `<div class="field"><label>${fld.label}</label><select name="${fld.name}">${
        fld.options.map(([v,l])=>`<option value="${v}" ${String(v)===String(val)?'selected':''}>${l}</option>`).join("")
      }</select></div>`;
    }
    if (fld.type === 'html'){
      return `<div class="field"><label>${fld.label}</label>${fld.html(val)}</div>`;
    }
    return `<div class="field"><label>${fld.label}</label><input name="${fld.name}" type="${fld.type}" ${fld.step?`step="${fld.step}"`:""} value="${val}"></div>`;
  }).join("");
}

let onSaveCallback = null;

export function showEditModal(title, fieldsHtml, onSave){
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-fields").innerHTML = fieldsHtml;
  onSaveCallback = onSave;
  document.getElementById("modal-edit").classList.add("open");
}

function closeModal(){
  document.getElementById("modal-edit").classList.remove("open");
  onSaveCallback = null;
}

document.getElementById("modal-cancel").addEventListener("click", closeModal);
document.getElementById("modal-save").addEventListener("click", ()=>{
  const values = {};
  document.querySelectorAll("#modal-fields [name]").forEach(inp => values[inp.name] = inp.value);
  const cb = onSaveCallback;
  closeModal();
  if (cb) cb(values);
});
