/**
 * Lectura paralela del Reporte Mensual por Sucursal desde Supabase.
 * No reemplaza la función operativa actual basada en Google Sheets.
 */

const RMS_SUPABASE_TAMANO_PAGINA_ = 100;
const RMS_SUPABASE_MAXIMO_PAGINAS_ = 100;

function formatearOffsetRMS_(fecha, zonaHoraria) {
  return Utilities.formatDate(fecha, zonaHoraria, 'Z').replace(
    /([+-]\d{2})(\d{2})$/,
    '$1:$2'
  );
}

function construirInicioMesRMS_(anio, mes) {
  const zonaHoraria = Session.getScriptTimeZone();
  const referencia = new Date(Date.UTC(anio, mes - 1, 15, 12, 0, 0));
  const yyyy = String(anio).padStart(4, '0');
  const mm = String(mes).padStart(2, '0');

  return yyyy + '-' + mm + '-01T00:00:00' +
    formatearOffsetRMS_(referencia, zonaHoraria);
}

function construirRangoMesRMS_(mes, anio) {
  const mesSiguiente = mes === 12 ? 1 : mes + 1;
  const anioSiguiente = mes === 12 ? anio + 1 : anio;

  return {
    desde: construirInicioMesRMS_(anio, mes),
    antesDe: construirInicioMesRMS_(anioSiguiente, mesSiguiente)
  };
}

function obtenerRegistrosMensualesSucursalSupabase_(
  sucursalSeleccionada,
  mes,
  anio
) {
  const rango = construirRangoMesRMS_(mes, anio);
  const registros = [];
  let offset = 0;

  for (
    let pagina = 0;
    pagina < RMS_SUPABASE_MAXIMO_PAGINAS_;
    pagina++
  ) {
    const lote = obtenerRegistrosReporteMensualSucursalSupabase_({
      fechaRegistroDesde: rango.desde,
      fechaRegistroAntesDe: rango.antesDe,
      sucursalOrigen: sucursalSeleccionada,
      limit: RMS_SUPABASE_TAMANO_PAGINA_,
      offset: offset
    });

    registros.push.apply(registros, lote);

    if (lote.length < RMS_SUPABASE_TAMANO_PAGINA_) {
      return registros.map(function(registro) {
        return {
          asesor: (registro.asesor_texto || 'SIN ASESOR')
            .toString()
            .trim() || 'SIN ASESOR'
        };
      });
    }

    offset += RMS_SUPABASE_TAMANO_PAGINA_;
  }

  throw new Error(
    'La paginación del Reporte Mensual superó el máximo seguro de ' +
    RMS_SUPABASE_MAXIMO_PAGINAS_ + ' páginas.'
  );
}

function construirRespuestaReporteMensualSupabase_(filtros, registros) {
  const agrupado = agruparRegistrosPorAsesorRMS_(registros);
  const asesores = construirDesgloseAsesoresRMS_(
    agrupado,
    registros.length
  );
  const totalCitas = registros.length;
  const totalAsesores = asesores.length;
  const promedioPorAsesor = totalAsesores > 0
    ? totalCitas / totalAsesores
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
}

function getReporteMensualSucursalSupabase(
  sucursalSeleccionada,
  mes,
  anio
) {
  try {
    const filtros = validarParametrosReporteMensualSucursal_(
      sucursalSeleccionada,
      mes,
      anio
    );
    const registros = obtenerRegistrosMensualesSucursalSupabase_(
      filtros.sucursal,
      filtros.mes,
      filtros.anio
    );

    return construirRespuestaReporteMensualSupabase_(filtros, registros);
  } catch (error) {
    return {
      ok: false,
      mensaje: error.message || error.toString()
    };
  }
}

function compararResultadosReporteMensual_(sheets, supabase) {
  const asesoresSheets = {};
  const asesoresSupabase = {};

  (sheets.asesores || []).forEach(function(item) {
    asesoresSheets[item.asesor] = item.citas;
  });

  (supabase.asesores || []).forEach(function(item) {
    asesoresSupabase[item.asesor] = item.citas;
  });

  const diferencias = Array.from(new Set(
    Object.keys(asesoresSheets).concat(Object.keys(asesoresSupabase))
  )).sort().filter(function(asesor) {
    return asesoresSheets[asesor] !== asesoresSupabase[asesor];
  }).map(function(asesor) {
    return {
      asesor: asesor,
      sheets: asesoresSheets[asesor] || 0,
      supabase: asesoresSupabase[asesor] || 0
    };
  });

  return {
    cantidad: diferencias.length,
    ejemplos: diferencias.slice(0, 10)
  };
}

function compararReporteMensualSheetsVsSupabase() {
  const SUCURSAL_PRUEBA = 'BANK';
  const MES_PRUEBA = 7;
  const ANIO_PRUEBA = 2026;
  const sheets = obtenerReporteMensualSucursalSheets_(
    SUCURSAL_PRUEBA,
    MES_PRUEBA,
    ANIO_PRUEBA
  );
  const supabase = getReporteMensualSucursalSupabase(
    SUCURSAL_PRUEBA,
    MES_PRUEBA,
    ANIO_PRUEBA
  );

  if (!sheets.ok || !supabase.ok) {
    throw new Error(
      'No se pudo comparar el reporte mensual. Sheets: ' +
      (sheets.mensaje || 'OK') + '; Supabase: ' +
      (supabase.mensaje || 'OK')
    );
  }

  const diferenciasAsesores = compararResultadosReporteMensual_(
    sheets,
    supabase
  );
  const diferenciasResumen = [
    'totalCitas',
    'totalAsesores',
    'promedioPorAsesor'
  ].filter(function(campo) {
    return sheets.resumen[campo] !== supabase.resumen[campo];
  });
  const totalDiferencias =
    diferenciasResumen.length + diferenciasAsesores.cantidad;

  Logger.log('REPORTE MENSUAL - COMPARACIÓN');
  Logger.log('SUCURSAL: ' + SUCURSAL_PRUEBA);
  Logger.log('MES: ' + MES_PRUEBA);
  Logger.log('AÑO: ' + ANIO_PRUEBA);
  Logger.log('TOTAL SHEETS: ' + sheets.resumen.totalCitas);
  Logger.log('TOTAL SUPABASE: ' + supabase.resumen.totalCitas);
  Logger.log('ASESORES SHEETS: ' + sheets.resumen.totalAsesores);
  Logger.log('ASESORES SUPABASE: ' + supabase.resumen.totalAsesores);
  Logger.log('DIFERENCIAS: ' + totalDiferencias);
  Logger.log(JSON.stringify(diferenciasAsesores.ejemplos, null, 2));

  return {
    sheets: sheets.resumen,
    supabase: supabase.resumen,
    diferenciasResumen: diferenciasResumen,
    diferenciasAsesores: diferenciasAsesores
  };
}

function probarReporteMensualSupabase() {
  const SUCURSAL_PRUEBA = 'BANK';
  const MES_PRUEBA = 7;
  const ANIO_PRUEBA = 2026;
  const resultado = getReporteMensualSucursalSupabase(
    SUCURSAL_PRUEBA,
    MES_PRUEBA,
    ANIO_PRUEBA
  );

  if (!resultado.ok) {
    throw new Error(resultado.mensaje || 'No se pudo generar el reporte.');
  }

  Logger.log('SUCURSAL: ' + SUCURSAL_PRUEBA);
  Logger.log('MES: ' + MES_PRUEBA);
  Logger.log('AÑO: ' + ANIO_PRUEBA);
  Logger.log('TOTAL: ' + resultado.resumen.totalCitas);
  Logger.log('ASESORES: ' + resultado.resumen.totalAsesores);

  return resultado;
}
