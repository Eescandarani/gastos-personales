// Tablero: gastos del mes, torta por categoría, listado con editar y eliminar.

const COLORES = {
  Comida: "#f2a541", Transporte: "#5b8def", Salud: "#4fd1c5", Gustos: "#e66a9a",
  Hogar: "#a78bfa", Deporte: "#34c759", Otro: "#93a1bd", Inversiones: "#eef1f8"
};
// Mismos colores que el análisis global, validados para el fondo oscuro
const COLORES_INV = { "Compra de USD": "#3987e5", "S&P500": "#199e70", "Bonos": "#d95926" };

const hoy = new Date();
const estado = {
  gastos: null,          // lo que devolvió "listar" para el mes elegido
  mes: hoy.getMonth() + 1,
  anio: hoy.getFullYear(),
  cat: "",               // categoría elegida en la torta
  medio: "",             // "Contado", "Crédito" o "" (ambos), solo filtra el listado
  menuId: null,          // gasto con el menú ⋯ abierto
  pedido: 0              // para descartar respuestas de un mes que ya no se mira
};

const $ = id => document.getElementById(id);
const formEditar = crearFormulario($("formEditar"), "editar");

// ---------- Filtros ----------

MESES.forEach((m, i) => $("filtroMes").add(new Option(m, i + 1)));
for (let y = 2025; y <= 2030; y++) $("filtroAnio").add(new Option(y, y));
$("filtroMes").value = estado.mes;
$("filtroAnio").value = estado.anio;

$("filtroMes").addEventListener("change", e => { estado.mes = Number(e.target.value); estado.cat = ""; cargar(); });
$("filtroAnio").addEventListener("change", e => { estado.anio = Number(e.target.value); estado.cat = ""; cargar(); });

// ---------- Carga ----------

function cargar() {
  const pedido = ++estado.pedido;
  estado.menuId = null;
  $("estado").textContent = "Cargando gastos…";
  $("estado").classList.remove("hidden");
  $("columnas").classList.add("hidden");

  llamarScript({ accion: "listar", mes: estado.mes, anio: estado.anio })
  .then(res => {
    if (pedido !== estado.pedido) return;
    if (!res.ok) throw new Error(res.error);
    estado.gastos = res.gastos;
    $("estado").classList.add("hidden");
    $("columnas").classList.remove("hidden");
    pintar();
  })
  .catch(() => {
    if (pedido !== estado.pedido) return;
    $("estado").textContent = "No se pudieron cargar los gastos. Revisá la conexión y recargá la página.";
  });
}

// ---------- Cálculos ----------

function suma(gastos) { return gastos.reduce((a, g) => a + g.monto, 0); }

function porCategoria() {
  const gastos = estado.gastos.filter(g => g.categoria !== "Inversiones");
  const total = suma(gastos);
  const sumas = {};
  gastos.forEach(g => { sumas[g.categoria] = (sumas[g.categoria] || 0) + g.monto; });
  let acum = 0;
  return Object.keys(sumas).sort((a, b) => sumas[b] - sumas[a]).map(cat => {
    const desde = acum / total * 360;
    acum += sumas[cat];
    return { cat, monto: sumas[cat], pct: Math.round(sumas[cat] / total * 100), desde, hasta: acum / total * 360, color: COLORES[cat] || "#93a1bd" };
  });
}

function alcance() {
  return estado.cat ? estado.gastos.filter(g => g.categoria === estado.cat) : estado.gastos;
}

// ---------- Pintar ----------

function pintar() {
  const visibles = alcance();
  const gastos = visibles.filter(g => g.categoria !== "Inversiones");

  $("totalLabel").textContent = estado.cat ? `Gastos en ${estado.cat}` : "Gastos totales";
  $("total").textContent = plata(suma(gastos));
  $("contado").textContent = plata(suma(gastos.filter(g => g.medioPago === "Contado")));
  $("credito").textContent = plata(suma(gastos.filter(g => g.medioPago !== "Contado")));
  $("invertido").textContent = plata(suma(visibles.filter(g => g.categoria === "Inversiones")));

  const filtro = $("filtroActivo");
  filtro.classList.toggle("hidden", !estado.cat);
  filtro.innerHTML = `Filtrando: ${escapar(estado.cat)} <span aria-hidden="true">×</span>`;

  pintarTorta();
  pintarLista(visibles);
}

function pintarTorta() {
  const slices = porCategoria();
  const card = $("tortaCard");
  if (!slices.length) {
    card.innerHTML = `<p class="estado">No hay gastos en este mes.</p>`;
    return;
  }
  const fondo = "conic-gradient(" + slices.map(s => {
    const color = estado.cat && estado.cat !== s.cat ? s.color + "40" : s.color;
    return `${color} ${s.desde}deg ${s.hasta}deg`;
  }).join(", ") + ")";

  card.innerHTML = `
    <button class="torta" id="torta" style="background: ${fondo}" aria-label="Gráfico de torta por categoría; tocá una porción para filtrar"></button>
    <div class="leyendas">
      ${slices.map(s => {
        const clase = s.cat === estado.cat ? "activa" : (estado.cat ? "apagada" : "");
        return `<button class="leyenda ${clase}" data-cat="${escapar(s.cat)}" aria-pressed="${s.cat === estado.cat}">
          <span class="punto" style="background: ${s.color}" aria-hidden="true"></span>
          <span class="cat">${escapar(s.cat)}</span>
          <span class="pct">${s.pct}%</span>
          <span class="monto">${plata(s.monto)}</span>
        </button>`;
      }).join("")}
    </div>`;

  $("torta").addEventListener("click", e => {
    const box = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - (box.left + box.width / 2);
    const dy = e.clientY - (box.top + box.height / 2);
    if (Math.hypot(dx, dy) > box.width / 2) return;
    const grados = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
    const s = slices.find(x => grados >= x.desde && grados < x.hasta);
    if (s) elegirCategoria(s.cat);
  });
}

function esContado(g) { return g.medioPago === "Contado"; }

function pintarLista(visibles) {
  const filtrados = estado.medio ? visibles.filter(g => esContado(g) === (estado.medio === "Contado")) : visibles;
  const ordenados = filtrados.slice().sort((a, b) => (a.ts < b.ts ? 1 : -1));
  $("filtroMedio").querySelectorAll("[data-medio]").forEach(b => b.setAttribute("aria-pressed", b.dataset.medio === estado.medio));
  $("cantidad").textContent = `Gastos · ${ordenados.length}`;

  if (!ordenados.length) {
    $("lista").innerHTML = `<p class="vacio">No hay gastos para mostrar.</p>`;
    return;
  }

  $("lista").innerHTML = ordenados.map(g => {
    const medio = esContado(g) ? "Contado" : "Tarjeta de crédito";
    const extra = (g.cuotas > 1 ? ` · Cuota ${g.cuota}/${g.cuotas}` : "") + (g.compartido === "Si" ? " · Compartido" : "");
    const abierto = estado.menuId === g.id;
    return `<div class="gasto">
      <div class="info">
        <span class="desc">${escapar(g.descripcion)}</span>
        <span class="meta"><span class="punto" style="background: ${COLORES[g.categoria] || "#93a1bd"}" aria-hidden="true"></span>${escapar(g.categoria)} · ${medio}${extra}</span>
      </div>
      <span class="monto">${plata(g.monto)}</span>
      ${g.id ? `<button class="dots" data-menu="${escapar(g.id)}" aria-label="Opciones del gasto" aria-expanded="${abierto}">⋯</button>` : ""}
      ${abierto ? `<div class="menu" role="menu">
        <button role="menuitem" data-editar="${escapar(g.id)}">Editar</button>
        <button role="menuitem" data-eliminar="${escapar(g.id)}">Eliminar</button>
      </div>` : ""}
    </div>`;
  }).join("") + (estado.menuId ? `<button class="cerrar-menu" data-cerrar-menu aria-label="Cerrar menú"></button>` : "");
}

function elegirCategoria(cat) {
  estado.cat = estado.cat === cat ? "" : cat;
  estado.menuId = null;
  pintar();
}

// ---------- Clicks (delegados) ----------

$("tortaCard").addEventListener("click", e => {
  const b = e.target.closest("[data-cat]");
  if (b) elegirCategoria(b.dataset.cat);
});

$("filtroActivo").addEventListener("click", () => { estado.cat = ""; pintar(); });

$("filtroMedio").addEventListener("click", e => {
  const b = e.target.closest("[data-medio]");
  if (!b) return;
  estado.medio = estado.medio === b.dataset.medio ? "" : b.dataset.medio;
  estado.menuId = null;
  pintar();
});

$("lista").addEventListener("click", e => {
  const menu = e.target.closest("[data-menu]");
  if (menu) {
    estado.menuId = estado.menuId === menu.dataset.menu ? null : menu.dataset.menu;
    return pintar();
  }
  if (e.target.closest("[data-cerrar-menu]")) {
    estado.menuId = null;
    return pintar();
  }
  const editar = e.target.closest("[data-editar]");
  if (editar) return pedirEditar(buscar(editar.dataset.editar));
  const eliminar = e.target.closest("[data-eliminar]");
  if (eliminar) return pedirEliminar(buscar(eliminar.dataset.eliminar));
});

function buscar(id) { return estado.gastos.find(g => g.id === id); }

// ---------- Diálogos ----------

// botones: [{ texto, clase, accion }]. La acción recibe una función para
// marcar el diálogo como ocupado mientras espera al script.
function abrirDialogo({ titulo, texto, html, botones, ancho }) {
  const d = $("dialogo");
  d.classList.toggle("ancho", !!ancho);
  d.innerHTML = `
    ${titulo ? `<h2 id="dialogoTitulo">${escapar(titulo)}</h2>` : ""}
    ${texto ? `<p>${escapar(texto)}</p>` : ""}
    ${html || ""}
    ${botones ? `<div class="dialogo-botones ${botones.length === 2 ? "fila" : ""}">
      ${botones.map((b, i) => `<button class="${b.clase}" data-boton="${i}">${escapar(b.texto)}</button>`).join("")}
    </div>` : ""}`;

  d.querySelectorAll("[data-boton]").forEach(el => {
    el.addEventListener("click", () => {
      const ocupado = valor => d.querySelectorAll("button").forEach(x => { x.disabled = valor; });
      botones[Number(el.dataset.boton)].accion(ocupado);
    });
  });

  $("modalDialogo").classList.remove("hidden");
}

function cerrarDialogo() { $("modalDialogo").classList.add("hidden"); }

// ---------- Eliminar ----------

function pedirEliminar(g) {
  estado.menuId = null;
  pintar();
  const quedan = g.cuotas > 1 && g.cuota < g.cuotas;

  if (quedan) {
    abrirDialogo({
      titulo: "¿Eliminar esta cuota?",
      texto: `“${g.descripcion}” es la cuota ${g.cuota} de ${g.cuotas}. Podés eliminar solo esta o también las siguientes.`,
      botones: [
        { texto: "Solo esta cuota", clase: "btn-peligro", accion: o => eliminar(g, "esta", o) },
        { texto: `Esta y las siguientes (${g.cuotas - g.cuota + 1})`, clase: "btn-peligro", accion: o => eliminar(g, "siguientes", o) },
        { texto: "Cancelar", clase: "btn-secundario", accion: cerrarDialogo }
      ]
    });
  } else {
    abrirDialogo({
      titulo: "¿Eliminar este gasto?",
      texto: `Vas a eliminar “${g.descripcion}” por ${plata(g.monto)}.`,
      botones: [
        { texto: "Cancelar", clase: "btn-secundario", accion: cerrarDialogo },
        { texto: "Eliminar", clase: "btn-peligro", accion: o => eliminar(g, "esta", o) }
      ]
    });
  }
}

function eliminar(g, alcanceElegido, ocupado) {
  ocupado(true);
  llamarScript({ accion: "eliminar", id: g.id, alcance: alcanceElegido })
  .then(res => {
    ocupado(false);
    if (!res.ok) { mostrarToast(mensajeDeError(res)); return; }
    cerrarDialogo();
    mostrarToast(res.eliminadas > 1 ? `✓ ${res.eliminadas} cuotas eliminadas` : "✓ Gasto eliminado");
    cargar();
  })
  .catch(() => { ocupado(false); mostrarToast("Error al eliminar, intentá de nuevo"); });
}

// ---------- Editar ----------

let edicion = null; // { gasto, alcance, original }

function pedirEditar(g) {
  estado.menuId = null;
  pintar();

  if (g.cuotas > 1) {
    abrirDialogo({
      titulo: "¿Qué cuotas querés editar?",
      texto: `“${g.descripcion}” es la cuota ${g.cuota} de ${g.cuotas}.`,
      botones: [
        { texto: "Solo esta cuota", clase: "btn-primario", accion: () => { cerrarDialogo(); abrirEdicion(g, "esta"); } },
        { texto: "Esta y las siguientes", clase: "btn-primario", accion: () => { cerrarDialogo(); abrirEdicion(g, "siguientes"); } },
        { texto: "Cancelar", clase: "btn-secundario", accion: cerrarDialogo }
      ]
    });
  } else {
    abrirEdicion(g, "siguientes");
  }
}

function abrirEdicion(g, alcanceElegido) {
  formEditar.setMinCuotas(alcanceElegido === "siguientes" ? g.cuota : 1);
  formEditar.setDatos({
    descripcion: g.descripcion,
    montoTotal: g.montoTotal,
    categoria: g.categoria,
    tipoInversion: g.tipoInversion,
    medioPago: g.medioPago,
    compartido: g.compartido,
    cuotas: g.cuotas,
    mesResumen: g.mesResumen,
    anioResumen: g.anioResumen
  });
  formEditar.bloquearCuotas(alcanceElegido === "esta");

  let sub = "";
  if (g.cuotas > 1) {
    sub = alcanceElegido === "esta"
      ? `Cuota ${g.cuota} de ${g.cuotas} · solo esta cuota. El monto es el total de la compra.`
      : `Desde la cuota ${g.cuota} de ${g.cuotas}. El monto es el total de la compra y el mes es el de la cuota ${g.cuota}.`;
  }
  $("subEditar").textContent = sub;
  $("subEditar").classList.toggle("hidden", !sub);

  edicion = { gasto: g, alcance: alcanceElegido, original: JSON.stringify(formEditar.getDatos()) };
  $("modalEditar").classList.remove("hidden");
}

function cerrarEdicion() {
  $("modalEditar").classList.add("hidden");
  edicion = null;
}

$("btnCancelarEdicion").addEventListener("click", cerrarEdicion);

$("btnGuardarEdicion").addEventListener("click", () => {
  const error = formEditar.validar();
  if (error) { mostrarToast(error); return; }

  const datos = formEditar.getDatos();
  if (JSON.stringify(datos) === edicion.original) { cerrarEdicion(); return; }

  const g = edicion.gasto;
  if (edicion.alcance === "siguientes" && datos.cuotas < g.cuota) {
    mostrarToast(`⚠️ No podés dejar menos de ${g.cuota} cuotas`);
    return;
  }

  // Si bajan las cuotas, las que sobran se eliminan: se avisa antes.
  if (edicion.alcance === "siguientes" && datos.cuotas < g.cuotas) {
    const desde = datos.cuotas + 1;
    const cuales = desde === g.cuotas ? `la cuota ${g.cuotas}` : `las cuotas ${desde} a ${g.cuotas}`;
    abrirDialogo({
      titulo: "¿Reducir las cuotas?",
      texto: `Pasás de ${g.cuotas} a ${datos.cuotas} cuotas, así que se van a eliminar ${cuales}.`,
      botones: [
        { texto: "Cancelar", clase: "btn-secundario", accion: cerrarDialogo },
        { texto: "Eliminar y guardar", clase: "btn-peligro", accion: o => guardarEdicion(datos, o) }
      ]
    });
    return;
  }

  guardarEdicion(datos);
});

function guardarEdicion(datos, ocupadoDialogo) {
  const btn = $("btnGuardarEdicion");
  const ocupado = valor => {
    btn.disabled = valor;
    btn.textContent = valor ? "Guardando..." : "Guardar cambios";
    if (ocupadoDialogo) ocupadoDialogo(valor);
  };

  ocupado(true);
  llamarScript({ accion: "editar", id: edicion.gasto.id, alcance: edicion.alcance, datos })
  .then(res => {
    ocupado(false);
    if (!res.ok) { mostrarToast(mensajeDeError(res)); return; }
    cerrarDialogo();
    cerrarEdicion();
    mostrarToast("✓ Gasto editado correctamente");
    cargar();
  })
  .catch(() => { ocupado(false); mostrarToast("Error al guardar, intentá de nuevo"); });
}

// ---------- Inversiones por tipo ----------

$("btnInvertido").addEventListener("click", () => {
  const inv = alcance().filter(g => g.categoria === "Inversiones");
  const total = suma(inv);
  const sumas = {};
  inv.forEach(g => { const t = g.tipoInversion || "Sin tipo"; sumas[t] = (sumas[t] || 0) + g.monto; });
  const max = Math.max(0, ...Object.values(sumas));

  const barras = Object.keys(sumas).sort((a, b) => sumas[b] - sumas[a]).map(t => `
    <div>
      <div class="barra-fila">
        <span>${escapar(t)}</span>
        <span><span class="pct">${Math.round(sumas[t] / total * 100)}%</span><span class="valor">${plata(sumas[t])}</span></span>
      </div>
      <div class="barra"><div style="width: ${sumas[t] / max * 100}%; background: ${COLORES_INV[t] || "#9085e9"}"></div></div>
    </div>`).join("");

  abrirDialogo({
    ancho: true,
    html: `
      <div class="inv-cabecera">
        <div>
          <h2 id="dialogoTitulo">Inversiones por tipo</h2>
          <span class="sub" style="color: var(--text-secondary); font-size: 14px">${MESES[estado.mes - 1]} ${estado.anio}</span>
        </div>
        <button class="inv-cerrar" id="invCerrar" aria-label="Cerrar">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#93a1bd" stroke-width="1.8" stroke-linecap="round"><path d="M4 4l10 10"/><path d="M14 4L4 14"/></svg>
        </button>
      </div>
      <span class="inv-total">${plata(total)}</span>
      ${inv.length ? `<div class="barras">${barras}</div>` : `<p>No hubo inversiones en este mes.</p>`}`,
    botones: [{ texto: "Cerrar", clase: "btn-secundario", accion: cerrarDialogo }]
  });
  $("invCerrar").addEventListener("click", cerrarDialogo);
});

cargar();
