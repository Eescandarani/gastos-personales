// ============================================================
//  CONFIGURACIÓN
// ============================================================
const SHEET_NAME = "Respuestas de formulario 1";
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

// Posición de cada columna en la fila (0 = columna A)
const COL = {
  TS: 0, MES: 1, MES_NUM: 2, ANIO: 3, FECHA: 4, CATEGORIA: 5, DESC: 6,
  MONTO: 7, MEDIO: 8, COMPARTIDO: 9, ES_CUOTAS: 10, MONTO_FINAL: 11,
  CUOTA: 12, CUOTAS: 13, TIPO_INV: 14, ID: 15, GRUPO: 16, ELIMINADO: 17
};
const NUM_COLS = 18;
const ELIMINADO_SI = "Sí";
const RE_SUFIJO_CUOTA = /\s*—\s*cuota \d+\/\d+$/;

// ============================================================
//  PUNTO DE ENTRADA — recibe los datos vía GET
// ============================================================
// Cada pedido trae un "accion": guardar (por defecto, para que el
// formulario actual siga andando), listar, editar o eliminar.
function doGet(e) {
  let data;
  try {
    data = leerPedido_(e);
  } catch (err) {
    return json_({ ok: false, error: "pedido_invalido" });
  }

  const accion = data.accion || "guardar";

  // Listar solo lee: no toma el lock ni gasta cupo del límite por hora,
  // así abrir el tablero varias veces no bloquea la carga de gastos.
  if (accion === "listar") {
    try {
      return json_(listarGastos(data));
    } catch (err) {
      return json_({ ok: false, error: err.message });
    }
  }

  // El lock atiende los pedidos de a uno. Sin esto, dos reintentos que
  // llegan en el mismo segundo revisan el registro de remitos antes de
  // que ninguno se haya anotado, y pasan los dos.
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);

    if (accion === "guardar") return json_(atenderGuardado_(data));

    if (accion === "editar" || accion === "eliminar") {
      if (!dentroDelLimite_()) return json_({ error: "limite" });
      return json_(accion === "editar" ? editarGasto(data) : eliminarGasto(data));
    }

    return json_({ ok: false, error: "accion_desconocida" });

  } catch (err) {
    return json_({ ok: false, error: err.message });

  } finally {
    // Se libera siempre, incluso si algo explotó en el medio.
    if (lock.hasLock()) lock.releaseLock();
  }
}

function leerPedido_(e) {
  // Si la descripción trae un "%" el decode falla, así que en ese caso
  // se usa el texto tal como llegó.
  const crudo = e.parameter.data;
  let texto;
  try { texto = decodeURIComponent(crudo); } catch (err) { texto = crudo; }
  return JSON.parse(texto);
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function dentroDelLimite_() {
  const cache = CacheService.getScriptCache();
  const clave = "gastos_" + Math.floor(Date.now() / 3600000);
  const usados = Number(cache.get(clave) || 0);
  if (usados >= 20) return false;
  cache.put(clave, String(usados + 1), 3900);
  return true;
}

function hoja_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
}

// ============================================================
//  GUARDAR
// ============================================================
function atenderGuardado_(data) {
  // --- Control de duplicados (número de remito) ---
  const cache = CacheService.getScriptCache();
  const clave = data.idEnvio ? "envio_" + data.idEnvio : null;

  if (clave && cache.get(clave)) {
    // Este remito ya se guardó: es un reintento de la red, no un gasto nuevo.
    // Se sale acá, antes del límite por hora, para no gastar cupo.
    return { ok: true, duplicado: true, cuotas: data.cuotas || 1 };
  }

  // --- Límite por hora ---
  if (!dentroDelLimite_()) return { error: "limite" };

  // --- Guardado real ---
  const result = guardarGasto(data);

  // El remito se anota recién ahora, después de escribir bien en la planilla.
  // Si algo falló antes, no queda anotado y podés reintentar el mismo gasto.
  if (clave) cache.put(clave, "1", 21600); // 6 horas

  return result;
}

function guardarGasto(data) {
  const sheet = hoja_();
  const d = normalizar_(data);
  const ahora = new Date();

  // El grupo junta las cuotas de una misma compra. Se usa el remito,
  // así un reintento que se cuele igual queda en el mismo grupo.
  const grupo = data.idEnvio || Utilities.getUuid();

  for (let i = 0; i < d.cuotas; i++) {
    sheet.appendRow(armarFila_(d, i + 1, d.cuotas, d.mes0 + i, d.anio, ahora, grupo));
  }

  return { ok: true, cuotas: d.cuotas, grupo };
}

// ============================================================
//  LISTAR — gastos de un mes, sin los eliminados
// ============================================================
// Pedido: { accion: "listar", mes: 1-12, anio }
// o { accion: "listar", todos: true } para todos los meses (análisis global).
function listarGastos(data) {
  const todos = data.todos === true;
  const mes = Number(data.mes);
  const anio = Number(data.anio);
  const values = hoja_().getDataRange().getValues();
  const gastos = [];

  for (let i = 1; i < values.length; i++) {
    const v = values[i];
    if (!todos && (Number(v[COL.MES_NUM]) !== mes || Number(v[COL.ANIO]) !== anio)) continue;
    if (estaEliminado_(v)) continue;

    gastos.push({
      id: String(v[COL.ID]),
      grupo: String(v[COL.GRUPO]),
      ts: v[COL.TS] instanceof Date ? v[COL.TS].toISOString() : String(v[COL.TS]),
      descripcion: String(v[COL.DESC]).replace(RE_SUFIJO_CUOTA, ""),
      detalle: String(v[COL.DESC]),
      categoria: String(v[COL.CATEGORIA]),
      montoTotal: numero_(v[COL.MONTO]),
      monto: numero_(v[COL.MONTO_FINAL]),
      medioPago: String(v[COL.MEDIO]),
      compartido: String(v[COL.COMPARTIDO]),
      cuota: Number(v[COL.CUOTA]) || 1,
      cuotas: Number(v[COL.CUOTAS]) || 1,
      // Las cuotas viejas se cargaron sueltas, sin total: se reconocen por esta columna
      esCuotas: String(v[COL.ES_CUOTAS]).trim().toLowerCase().startsWith("s"),
      tipoInversion: String(v[COL.TIPO_INV]),
      mesResumen: Number(v[COL.MES_NUM]) - 1,
      anioResumen: Number(v[COL.ANIO])
    });
  }

  return { ok: true, gastos };
}

// ============================================================
//  ELIMINAR — marca las filas, no las borra
// ============================================================
// Pedido: { accion: "eliminar", id, alcance: "esta" | "siguientes" }
// "siguientes" marca esta cuota y las que vienen después en el mismo grupo.
function eliminarGasto(data) {
  const sheet = hoja_();
  const values = sheet.getDataRange().getValues();
  const fila = buscarPorId_(values, data.id);
  const desde = Number(values[fila][COL.CUOTA]) || 1;
  const grupo = values[fila][COL.GRUPO];

  const filas = data.alcance === "siguientes"
    ? filasDelGrupo_(values, grupo).filter((i) => (Number(values[i][COL.CUOTA]) || 1) >= desde)
    : [fila];

  let eliminadas = 0;
  filas.forEach((i) => {
    if (estaEliminado_(values[i])) return;
    sheet.getRange(i + 1, COL.ELIMINADO + 1).setValue(ELIMINADO_SI);
    eliminadas++;
  });

  return { ok: true, eliminadas };
}

// ============================================================
//  EDITAR
// ============================================================
// Pedido: { accion: "editar", id, alcance: "esta" | "siguientes", datos }
// "datos" tiene los mismos campos que el formulario de alta.
//
// - "esta": cambia solo esa fila. Conserva su número y total de cuotas.
// - "siguientes": reescribe esta cuota y las que vienen, arrancando en el
//   mes elegido. Si bajan las cuotas, las que sobran quedan eliminadas;
//   si suben, se agregan al final. Las cuotas anteriores no cambian de
//   monto ni de mes, solo actualizan el total ("cuota 2/4").
//   Un gasto sin cuotas se edita siempre con "siguientes".
function editarGasto(data) {
  const sheet = hoja_();
  const values = sheet.getDataRange().getValues();
  const fila = buscarPorId_(values, data.id);
  const actual = values[fila];
  const d = normalizar_(data.datos || {});

  const grupo = String(actual[COL.GRUPO]);
  const k = Number(actual[COL.CUOTA]) || 1;
  const totalActual = Number(actual[COL.CUOTAS]) || 1;
  const ts = actual[COL.TS];

  if (data.alcance === "esta") {
    const nueva = armarFila_(d, k, totalActual, d.mes0, d.anio, ts, grupo);
    sheet.getRange(fila + 1, 1, 1, NUM_COLS).setValues([nueva]);
    return { ok: true, editadas: 1, agregadas: 0, eliminadas: 0 };
  }

  const totalNuevo = d.cuotas;
  // No se puede dejar menos cuotas que la que estás editando.
  if (totalNuevo < k) throw new Error("cuotas_invalidas");

  // Filas del grupo por número de cuota, incluidas las eliminadas,
  // para reusar su ID si una cuota vuelve a hacer falta.
  const porCuota = {};
  filasDelGrupo_(values, grupo).forEach((i) => {
    porCuota[Number(values[i][COL.CUOTA]) || 1] = i;
  });

  // Cuotas anteriores: solo el total y la descripción.
  if (totalNuevo !== totalActual) {
    for (let n = 1; n < k; n++) {
      const i = porCuota[n];
      if (i === undefined) continue;
      const base = String(values[i][COL.DESC]).replace(RE_SUFIJO_CUOTA, "");
      sheet.getRange(i + 1, COL.DESC + 1).setValue(`${base} — cuota ${n}/${totalNuevo}`);
      sheet.getRange(i + 1, COL.CUOTAS + 1).setValue(totalNuevo);
    }
  }

  let editadas = 0, agregadas = 0, eliminadas = 0;

  for (let n = k; n <= totalNuevo; n++) {
    const nueva = armarFila_(d, n, totalNuevo, d.mes0 + (n - k), d.anio, ts, grupo);
    const i = porCuota[n];
    if (i !== undefined) {
      sheet.getRange(i + 1, 1, 1, NUM_COLS).setValues([nueva]);
      editadas++;
    } else {
      sheet.appendRow(nueva);
      agregadas++;
    }
  }

  Object.keys(porCuota).forEach((n) => {
    const i = porCuota[n];
    if (Number(n) > totalNuevo && !estaEliminado_(values[i])) {
      sheet.getRange(i + 1, COL.ELIMINADO + 1).setValue(ELIMINADO_SI);
      eliminadas++;
    }
  });

  return { ok: true, editadas, agregadas, eliminadas };
}

// ============================================================
//  AUXILIARES
// ============================================================
// Deja los datos del formulario listos para escribir.
function normalizar_(data) {
  const d = {
    descripcion: String(data.descripcion || "").trim(),
    categoria: String(data.categoria || ""),
    montoTotal: parseFloat(String(data.montoTotal).replace(/\./g, "")),
    medioPago: data.medioPago === "Contado" ? "Contado" : "Crédito",
    compartido: data.compartido === "Si" ? "Si" : "No",
    mes0: parseInt(data.mesResumen),
    anio: parseInt(data.anioResumen),
    cuotas: Math.min(Math.max(parseInt(data.cuotas) || 1, 1), 48),
    tipoInversion: data.tipoInversion || ""
  };
  if (d.medioPago === "Contado") d.cuotas = 1;

  if (!d.descripcion || !d.categoria || !(d.montoTotal > 0) ||
      isNaN(d.mes0) || isNaN(d.anio)) {
    throw new Error("datos_invalidos");
  }
  return d;
}

// Arma una fila completa (columnas A a R) para una cuota.
function armarFila_(d, nroCuota, totalCuotas, mes0, anio, ts, grupo) {
  while (mes0 > 11) { mes0 -= 12; anio++; }

  const montoPorCuota = parseFloat((d.montoTotal / totalCuotas).toFixed(2));
  const montoFinal = d.compartido === "Si"
    ? parseFloat((montoPorCuota / 2).toFixed(2))
    : montoPorCuota;

  const descripcion = totalCuotas > 1
    ? `${d.descripcion} — cuota ${nroCuota}/${totalCuotas}`
    : d.descripcion;

  return [
    ts,
    MESES[mes0],
    mes0 + 1,
    anio,
    new Date(anio, mes0, 1),
    d.categoria,
    descripcion,
    d.montoTotal,
    d.medioPago,
    d.compartido,
    totalCuotas > 1 ? "Si" : "No",
    montoFinal,
    nroCuota,
    totalCuotas,
    d.tipoInversion,
    `${grupo}-${nroCuota}`,
    grupo,
    "No"
  ];
}

function buscarPorId_(values, id) {
  if (!id) throw new Error("no_encontrado");
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][COL.ID]) === String(id)) return i;
  }
  throw new Error("no_encontrado");
}

function filasDelGrupo_(values, grupo) {
  const filas = [];
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][COL.GRUPO]) === String(grupo)) filas.push(i);
  }
  return filas;
}

function estaEliminado_(v) {
  return String(v[COL.ELIMINADO]).trim().toLowerCase().startsWith("s");
}

// Algunas filas viejas guardaron el monto como texto ("$30,000.00").
function numero_(x) {
  if (typeof x === "number") return x;
  return parseFloat(String(x).replace(/[$\s,]/g, "")) || 0;
}
