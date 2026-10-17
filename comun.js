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
  if (res && res.error === "no_encontrado") return "⚠️ No se encontró el gasto, recargá la página";
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

// Barra de navegación inferior. Cada página pone <nav id="navbar" data-actual="...">
// y acá se completa, así los íconos viven en un solo lugar.
const SECCIONES = [
  { id: "tablero", href: "tablero.html", texto: "Gastos del mes",
    icono: '<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>' },
  { id: "nuevo", href: "index.html", texto: "Nuevo gasto",
    icono: '<path d="M12 5v14"/><path d="M5 12h14"/>' },
  { id: "global", href: "analisis.html", texto: "Global",
    icono: '<path d="M4 20h16"/><path d="M7 16v-5"/><path d="M12 16V6"/><path d="M17 16v-8"/>' },
];

function montarNavbar() {
  const nav = document.getElementById("navbar");
  if (!nav) return;
  const actual = nav.dataset.actual;
  nav.setAttribute("aria-label", "Secciones");
  nav.innerHTML = SECCIONES.map(s => `
    <a href="${s.href}" class="nav-item${s.id === "nuevo" ? " nav-destacado" : ""}${s.id === actual ? " activo" : ""}"
       ${s.id === actual ? 'aria-current="page"' : ""}>
      <span class="nav-icono"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="${s.id === "nuevo" ? 2.6 : 1.8}" stroke-linecap="round" stroke-linejoin="round">${s.icono}</svg></span>
      <span class="nav-texto">${s.texto}</span>
    </a>`).join("");
}

montarNavbar();
