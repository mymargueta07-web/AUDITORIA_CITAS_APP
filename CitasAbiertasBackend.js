/**
 * ==========================================================
 * CITAS ABIERTAS - BACKEND
 * ==========================================================
 */

const HOJA_REGISTRO_CITAS = "RegistroCitas";
const CARPETA_REPORTES_CITAS_ABIERTAS = "Reportes Citas Abiertas";
const HOJA_SUCURSALES_CITAS_ABIERTAS = "Sucursales";

/**
 * Alias de sucursales
 * BANK se considera parte de CALL CENTER / CENTRAL
 */
const ALIAS_SUCURSALES_CITAS_ABIERTAS = {
  "BANK": "CALL CENTER / CENTRAL"
};

/**
 * Estados que se consideran "abiertos"
 */
const ESTADOS_CITAS_ABIERTAS = [
  "EN ESPERA DE CITA",
  "REPROGRAMADA",
  "CANCELADA",
  "SIN RESPUESTA",
  "BO"
];


/**
 * ==========================================================
 * OBTENER CONFIGURACIÓN DEL MÓDULO
 * Devuelve las sucursales para poblar el selector
 * ==========================================================
 */
function obtenerConfigCitasAbiertas() {
  try {
    const sucursales = obtenerSucursalesCitasAbiertas_();

    return {
      ok: true,
      sucursales: sucursales
    };

  } catch (error) {
    return {
      ok: false,
      mensaje: error.message || error.toString()
    };
  }
}


/**
 * ==========================================================
 * GENERAR VISTA PREVIA DEL REPORTE DE CITAS ABIERTAS
 * ==========================================================
 *
 * @param {string} sucursalSeleccionada
 * @param {string} fechaDesde  formato yyyy-MM-dd
 * @param {string} fechaHasta  formato yyyy-MM-dd
 * @return {Object}
 */
function obtenerReporteCitasAbiertas(sucursalSeleccionada, fechaDesde, fechaHasta) {
  try {

    validarParametrosCitasAbiertas(sucursalSeleccionada, fechaDesde, fechaHasta);

    const registros = obtenerRegistrosCitasAbiertas_(
      sucursalSeleccionada,
      fechaDesde,
      fechaHasta
    );

    const agrupado = agruparPorAsesorCitasAbiertas_(registros);

    const asesores = Object.keys(agrupado)
      .sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }))
      .map(nombre => ({
        asesor: nombre,
        cantidad: agrupado[nombre].length
      }));

    return {
      ok: true,
      filtros: {
        sucursal: sucursalSeleccionada,
        desde: fechaDesde,
        hasta: fechaHasta
      },
      resumen: {
        totalRegistros: registros.length,
        totalAsesores: asesores.length
      },
      asesores: asesores
    };

  } catch (error) {
    return {
      ok: false,
      mensaje: error.message || error.toString()
    };
  }
}


/**
 * ==========================================================
 * EXPORTAR REPORTE DE CITAS ABIERTAS A EXCEL
 * ==========================================================
 *
 * Genera un Spreadsheet temporal con una hoja por asesor
 * y devuelve el archivo para descarga.
 *
 * @param {string} sucursalSeleccionada
 * @param {string} fechaDesde  formato yyyy-MM-dd
 * @param {string} fechaHasta  formato yyyy-MM-dd
 * @return {Object}
 */
function exportarReporteCitasAbiertas(sucursalSeleccionada, fechaDesde, fechaHasta) {
  try {

    validarParametrosCitasAbiertas(sucursalSeleccionada, fechaDesde, fechaHasta);

    const registros = obtenerRegistrosCitasAbiertas_(
      sucursalSeleccionada,
      fechaDesde,
      fechaHasta
    );

    const agrupado = agruparPorAsesorCitasAbiertas_(registros);

    const nombreArchivo =
      "Citas Abiertas - " +
      sucursalSeleccionada +
      " - " +
      fechaDesde +
      " a " +
      fechaHasta;

    const archivo = crearExcelCitasAbiertas_(nombreArchivo, agrupado, {
      sucursal: sucursalSeleccionada,
      desde: fechaDesde,
      hasta: fechaHasta,
      totalRegistros: registros.length
    });

    return {
      ok: true,
      nombre: archivo.nombre,
      url: archivo.url
    };

  } catch (error) {
    return {
      ok: false,
      mensaje: error.message || error.toString()
    };
  }
}


/**
 * ==========================================================
 * VALIDACIONES
 * ==========================================================
 */
function validarParametrosCitasAbiertas(sucursalSeleccionada, fechaDesde, fechaHasta) {

  if (!sucursalSeleccionada) {
    throw new Error("Debes seleccionar una sucursal.");
  }

  if (!fechaDesde) {
    throw new Error("Debes seleccionar la fecha inicial.");
  }

  if (!fechaHasta) {
    throw new Error("Debes seleccionar la fecha final.");
  }

  const sucursalesValidas = obtenerSucursalesCitasAbiertas_();

  if (!sucursalesValidas.includes(sucursalSeleccionada)) {
    throw new Error("La sucursal seleccionada no es válida.");
  }

  const desde = parseFechaISO_(fechaDesde);
  const hasta = parseFechaISO_(fechaHasta);

  if (!desde || !hasta) {
    throw new Error("El rango de fechas no es válido.");
  }

  if (desde.getTime() > hasta.getTime()) {
    throw new Error("La fecha inicial no puede ser mayor que la fecha final.");
  }
}


/**
 * ==========================================================
 * OBTENER SUCURSALES DESDE LA HOJA "Sucursales"
 * ==========================================================
 *
 * Toma la columna A desde la fila 2.
 * Normaliza BANK => CALL CENTER / CENTRAL.
 * Elimina vacíos y duplicados.
 */
function obtenerSucursalesCitasAbiertas_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getSheetByName(HOJA_SUCURSALES_CITAS_ABIERTAS);

  if (!hoja) {
    throw new Error('No existe la hoja "' + HOJA_SUCURSALES_CITAS_ABIERTAS + '".');
  }

  const datos = hoja.getDataRange().getValues();

  if (datos.length <= 1) {
    return [];
  }

  const lista = [];

  for (let i = 1; i < datos.length; i++) {
    const nombre = String(datos[i][0] || "").trim(); // Columna A
    if (!nombre) continue;

    const normalizada = normalizarSucursalCitasAbiertas_(nombre);

    if (!lista.includes(normalizada)) {
      lista.push(normalizada);
    }
  }

  return lista.sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
}


/**
 * ==========================================================
 * OBTENER REGISTROS FILTRADOS
 * ==========================================================
 *
 * Reglas:
 * - Sucursal debe coincidir (BANK => CALL CENTER / CENTRAL)
 * - Timestamp debe estar entre fechaDesde y fechaHasta
 * - Estado debe estar en la lista de estados abiertos
 * - Columna Fecha (H) debe ser:
 *    a) "cita abierta"
 *    o
 *    b) una fecha válida menor a HOY
 */
function obtenerRegistrosCitasAbiertas_(sucursalSeleccionada, fechaDesde, fechaHasta) {

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getSheetByName(HOJA_REGISTRO_CITAS);

  if (!hoja) {
    throw new Error("No existe la hoja: " + HOJA_REGISTRO_CITAS);
  }

  const mapa =
    obtenerMapaEncabezados_(hoja);

  [
    'ID',
    'Timestamp',
    'Cliente',
    'Proceso',
    'Numero',
    'Fecha',
    'Asesor',
    'SucursalOrigen',
    'ESTADO'
  ].forEach(function(nombreEncabezado) {
    obtenerColumnaObligatoria_(
      mapa,
      nombreEncabezado
    );
  });

  const datos = hoja.getDataRange().getValues();

  if (datos.length <= 1) {
    return [];
  }

  const desde = parseFechaISO_(fechaDesde);
  const hasta = parseFechaISO_(fechaHasta);

  // Ajustar hasta al final del día
  hasta.setHours(23, 59, 59, 999);

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const registros = [];

  for (let i = 1; i < datos.length; i++) {

    const fila = datos[i];

    const id = fila[mapa.ID - 1];
    const timestamp = fila[mapa.Timestamp - 1];
    const cliente = fila[mapa.Cliente - 1];
    const proceso = fila[mapa.Proceso - 1];
    const numero = fila[mapa.Numero - 1];
    const fechaCita = fila[mapa.Fecha - 1];
    const asesor = fila[mapa.Asesor - 1];
    let sucursal = fila[mapa.SucursalOrigen - 1];
    const estado = fila[mapa.ESTADO - 1];

    sucursal = normalizarSucursalCitasAbiertas_(sucursal);

    // 1) Filtrar por sucursal
    if (sucursal !== sucursalSeleccionada) {
      continue;
    }

    // 2) Filtrar por Timestamp dentro del rango
    const fechaRegistro = parseFechaFlexible_(timestamp);
    if (!fechaRegistro) {
      continue;
    }

    if (fechaRegistro.getTime() < desde.getTime() || fechaRegistro.getTime() > hasta.getTime()) {
      continue;
    }

    // 3) Estado debe estar dentro de la lista de estados abiertos
    const estadoTexto = String(estado || "").trim().toUpperCase();
    if (!ESTADOS_CITAS_ABIERTAS.includes(estadoTexto)) {
      continue;
    }

    // 4) Fecha (H) debe ser "cita abierta" o fecha anterior a hoy
    if (!esCitaAbiertaOVencida_(fechaCita, hoy)) {
      continue;
    }

    registros.push({
      id: id,
      timestamp: formatearFechaHora_(fechaRegistro),
      cliente: cliente || "",
      numero: numero || "",
      proceso: proceso || "",
      estado: estado || "",
      fecha: valorFechaParaReporte_(fechaCita),
      asesor: (asesor || "SIN ASESOR").toString().trim()
    });
  }

  return registros;
}


/**
 * ==========================================================
 * AGRUPAR REGISTROS POR ASESOR
 * ==========================================================
 */
function agruparPorAsesorCitasAbiertas_(registros) {
  const resultado = {};

  registros.forEach(reg => {
    const asesor = reg.asesor || "SIN ASESOR";

    if (!resultado[asesor]) {
      resultado[asesor] = [];
    }

    resultado[asesor].push(reg);
  });

  return resultado;
}

/**
 * ==========================================================
 * CREA EL ARCHIVO EXCEL DEL REPORTE
 * ==========================================================
 */
function crearExcelCitasAbiertas_(nombreArchivo, agrupadoPorAsesor, meta) {
  const ssTemp = SpreadsheetApp.create(nombreArchivo);
  const hojaInicial = ssTemp.getSheets()[0];

  const asesores = Object.keys(agrupadoPorAsesor)
    .sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));

  if (asesores.length === 0) {
    hojaInicial.setName("Sin registros");

    const filas = [
      ["No se encontraron registros para los filtros seleccionados.", "", "", "", "", ""],
      ["", "", "", "", "", ""],
      ["Sucursal:", meta.sucursal, "", "", "", ""],
      ["Desde:", meta.desde, "", "", "", ""],
      ["Hasta:", meta.hasta, "", "", "", ""]
    ];

    hojaInicial.getRange(1, 1, filas.length, 6).setValues(filas);
    hojaInicial.autoResizeColumns(1, 6);

  } else {
    asesores.forEach((asesor, index) => {
      const nombreHoja = limpiarNombreHoja_(asesor || "SIN ASESOR");
      const hoja = index === 0 ? hojaInicial : ssTemp.insertSheet(nombreHoja);

      hoja.setName(nombreHoja);

      const registros = agrupadoPorAsesor[asesor];
      const filas = [];

      // Todas las filas con 6 columnas
      filas.push(["REPORTE DE CITAS ABIERTAS", "", "", "", "", ""]);
      filas.push(["Sucursal", meta.sucursal, "", "", "", ""]);
      filas.push(["Desde", meta.desde, "", "", "", ""]);
      filas.push(["Hasta", meta.hasta, "", "", "", ""]);
      filas.push(["Asesor", asesor, "", "", "", ""]);
      filas.push(["Total registros", registros.length, "", "", "", ""]);
      filas.push(["", "", "", "", "", ""]);

      filas.push([
        "Fecha Registro",
        "Cliente",
        "Numero",
        "Proceso",
        "Estado",
        "Fecha"
      ]);

      registros.forEach(reg => {
        filas.push([
          reg.timestamp || "",
          reg.cliente || "",
          reg.numero || "",
          reg.proceso || "",
          reg.estado || "",
          reg.fecha || ""
        ]);
      });

      hoja.getRange(1, 1, filas.length, 6).setValues(filas);

      // Formato
      hoja.getRange(1, 1, 1, 6)
        .merge()
        .setFontWeight("bold")
        .setFontSize(13)
        .setHorizontalAlignment("center");

      hoja.getRange(8, 1, 1, 6)
        .setFontWeight("bold");

      hoja.setFrozenRows(8);
      hoja.autoResizeColumns(1, 6);
    });
  }

  SpreadsheetApp.flush();

  // Exportar a XLSX
  const fileId = ssTemp.getId();
  const exportUrl =
    "https://docs.google.com/spreadsheets/d/" + fileId + "/export?format=xlsx";

  const token = ScriptApp.getOAuthToken();
  const response = UrlFetchApp.fetch(exportUrl, {
    headers: {
      Authorization: "Bearer " + token
    },
    muteHttpExceptions: true
  });

  if (response.getResponseCode() !== 200) {
    // Limpiar temporal aunque falle
    try {
      DriveApp.getFileById(fileId).setTrashed(true);
    } catch (e) { }
    throw new Error("No se pudo exportar el archivo Excel.");
  }

  const blob = response.getBlob().setName(nombreArchivo + ".xlsx");

  // Guardar el Excel dentro de la carpeta de reportes
  const carpeta = obtenerCarpetaReportesCitasAbiertas_();
  const archivo = carpeta.createFile(blob);

  // Borrar el spreadsheet temporal de Google Sheets
  try {
    DriveApp.getFileById(fileId).setTrashed(true);
  } catch (e) { }

  return {
    nombre: archivo.getName(),
    url: "https://drive.google.com/uc?export=download&id=" + archivo.getId()
  };
}
/**
 * ==========================================================
 * UTILIDADES DE FECHAS / TEXTO
 * ==========================================================
 */

/**
 * Convierte una sucursal al valor oficial del reporte
 */
function normalizarSucursalCitasAbiertas_(sucursal) {
  const valor = String(sucursal || "").trim();
  return ALIAS_SUCURSALES_CITAS_ABIERTAS[valor] || valor;
}

/**
 * Determina si la columna Fecha (H) representa una cita abierta
 * o una cita con fecha ya vencida
 */
function esCitaAbiertaOVencida_(valorFecha, hoy) {

  const texto = String(valorFecha || "").trim().toLowerCase();

  if (texto === "cita abierta") {
    return true;
  }

  const fecha = parseFechaFlexible_(valorFecha);

  if (!fecha) {
    return false;
  }

  fecha.setHours(0, 0, 0, 0);

  return fecha.getTime() < hoy.getTime();
}

/**
 * Parsea fechas en distintos formatos:
 * - Date real
 * - dd/MM/yyyy
 * - d/M/yyyy
 * - dd/MM/yyyy HH:mm:ss
 * - d/M/yyyy HH:mm:ss
 * - yyyy-MM-dd
 */
function parseFechaFlexible_(valor) {

  if (valor === null || valor === undefined || valor === "") {
    return null;
  }

  // Date real
  if (Object.prototype.toString.call(valor) === "[object Date]") {
    if (isNaN(valor.getTime())) return null;
    return new Date(valor.getTime());
  }

  const texto = String(valor).trim();

  // dd/MM/yyyy o dd/MM/yyyy HH:mm:ss
  if (texto.includes("/")) {
    const partes = texto.split(" ");
    const fechaParte = partes[0];
    const horaParte = partes[1] || "";

    const f = fechaParte.split("/");
    if (f.length !== 3) return null;

    const dia = Number(f[0]);
    const mes = Number(f[1]) - 1;
    const anio = Number(f[2]);

    let hh = 0, mm = 0, ss = 0;

    if (horaParte) {
      const h = horaParte.split(":");
      hh = Number(h[0] || 0);
      mm = Number(h[1] || 0);
      ss = Number(h[2] || 0);
    }

    const fecha = new Date(anio, mes, dia, hh, mm, ss);
    if (isNaN(fecha.getTime())) return null;

    return fecha;
  }

  // yyyy-MM-dd
  if (texto.includes("-")) {
    const fecha = new Date(texto);
    if (isNaN(fecha.getTime())) return null;
    return fecha;
  }

  return null;
}

/**
 * Parsea fecha ISO del input date: yyyy-MM-dd
 */
function parseFechaISO_(texto) {
  if (!texto) return null;

  const partes = texto.split("-");
  if (partes.length !== 3) return null;

  const anio = Number(partes[0]);
  const mes = Number(partes[1]) - 1;
  const dia = Number(partes[2]);

  const fecha = new Date(anio, mes, dia);
  if (isNaN(fecha.getTime())) return null;

  fecha.setHours(0, 0, 0, 0);
  return fecha;
}

/**
 * Formatea un Date como dd/MM/yyyy HH:mm
 */
function formatearFechaHora_(fecha) {
  return Utilities.formatDate(
    fecha,
    Session.getScriptTimeZone(),
    "dd/MM/yyyy HH:mm"
  );
}

/**
 * Convierte la columna Fecha del registro a texto amigable
 */
function valorFechaParaReporte_(valor) {
  const texto = String(valor || "").trim();

  if (texto.toLowerCase() === "cita abierta") {
    return "cita abierta";
  }

  const fecha = parseFechaFlexible_(valor);

  if (!fecha) {
    return texto;
  }

  return Utilities.formatDate(
    fecha,
    Session.getScriptTimeZone(),
    "dd/MM/yyyy"
  );
}

/**
 * Limpia el nombre de una hoja de cálculo
 */
function limpiarNombreHoja_(nombre) {
  let limpio = String(nombre || "SIN ASESOR")
    .replace(/[\\\/\?\*\[\]\:]/g, "")
    .trim();

  if (!limpio) limpio = "SIN ASESOR";

  return limpio.substring(0, 99);
}

/**
 * ==========================================================
 * OBTENER / CREAR CARPETA DE REPORTES
 * ==========================================================
 */
function obtenerCarpetaReportesCitasAbiertas_() {
  const carpetas = DriveApp.getFoldersByName(CARPETA_REPORTES_CITAS_ABIERTAS);

  if (carpetas.hasNext()) {
    return carpetas.next();
  }

  return DriveApp.createFolder(CARPETA_REPORTES_CITAS_ABIERTAS);
}
