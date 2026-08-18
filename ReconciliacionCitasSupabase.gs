/**
 * Diagnóstico de reconciliación RegistroCitas -> Supabase.
 * Solo realiza lecturas de Google Sheets y peticiones GET a Supabase.
 */

const RECONCILIACION_CITAS_ESTADOS_PENDIENTES_ = {
  PENDIENTE: true,
  ERROR: true
};
const RECONCILIACION_CITAS_MAX_KEYS_POR_GET_ = 20;
const RECONCILIACION_CITAS_CAMPOS_REMOTOS_ = [
  'id',
  'source_system',
  'source_record_key',
  'legacy_id',
  'fecha_registro',
  'cliente',
  'numero_original',
  'numero_normalizado',
  'proceso_id',
  'proceso_texto',
  'precio_texto',
  'precio_monto',
  'extras',
  'fecha_cita',
  'cita_abierta',
  'hora_cita',
  'hora_texto_original',
  'asesor_id',
  'asesor_texto',
  'nota',
  'origen_id',
  'origen_texto',
  'sucursal_origen_id',
  'sucursal_origen_texto',
  'sucursal_destino_texto_legacy',
  'estado_codigo',
  'fecha_venta'
];
const RECONCILIACION_CITAS_ENCABEZADOS_ = [
  'OperationId',
  'ID',
  'Timestamp',
  'Cliente',
  'Proceso',
  'Numero',
  'Precio',
  'Extras',
  'Fecha',
  'SucursalDestino',
  'Asesor',
  'Nota',
  'Origen',
  'SucursalOrigen',
  'ESTADO',
  'FECHA DE VENTA',
  'HORA',
  'SUPABASE_SYNC_ESTADO',
  'SUPABASE_ID',
  'SUPABASE_SYNC_ULTIMO_INTENTO',
  'SUPABASE_SYNC_ERROR'
];

function obtenerHojaReconciliacionCitasSupabase_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss && ss.getSheetByName('RegistroCitas');

  if (!hoja) {
    throw new Error('No se encuentra la hoja "RegistroCitas".');
  }

  const mapa = obtenerMapaEncabezados_(hoja);
  RECONCILIACION_CITAS_ENCABEZADOS_.forEach(function(encabezado) {
    obtenerColumnaObligatoria_(mapa, encabezado);
  });

  return { hoja: hoja, mapa: mapa };
}

function valorVisibleFilaReconciliacionCita_(visibles, mapa, encabezado) {
  return String(visibles[mapa[encabezado] - 1] || '');
}

function capturarCandidatoSupabaseDesdeFilaCita_(hoja, mapa, numeroFila) {
  if (!Number.isInteger(numeroFila) || numeroFila < 2) {
    throw new Error('La fila de reconciliación debe ser mayor o igual a 2.');
  }

  const rango = hoja.getRange(
    numeroFila,
    1,
    1,
    hoja.getLastColumn()
  );
  const valores = rango.getValues()[0];
  const visibles = rango.getDisplayValues()[0];
  const operationId = valorVisibleFilaReconciliacionCita_(
    visibles,
    mapa,
    'OperationId'
  );
  const legacyId = valorVisibleFilaReconciliacionCita_(
    visibles,
    mapa,
    'ID'
  ).trim();
  const fechaRegistro = valores[mapa.Timestamp - 1];

  if (!/^\d+$/.test(legacyId)) {
    throw new Error('La fila tiene un ID legacy inválido.');
  }

  const contexto = crearContextoEscrituraCitaSupabase_(
    operationId,
    legacyId,
    fechaRegistro,
    numeroFila
  );

  const datos = {
    cliente: valorVisibleFilaReconciliacionCita_(visibles, mapa, 'Cliente'),
    proceso: valorVisibleFilaReconciliacionCita_(visibles, mapa, 'Proceso'),
    numero: valorVisibleFilaReconciliacionCita_(visibles, mapa, 'Numero'),
    precio: valorVisibleFilaReconciliacionCita_(visibles, mapa, 'Precio'),
    extras: valorVisibleFilaReconciliacionCita_(visibles, mapa, 'Extras'),
    fecha: valorVisibleFilaReconciliacionCita_(visibles, mapa, 'Fecha'),
    sucursalDestino: valorVisibleFilaReconciliacionCita_(
      visibles,
      mapa,
      'SucursalDestino'
    ),
    asesor: valorVisibleFilaReconciliacionCita_(visibles, mapa, 'Asesor'),
    nota: valorVisibleFilaReconciliacionCita_(visibles, mapa, 'Nota'),
    origen: valorVisibleFilaReconciliacionCita_(visibles, mapa, 'Origen'),
    sucursalOrigen: valorVisibleFilaReconciliacionCita_(
      visibles,
      mapa,
      'SucursalOrigen'
    ),
    hora: valorVisibleFilaReconciliacionCita_(visibles, mapa, 'HORA'),
    estado: valorVisibleFilaReconciliacionCita_(visibles, mapa, 'ESTADO'),
    fechaVenta: valorVisibleFilaReconciliacionCita_(
      visibles,
      mapa,
      'FECHA DE VENTA'
    )
  };
  return {
    fila: numeroFila,
    datos: datos,
    contexto: contexto,
    operationId: contexto.operationId,
    operationIdEnmascarado:
      enmascararOperationIdReconciliacionCita_(contexto.operationId),
    legacyId: contexto.legacyId,
    fechaRegistro: contexto.fechaRegistro,
    sourceSystem: ESCRITURA_CITA_SUPABASE_SOURCE_SYSTEM_,
    sourceRecordKey: contexto.sourceRecordKey,
    syncEstado: valorVisibleFilaReconciliacionCita_(
      visibles,
      mapa,
      'SUPABASE_SYNC_ESTADO'
    ).trim().toUpperCase(),
    supabaseId: valorVisibleFilaReconciliacionCita_(
      visibles,
      mapa,
      'SUPABASE_ID'
    ),
    preparacion: null
  };
}

function prepararCandidatoSupabaseDesdeFilaCita_(candidato, catalogos) {
  const contexto = Object.assign({}, candidato.contexto);

  if (catalogos) {
    contexto.catalogos = catalogos;
  }

  return Object.assign({}, candidato, {
    contexto: contexto,
    preparacion: prepararEscrituraCitaSupabase_(
      candidato.datos,
      contexto
    )
  });
}

function construirPayloadSupabaseDesdeFilaCita_(
  hoja,
  mapa,
  numeroFila,
  catalogos
) {
  return prepararCandidatoSupabaseDesdeFilaCita_(
    capturarCandidatoSupabaseDesdeFilaCita_(hoja, mapa, numeroFila),
    catalogos
  );
}

function enmascararOperationIdReconciliacionCita_(operationId) {
  const valor = String(operationId || '');

  if (valor.length < 13) {
    return '********';
  }

  return valor.slice(0, 8) + '-****-****-****-' + valor.slice(-4);
}

function obtenerCitasReconciliacionPorKeysSupabase_(sourceRecordKeys) {
  const keys = Array.from(new Set((sourceRecordKeys || []).filter(Boolean)));
  const resultados = [];

  dividirEnLotesSupabase_(keys, RECONCILIACION_CITAS_MAX_KEYS_POR_GET_)
    .forEach(function(lote) {
      const ruta =
        'citas?select=' + RECONCILIACION_CITAS_CAMPOS_REMOTOS_.join(',') +
        '&source_system=eq.' +
        encodeURIComponent(ESCRITURA_CITA_SUPABASE_SOURCE_SYSTEM_) +
        '&source_record_key=in.(' +
        lote.map(function(key) {
          return encodeURIComponent(key);
        }).join(',') + ')' +
        '&order=source_record_key.asc,id.asc';
      const filas = supabaseRequest_(ruta, { method: 'GET' }) || [];

      if (filas.length > 0) {
        resultados.push.apply(resultados, filas);
      }
    });

  return resultados;
}

function obtenerDestinosReconciliacionCitasSupabase_(idsCitas) {
  const ids = Array.from(new Set((idsCitas || []).filter(Boolean)));
  const resultados = [];

  dividirEnLotesSupabase_(ids, RECONCILIACION_CITAS_MAX_KEYS_POR_GET_)
    .forEach(function(lote) {
      const ruta =
        'cita_destinos?select=cita_id,sucursal_id,orden' +
        '&cita_id=in.(' +
        lote.map(function(id) {
          return encodeURIComponent(id);
        }).join(',') + ')' +
        '&order=cita_id.asc,orden.asc';
      const filas = supabaseRequest_(ruta, { method: 'GET' }) || [];

      if (filas.length > 0) {
        resultados.push.apply(resultados, filas);
      }
    });

  return resultados;
}

function valoresNulosEquivalentesReconciliacionCita_(valor) {
  return valor === null || valor === undefined ? null : valor;
}

function compararPayloadCitaReconciliacionSupabase_(esperado, remoto) {
  const diferencias = [];

  Object.keys(esperado).forEach(function(campo) {
    const valorEsperado = valoresNulosEquivalentesReconciliacionCita_(
      esperado[campo]
    );
    const valorRemoto = valoresNulosEquivalentesReconciliacionCita_(
      remoto[campo]
    );
    let coincide;

    if (campo === 'fecha_registro') {
      const tiempoEsperado = Date.parse(valorEsperado);
      const tiempoRemoto = Date.parse(valorRemoto);
      coincide =
        !isNaN(tiempoEsperado) &&
        !isNaN(tiempoRemoto) &&
        tiempoEsperado === tiempoRemoto;
    } else if (campo === 'precio_monto') {
      coincide = valorEsperado === null || valorRemoto === null
        ? valorEsperado === null && valorRemoto === null
        : Number(valorEsperado) === Number(valorRemoto);
    } else if (campo === 'cita_abierta') {
      coincide = Boolean(valorEsperado) === Boolean(valorRemoto);
    } else {
      coincide = valorEsperado === null && valorRemoto === null
        ? true
        : String(valorEsperado) === String(valorRemoto);
    }

    if (!coincide) {
      diferencias.push(campo);
    }
  });

  return diferencias;
}

function compararDestinosCitaReconciliacionSupabase_(esperados, remotos) {
  const listaEsperada = (esperados || []).slice().sort(function(a, b) {
    return Number(a.orden) - Number(b.orden);
  });
  const listaRemota = (remotos || []).slice().sort(function(a, b) {
    return Number(a.orden) - Number(b.orden);
  });

  if (listaEsperada.length !== listaRemota.length) {
    return false;
  }

  return listaEsperada.every(function(destino, indice) {
    return (
      String(destino.sucursal_id) ===
        String(listaRemota[indice].sucursal_id) &&
      Number(destino.orden) === Number(listaRemota[indice].orden)
    );
  });
}

function tieneErrorCatalogoReconciliacionCita_(errores) {
  return (errores || []).some(function(error) {
    return /catálogo|_id|sucursal|estado_codigo/i.test(String(error));
  });
}

function registrarDetalleReconciliacionCita_(detalle) {
  Logger.log(
    'FILA: ' + detalle.fila +
    ' | LEGACY ID: ' + (detalle.legacyId || '') +
    ' | OPERATION ID: ' + (detalle.operationIdEnmascarado || '********') +
    ' | TIPO: ' + detalle.tipo +
    (detalle.campos && detalle.campos.length > 0
      ? ' | CAMPOS: ' + detalle.campos.join(',')
      : '')
  );
}

function diagnosticarCitasPendientesSupabase() {
  const origen = obtenerHojaReconciliacionCitasSupabase_();
  const hoja = origen.hoja;
  const mapa = origen.mapa;
  const ultimaFila = hoja.getLastRow();
  const resumen = {
    filasRegistroCitas: Math.max(0, ultimaFila - 1),
    conOperationId: 0,
    pendientesError: 0,
    yaExistenSupabase: 0,
    faltantesSupabase: 0,
    payloadValido: 0,
    payloadInvalido: 0,
    erroresCatalogo: 0,
    coincidencias: 0,
    inconsistencias: 0
  };
  const detalles = [];
  const candidatos = [];
  const catalogos = cargarCatalogosEscrituraCitaSupabase_();

  if (ultimaFila >= 2) {
    const rango = hoja.getRange(
      2,
      1,
      ultimaFila - 1,
      hoja.getLastColumn()
    );
    const visibles = rango.getDisplayValues();

    visibles.forEach(function(filaVisible, indice) {
      const numeroFila = indice + 2;
      const operationId = valorVisibleFilaReconciliacionCita_(
        filaVisible,
        mapa,
        'OperationId'
      ).trim();
      const syncEstado = valorVisibleFilaReconciliacionCita_(
        filaVisible,
        mapa,
        'SUPABASE_SYNC_ESTADO'
      ).trim().toUpperCase();

      if (operationId) {
        resumen.conOperationId++;
      }

      if (!RECONCILIACION_CITAS_ESTADOS_PENDIENTES_[syncEstado]) {
        return;
      }

      resumen.pendientesError++;

      try {
        const candidato = construirPayloadSupabaseDesdeFilaCita_(
          hoja,
          mapa,
          numeroFila,
          catalogos
        );

        if (candidato.preparacion.valido) {
          resumen.payloadValido++;
        } else {
          resumen.payloadInvalido++;
          if (tieneErrorCatalogoReconciliacionCita_(
            candidato.preparacion.errores
          )) {
            resumen.erroresCatalogo++;
          }
          detalles.push({
            fila: candidato.fila,
            legacyId: candidato.legacyId,
            operationIdEnmascarado: candidato.operationIdEnmascarado,
            tipo: 'PAYLOAD_INVALIDO',
            campos: candidato.preparacion.errores
          });
        }

        candidatos.push(candidato);
      } catch (error) {
        resumen.payloadInvalido++;
        detalles.push({
          fila: numeroFila,
          legacyId: valorVisibleFilaReconciliacionCita_(
            filaVisible,
            mapa,
            'ID'
          ),
          operationIdEnmascarado:
            enmascararOperationIdReconciliacionCita_(operationId),
          tipo: 'FILA_INVALIDA',
          campos: [error.message || error.toString()]
        });
      }
    });
  }

  const remotas = obtenerCitasReconciliacionPorKeysSupabase_(
    candidatos.map(function(candidato) {
      return candidato.sourceRecordKey;
    })
  );
  const remotasPorKey = {};

  remotas.forEach(function(remota) {
    if (!remotasPorKey[remota.source_record_key]) {
      remotasPorKey[remota.source_record_key] = [];
    }
    remotasPorKey[remota.source_record_key].push(remota);
  });

  const destinosRemotos = obtenerDestinosReconciliacionCitasSupabase_(
    remotas.map(function(remota) {
      return remota.id;
    })
  );
  const destinosPorCita = {};

  destinosRemotos.forEach(function(destino) {
    if (!destinosPorCita[destino.cita_id]) {
      destinosPorCita[destino.cita_id] = [];
    }
    destinosPorCita[destino.cita_id].push(destino);
  });

  candidatos.forEach(function(candidato) {
    const coincidenciasRemotas =
      remotasPorKey[candidato.sourceRecordKey] || [];

    if (coincidenciasRemotas.length === 0) {
      resumen.faltantesSupabase++;
      return;
    }

    resumen.yaExistenSupabase++;

    if (coincidenciasRemotas.length !== 1) {
      resumen.inconsistencias++;
      detalles.push({
        fila: candidato.fila,
        legacyId: candidato.legacyId,
        operationIdEnmascarado: candidato.operationIdEnmascarado,
        tipo: 'SOURCE_RECORD_KEY_REPETIDA',
        campos: []
      });
      return;
    }

    if (!candidato.preparacion.valido) {
      resumen.inconsistencias++;
      return;
    }

    const remota = coincidenciasRemotas[0];
    const diferencias = compararPayloadCitaReconciliacionSupabase_(
      candidato.preparacion.cita,
      remota
    );
    const destinosCoinciden = compararDestinosCitaReconciliacionSupabase_(
      candidato.preparacion.destinos,
      destinosPorCita[remota.id] || []
    );

    if (diferencias.length === 0 && destinosCoinciden) {
      resumen.coincidencias++;
    } else {
      resumen.inconsistencias++;
      detalles.push({
        fila: candidato.fila,
        legacyId: candidato.legacyId,
        operationIdEnmascarado: candidato.operationIdEnmascarado,
        tipo: 'DIFIERE',
        campos: diferencias.concat(
          destinosCoinciden ? [] : ['cita_destinos']
        )
      });
    }
  });

  Logger.log('RECONCILIACIÓN CITAS PENDIENTES');
  Logger.log('FILAS REGISTROCITAS: ' + resumen.filasRegistroCitas);
  Logger.log('CON OPERATION ID: ' + resumen.conOperationId);
  Logger.log('PENDIENTES/ERROR: ' + resumen.pendientesError);
  Logger.log('YA EXISTEN EN SUPABASE: ' + resumen.yaExistenSupabase);
  Logger.log('FALTANTES EN SUPABASE: ' + resumen.faltantesSupabase);
  Logger.log('PAYLOAD VALIDO: ' + resumen.payloadValido);
  Logger.log('PAYLOAD INVALIDO: ' + resumen.payloadInvalido);
  Logger.log('ERRORES CATALOGO: ' + resumen.erroresCatalogo);
  Logger.log('COINCIDENCIAS: ' + resumen.coincidencias);
  Logger.log('INCONSISTENCIAS: ' + resumen.inconsistencias);
  detalles.forEach(registrarDetalleReconciliacionCita_);

  return {
    resumen: resumen,
    detalles: detalles
  };
}

function probarPayloadSupabaseDesdeUltimaCitaPendiente() {
  const origen = obtenerHojaReconciliacionCitasSupabase_();
  const hoja = origen.hoja;
  const mapa = origen.mapa;
  const catalogos = cargarCatalogosEscrituraCitaSupabase_();
  let candidato = null;

  for (let fila = hoja.getLastRow(); fila >= 2; fila--) {
    const visibles = hoja
      .getRange(fila, 1, 1, hoja.getLastColumn())
      .getDisplayValues()[0];
    const syncEstado = valorVisibleFilaReconciliacionCita_(
      visibles,
      mapa,
      'SUPABASE_SYNC_ESTADO'
    ).trim().toUpperCase();
    const operationId = valorVisibleFilaReconciliacionCita_(
      visibles,
      mapa,
      'OperationId'
    ).trim();

    if (syncEstado !== 'PENDIENTE' || !operationId) {
      continue;
    }

    try {
      normalizarOperationIdCita_(operationId);
      candidato = construirPayloadSupabaseDesdeFilaCita_(
        hoja,
        mapa,
        fila,
        catalogos
      );
      break;
    } catch (error) {
      // Continúa hasta encontrar la última fila pendiente estructuralmente válida.
    }
  }

  if (!candidato) {
    throw new Error(
      'No se encontró una cita PENDIENTE con OperationId y fila válidos.'
    );
  }

  const remotas = obtenerCitasReconciliacionPorKeysSupabase_([
    candidato.sourceRecordKey
  ]);
  const catalogosValidos = !tieneErrorCatalogoReconciliacionCita_(
    candidato.preparacion.errores
  );

  Logger.log('PRUEBA PAYLOAD SUPABASE DESDE FILA PERSISTIDA');
  Logger.log('FILA: ' + candidato.fila);
  Logger.log('OPERATION ID: ' + candidato.operationIdEnmascarado);
  Logger.log('LEGACY ID: ' + candidato.legacyId);
  Logger.log('TIMESTAMP VALIDO: true');
  Logger.log('PAYLOAD VALIDO: ' + candidato.preparacion.valido);
  Logger.log('CATALOGOS VALIDOS: ' + catalogosValidos);
  Logger.log(
    'DESTINOS SOLICITADOS: ' +
    candidato.preparacion.diagnostico.destinos_solicitados
  );
  Logger.log(
    'DESTINOS RESUELTOS: ' +
    candidato.preparacion.diagnostico.destinos_resueltos
  );
  Logger.log('EXISTE EN SUPABASE: ' + (remotas.length > 0));

  return {
    fila: candidato.fila,
    operationId: candidato.operationIdEnmascarado,
    legacyId: candidato.legacyId,
    timestampValido: true,
    payloadValido: candidato.preparacion.valido,
    catalogosValidos: catalogosValidos,
    destinosSolicitados:
      candidato.preparacion.diagnostico.destinos_solicitados,
    destinosResueltos:
      candidato.preparacion.diagnostico.destinos_resueltos,
    existeEnSupabase: remotas.length > 0
  };
}
