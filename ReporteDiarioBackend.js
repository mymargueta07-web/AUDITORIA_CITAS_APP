/**
 * ===========================================
 * REPORTE DIARIO
 * ===========================================
 */

function obtenerReporteDiario(fechaSeleccionada) {

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const shCitas =
    ss.getSheetByName("RegistroCitas");

  const shAtencion =
    ss.getSheetByName(
      "Ventas Atencion al Cliente"
    );

  if (!shCitas) {

    throw new Error(
      'No se encuentra la hoja "RegistroCitas".'
    );

  }

  if (!shAtencion) {

    throw new Error(
      'No se encuentra la hoja ' +
      '"Ventas Atencion al Cliente".'
    );

  }

  const citas =
    shCitas.getDataRange().getValues();

  const atencion =
    shAtencion.getDataRange().getValues();


  // =====================================================
  // ORDEN REAL DEL REPORTE
  // =====================================================

  const sucursales = [

    "CALL CENTER / CENTRAL",

    "CALL CENTER CHALATENANGO",

    "CHALATENANGO",

    "AGUILARES",

    "SANTA FE",

    "MERLIOT",

    "CIUDAD ARCE",

    "USULUTAN",

    "SANTA ROSA DE LIMA",

    "LA PALMA"

  ];


  // =====================================================
  // NOMBRES VISUALES
  // =====================================================

  const NOMBRES_VISUALES = {

    "CALL CENTER / CENTRAL":
      "CALL CENTER",

    "CALL CENTER CHALATENANGO":
      "CALL CHALATE",

    "CHALATENANGO":
      "CHALATE Centro",

    "AGUILARES":
      "AGUILARES",

    "SANTA FE":
      "SANTA FE",

    "MERLIOT":
      "MERLIOT",

    "CIUDAD ARCE":
      "C ARCE",

    "USULUTAN":
      "USULUTAN",

    "SANTA ROSA DE LIMA":
      "S ROSA DE LIMA",

    "LA PALMA":
      "LA PALMA"

  };


  const reporte = {};


  sucursales.forEach(function(nombre) {

    reporte[nombre] = {

      nombre:
        NOMBRES_VISUALES[nombre] ||
        nombre,

      citas:
        0,

      ventas:
        0,

      atencion:
        0

    };

  });


  // =====================================================
  // REGISTRO DE CITAS
  // =====================================================

  for (
    let i = 1;
    i < citas.length;
    i++
  ) {

    const fila =
      citas[i];

    const timestamp =
      fila[1]; // B

    const sucursal =
      normalizarSucursalReporte_(
        fila[12]
      ); // M

    const estado =
      String(fila[13] || "")
        .trim()
        .toUpperCase(); // N

    const fechaVenta =
      fila[14]; // O


    if (!reporte[sucursal]) {
      continue;
    }


    // Citas registradas según Timestamp
    if (
      mismaFecha(
        timestamp,
        fechaSeleccionada
      )
    ) {

      reporte[sucursal].citas++;

    }


    // Ventas cerradas según FECHA DE VENTA
    if (
      estado === "VENTA CERRADA" &&
      mismaFecha(
        fechaVenta,
        fechaSeleccionada
      )
    ) {

      reporte[sucursal].ventas++;

    }

  }


  // =====================================================
  // VENTAS ATENCIÓN AL CLIENTE
  // =====================================================

  for (
    let i = 1;
    i < atencion.length;
    i++
  ) {

    const fila =
      atencion[i];

    const sucursal =
      normalizarSucursalReporte_(
        fila[8]
      ); // I

    const estado =
      String(fila[9] || "")
        .trim()
        .toUpperCase(); // J

    const fechaVenta =
      fila[10]; // K


    if (!reporte[sucursal]) {
      continue;
    }


    if (
      estado === "VENTA CERRADA" &&
      mismaFecha(
        fechaVenta,
        fechaSeleccionada
      )
    ) {

      reporte[sucursal].atencion++;

    }

  }


  // =====================================================
  // RESUMEN
  // =====================================================

  let totalCitas = 0;
  let totalVentas = 0;
  let totalAtencion = 0;

  const resultado = [];


  sucursales.forEach(function(nombre) {

    resultado.push(
      reporte[nombre]
    );

    totalCitas +=
      reporte[nombre].citas;

    totalVentas +=
      reporte[nombre].ventas;

    totalAtencion +=
      reporte[nombre].atencion;

  });


  return {

    resumen: {

      totalSucursales:
        sucursales.length,

      totalCitas:
        totalCitas,

      totalVentas:
        totalVentas,

      totalAtencion:
        totalAtencion

    },

    sucursales:
      resultado

  };

}


/**
 * ===========================================
 * NORMALIZA NOMBRES DE SUCURSAL
 * ===========================================
 */

function normalizarSucursalReporte_(valor) {

  const sucursal =
    String(valor || "")
      .trim()
      .toUpperCase();


  const equivalencias = {

    // CALL CENTER / CENTRAL
    "BANK":
      "CALL CENTER / CENTRAL",

    "CALL CENTER":
      "CALL CENTER / CENTRAL",

    "CALL CENTER / CENTRAL":
      "CALL CENTER / CENTRAL",

    "CENTRAL":
      "CALL CENTER / CENTRAL",


    // CALL CENTER CHALATENANGO
    "CALL CHALATE":
      "CALL CENTER CHALATENANGO",

    "CALL CENTER CHALATE":
      "CALL CENTER CHALATENANGO",

    "CALL CENTER CHALATENANGO":
      "CALL CENTER CHALATENANGO",


    // CHALATENANGO CENTRO
    "CHALATE":
      "CHALATENANGO",

    "CHALATE CENTRO":
      "CHALATENANGO",

    "CHALATENANGO":
      "CHALATENANGO",


    // CIUDAD ARCE
    "C ARCE":
      "CIUDAD ARCE",

    "CIUDAD ARCE":
      "CIUDAD ARCE",


    // SANTA ROSA DE LIMA
    "S ROSA DE LIMA":
      "SANTA ROSA DE LIMA",

    "SANTA ROSA DE LIMA":
      "SANTA ROSA DE LIMA",


    // RESTO
    "AGUILARES":
      "AGUILARES",

    "SANTA FE":
      "SANTA FE",

    "MERLIOT":
      "MERLIOT",

    "USULUTAN":
      "USULUTAN",

    "LA PALMA":
      "LA PALMA"

  };


  return (
    equivalencias[sucursal] ||
    sucursal
  );

}


/**
 * ===========================================
 * COMPARA SOLO LA FECHA
 * ===========================================
 */

function mismaFecha(
  valor,
  fechaSeleccionada
) {

  if (
    valor === "" ||
    valor === null ||
    valor === undefined
  ) {

    return false;

  }


  let fecha;


  // Si ya es un Date válido
  if (
    Object.prototype
      .toString
      .call(valor) ===
      "[object Date]"
  ) {

    fecha =
      valor;

  } else {

    const texto =
      String(valor).trim();


    // dd/MM/yyyy o d/M/yyyy
    if (
      texto.includes("/")
    ) {

      const partes =
        texto.split("/");

      if (
        partes.length !== 3
      ) {

        return false;

      }

      const dia =
        Number(partes[0]);

      const mes =
        Number(partes[1]) - 1;

      const anio =
        Number(partes[2]);


      fecha =
        new Date(
          anio,
          mes,
          dia
        );

    }

    // yyyy-MM-dd
    else if (
      texto.includes("-")
    ) {

      const partes =
        texto.split("-");

      if (
        partes.length !== 3
      ) {

        return false;

      }

      const anio =
        Number(partes[0]);

      const mes =
        Number(partes[1]) - 1;

      const dia =
        Number(partes[2]);


      fecha =
        new Date(
          anio,
          mes,
          dia
        );

    } else {

      return false;

    }

  }


  if (
    isNaN(fecha.getTime())
  ) {

    return false;

  }


  const y =
    fecha.getFullYear();

  const m =
    String(
      fecha.getMonth() + 1
    ).padStart(2, "0");

  const d =
    String(
      fecha.getDate()
    ).padStart(2, "0");


  return (
    `${y}-${m}-${d}` ===
    fechaSeleccionada
  );

}