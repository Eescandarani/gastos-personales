// ============================================================
//  CONFIGURACIÓN
// ============================================================
const SHEET_NAME = "Respuestas de formulario 1";
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

// ============================================================
//  PUNTO DE ENTRADA — recibe los datos vía GET
// ============================================================
function doGet(e) {
  // El lock atiende los pedidos de a uno. Sin esto, dos reintentos que
  // llegan en el mismo segundo revisan el registro de remitos antes de
  // que ninguno se haya anotado, y pasan los dos.
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);

    // Se lee el pedido. Si la descripción trae un "%" el decode falla,
    // así que en ese caso se usa el texto tal como llegó.
    const crudo = e.parameter.data;
    let texto;
    try { texto = decodeURIComponent(crudo); } catch (err) { texto = crudo; }
    const data = JSON.parse(texto);

    // --- Control de duplicados (número de remito) ---
    const cache = CacheService.getScriptCache();
    const clave = data.idEnvio ? "envio_" + data.idEnvio : null;

    if (clave && cache.get(clave)) {
      // Este remito ya se guardó: es un reintento de la red, no un gasto nuevo.
      // Se sale acá, antes del límite por hora, para no gastar cupo.
      return ContentService
        .createTextOutput(JSON.stringify({ ok: true, duplicado: true, cuotas: data.cuotas || 1 }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // --- Límite por hora ---
    if (!dentroDelLimite_()) {
      return ContentService
        .createTextOutput(JSON.stringify({ error: "limite" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // --- Guardado real ---
    const result = guardarGasto(data);

    // El remito se anota recién ahora, después de escribir bien en la planilla.
    // Si algo falló antes, no queda anotado y podés reintentar el mismo gasto.
    if (clave) cache.put(clave, "1", 21600); // 6 horas

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);

  } finally {
    // Se libera siempre, incluso si algo explotó en el medio.
    if (lock.hasLock()) lock.releaseLock();
  }
}

function dentroDelLimite_() {
  const cache = CacheService.getScriptCache();
  const clave = "gastos_" + Math.floor(Date.now() / 3600000);
  const usados = Number(cache.get(clave) || 0);
  if (usados >= 20) return false;
  cache.put(clave, String(usados + 1), 3900);
  return true;
}

// ============================================================
//  GUARDA EL GASTO EN EL SHEET
// ============================================================
function guardarGasto(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  const ahora = new Date();

  const cuotas = Math.min(Math.max(parseInt(data.cuotas) || 1, 1), 48);
  const montoTotal = parseFloat(String(data.montoTotal).replace(/\./g, ""));
  const montoPorCuota = parseFloat((montoTotal / cuotas).toFixed(2));
  const montoFinal = data.compartido === "Si"
    ? parseFloat((montoPorCuota / 2).toFixed(2))
    : montoPorCuota;

  let mesInicio = parseInt(data.mesResumen);
  let anioInicio = parseInt(data.anioResumen);

  for (let i = 0; i < cuotas; i++) {
    let mes = mesInicio + i;
    let anio = anioInicio;
    while (mes > 11) { mes -= 12; anio++; }

    const nombreMes = MESES[mes];
    const numMes = mes + 1;
    const fechaMes = new Date(anio, mes, 1);

    const descripcion = cuotas > 1
      ? `${data.descripcion} — cuota ${i + 1}/${cuotas}`
      : data.descripcion;

    sheet.appendRow([
      ahora,
      nombreMes,
      numMes,
      anio,
      fechaMes,
      data.categoria,
      descripcion,
      montoTotal,
      data.medioPago,
      data.compartido,
      cuotas > 1 ? "Si" : "No",
      montoFinal,
      i + 1,
      cuotas,
      data.tipoInversion || ""
    ]);
  }

  return { ok: true, cuotas };
}
