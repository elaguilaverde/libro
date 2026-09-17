// ui.js — piezas de interfaz que cualquier módulo puede reutilizar.
// No sabe nada de ventas, inventario ni cuentas: solo de tabs, formato y el modal.

export function money(n){
  return "$" + Number(n).toLocaleString("es", { minimumFractionDigits:2, maximumFractionDigits:2 });
}

export function setStatus(t){
  document.getElementById("status").textContent = t;
}

export function initTabs(){
  document.querySelectorAll("nav.tabs button").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      document.querySelectorAll("nav.tabs button").forEach(b=>b.classList.remove("active"));
      document.querySelectorAll(".panel").forEach(p=>p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("panel-"+btn.dataset.tab).classList.add("active");
    });
  });
}

// Construye los <div class="field"> de un formulario a partir de una
// configuración declarativa. fld.type puede ser 'text' | 'number' | 'date',
// 'select' (con fld.options = [[valor,texto],...]) o 'html' (fld.html(valorActual)
// para casos especiales, como el selector de productos).
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
