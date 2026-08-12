/**
 * Lectura paralela de Citas Abiertas desde Supabase.
 * No reemplaza las funciones operativas actuales basadas en Google Sheets.
 */

const CITAS_ABIERTAS_SUPABASE_TAMANO_PAGINA_ = 100;
const CITAS_ABIERTAS_SUPABASE_MAXIMO_PAGINAS_ = 100;

function obtenerCandidatasCitasAbiertasSupabase_(filtros, descripcion) {
  const citas = [];
  let offset = 0;

  for (
    let pagina = 0;
    pagina < CITAS_ABIERTAS_SUPABASE_MAXIMO_PAGINAS_;
    pagina++
  ) {
    const opciones = Object.assign({}, filtros, {
      limit: CITAS_ABIERTAS_SUPABASE_TAMANO_PAGINA_,
      offset: offset
    });
    const lote = obtenerCitasConDestinosSupabase_(opciones);

    citas.push.apply(citas, lote);

    if (lote.length < CITAS_ABIERTAS_SUPABASE_TAMANO_PAGINA_) {
      return citas;
    }

    offset += CITAS_ABIERTAS_SUPABASE_TAMANO_PAGINA_;
  }

  throw new Error(
    'La paginación de ' + descripcion + ' superó el máximo seguro de ' +
    CITAS_ABIERTAS_SUPABASE_MAXIMO_PAGINAS_ + ' páginas.'
  );
}

function obtenerCitasAbiertasSupabase_() {
  const hoy = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    'yyyy-MM-dd'
  );
  const abiertas = obtenerCandidatasCitasAbiertasSupabase_(
    { citaAbierta: true },
    'citas abiertas'
  );
  const vencidas = obtenerCandidatasCitasAbiertasSupabase_(
    { fechaCitaAntesDe: hoy },
    'citas vencidas'
  );
  const citasPorId = {};

  abiertas.concat(vencidas).forEach(function(cita) {
    citasPorId[cita.id] = cita;
  });

  return Object.keys(citasPorId).map(function(id) {
    return citasPorId[id];
  }).sort(function(a, b) {
    const comparacionFecha = String(a.fecha_registro || '')
      .localeCompare(String(b.fecha_registro || ''));

    return comparacionFecha || String(a.id).localeCompare(String(b.id));
  });
}

function mapearCitasAbiertasSupabase_() {
  return mapCitasSupabase(obtenerCitasAbiertasSupabase_())
    .filter(function(cita) {
      return ESTADOS_CITAS_ABIERTAS.includes(
        String(cita.ESTADO || '').trim().toUpperCase()
      );
    })
    .map(function(cita) {
      const fechaRegistro = parseFechaFlexible_(cita.Timestamp);

      return {
        id: cita.ID,
        timestamp: fechaRegistro
          ? formatearFechaHora_(fechaRegistro)
          : cita.Timestamp,
        cliente: cita.Cliente,
        numero: cita.Numero,
        proceso: cita.Proceso,
        precio: cita.Precio,
        extras: cita.Extras,
        estado: cita.ESTADO,
        fecha: cita.Fecha === 'CITA ABIERTA'
          ? 'cita abierta'
          : cita.Fecha,
        sucursalDestino: cita.SucursalDestino,
        asesor: cita.Asesor || 'SIN ASESOR',
        nota: cita.Nota,
        origen: cita.Origen,
        sucursalOrigen: normalizarSucursalCitasAbiertas_(
          cita.SucursalOrigen
        ),
        hora: cita.HORA,
        destinos: cita.destinos,
        source_record_key: cita.source_record_key
      };
    });
}

function validarParametrosCitasAbiertasSupabase_(
  sucursalSeleccionada,
  fechaDesde,
  fechaHasta
) {
  if (!sucursalSeleccionada) {
    throw new Error('Debes seleccionar una sucursal.');
  }

  if (!fechaDesde) {
    throw new Error('Debes seleccionar la fecha inicial.');
  }

  if (!fechaHasta) {
    throw new Error('Debes seleccionar la fecha final.');
  }

  const desde = parseFechaISO_(fechaDesde);
  const hasta = parseFechaISO_(fechaHasta);

  if (!desde || !hasta) {
    throw new Error('El rango de fechas no es válido.');
  }

  if (desde.getTime() > hasta.getTime()) {
    throw new Error('La fecha inicial no puede ser mayor que la fecha final.');
  }
}

function filtrarCitasAbiertasSupabase_(
  citas,
  sucursalSeleccionada,
  fechaDesde,
  fechaHasta
) {
  const desde = parseFechaISO_(fechaDesde);
  const hasta = parseFechaISO_(fechaHasta);
  hasta.setHours(23, 59, 59, 999);

  return citas.filter(function(cita) {
    const fechaRegistro = parseFechaFlexible_(cita.timestamp);

    return (
      cita.sucursalOrigen === sucursalSeleccionada &&
      fechaRegistro &&
      fechaRegistro.getTime() >= desde.getTime() &&
      fechaRegistro.getTime() <= hasta.getTime()
    );
  });
}

function construirRespuestaCitasAbiertasSupabase_(
  registros,
  sucursalSeleccionada,
  fechaDesde,
  fechaHasta
) {
  const agrupado = agruparPorAsesorCitasAbiertas_(registros);
  const asesores = Object.keys(agrupado)
    .sort(function(a, b) {
      return a.localeCompare(b, 'es', { sensitivity: 'base' });
    })
    .map(function(nombre) {
      return {
        asesor: nombre,
        cantidad: agrupado[nombre].length
      };
    });

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
}

function getCitasAbiertasSupabase(
  sucursalSeleccionada,
  fechaDesde,
  fechaHasta
) {
  try {
    validarParametrosCitasAbiertasSupabase_(
      sucursalSeleccionada,
      fechaDesde,
      fechaHasta
    );

    const registros = filtrarCitasAbiertasSupabase_(
      mapearCitasAbiertasSupabase_(),
      sucursalSeleccionada,
      fechaDesde,
      fechaHasta
    );

    return construirRespuestaCitasAbiertasSupabase_(
      registros,
      sucursalSeleccionada,
      fechaDesde,
      fechaHasta
    );
  } catch (error) {
    return {
      ok: false,
      mensaje: error.message || error.toString()
    };
  }
}

function obtenerRegistrosComparablesCitasAbiertasSheets_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getSheetByName(HOJA_REGISTRO_CITAS);

  if (!hoja) {
    throw new Error('No existe la hoja: ' + HOJA_REGISTRO_CITAS);
  }

  const datos = hoja.getDataRange().getValues();
  const mapa = obtenerMapaEncabezados_(hoja);
  const requeridas = [
    'ID', 'Timestamp', 'Cliente', 'Proceso', 'Numero', 'Fecha',
    'SucursalDestino', 'Asesor', 'Origen', 'SucursalOrigen', 'ESTADO'
  ];

  requeridas.forEach(function(nombre) {
    obtenerColumnaObligatoria_(mapa, nombre);
  });

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  return datos.slice(1).map(function(fila, indice) {
    return {
      clave: obtenerClaveComparacionSheets_(
        fila,
        mapa,
        indice + 2,
        ss
      ),
      legacy_id: String(fila[mapa.ID - 1] || ''),
      cliente: String(fila[mapa.Cliente - 1] || ''),
      numero: String(fila[mapa.Numero - 1] || ''),
      proceso: String(fila[mapa.Proceso - 1] || ''),
      sucursalDestino: String(fila[mapa.SucursalDestino - 1] || ''),
      asesor: (fila[mapa.Asesor - 1] || 'SIN ASESOR').toString().trim(),
      origen: String(fila[mapa.Origen - 1] || ''),
      sucursalOrigen: normalizarSucursalCitasAbiertas_(
        fila[mapa.SucursalOrigen - 1]
      ),
      estado: String(fila[mapa.ESTADO - 1] || ''),
      fecha: valorFechaParaReporte_(fila[mapa.Fecha - 1]),
      incluir: (
        ESTADOS_CITAS_ABIERTAS.includes(
          String(fila[mapa.ESTADO - 1] || '').trim().toUpperCase()
        ) &&
        esCitaAbiertaOVencida_(fila[mapa.Fecha - 1], hoy)
      )
    };
  }).filter(function(registro) {
    return registro.incluir;
  });
}

function compararCamposCitasAbiertas_(sheets, supabase) {
  const pares = {
    cliente: [sheets.cliente, supabase.cliente],
    numero: [
      normalizarNumeroComparacionConsultaSupabase_(sheets.numero),
      normalizarNumeroComparacionConsultaSupabase_(supabase.numero)
    ],
    proceso: [sheets.proceso, supabase.proceso],
    sucursalDestino: [
      sheets.sucursalDestino,
      supabase.sucursalDestino
    ],
    asesor: [sheets.asesor, supabase.asesor],
    origen: [sheets.origen, supabase.origen],
    sucursalOrigen: [sheets.sucursalOrigen, supabase.sucursalOrigen],
    estado: [sheets.estado, supabase.estado],
    fecha: [sheets.fecha, supabase.fecha]
  };

  return Object.keys(pares).filter(function(campo) {
    return String(pares[campo][0] || '') !== String(pares[campo][1] || '');
  });
}

function compararCitasAbiertasSheetsVsSupabase() {
  const sheets = obtenerRegistrosComparablesCitasAbiertasSheets_();
  const supabase = mapearCitasAbiertasSupabase_();
  const supabasePorClave = {};
  const usados = {};
  const ejemplosDiferencias = [];
  let coincidencias = 0;
  let diferencias = 0;
  let soloSheets = 0;

  supabase.forEach(function(cita) {
    if (cita.source_record_key) {
      supabasePorClave[cita.source_record_key] = cita;
    }
  });

  sheets.forEach(function(citaSheets) {
    const citaSupabase = supabasePorClave[citaSheets.clave];

    if (!citaSupabase) {
      soloSheets++;
      return;
    }

    usados[citaSheets.clave] = true;
    const campos = compararCamposCitasAbiertas_(citaSheets, citaSupabase);

    if (campos.length === 0) {
      coincidencias++;
      return;
    }

    diferencias++;

    if (ejemplosDiferencias.length < 10) {
      ejemplosDiferencias.push({
        legacy_id: citaSheets.legacy_id,
        campos: campos
      });
    }
  });

  const soloSupabase = supabase.filter(function(cita) {
    return !cita.source_record_key || !usados[cita.source_record_key];
  }).length;
  const resultado = {
    sheetsTotal: sheets.length,
    supabaseTotal: supabase.length,
    coincidencias: coincidencias,
    diferencias: diferencias,
    soloSheets: soloSheets,
    soloSupabase: soloSupabase,
    ejemplosDiferencias: ejemplosDiferencias
  };

  Logger.log('CITAS ABIERTAS - COMPARACIÓN');
  Logger.log('SHEETS TOTAL: ' + resultado.sheetsTotal);
  Logger.log('SUPABASE TOTAL: ' + resultado.supabaseTotal);
  Logger.log('COINCIDENCIAS: ' + resultado.coincidencias);
  Logger.log('DIFERENCIAS: ' + resultado.diferencias);
  Logger.log('SOLO SHEETS: ' + resultado.soloSheets);
  Logger.log('SOLO SUPABASE: ' + resultado.soloSupabase);
  Logger.log(JSON.stringify(resultado.ejemplosDiferencias, null, 2));

  return resultado;
}

function probarCitasAbiertasSupabase() {
  const citas = mapearCitasAbiertasSupabase_();
  const muestra = citas.slice(0, 5).map(function(cita) {
    return {
      ID: cita.id,
      Timestamp: cita.timestamp,
      Cliente: cita.cliente,
      Proceso: cita.proceso,
      Numero: cita.numero,
      Precio: cita.precio,
      Extras: cita.extras,
      Fecha: cita.fecha,
      SucursalDestino: cita.sucursalDestino,
      Asesor: cita.asesor,
      Nota: cita.nota,
      Origen: cita.origen,
      SucursalOrigen: cita.sucursalOrigen,
      ESTADO: cita.estado,
      HORA: cita.hora,
      destinos: cita.destinos.map(function(destino) {
        return {
          sucursal_nombre: destino.sucursal_nombre,
          orden: destino.orden
        };
      })
    };
  });

  Logger.log('CITAS ABIERTAS SUPABASE - PRUEBA');
  Logger.log('TOTAL: ' + citas.length);
  Logger.log(JSON.stringify(muestra, null, 2));

  return muestra;
}
