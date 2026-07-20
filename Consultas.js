/**
 * ==========================================================
 * CONFIGURACIÓN
 * ==========================================================
 */

const HOJA_CITAS = "RegistroCitas";


/**
 * ==========================================================
 * CAPA 1 - DATOS
 * ==========================================================
 */

/**
 * Obtiene todos los datos crudos de RegistroCitas.
 */
function getCitasRaw() {

  const hoja = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(HOJA_CITAS);

  if (!hoja) {

    throw new Error(
      "No existe la hoja: " + HOJA_CITAS
    );

  }

  const data = hoja
    .getDataRange()
    .getValues();

  if (data.length <= 1) {

    return {
      headers: [],
      rows: []
    };

  }

  return {
    headers: data[0],
    rows: data.slice(1)
  };

}


/**
 * ==========================================================
 * CAPA 2 - TRANSFORMACIÓN
 * ==========================================================
 */

/**
 * Convierte las filas en objetos estructurados.
 */
function mapCitas(data) {

  if (
    !data ||
    !data.headers ||
    !data.rows ||
    data.rows.length === 0
  ) {

    return [];

  }

  const idx = indexMap(data.headers);

  validarColumnasConsulta_(idx);

  const tz = Session.getScriptTimeZone();

  return data.rows.map(function(row) {

    const fecha =
      normalizarFechaConsulta_(
        row[idx.Fecha],
        tz
      );

    return {

      fecha: fecha,

      cliente:
        row[idx.Cliente] || "",

      proceso:
        row[idx.Proceso] || "",

      /*
       * La agrupación utiliza SucursalOrigen.
       */
      sucursal:
        row[idx.SucursalOrigen] ||
        "SIN SUCURSAL",

      /*
       * SucursalDestino se muestra únicamente
       * como Oficina a visitar.
       */
      oficinaVisita:
        row[idx.SucursalDestino] ||
        "SIN DEFINIR",

      asesor:
        row[idx.Asesor] ||
        "SIN ASESOR",

      estado:
        row[idx.ESTADO] || ""

    };

  });

}


/**
 * Mapea los índices de columnas.
 */
function indexMap(headers) {

  return {

    Fecha:
      headers.indexOf("Fecha"),

    Cliente:
      headers.indexOf("Cliente"),

    Proceso:
      headers.indexOf("Proceso"),

    SucursalOrigen:
      headers.indexOf("SucursalOrigen"),

    SucursalDestino:
      headers.indexOf("SucursalDestino"),

    Asesor:
      headers.indexOf("Asesor"),

    ESTADO:
      headers.indexOf("ESTADO")

  };

}


/**
 * Verifica que existan las columnas necesarias.
 */
function validarColumnasConsulta_(idx) {

  const obligatorias = [
    "Fecha",
    "Cliente",
    "Proceso",
    "SucursalOrigen",
    "SucursalDestino",
    "Asesor",
    "ESTADO"
  ];

  const faltantes =
    obligatorias.filter(function(nombre) {

      return idx[nombre] === -1;

    });

  if (faltantes.length > 0) {

    throw new Error(
      "Faltan columnas en RegistroCitas: " +
      faltantes.join(", ")
    );

  }

}


/**
 * Normaliza la fecha para compararla con yyyy-MM-dd.
 *
 * Ignora valores como "cita abierta".
 */
function normalizarFechaConsulta_(valor, tz) {

  if (!valor) {
    return "";
  }

  if (
    Object.prototype.toString.call(valor) ===
    "[object Date]" &&
    !isNaN(valor.getTime())
  ) {

    return Utilities.formatDate(
      valor,
      tz,
      "yyyy-MM-dd"
    );

  }

  const texto =
    String(valor).trim();

  if (!texto) {
    return "";
  }

  const partes =
    texto.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
    );

  if (partes) {

    const dd =
      partes[1].padStart(2, "0");

    const mm =
      partes[2].padStart(2, "0");

    const yyyy =
      partes[3];

    return `${yyyy}-${mm}-${dd}`;

  }

  return "";

}


/**
 * ==========================================================
 * CAPA 3 - SERVICIO PRINCIPAL
 * ==========================================================
 */

/**
 * Obtiene citas filtradas por fecha.
 */
function getCitasByFecha(fechaSeleccionada) {

  try {

    if (!fechaSeleccionada) {

      throw new Error(
        "Fecha no válida"
      );

    }

    const raw =
      getCitasRaw();

    const citas =
      mapCitas(raw);

    const filtradas =
      citas.filter(function(cita) {

        return (
          cita.fecha ===
          fechaSeleccionada
        );

      });

    const agrupadas =
      agruparCitas(filtradas);


    // =====================================================
    // RESUMEN GENERAL
    // =====================================================

    const todasSucursales = [
      ...new Set(
        citas
          .map(function(cita) {

            return cita.sucursal;

          })
          .filter(function(sucursal) {

            return (
              sucursal &&
              sucursal !== "SIN SUCURSAL"
            );

          })
      )
    ].sort();


    const sucursalesConCitas =
      agrupadas.map(function(grupo) {

        return grupo.sucursal;

      });


    const conCitas =
      new Set(sucursalesConCitas);


    const sinCitas =
      todasSucursales.filter(
        function(sucursal) {

          return !conCitas.has(sucursal);

        }
      );


    const resumen = {

      proyecciones:
        filtradas.length,

      totalSucursales:
        todasSucursales.length,

      sucursalesConCitas:
        conCitas.size,

      sucursalesSinCitas:
        sinCitas.length,

      listaConCitas:
        sucursalesConCitas,

      listaSinCitas:
        sinCitas

    };


    return {

      ok: true,

      total:
        filtradas.length,

      data:
        agrupadas,

      resumen:
        resumen

    };

  } catch (error) {

    console.error(
      "Error en getCitasByFecha:",
      error
    );

    return {

      ok: false,

      mensaje:
        error.message ||
        error.toString()

    };

  }

}


/**
 * ==========================================================
 * CAPA 4 - AGRUPACIÓN
 * ==========================================================
 */

/**
 * Agrupa citas por SucursalOrigen y luego por asesor.
 */
function agruparCitas(citas) {

  const mapa = {};


  citas.forEach(function(cita) {

    const sucursal =
      cita.sucursal ||
      "SIN SUCURSAL";

    const asesor =
      cita.asesor ||
      "SIN ASESOR";


    if (!mapa[sucursal]) {

      mapa[sucursal] = {};

    }


    if (!mapa[sucursal][asesor]) {

      mapa[sucursal][asesor] = [];

    }


    mapa[sucursal][asesor].push({

      cliente:
        cita.cliente,

      proceso:
        cita.proceso,

      oficinaVisita:
        cita.oficinaVisita,

      estado:
        cita.estado

    });

  });


  return Object
    .keys(mapa)
    .sort()
    .map(function(sucursal) {

      const asesores = Object
        .keys(mapa[sucursal])
        .sort()
        .map(function(asesor) {

          return {

            asesor:
              asesor,

            cantidad:
              mapa[sucursal][asesor]
                .length,

            citas:
              mapa[sucursal][asesor]

          };

        });


      return {

        sucursal:
          sucursal,

        cantidad:
          asesores.reduce(
            function(total, asesor) {

              return (
                total +
                asesor.cantidad
              );

            },
            0
          ),

        asesores:
          asesores

      };

    });

}