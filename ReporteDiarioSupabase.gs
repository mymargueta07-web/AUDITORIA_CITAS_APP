/**
 * Implementación paralela híbrida del Reporte Diario.
 * RegistroCitas se consulta en Supabase y Atención al Cliente permanece
 * en Google Sheets. No reemplaza todavía la función operativa.
 */

const REPORTE_DIARIO_SUPABASE_TAMANO_PAGINA_ = 100;
const REPORTE_DIARIO_SUPABASE_MAXIMO_PAGINAS_ = 100;

function normalizarFechaReporteDiarioSupabase_(valor) {
  const texto = String(valor || '').trim();
  const partes = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!partes) {
    throw new Error('Fecha no válida para el Reporte Diario.');
  }

  const anio = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);
  const referencia = new Date(Date.UTC(anio, mes - 1, dia, 12, 0, 0));

  if (
    referencia.getUTCFullYear() !== anio ||
    referencia.getUTCMonth() !== mes - 1 ||
    referencia.getUTCDate() !== dia
  ) {
    throw new Error('Fecha no válida para el Reporte Diario.');
  }

  return texto;
}

function formatearOffsetReporteDiario_(fecha, zonaHoraria) {
  return Utilities.formatDate(fecha, zonaHoraria, 'Z').replace(
    /([+-]\d{2})(\d{2})$/,
    '$1:$2'
  );
}

function construirInicioDiaReporteDiario_(fecha) {
  const zonaHoraria = Session.getScriptTimeZone();
  const partes = fecha.split('-');
  const referencia = new Date(Date.UTC(
    Number(partes[0]),
    Number(partes[1]) - 1,
    Number(partes[2]),
    12,
    0,
    0
  ));

  return fecha + 'T00:00:00' +
    formatearOffsetReporteDiario_(referencia, zonaHoraria);
}

function obtenerFechaSiguienteReporteDiario_(fecha) {
  const partes = fecha.split('-');
  const siguiente = new Date(Date.UTC(
    Number(partes[0]),
    Number(partes[1]) - 1,
    Number(partes[2]) + 1,
    12,
    0,
    0
  ));

  return [
    siguiente.getUTCFullYear(),
    String(siguiente.getUTCMonth() + 1).padStart(2, '0'),
    String(siguiente.getUTCDate()).padStart(2, '0')
  ].join('-');
}

function construirRangoDiaReporteDiario_(fechaSeleccionada) {
  const fecha = normalizarFechaReporteDiarioSupabase_(fechaSeleccionada);
  const fechaSiguiente = obtenerFechaSiguienteReporteDiario_(fecha);

  return {
    fecha: fecha,
    desde: construirInicioDiaReporteDiario_(fecha),
    antesDe: construirInicioDiaReporteDiario_(fechaSiguiente)
  };
}

function paginarConsultaReporteDiario_(lector, opciones, descripcion) {
  const registros = [];
  let offset = 0;

  for (
    let pagina = 0;
    pagina < REPORTE_DIARIO_SUPABASE_MAXIMO_PAGINAS_;
    pagina++
  ) {
    const opcionesPagina = Object.assign({}, opciones, {
      limit: REPORTE_DIARIO_SUPABASE_TAMANO_PAGINA_,
      offset: offset
    });
    const lote = lector(opcionesPagina);

    registros.push.apply(registros, lote);

    if (lote.length < REPORTE_DIARIO_SUPABASE_TAMANO_PAGINA_) {
      return registros;
    }

    offset += REPORTE_DIARIO_SUPABASE_TAMANO_PAGINA_;
  }

  throw new Error(
    'La paginación de ' + descripcion + ' superó el máximo seguro de ' +
    REPORTE_DIARIO_SUPABASE_MAXIMO_PAGINAS_ + ' páginas.'
  );
}

function crearBaseReporteDiarioHibrido_() {
  const reporte = {};

  REPORTE_DIARIO_SUCURSALES_.forEach(function(sucursal) {
    reporte[sucursal] = {
      nombre: REPORTE_DIARIO_NOMBRES_VISUALES_[sucursal] || sucursal,
      citas: 0,
      ventas: 0,
      atencion: 0
    };
  });

  return reporte;
}

function sumarSucursalesReporteDiario_(registros, reporte, campo) {
  registros.forEach(function(registro) {
    const sucursal = normalizarSucursalReporte_(
      registro.sucursal_origen_texto
    );

    if (reporte[sucursal]) {
      reporte[sucursal][campo]++;
    }
  });
}

function obtenerVentasAtencionClienteReporteDiario_(fechaSeleccionada) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getSheetByName('Ventas Atencion al Cliente');

  if (!hoja) {
    throw new Error(
      'No se encuentra la hoja "Ventas Atencion al Cliente".'
    );
  }

  const mapa = obtenerMapaEncabezados_(hoja);

  [
    'SucursalOrigen',
    'ESTADO',
    'FECHA DE VENTA'
  ].forEach(function(nombreEncabezado) {
    obtenerColumnaObligatoria_(mapa, nombreEncabezado);
  });

  const datos = hoja.getDataRange().getValues();
  const conteos = {};

  for (let indice = 1; indice < datos.length; indice++) {
    const fila = datos[indice];
    const sucursal = normalizarSucursalReporte_(
      fila[mapa.SucursalOrigen - 1]
    );
    const estado = String(fila[mapa.ESTADO - 1] || '')
      .trim()
      .toUpperCase();
    const fechaVenta = fila[mapa['FECHA DE VENTA'] - 1];

    if (
      estado === 'VENTA CERRADA' &&
      mismaFecha(fechaVenta, fechaSeleccionada)
    ) {
      conteos[sucursal] = (conteos[sucursal] || 0) + 1;
    }
  }

  return conteos;
}

function construirRespuestaReporteDiarioHibrido_(reporte) {
  let totalCitas = 0;
  let totalVentas = 0;
  let totalAtencion = 0;
  const sucursales = REPORTE_DIARIO_SUCURSALES_.map(function(nombre) {
    const registro = reporte[nombre];

    totalCitas += registro.citas;
    totalVentas += registro.ventas;
    totalAtencion += registro.atencion;

    return registro;
  });

  return {
    resumen: {
      totalSucursales: REPORTE_DIARIO_SUCURSALES_.length,
      totalCitas: totalCitas,
      totalVentas: totalVentas,
      totalAtencion: totalAtencion
    },
    sucursales: sucursales
  };
}

function obtenerReporteDiarioHibrido_(fechaSeleccionada) {
  const rango = construirRangoDiaReporteDiario_(fechaSeleccionada);
  const reporte = crearBaseReporteDiarioHibrido_();
  const citas = paginarConsultaReporteDiario_(
    obtenerSucursalesCitasRegistradasReporteDiarioSupabase_,
    {
      fechaRegistroDesde: rango.desde,
      fechaRegistroAntesDe: rango.antesDe
    },
    'citas registradas del Reporte Diario'
  );
  const ventas = paginarConsultaReporteDiario_(
    obtenerSucursalesVentasCerradasReporteDiarioSupabase_,
    { fechaVenta: rango.fecha },
    'ventas cerradas del Reporte Diario'
  );
  const atencion = obtenerVentasAtencionClienteReporteDiario_(rango.fecha);

  sumarSucursalesReporteDiario_(citas, reporte, 'citas');
  sumarSucursalesReporteDiario_(ventas, reporte, 'ventas');

  Object.keys(atencion).forEach(function(sucursal) {
    if (reporte[sucursal]) {
      reporte[sucursal].atencion = atencion[sucursal];
    }
  });

  return construirRespuestaReporteDiarioHibrido_(reporte);
}

function compararReporteDiarioSheetsVsHibrido() {
  const FECHA_PRUEBA = '2026-07-18';
  const sheets = obtenerReporteDiarioSheets_(FECHA_PRUEBA);
  const hibrido = obtenerReporteDiarioHibrido_(FECHA_PRUEBA);
  const diferencias = [];

  sheets.sucursales.forEach(function(sucursalSheets, indice) {
    const sucursalHibrida = hibrido.sucursales[indice];

    ['nombre', 'citas', 'ventas', 'atencion'].forEach(function(campo) {
      if (sucursalSheets[campo] !== sucursalHibrida[campo]) {
        diferencias.push({
          sucursal: sucursalSheets.nombre,
          campo: campo,
          sheets: sucursalSheets[campo],
          hibrido: sucursalHibrida[campo]
        });
      }
    });
  });

  [
    'totalSucursales',
    'totalCitas',
    'totalVentas',
    'totalAtencion'
  ].forEach(function(campo) {
    if (sheets.resumen[campo] !== hibrido.resumen[campo]) {
      diferencias.push({
        sucursal: 'TOTAL GENERAL',
        campo: campo,
        sheets: sheets.resumen[campo],
        hibrido: hibrido.resumen[campo]
      });
    }
  });

  Logger.log('REPORTE DIARIO - COMPARACIÓN');
  Logger.log('FECHA: ' + FECHA_PRUEBA);
  Logger.log('TOTAL DIFERENCIAS: ' + diferencias.length);
  Logger.log(JSON.stringify(diferencias.slice(0, 10), null, 2));

  return {
    fecha: FECHA_PRUEBA,
    totalDiferencias: diferencias.length,
    ejemplos: diferencias.slice(0, 10)
  };
}

function probarReporteDiarioHibrido() {
  const FECHA_PRUEBA = '2026-07-18';
  const resultado = obtenerReporteDiarioHibrido_(FECHA_PRUEBA);

  Logger.log('FECHA: ' + FECHA_PRUEBA);
  Logger.log('TOTAL CITAS: ' + resultado.resumen.totalCitas);
  Logger.log('TOTAL VENTAS CERRADAS: ' + resultado.resumen.totalVentas);
  Logger.log(
    'TOTAL VENTAS ATENCIÓN AL CLIENTE: ' +
    resultado.resumen.totalAtencion
  );

  return resultado;
}
