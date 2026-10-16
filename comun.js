// Lo que comparten el formulario y el tablero.

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function nuevoId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

// Todos los pedidos van por GET con el JSON en "data", como siempre.
function llamarScript(payload) {
  const data = encodeURIComponent(JSON.stringify(payload));
  return fetch(`${APPS_SCRIPT_URL}?data=${data}`, { method: "GET" }).then(r => r.json());
}

// Texto para el toast según el error que devolvió el script.
function mensajeDeError(res) {
  if (res && res.error === "limite") return "⚠️ Límite por hora alcanzado, probá más tarde";
  if (res && res.error === "cuotas_invalidas") return "⚠️ No podés dejar menos cuotas que la que estás editando";
  if (res && res.error === "no_encontrado") return "⚠️ No se encontró el gasto, recargá el tablero";
  return "Error al guardar, intentá de nuevo";
}

function miles(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function plata(n) {
  return "$ " + miles(n);
}

function escapar(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

let toastTimer = null;
function mostrarToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3000);
}
