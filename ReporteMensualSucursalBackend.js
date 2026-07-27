/**
 * ==========================================================
 * REPORTE MENSUAL DE SUCURSAL - BACKEND
 * ==========================================================
 */

const RMS_HOJA_REGISTRO_CITAS = "RegistroCitas";

/**
 * Sucursales oficiales del reporte
 */
const RMS_SUCURSALES = [
  "CALL CENTER / CENTRAL",
  "MERLIOT",
  "SANTA FE",
  "AGUILARES",
  "CIUDAD ARCE",
  "CHALATENANGO",
  "LA PALMA",
  "USULUTAN",
  "SANTA ROSA DE LIMA",
  "CALL CENTER CHALATENANGO"
];

/**
 * Alias de sucursales
 * BANK se considera parte de CALL CENTER / CENTRAL
 */
const RMS_ALIAS_SUCURSALES = {
  "BANK": "CALL CENTER / CENTRAL"
};

/**
 * ==========================================================
 * OBTENER CONFIGURACIÓN DEL MÓDULO
 * Devuelve sucursales + mes actual + año actual
 * ==========================================================
 */
function obtenerConfigReporteMensualSucursal() {
  const hoy = new Date();

  return {
    ok: true,
    sucursales: RMS_SUCURSALES,
    mesActual: hoy.getMonth() + 1,
    anioActual: hoy.getFullYear()
  };
}

/**
 * ==========================================================
 * GENERAR REPORTE MENSUAL DE SUCURSAL
 * ==========================================================
 *
 * @param {string} sucursalSeleccionada
 * @param {number|string} mes
 * @param {number|string} anio
 * @return {Object}
 */
function obtenerReporteMensualSucursal(sucursalSeleccionada, mes, anio) {
  try {
    const filtros = validarParametrosReporteMensualSucursal_(
      sucursalSeleccionada,
      mes,
      anio
    );

    const registros = obtenerRegistrosReporteMensualSucursal_(
      filtros.sucursal,
      filtros.mes,
      filtros.anio
    );

    const agrupado = agruparRegistrosPorAsesorRMS_(registros);
    const asesores = construirDesgloseAsesoresRMS_(agrupado, registros.length);

    const totalCitas = registros.length;
    const totalAsesores = asesores.length;
    const promedioPorAsesor = totalAsesores > 0
      ? (totalCitas / totalAsesores)
      : 0;

    return {
      ok: true,
      filtros: {
        sucursal: filtros.sucursal,
        mes: filtros.mes,
        anio: filtros.anio,
        nombreMes: obtenerNombreMesRMS_(filtros.mes)
      },
      resumen: {
        totalCitas: totalCitas,
        totalAsesores: totalAsesores,
        promedioPorAsesor: Number(promedioPorAsesor.toFixed(1))
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
 * VALIDAR PARÁMETROS
 * ==========================================================
 */
function validarParametrosReporteMensualSucursal_(sucursalSeleccionada, mes, anio) {
  const sucursal = String(sucursalSeleccionada || "").trim();
  const mesNum = Number(mes);
  const anioNum = Number(anio);

  if (!sucursal) {
    throw new Error("Debes seleccionar una sucursal.");
  }

  if (!RMS_SUCURSALES.includes(sucursal)) {
    throw new Error("La sucursal seleccionada no es válida.");
  }

  if (!mesNum || mesNum < 1 || mesNum > 12) {
    throw new Error("Debes seleccionar un mes válido.");
  }

  if (!anioNum || anioNum < 2000 || anioNum > 3000) {
    throw new Error("Debes seleccionar un año válido.");
  }

  return {
    sucursal: sucursal,
    mes: mesNum,
    anio: anioNum
  };
}

/**
 * ==========================================================
 * OBTENER REGISTROS DEL REPORTE
 * ==========================================================
 *
 * Reglas:
 * - Usa la hoja RegistroCitas
 * - Toma la fecha del Timestamp (columna B)
 * - Toma la sucursal desde SucursalOrigen (columna M)
 * - BANK se suma a CALL CENTER / CENTRAL
 * - Agrupa por Asesor (columna J)
 */
function obtenerRegistrosReporteMensualSucursal_(sucursalSeleccionada, mes, anio) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getSheetByName(RMS_HOJA_REGISTRO_CITAS);

  if (!hoja) {
    throw new Error("No existe la hoja: " + RMS_HOJA_REGISTRO_CITAS);
  }

  const mapa =
    obtenerMapaEncabezados_(hoja);

  [
    'Timestamp',
    'Asesor',
    'SucursalOrigen'
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

  const registros = [];

  for (let i = 1; i < datos.length; i++) {
    const fila = datos[i];

    const timestamp = fila[mapa.Timestamp - 1];
    const asesor = fila[mapa.Asesor - 1];
    let sucursal = fila[mapa.SucursalOrigen - 1];

    sucursal = normalizarSucursalRMS_(sucursal);

    // 1) Filtrar sucursal
    if (sucursal !== sucursalSeleccionada) {
      continue;
    }

    // 2) Parsear timestamp
    const fechaRegistro = parseFechaFlexibleRMS_(timestamp);
    if (!fechaRegistro) {
      continue;
    }

    // 3) Filtrar mes y año
    const mesRegistro = fechaRegistro.getMonth() + 1;
    const anioRegistro = fechaRegistro.getFullYear();

    if (mesRegistro !== mes || anioRegistro !== anio) {
      continue;
    }

    registros.push({
      asesor: (asesor || "SIN ASESOR").toString().trim() || "SIN ASESOR"
    });
  }

  return registros;
}

/**
 * ==========================================================
 * AGRUPAR REGISTROS POR ASESOR
 * ==========================================================
 */
function agruparRegistrosPorAsesorRMS_(registros) {
  const agrupado = {};

  registros.forEach(reg => {
    const asesor = reg.asesor || "SIN ASESOR";

    if (!agrupado[asesor]) {
      agrupado[asesor] = 0;
    }

    agrupado[asesor]++;
  });

  return agrupado;
}

/**
 * ==========================================================
 * CONSTRUIR DESGLOSE DE ASESORES
 * ==========================================================
 */
function construirDesgloseAsesoresRMS_(agrupado, totalCitas) {
  const asesores = Object.keys(agrupado).map(nombre => {
    const citas = agrupado[nombre];
    const porcentaje = totalCitas > 0 ? (citas / totalCitas) * 100 : 0;

    return {
      asesor: nombre,
      citas: citas,
      porcentaje: Number(porcentaje.toFixed(1))
    };
  });

  asesores.sort(function(a, b) {
    if (b.citas !== a.citas) return b.citas - a.citas;
    return a.asesor.localeCompare(b.asesor, "es", { sensitivity: "base" });
  });

  return asesores.map(function(item, index) {
    return {
      posicion: index + 1,
      asesor: item.asesor,
      citas: item.citas,
      porcentaje: item.porcentaje
    };
  });
}

/**
 * ==========================================================
 * UTILIDADES
 * ==========================================================
 */

/**
 * Normaliza la sucursal para el reporte
 */
function normalizarSucursalRMS_(sucursal) {
  const valor = String(sucursal || "").trim();
  return RMS_ALIAS_SUCURSALES[valor] || valor;
}

/**
 * Convierte fechas en distintos formatos:
 * - Date real
 * - dd/MM/yyyy
 * - d/M/yyyy
 * - dd/MM/yyyy HH:mm:ss
 * - d/M/yyyy HH:mm:ss
 * - yyyy-MM-dd
 * - yyyy-MM-dd HH:mm:ss
 */
function parseFechaFlexibleRMS_(valor) {
  if (valor === null || valor === undefined || valor === "") {
    return null;
  }

  // Si ya es Date real
  if (Object.prototype.toString.call(valor) === "[object Date]") {
    if (isNaN(valor.getTime())) return null;
    return new Date(valor.getTime());
  }

  const texto = String(valor).trim();
  if (!texto) return null;

  // Formato dd/MM/yyyy o dd/MM/yyyy HH:mm:ss
  if (texto.includes("/")) {
    const partes = texto.split(" ");
    const fechaParte = partes[0];
    const horaParte = partes[1] || "";

    const f = fechaParte.split("/");
    if (f.length !== 3) return null;

    const dia = Number(f[0]);
    const mes = Number(f[1]) - 1;
    const anio = Number(f[2]);

    if (!dia || mes < 0 || !anio) return null;

    let hh = 0;
    let mm = 0;
    let ss = 0;

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

  // Formato yyyy-MM-dd o similar
  if (texto.includes("-")) {
    const fecha = new Date(texto);
    if (isNaN(fecha.getTime())) return null;
    return fecha;
  }

  return null;
}

/**
 * Devuelve el nombre del mes
 */
function obtenerNombreMesRMS_(mes) {
  const meses = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre"
  ];

  return meses[mes - 1] || "";
}
