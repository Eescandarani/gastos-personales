// Formulario de gasto. Lo usan la pantalla de alta y el modal de editar.
//
// crearFormulario(contenedor, prefijo) dibuja los campos adentro del
// contenedor y devuelve funciones para leerlo, cargarlo y limpiarlo.
// El prefijo hace únicos los id, por si hay más de un formulario en la página.

const TIPOS_INVERSION = ["S&P500", "Bonos", "Compra de USD"];
const CATEGORIAS = ["Comida", "Transporte", "Salud", "Gustos", "Hogar", "Inversiones", "Deporte", "Otro"];

function crearFormulario(contenedor, prefijo) {
  const id = nombre => `${prefijo}-${nombre}`;
  const hoy = new Date();

  contenedor.innerHTML = `
    <div class="monto-hero">
      <span class="monto-prefix">$</span>
      <input type="text" class="monto-input" id="${id("monto")}" placeholder="0" inputmode="numeric" autocomplete="off" aria-label="Monto">
    </div>
    <input class="desc-input" type="text" id="${id("descripcion")}" placeholder="Descripción" autocomplete="off" autocorrect="off" aria-label="Descripción">

    <div class="card">
      <div class="field">
        <div class="select-wrap">
          <select id="${id("categoria")}" class="unset" aria-label="Categoría">
            <option value="" disabled selected>Categoría</option>
            ${CATEGORIAS.map(c => `<option>${c}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="field hidden" id="${id("fieldTipoInversion")}">
        <div class="select-wrap">
          <select id="${id("tipoInversion")}" class="unset" aria-label="Tipo de inversión">
            <option value="" disabled selected>Tipo de inversión</option>
            ${TIPOS_INVERSION.map(t => `<option value="${t}">${escapar(t)}</option>`).join("")}
            <option value="Otros">Otros</option>
          </select>
        </div>
      </div>
      <div class="field hidden" id="${id("fieldInvOtros")}">
        <label for="${id("invOtros")}">Detalle</label>
        <input type="text" id="${id("invOtros")}" placeholder="Describí la inversión" autocomplete="off">
      </div>
    </div>

    <div class="card">
      <div class="chips">
        <button type="button" class="chip active" id="${id("chipCredito")}">Tarjeta de crédito</button>
        <button type="button" class="chip" id="${id("chipContado")}">Contado</button>
      </div>
      <div class="stepper-field" id="${id("fieldCuotas")}">
        <span class="stepper-label">Cuotas</span>
        <div class="stepper">
          <button type="button" class="stepper-btn" id="${id("cuotasMinus")}" aria-label="Menos cuotas" disabled>−</button>
          <span class="stepper-value" id="${id("cuotasDisplay")}">1</span>
          <button type="button" class="stepper-btn" id="${id("cuotasPlus")}" aria-label="Más cuotas">+</button>
        </div>
      </div>
      <div class="field mes-anio-row">
        <div class="mes-anio-item">
          <label for="${id("mes")}">Mes</label>
          <div class="select-wrap"><select id="${id("mes")}"></select></div>
        </div>
        <div class="mes-anio-item">
          <label for="${id("anio")}">Año</label>
          <div class="select-wrap"><select id="${id("anio")}"></select></div>
        </div>
      </div>
    </div>

    <button type="button" class="toggle-standalone" role="switch" aria-checked="false" id="${id("compartido")}">
      <span class="toggle-text">
        <span class="title">Compartido con Iru</span>
        <span class="sub">Se registra el 50% del monto</span>
      </span>
      <span class="switch" id="${id("switch")}"><span class="knob"></span></span>
    </button>
  `;

  const el = nombre => document.getElementById(id(nombre));

  MESES.forEach((m, i) => el("mes").add(new Option(m, i)));
  for (let y = hoy.getFullYear() - 1; y <= 2030; y++) el("anio").add(new Option(y, y));

  // Estado que no vive en un input
  let medio = "Crédito";
  let cuotas = 1;
  let minCuotas = 1;
  let compartido = false;
  let cuotasBloqueadas = false;

  function pintarMedio() {
    el("chipCredito").classList.toggle("active", medio === "Crédito");
    el("chipContado").classList.toggle("active", medio === "Contado");
    el("fieldCuotas").classList.toggle("hidden", medio !== "Crédito");
  }

  function pintarCuotas() {
    el("cuotasDisplay").textContent = cuotas;
    el("cuotasMinus").disabled = cuotasBloqueadas || cuotas <= minCuotas;
    el("cuotasPlus").disabled = cuotasBloqueadas || cuotas >= 48;
    el("chipCredito").disabled = cuotasBloqueadas;
    el("chipContado").disabled = cuotasBloqueadas;
  }

  function pintarCompartido() {
    el("switch").classList.toggle("on", compartido);
    el("compartido").setAttribute("aria-checked", String(compartido));
  }

  function pintarCategoria() {
    const cat = el("categoria");
    cat.classList.toggle("unset", cat.value === "");
    el("fieldTipoInversion").classList.toggle("hidden", cat.value !== "Inversiones");
    const tipo = el("tipoInversion");
    tipo.classList.toggle("unset", tipo.value === "");
    el("fieldInvOtros").classList.toggle("hidden", cat.value !== "Inversiones" || tipo.value !== "Otros");
  }

  function formatearMonto(valor) {
    const raw = String(valor).replace(/\./g, "").replace(/[^0-9]/g, "");
    return raw.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  el("monto").addEventListener("input", e => { e.target.value = formatearMonto(e.target.value); });
  el("categoria").addEventListener("change", () => {
    el("tipoInversion").value = "";
    el("invOtros").value = "";
    pintarCategoria();
  });
  el("tipoInversion").addEventListener("change", pintarCategoria);
  el("chipCredito").addEventListener("click", () => { medio = "Crédito"; pintarMedio(); });
  el("chipContado").addEventListener("click", () => {
    medio = "Contado"; cuotas = 1;
    pintarMedio(); pintarCuotas();
  });
  el("cuotasMinus").addEventListener("click", () => { cuotas = Math.max(minCuotas, cuotas - 1); pintarCuotas(); });
  el("cuotasPlus").addEventListener("click", () => { cuotas = Math.min(48, cuotas + 1); pintarCuotas(); });
  el("compartido").addEventListener("click", () => { compartido = !compartido; pintarCompartido(); });

  function tipoInversionElegido() {
    if (el("categoria").value !== "Inversiones") return null;
    const tipo = el("tipoInversion").value;
    return tipo === "Otros" ? (el("invOtros").value.trim() || "Otros") : tipo;
  }

  const api = {
    // Datos tal como los espera el script
    getDatos() {
      return {
        descripcion: el("descripcion").value.trim(),
        montoTotal: parseInt(el("monto").value.replace(/\./g, "")) || 0,
        categoria: el("categoria").value,
        medioPago: medio,
        compartido: compartido ? "Si" : "No",
        mesResumen: parseInt(el("mes").value),
        anioResumen: parseInt(el("anio").value),
        cuotas: medio === "Crédito" ? cuotas : 1,
        tipoInversion: tipoInversionElegido()
      };
    },

    // Devuelve el mensaje de error, o null si está todo bien
    validar() {
      const d = api.getDatos();
      if (!d.descripcion) return "⚠️ Completá la descripción";
      if (!d.categoria) return "⚠️ Seleccioná una categoría";
      if (!d.montoTotal || d.montoTotal <= 0) return "⚠️ Ingresá un monto válido";
      return null;
    },

    setDatos(d) {
      el("monto").value = formatearMonto(Math.round(d.montoTotal || 0));
      el("descripcion").value = d.descripcion || "";
      el("categoria").value = d.categoria || "";

      const tipo = d.tipoInversion || "";
      if (!tipo || TIPOS_INVERSION.includes(tipo)) {
        el("tipoInversion").value = tipo;
        el("invOtros").value = "";
      } else {
        el("tipoInversion").value = "Otros";
        el("invOtros").value = tipo === "Otros" ? "" : tipo;
      }

      medio = d.medioPago === "Contado" ? "Contado" : "Crédito";
      cuotas = medio === "Crédito" ? (d.cuotas || 1) : 1;
      compartido = d.compartido === "Si";
      el("mes").value = d.mesResumen;
      el("anio").value = d.anioResumen;
      // Si el año quedó fuera de la lista, se agrega para no perderlo
      if (el("anio").value !== String(d.anioResumen)) {
        el("anio").add(new Option(d.anioResumen, d.anioResumen), 0);
        el("anio").value = d.anioResumen;
      }

      pintarCategoria(); pintarMedio(); pintarCuotas(); pintarCompartido();
    },

    // Limpia lo que se carga en cada gasto. Medio, mes y año quedan como estaban.
    reset() {
      el("monto").value = "";
      el("descripcion").value = "";
      el("categoria").value = "";
      el("tipoInversion").value = "";
      el("invOtros").value = "";
      cuotas = Math.max(1, minCuotas);
      compartido = false;
      pintarCategoria(); pintarCuotas(); pintarCompartido();
    },

    // Para editar "solo esta cuota": no se puede cambiar el medio ni las cuotas
    bloquearCuotas(bloquear) {
      cuotasBloqueadas = bloquear;
      pintarCuotas();
    },

    // Para editar "esta y las siguientes": no se puede bajar de la cuota actual
    setMinCuotas(n) {
      minCuotas = n;
      pintarCuotas();
    }
  };

  el("mes").value = hoy.getMonth();
  el("anio").value = hoy.getFullYear();
  pintarMedio(); pintarCuotas(); pintarCompartido();

  return api;
}
