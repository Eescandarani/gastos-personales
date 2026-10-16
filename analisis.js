// Análisis global: gastado, invertido y cuotas, mes a mes, sobre todos los datos.

const MESES_CORTOS = ["ene","feb","mar","abr","may","jun","jul","ago","sept","oct","nov","dic"];
const AZUL = "#3987e5";
// Paleta validada para el fondo oscuro (orden fijo, no se recicla)
const SERIES_INV = [
  { nombre: "Compra de USD", color: "#3987e5" },
  { nombre: "S&P500", color: "#199e70" },
  { nombre: "Bonos", color: "#d95926" },
  { nombre: "Otros", color: "#9085e9" }
];
const SVGNS = "http://www.w3.org/2000/svg";
const $ = id => document.getElementById(id);

let gastos = [];
let mesCuotas = null; // mes elegido en el gráfico de cuotas (clave) o null

// ---------- Utilidades ----------

const clave = g => g.anioResumen * 12 + g.mesResumen;
const etiqueta = k => `${MESES_CORTOS[k % 12]} ${Math.floor(k / 12)}`;
const etiquetaLarga = k => `${MESES[k % 12]} ${Math.floor(k / 12)}`;

function rango(desde, hasta) {
  const r = [];
  for (let k = desde; k <= hasta; k++) r.push(k);
  return r;
}

function compacto(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(".0", "").replace(".", ",") + " M";
  if (n >= 1e3) return Math.round(n / 1e3) + " mil";
  return String(Math.round(n));
}

// Máximo "redondo" y paso de la grilla para 4 divisiones
function escala(max) {
  if (max <= 0) return { tope: 1, paso: 1 };
  const bruto = max / 4;
  const pot = Math.pow(10, Math.floor(Math.log10(bruto)));
  const paso = [1, 2, 2.5, 5, 10].map(m => m * pot).find(p => p >= bruto);
  return { tope: Math.ceil(max / paso) * paso, paso };
}

function nodo(tag, attrs, padre) {
  const n = document.createElementNS(SVGNS, tag);
  Object.entries(attrs || {}).forEach(([k, v]) => n.setAttribute(k, v));
  if (padre) padre.appendChild(n);
  return n;
}

function texto(padre, x, y, contenido, attrs) {
  const t = nodo("text", { x, y, ...attrs }, padre);
  t.textContent = contenido;
  return t;
}

// Tooltip: los textos se ponen con textContent
function crearTooltip(cont) {
  const tip = document.createElement("div");
  tip.className = "tooltip";
  cont.appendChild(tip);
  return {
    mostrar(x, y, titulo, filas) {
      tip.replaceChildren();
      const t = document.createElement("div");
      t.className = "t-titulo";
      t.textContent = titulo;
      tip.appendChild(t);
      filas.forEach(f => {
        const fila = document.createElement("div");
        fila.className = "t-fila";
        const key = document.createElement("span");
        key.className = "t-key";
        if (f.color) {
          const i = document.createElement("i");
          i.style.background = f.color;
          key.appendChild(i);
        }
        key.appendChild(document.createTextNode(f.nombre));
        const b = document.createElement("b");
        b.textContent = f.valor;
        fila.append(key, b);
        tip.appendChild(fila);
      });
      tip.classList.add("visible");
      const ancho = cont.clientWidth;
      const w = tip.offsetWidth;
      tip.style.left = Math.min(Math.max(0, x - w / 2), ancho - w) + "px";
      tip.style.top = Math.max(0, y - tip.offsetHeight - 12) + "px";
    },
    ocultar() { tip.classList.remove("visible"); }
  };
}

const MARGEN = { izq: 56, der: 12, arr: 12, aba: 28 };

// Ejes, grilla y etiquetas del eje X (cada tantos meses para que no se pisen)
function ejes(svg, ancho, alto, meses, xDe, esc) {
  const plotH = alto - MARGEN.arr - MARGEN.aba;
  for (let v = 0; v <= esc.tope + 1e-9; v += esc.paso) {
    const y = MARGEN.arr + plotH - v / esc.tope * plotH;
    nodo("line", { x1: MARGEN.izq, x2: ancho - MARGEN.der, y1: y, y2: y, class: v === 0 ? "base" : "grilla" }, svg);
    texto(svg, MARGEN.izq - 8, y + 4, v === 0 ? "0" : compacto(v), { "text-anchor": "end" });
  }
  // Cada etiqueta ocupa ~64px: se salta las que quedarían encima de la anterior,
  // y la del último mes siempre se muestra.
  const SEPARACION = 72;
  const ultimo = meses.length - 1;
  let xPrevio = -Infinity;
  meses.forEach((k, i) => {
    const x = xDe(i);
    if (i !== ultimo && (x - xPrevio < SEPARACION || xDe(ultimo) - x < SEPARACION)) return;
    // Pegada al borde derecho se alinea a la derecha para no salirse
    const anchor = x > ancho - MARGEN.der - 30 ? "end" : "middle";
    texto(svg, x, alto - 8, etiqueta(k), { "text-anchor": anchor });
    xPrevio = x;
  });
}

// ---------- Gráfico de línea con crosshair ----------

function graficoLinea(cont, meses, valores, opciones = {}) {
  cont.replaceChildren();
  const ancho = cont.clientWidth;
  const alto = 240;
  const plotW = ancho - MARGEN.izq - MARGEN.der;
  const plotH = alto - MARGEN.arr - MARGEN.aba;
  const esc = escala(Math.max(...valores));
  const xDe = i => MARGEN.izq + (meses.length === 1 ? plotW / 2 : i / (meses.length - 1) * plotW);
  const yDe = v => MARGEN.arr + plotH - v / esc.tope * plotH;

  const svg = nodo("svg", { viewBox: `0 0 ${ancho} ${alto}`, height: alto, role: "img", "aria-label": opciones.titulo || "" }, cont);
  ejes(svg, ancho, alto, meses, xDe, esc);

  const puntos = valores.map((v, i) => `${xDe(i)},${yDe(v)}`);
  nodo("path", { d: `M${xDe(0)},${yDe(0)} L${puntos.join(" L")} L${xDe(meses.length - 1)},${yDe(0)} Z`, fill: AZUL, "fill-opacity": 0.1 }, svg);
  nodo("path", { d: `M${puntos.join(" L")}`, fill: "none", stroke: AZUL, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);

  if (opciones.marcadores) {
    valores.forEach((v, i) => nodo("circle", { cx: xDe(i), cy: yDe(v), r: 4, fill: AZUL, stroke: "#151b28", "stroke-width": 2 }, svg));
  }

  // Capa de hover: busca el mes más cercano al puntero
  const guia = nodo("line", { y1: MARGEN.arr, y2: MARGEN.arr + plotH, stroke: "rgba(238,241,248,0.35)", "stroke-width": 1, visibility: "hidden" }, svg);
  const punto = nodo("circle", { r: 5, fill: AZUL, stroke: "#151b28", "stroke-width": 2, visibility: "hidden" }, svg);
  const zona = nodo("rect", { x: MARGEN.izq, y: MARGEN.arr, width: plotW, height: plotH, class: "zona", tabindex: 0, "aria-label": `${opciones.titulo}: usá las flechas para recorrer los meses` }, svg);
  const tip = crearTooltip(cont);
  let actual = meses.length - 1;

  function marcar(i) {
    actual = i;
    const x = xDe(i), y = yDe(valores[i]);
    guia.setAttribute("x1", x); guia.setAttribute("x2", x);
    punto.setAttribute("cx", x); punto.setAttribute("cy", y);
    guia.setAttribute("visibility", "visible"); punto.setAttribute("visibility", "visible");
    tip.mostrar(x, y, etiquetaLarga(meses[i]), [{ nombre: opciones.serie || "Total", valor: plata(valores[i]), color: AZUL }]);
  }
  function limpiar() {
    guia.setAttribute("visibility", "hidden"); punto.setAttribute("visibility", "hidden");
    tip.ocultar();
  }
  const indice = e => {
    const r = svg.getBoundingClientRect();
    const x = (e.clientX - r.left) * (ancho / r.width);
    return Math.max(0, Math.min(meses.length - 1, Math.round((x - MARGEN.izq) / (plotW / Math.max(1, meses.length - 1)))));
  };

  zona.addEventListener("pointermove", e => marcar(indice(e)));
  zona.addEventListener("pointerleave", limpiar);
  zona.addEventListener("focus", () => marcar(actual));
  zona.addEventListener("blur", limpiar);
  zona.addEventListener("keydown", e => {
    if (e.key === "ArrowLeft") { marcar(Math.max(0, actual - 1)); e.preventDefault(); }
    if (e.key === "ArrowRight") { marcar(Math.min(meses.length - 1, actual + 1)); e.preventDefault(); }
    if ((e.key === "Enter" || e.key === " ") && opciones.alElegir) { opciones.alElegir(meses[actual]); e.preventDefault(); }
  });
  if (opciones.alElegir) zona.addEventListener("click", e => opciones.alElegir(meses[indice(e)]));
}

// ---------- Columnas apiladas ----------

function graficoColumnas(cont, meses, series) {
  cont.replaceChildren();
  const ancho = cont.clientWidth;
  const alto = 260;
  const plotW = ancho - MARGEN.izq - MARGEN.der;
  const plotH = alto - MARGEN.arr - MARGEN.aba;
  const totales = meses.map((_, i) => series.reduce((a, s) => a + s.valores[i], 0));
  const esc = escala(Math.max(...totales));
  const banda = plotW / meses.length;
  const barra = Math.max(4, Math.min(24, banda * 0.6));
  const xDe = i => MARGEN.izq + banda * i + banda / 2;
  const alturaDe = v => v / esc.tope * plotH;
  const base = MARGEN.arr + plotH;

  const svg = nodo("svg", { viewBox: `0 0 ${ancho} ${alto}`, height: alto, role: "img", "aria-label": "Invertido por mes, por tipo de inversión" }, cont);
  ejes(svg, ancho, alto, meses, xDe, esc);
  const tip = crearTooltip(cont);
  const grupos = [];

  meses.forEach((k, i) => {
    const g = nodo("g", {}, svg);
    grupos.push(g);
    let y = base;
    const visibles = series.filter(s => s.valores[i] > 0);
    visibles.forEach((s, j) => {
      const h = alturaDe(s.valores[i]);
      const ultimo = j === visibles.length - 1;
      const x0 = xDe(i) - barra / 2;
      // 2px de separación entre segmentos; solo el de arriba lleva la punta redondeada
      const alto = Math.max(0, h - (j > 0 ? 2 : 0));
      const top = y - h;
      if (ultimo && alto > 4) {
        const r = 4;
        nodo("path", { d: `M${x0},${y - (j > 0 ? 2 : 0)} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + barra - r} Q${x0 + barra},${top} ${x0 + barra},${top + r} V${y - (j > 0 ? 2 : 0)} Z`, fill: s.color }, g);
      } else {
        nodo("rect", { x: x0, y: top, width: barra, height: alto, fill: s.color }, g);
      }
      y = top;
    });

    // Zona de hover: toda la banda del mes, más grande que la columna
    const hit = nodo("rect", { x: MARGEN.izq + banda * i, y: MARGEN.arr, width: banda, height: plotH, class: "columna-hit", tabindex: 0, "aria-label": `${etiquetaLarga(k)}: ${plata(totales[i])}` }, svg);
    const mostrar = () => {
      grupos.forEach((otro, j) => otro.setAttribute("opacity", j === i ? 1 : 0.45));
      tip.mostrar(xDe(i), base - alturaDe(totales[i]), etiquetaLarga(k), [
        ...series.filter(s => s.valores[i] > 0).map(s => ({ nombre: s.nombre, valor: plata(s.valores[i]), color: s.color })),
        { nombre: "Total", valor: plata(totales[i]) }
      ]);
    };
    const ocultar = () => { grupos.forEach(otro => otro.setAttribute("opacity", 1)); tip.ocultar(); };
    hit.addEventListener("pointerenter", mostrar);
    hit.addEventListener("pointerleave", ocultar);
    hit.addEventListener("focus", mostrar);
    hit.addEventListener("blur", ocultar);
  });
}

// ---------- Tablas (vista accesible de cada gráfico) ----------

function tabla(cont, columnas, filas) {
  const t = document.createElement("table");
  const cab = t.createTHead().insertRow();
  columnas.forEach((c, i) => {
    const th = document.createElement("th");
    th.textContent = c;
    if (i > 0) th.className = "num";
    cab.appendChild(th);
  });
  const cuerpo = t.createTBody();
  filas.forEach(f => {
    const tr = cuerpo.insertRow();
    f.forEach((v, i) => {
      const td = tr.insertCell();
      td.textContent = v;
      if (i > 0) td.className = "num";
    });
  });
  cont.replaceChildren(t);
}

// ---------- Armado ----------

function sumarPorMes(lista) {
  const m = {};
  lista.forEach(g => { m[clave(g)] = (m[clave(g)] || 0) + g.monto; });
  return m;
}

function extremos(lista) {
  const claves = lista.map(clave);
  return [Math.min(...claves), Math.max(...claves)];
}

function tipoDe(g) {
  return SERIES_INV.some(s => s.nombre === g.tipoInversion) ? g.tipoInversion : "Otros";
}

const esCuota = g => g.esCuotas || g.cuotas > 1;

function pintarGastado() {
  const lista = gastos.filter(g => g.categoria !== "Inversiones");
  if (!lista.length) return;
  const meses = rango(...extremos(lista));
  const suma = sumarPorMes(lista);
  const valores = meses.map(k => suma[k] || 0);
  graficoLinea($("grafGastado"), meses, valores, { titulo: "Gastado por mes", serie: "Gastado" });
  tabla($("tablaGastado"), ["Mes", "Gastado"], meses.map((k, i) => [etiquetaLarga(k), plata(valores[i])]).reverse());
}

function pintarInvertido() {
  const lista = gastos.filter(g => g.categoria === "Inversiones");
  if (!lista.length) return;
  const meses = rango(...extremos(lista));
  const series = SERIES_INV.map(s => {
    const suma = sumarPorMes(lista.filter(g => tipoDe(g) === s.nombre));
    return { ...s, valores: meses.map(k => suma[k] || 0) };
  }).filter(s => s.valores.some(v => v > 0));

  $("leyendaInv").replaceChildren(...series.map(s => {
    const span = document.createElement("span");
    const i = document.createElement("i");
    i.style.background = s.color;
    span.append(i, document.createTextNode(s.nombre));
    return span;
  }));
  graficoColumnas($("grafInvertido"), meses, series);
  tabla($("tablaInvertido"), ["Mes", ...series.map(s => s.nombre), "Total"],
    meses.map((k, i) => [etiquetaLarga(k), ...series.map(s => plata(s.valores[i])), plata(series.reduce((a, s) => a + s.valores[i], 0))]).reverse());
}

function pintarCuotas() {
  const lista = gastos.filter(esCuota);
  if (!lista.length) return;
  const meses = rango(...extremos(lista));
  const suma = sumarPorMes(lista);
  const valores = meses.map(k => suma[k] || 0);
  graficoLinea($("grafCuotas"), meses, valores, {
    titulo: "Cuotas por mes", serie: "En cuotas", marcadores: true,
    alElegir: k => { mesCuotas = mesCuotas === k ? null : k; pintarListaCuotas(); }
  });
  tabla($("tablaCuotas"), ["Mes", "En cuotas"], meses.map((k, i) => [etiquetaLarga(k), plata(valores[i])]).reverse());
  pintarListaCuotas();
}

function pintarListaCuotas() {
  const lista = gastos.filter(esCuota)
    .filter(g => mesCuotas === null || clave(g) === mesCuotas)
    .sort((a, b) => clave(b) - clave(a) || b.monto - a.monto);

  $("cuotasTitulo").textContent = mesCuotas === null ? `Todas las cuotas · ${lista.length}` : `${etiquetaLarga(mesCuotas)} · ${lista.length}`;
  $("cuotasTodas").classList.toggle("hidden", mesCuotas === null);

  $("listaCuotas").replaceChildren(...lista.map(g => {
    const fila = document.createElement("div");
    fila.className = "cuota";
    const info = document.createElement("div");
    info.className = "info";
    const desc = document.createElement("span");
    desc.className = "desc";
    desc.textContent = g.detalle || g.descripcion;
    const mes = document.createElement("span");
    mes.className = "mes";
    mes.textContent = etiquetaLarga(clave(g));
    info.append(desc, mes);
    const monto = document.createElement("span");
    monto.className = "monto";
    monto.textContent = plata(g.monto);
    fila.append(info, monto);
    return fila;
  }));
}

$("cuotasTodas").addEventListener("click", () => { mesCuotas = null; pintarListaCuotas(); });

function pintarTodo() {
  pintarGastado();
  pintarInvertido();
  pintarCuotas();
}

// Los gráficos se redibujan al cambiar el ancho (girar el teléfono, achicar la ventana)
let anchoPrevio = 0;
new ResizeObserver(entradas => {
  const w = entradas[0].contentRect.width;
  if (gastos.length && Math.abs(w - anchoPrevio) > 2) { anchoPrevio = w; pintarTodo(); }
}).observe($("secciones"));

llamarScript({ accion: "listar", todos: true })
.then(res => {
  if (!res.ok) throw new Error(res.error);
  gastos = res.gastos;
  if (!gastos.length) {
    $("estado").textContent = "No hay gastos para analizar. Si recién actualizaste el script, revisá que esté publicada la versión nueva.";
    return;
  }
  $("estado").classList.add("hidden");
  $("secciones").classList.remove("hidden");
  anchoPrevio = $("secciones").clientWidth;
  pintarTodo();
})
.catch(() => {
  $("estado").textContent = "No se pudieron cargar los gastos. Revisá la conexión y recargá la página.";
});
