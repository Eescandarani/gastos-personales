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

// ---------- Gastos compartidos ----------

// Lee la planilla de compartidos y devuelve tu parte de cada gasto, con la misma
// forma que los gastos personales (mesResumen de 0 a 11, medioPago, cuotas...).
// Lo que corresponde solo a Iru queda afuera; lo de los dos va a la mitad.
function cargarCompartidos() {
  return fetch(COMPARTIDOS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ accion: "listar" })
  })
  .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
  .then(res => {
    if (!res.ok) throw new Error(res.error || "compartidos");
    return res.gastos.map(armarCompartido).filter(g => g && g.monto > 0);
  });
}

function armarCompartido(f) {
  const descripcion = String(f.descripcion ?? "").trim();
  const mes = Number(f.mes), anio = Number(f.anio);
  if (!descripcion || !mes || !anio) return null;

  // Las cuotas se guardan como "Caldera 2/6"
  const suf = descripcion.match(/\s*(\d+)\s*\/\s*(\d+)\s*$/);
  const enCuotas = /^s/i.test(String(f.esCuotas ?? "")) && !!suf;
  const base = enCuotas ? descripcion.slice(0, suf.index).trim() : descripcion;
  const cuotas = enCuotas ? Number(suf[2]) : 1;

  const total = Number(f.montoCuota) || Number(f.monto) || 0;
  const corresponde = String(f.corresponde ?? "").trim().toLowerCase();
  const parte = corresponde === YO.toLowerCase() ? 1 : corresponde === "iru" ? 0 : 0.5;

  return {
    id: "c" + f.fila,
    grupo: "c:" + base.toLowerCase() + "/" + cuotas,
    descripcion: base,
    detalle: descripcion,
    categoria: String(f.categoria ?? "").trim() || "Otro",
    monto: total * parte,
    medioPago: /contado/i.test(String(f.medio ?? "")) ? "Contado" : "Crédito",
    cuota: enCuotas ? Number(suf[1]) : 1,
    cuotas,
    esCuotas: enCuotas,
    mesResumen: mes - 1,
    anioResumen: anio,
    deCompartidos: true
  };
}

// Preferencia del switch, compartida entre Gastos del mes y Global.
// Si el navegador no deja guardar, arranca prendido.
function leerIncluirCompartidos() {
  try { return localStorage.getItem("incluirCompartidos") !== "no"; } catch (e) { return true; }
}
function guardarIncluirCompartidos(si) {
  try { localStorage.setItem("incluirCompartidos", si ? "si" : "no"); } catch (e) { /* sin guardar */ }
}

// Arma el switch "Incluir compartidos" dentro de cont. alCambiar(prendido) se
// llama al tocarlo. Devuelve { prendido(), deshabilitar(mensaje) }.
function montarSwitchCompartidos(cont, alCambiar) {
  let prendido = leerIncluirCompartidos();
  cont.innerHTML = `
    <button type="button" class="switch-compartidos" role="switch" aria-checked="${prendido}">
      <span class="texto">Incluir compartidos</span>
      <span class="switch chico${prendido ? " on" : ""}"><span class="knob"></span></span>
    </button>
    <span class="switch-aviso hidden" role="status"></span>`;
  const btn = cont.querySelector("button");
  btn.addEventListener("click", () => {
    prendido = !prendido;
    guardarIncluirCompartidos(prendido);
    btn.setAttribute("aria-checked", prendido);
    btn.querySelector(".switch").classList.toggle("on", prendido);
    alCambiar(prendido);
  });
  return {
    prendido: () => prendido && !btn.disabled,
    deshabilitar(mensaje) {
      btn.disabled = true;
      btn.querySelector(".switch").classList.remove("on");
      btn.setAttribute("aria-checked", "false");
      const aviso = cont.querySelector(".switch-aviso");
      aviso.textContent = mensaje;
      aviso.classList.remove("hidden");
    }
  };
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

// Skeleton de los tableros (#carga). Si la espera pasa de 5 segundos, además avisa con un mensaje.
let cargaTimer = null;
function mostrarCarga() {
  const mensaje = document.getElementById("cargaMensaje");
  mensaje.textContent = "";
  document.getElementById("carga").classList.remove("hidden");
  clearTimeout(cargaTimer);
  cargaTimer = setTimeout(() => { mensaje.textContent = "Cargando datos…"; }, 5000);
}

function ocultarCarga() {
  clearTimeout(cargaTimer);
  document.getElementById("carga").classList.add("hidden");
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
