/**
 * Sincronización manual y controlada de una sola cita RegistroCitas -> Supabase.
 *
 * La escritura operativa solo se invoca después de persistir Sheets y usa el
 * RPC transaccional e idempotente. La función manual conserva confirmación.
 */

const SINCRONIZACION_CITA_SUPABASE_CONFIRMACION_PROPERTY_ =
  'CONFIRMAR_SINCRONIZACION_CITA_SUPABASE';
const SINCRONIZACION_CITA_SUPABASE_CONFIRMACION_VALOR_ = 'SI';
const ESCRITURA_CITAS_SUPABASE_PROPERTY_ = 'ESCRITURA_CITAS_SUPABASE';
const ESCRITURA_CITAS_SUPABASE_DESACTIVADA_ = 'DESACTIVADA';
const ESCRITURA_CITAS_SUPABASE_DUAL_WRITE_ = 'DUAL_WRITE';
const SINCRONIZACION_CITA_SUPABASE_ESTADO_PENDIENTE_ = 'PENDIENTE';
const SINCRONIZACION_CITA_SUPABASE_ESTADO_SINCRONIZADA_ = 'SINCRONIZADA';
const SINCRONIZACION_CITA_SUPABASE_ESTADO_ERROR_ = 'ERROR';
const SINCRONIZACION_CITA_SUPABASE_LOCK_TIMEOUT_MS_ = 30000;
const SINCRONIZACION_CITA_SUPABASE_ERROR_MAX_LENGTH_ = 300;
const SINCRONIZACION_CITA_SUPABASE_CAMPOS_SNAPSHOT_ = [
  'cliente',
  'proceso',
  'numero',
  'precio',
  'extras',
  'fecha',
  'sucursalDestino',
  'asesor',
  'nota',
  'origen',
  'sucursalOrigen',
  'hora',
  'estado',
  'fechaVenta'
];

function obtenerModoEscrituraCitasSupabase_() {
  const valor = PropertiesService
    .getScriptProperties()
    .getProperty(ESCRITURA_CITAS_SUPABASE_PROPERTY_);

  if (valor === null) {
    return ESCRITURA_CITAS_SUPABASE_DESACTIVADA_;
  }

  const modo = String(valor).trim().toUpperCase();

  if (
    modo !== ESCRITURA_CITAS_SUPABASE_DESACTIVADA_ &&
    modo !== ESCRITURA_CITAS_SUPABASE_DUAL_WRITE_
  ) {
    throw new Error(
      'Valor inválido para la Script Property ' +
      ESCRITURA_CITAS_SUPABASE_PROPERTY_ + '.'
    );
  }

  return modo;
}

function exigirConfirmacionSincronizacionCitaSupabase_() {
  const valor = PropertiesService
    .getScriptProperties()
    .getProperty(SINCRONIZACION_CITA_SUPABASE_CONFIRMACION_PROPERTY_);

  if (valor !== SINCRONIZACION_CITA_SUPABASE_CONFIRMACION_VALOR_) {
    throw new Error(
      'Sincronización Supabase bloqueada: la Script Property ' +
      SINCRONIZACION_CITA_SUPABASE_CONFIRMACION_PROPERTY_ +
      ' debe tener el valor exacto SI.'
    );
  }
}

function validarPayloadPersistidoSinCatalogosSincronizacionSupabase_(
  candidato
) {
  const obligatorios = [
    'cliente',
    'proceso',
    'numero',
    'precio',
    'fecha',
    'sucursalDestino',
    'asesor',
    'origen',
    'sucursalOrigen',
    'estado'
  ];
  const faltantes = obligatorios.filter(function(propiedad) {
    return !String(candidato.datos[propiedad] || '').trim();
  });

  if (faltantes.length > 0) {
    throw new Error(
      'La fila seleccionada carece de campos obligatorios: ' +
      faltantes.join(',') + '.'
    );
  }
}

function capturarUltimaCitaConEstadoSincronizacionSupabase_(
  hoja,
  mapa,
  estadoBuscado
) {
  const estadoObjetivo = String(estadoBuscado || '').trim().toUpperCase();

  if (
    estadoObjetivo !== SINCRONIZACION_CITA_SUPABASE_ESTADO_PENDIENTE_ &&
    estadoObjetivo !== SINCRONIZACION_CITA_SUPABASE_ESTADO_ERROR_
  ) {
    throw new Error('El estado técnico buscado no es válido.');
  }

  for (let fila = hoja.getLastRow(); fila >= 2; fila--) {
    const visibles = hoja
      .getRange(fila, 1, 1, hoja.getLastColumn())
      .getDisplayValues()[0];
    const estado = valorVisibleFilaReconciliacionCita_(
      visibles,
      mapa,
      'SUPABASE_SYNC_ESTADO'
    ).trim().toUpperCase();

    if (estado !== estadoObjetivo) {
      continue;
    }

    try {
      const candidato = capturarCandidatoSupabaseDesdeFilaCita_(
        hoja,
        mapa,
        fila
      );

      validarPayloadPersistidoSinCatalogosSincronizacionSupabase_(
        candidato
      );
      return candidato;
    } catch (error) {
      // Continúa hasta una fila del estado pedido con identidad válida.
    }
  }

  return null;
}

function capturarUltimaCitaPendienteSincronizacionSupabase_(hoja, mapa) {
  return capturarUltimaCitaConEstadoSincronizacionSupabase_(
    hoja,
    mapa,
    SINCRONIZACION_CITA_SUPABASE_ESTADO_PENDIENTE_
  );
}

function capturarUltimaCitaErrorSincronizacionSupabase_(hoja, mapa) {
  return capturarUltimaCitaConEstadoSincronizacionSupabase_(
    hoja,
    mapa,
    SINCRONIZACION_CITA_SUPABASE_ESTADO_ERROR_
  );
}

function consultarCitaRemotaSincronizacionSupabase_(candidato) {
  const remotas = obtenerCitasReconciliacionPorKeysSupabase_([
    candidato.sourceRecordKey
  ]);

  if (remotas.length === 0) {
    return {
      existe: false,
      coincide: false,
      remota: null,
      destinos: [],
      diferencias: [],
      destinosCoinciden: false
    };
  }

  if (remotas.length !== 1) {
    throw new Error(
      'La identidad idempotente devolvió más de una cita remota.'
    );
  }

  const remota = remotas[0];
  const destinos = obtenerDestinosReconciliacionCitasSupabase_([
    remota.id
  ]);
  const diferencias = compararPayloadCitaReconciliacionSupabase_(
    candidato.preparacion.cita,
    remota
  );
  const destinosCoinciden = compararDestinosCitaReconciliacionSupabase_(
    candidato.preparacion.destinos,
    destinos
  );

  return {
    existe: true,
    coincide: diferencias.length === 0 && destinosCoinciden,
    remota: remota,
    destinos: destinos,
    diferencias: diferencias,
    destinosCoinciden: destinosCoinciden
  };
}

function describirDiferenciasSincronizacionCitaSupabase_(verificacion) {
  const campos = (verificacion.diferencias || []).slice();

  if (!verificacion.destinosCoinciden) {
    campos.push('cita_destinos');
  }

  return campos.join(',');
}

function filaConservaSnapshotSincronizacionSupabase_(hoja, mapa, candidato) {
  let actual;

  try {
    actual = capturarCandidatoSupabaseDesdeFilaCita_(
      hoja,
      mapa,
      candidato.fila
    );
  } catch (error) {
    return false;
  }

  const identidadConservada =
    actual.operationId === candidato.operationId &&
    actual.legacyId === candidato.legacyId &&
    actual.fechaRegistro.getTime() === candidato.fechaRegistro.getTime() &&
    actual.syncEstado ===
      SINCRONIZACION_CITA_SUPABASE_ESTADO_PENDIENTE_;
  const datosConservados =
    SINCRONIZACION_CITA_SUPABASE_CAMPOS_SNAPSHOT_.every(
      function(propiedad) {
        return String(actual.datos[propiedad]) ===
          String(candidato.datos[propiedad]);
      }
    );

  return identidadConservada && datosConservados;
}

function actualizarCitaSincronizadaSupabase_(
  hoja,
  mapa,
  candidato,
  supabaseId,
  fechaIntento
) {
  if (!filaConservaSnapshotSincronizacionSupabase_(
    hoja,
    mapa,
    candidato
  )) {
    throw new Error(
      'La identidad, el estado PENDIENTE o el payload de la fila cambió durante la sincronización; no se actualizaron columnas técnicas.'
    );
  }

  hoja
    .getRange(candidato.fila, mapa.SUPABASE_SYNC_ESTADO)
    .setValue(SINCRONIZACION_CITA_SUPABASE_ESTADO_SINCRONIZADA_);
  hoja
    .getRange(candidato.fila, mapa.SUPABASE_ID)
    .setValue(supabaseId);
  hoja
    .getRange(candidato.fila, mapa.SUPABASE_SYNC_ULTIMO_INTENTO)
    .setValue(fechaIntento);
  hoja
    .getRange(candidato.fila, mapa.SUPABASE_SYNC_ERROR)
    .setValue('');
  SpreadsheetApp.flush();
}

function resumirErrorSincronizacionCitaSupabase_(error) {
  const texto = String(
    error && error.message ? error.message : error || 'Error desconocido.'
  )
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,
      '[UUID]'
    )
    .replace(/\s+/g, ' ')
    .trim();

  return (
    texto.slice(0, SINCRONIZACION_CITA_SUPABASE_ERROR_MAX_LENGTH_) ||
    'Error desconocido.'
  );
}

function actualizarErrorSincronizacionCitaSupabase_(
  hoja,
  mapa,
  candidato,
  mensaje,
  fechaIntento
) {
  if (!filaConservaSnapshotSincronizacionSupabase_(
    hoja,
    mapa,
    candidato
  )) {
    return false;
  }

  hoja
    .getRange(candidato.fila, mapa.SUPABASE_SYNC_ESTADO)
    .setValue(SINCRONIZACION_CITA_SUPABASE_ESTADO_ERROR_);
  hoja
    .getRange(candidato.fila, mapa.SUPABASE_SYNC_ULTIMO_INTENTO)
    .setValue(fechaIntento);
  hoja
    .getRange(candidato.fila, mapa.SUPABASE_SYNC_ERROR)
    .setValue(mensaje);
  SpreadsheetApp.flush();
  return true;
}

function enmascararIdSincronizacionCitaSupabase_(id) {
  const valor = String(id || '');

  if (valor.length < 13) {
    return valor ? '********' : '';
  }

  return valor.slice(0, 8) + '-****-' + valor.slice(-4);
}

function registrarResultadoSincronizacionCitaSupabase_(resultado) {
  Logger.log('SINCRONIZACION CONTROLADA CITA SUPABASE');
  Logger.log('FILA: ' + (resultado.fila || ''));
  Logger.log('LEGACY ID: ' + (resultado.legacyId || ''));
  Logger.log('OPERATION ID: ' + (resultado.operationId || '********'));
  Logger.log('ESTADO INICIAL: ' + (resultado.estadoInicial || ''));
  Logger.log('EXISTIA REMOTA: ' + resultado.existiaRemota);
  Logger.log('RPC EJECUTADO: ' + resultado.rpcEjecutado);
  Logger.log('REUTILIZADA: ' + resultado.reutilizada);
  Logger.log('DESTINOS ESPERADOS: ' + resultado.destinosEsperados);
  Logger.log('DESTINOS VERIFICADOS: ' + resultado.destinosVerificados);
  Logger.log(
    'SUPABASE ID: ' +
    enmascararIdSincronizacionCitaSupabase_(resultado.supabaseId)
  );
  Logger.log('ESTADO FINAL: ' + resultado.estadoFinal);
  Logger.log('EXITO: ' + resultado.exito);
}

function ejecutarConScriptLockSincronizacionCitaSupabase_(callback) {
  const lock = LockService.getScriptLock();
  const adquirido = lock.tryLock(
    SINCRONIZACION_CITA_SUPABASE_LOCK_TIMEOUT_MS_
  );

  if (!adquirido) {
    throw new Error(
      'No se pudo obtener el bloqueo exclusivo para sincronizar la cita.'
    );
  }

  try {
    return callback();
  } finally {
    if (lock.hasLock()) {
      lock.releaseLock();
    }
  }
}

function ejecutarFaseRemotaSincronizacionCitaSupabase_(
  candidatoCapturado,
  resultado
) {
  const catalogos = cargarCatalogosEscrituraCitaSupabase_();
  const candidato = prepararCandidatoSupabaseDesdeFilaCita_(
    candidatoCapturado,
    catalogos
  );
  const catalogosValidos = !tieneErrorCatalogoReconciliacionCita_(
    candidato.preparacion.errores
  );

  if (!candidato.preparacion.valido || !catalogosValidos) {
    throw new Error(
      'Preflight Supabase rechazado: ' +
      candidato.preparacion.errores.join(' ')
    );
  }

  resultado.destinosEsperados = candidato.preparacion.destinos.length;
  let verificacion = consultarCitaRemotaSincronizacionSupabase_(
    candidato
  );
  resultado.existiaRemota = verificacion.existe;

  if (verificacion.existe) {
    resultado.destinosVerificados = verificacion.destinos.length;

    if (!verificacion.coincide) {
      throw new Error(
        'La cita remota existe pero difiere en: ' +
        describirDiferenciasSincronizacionCitaSupabase_(verificacion) + '.'
      );
    }

    resultado.reutilizada = true;
  } else {
    resultado.rpcEjecutado = true;
    const contextoEscritura = Object.assign({}, candidato.contexto, {
      confirmacion: ESCRITURA_CITA_SUPABASE_CONFIRMACION_
    });
    let respuestaRpc = null;

    try {
      respuestaRpc = insertarCitaSupabase_(
        candidato.datos,
        contextoEscritura
      );
    } catch (errorRpc) {
      // El servidor pudo confirmar la transacción aunque Apps Script haya
      // perdido la respuesta. El GET de recuperación también ocurre sin lock.
      verificacion = consultarCitaRemotaSincronizacionSupabase_(candidato);

      if (!verificacion.existe || !verificacion.coincide) {
        throw errorRpc;
      }

      resultado.reutilizada = true;
    }

    if (respuestaRpc) {
      resultado.reutilizada = respuestaRpc.reutilizada;
      verificacion = consultarCitaRemotaSincronizacionSupabase_(candidato);

      if (!verificacion.existe || !verificacion.coincide) {
        throw new Error(
          'La verificación posterior al RPC no encontró una copia remota exacta' +
          (verificacion.existe
            ? ': ' + describirDiferenciasSincronizacionCitaSupabase_(
              verificacion
            )
            : '') + '.'
        );
      }

      if (
        String(respuestaRpc.id) !== String(verificacion.remota.id) ||
        respuestaRpc.sourceRecordKey !== candidato.sourceRecordKey
      ) {
        throw new Error(
          'La respuesta del RPC no coincide con la cita recuperada en la verificación.'
        );
      }
    }
  }

  resultado.destinosVerificados = verificacion.destinos.length;
  resultado.supabaseId = verificacion.remota.id;

  return {
    candidato: candidato,
    supabaseId: verificacion.remota.id
  };
}

function crearResultadoSincronizacionCitaSupabase_() {
  return {
    fila: '',
    legacyId: '',
    operationId: '********',
    estadoInicial: '',
    existiaRemota: false,
    rpcEjecutado: false,
    reutilizada: false,
    destinosEsperados: 0,
    destinosVerificados: 0,
    supabaseId: '',
    estadoFinal: 'ABORTADA',
    exito: false
  };
}

function sincronizarCitaPersistidaSupabase_(
  numeroFila,
  operationId,
  legacyId,
  timestamp
) {
  const resultado = crearResultadoSincronizacionCitaSupabase_();
  let origen = null;
  let candidato = null;
  let supabaseId = null;
  let errorRemoto = null;

  try {
    const filaEsperada = Number(numeroFila);
    const operationIdEsperado = normalizarOperationIdCita_(operationId);
    const legacyIdEsperado = String(legacyId || '').trim();

    if (!Number.isInteger(filaEsperada) || filaEsperada < 2) {
      throw new Error('La fila persistida para dual-write no es válida.');
    }

    if (!/^\d+$/.test(legacyIdEsperado)) {
      throw new Error('El legacyId persistido para dual-write no es válido.');
    }

    if (
      Object.prototype.toString.call(timestamp) !== '[object Date]' ||
      isNaN(timestamp.getTime())
    ) {
      throw new Error('El Timestamp persistido para dual-write no es válido.');
    }

    // FASE A: solo Sheets y validaciones locales bajo un lock breve.
    const captura = ejecutarConScriptLockSincronizacionCitaSupabase_(
      function() {
        const origenCaptura = obtenerHojaReconciliacionCitasSupabase_();
        let candidatoCapturado = capturarCandidatoSupabaseDesdeFilaCita_(
          origenCaptura.hoja,
          origenCaptura.mapa,
          filaEsperada
        );

        validarPayloadPersistidoSinCatalogosSincronizacionSupabase_(
          candidatoCapturado
        );

        if (
          candidatoCapturado.operationId !== operationIdEsperado ||
          candidatoCapturado.legacyId !== legacyIdEsperado ||
          candidatoCapturado.fechaRegistro.getTime() !== timestamp.getTime()
        ) {
          throw new Error(
            'La fila ya no conserva la identidad persistida por guardarCita().'
          );
        }

        const estadoInicial = candidatoCapturado.syncEstado;

        if (
          estadoInicial ===
          SINCRONIZACION_CITA_SUPABASE_ESTADO_SINCRONIZADA_
        ) {
          const idExistente = String(
            candidatoCapturado.supabaseId || ''
          ).trim();

          if (!idExistente) {
            throw new Error(
              'La fila está SINCRONIZADA pero no conserva SUPABASE_ID.'
            );
          }

          return {
            origen: origenCaptura,
            candidato: candidatoCapturado,
            estadoInicial: estadoInicial,
            yaSincronizada: true,
            supabaseId: idExistente
          };
        }

        if (estadoInicial === SINCRONIZACION_CITA_SUPABASE_ESTADO_ERROR_) {
          const snapshotError = candidatoCapturado;

          origenCaptura.hoja
            .getRange(
              filaEsperada,
              origenCaptura.mapa.SUPABASE_SYNC_ESTADO
            )
            .setValue(SINCRONIZACION_CITA_SUPABASE_ESTADO_PENDIENTE_);
          SpreadsheetApp.flush();
          candidatoCapturado = capturarCandidatoSupabaseDesdeFilaCita_(
            origenCaptura.hoja,
            origenCaptura.mapa,
            filaEsperada
          );

          const snapshotConservado =
            candidatoCapturado.operationId === snapshotError.operationId &&
            candidatoCapturado.legacyId === snapshotError.legacyId &&
            candidatoCapturado.fechaRegistro.getTime() ===
              snapshotError.fechaRegistro.getTime() &&
            SINCRONIZACION_CITA_SUPABASE_CAMPOS_SNAPSHOT_.every(
              function(propiedad) {
                return String(candidatoCapturado.datos[propiedad]) ===
                  String(snapshotError.datos[propiedad]);
              }
            );

          if (!snapshotConservado) {
            throw new Error(
              'La fila cambió durante la preparación controlada del retry.'
            );
          }
        } else if (
          estadoInicial !== SINCRONIZACION_CITA_SUPABASE_ESTADO_PENDIENTE_
        ) {
          throw new Error(
            'La fila tiene un estado técnico de sincronización no admitido.'
          );
        }

        return {
          origen: origenCaptura,
          candidato: candidatoCapturado,
          estadoInicial: estadoInicial,
          yaSincronizada: false,
          supabaseId: ''
        };
      }
    );

    origen = captura.origen;
    candidato = captura.candidato;

    resultado.fila = candidato.fila;
    resultado.legacyId = candidato.legacyId;
    resultado.operationId = candidato.operationIdEnmascarado;
    resultado.estadoInicial = captura.estadoInicial;

    if (captura.yaSincronizada) {
      resultado.supabaseId = captura.supabaseId;
      resultado.estadoFinal =
        SINCRONIZACION_CITA_SUPABASE_ESTADO_SINCRONIZADA_;
      resultado.reutilizada = true;
      resultado.exito = true;
      return resultado;
    }

    // FASE B: catálogos, GET, RPC y verificación, siempre sin lock.
    try {
      const faseRemota = ejecutarFaseRemotaSincronizacionCitaSupabase_(
        candidato,
        resultado
      );
      candidato = faseRemota.candidato;
      supabaseId = faseRemota.supabaseId;
    } catch (error) {
      errorRemoto = error;
    }

    // FASE C: un lock nuevo solo para revalidar y actualizar columnas técnicas.
    ejecutarConScriptLockSincronizacionCitaSupabase_(function() {
      if (!filaConservaSnapshotSincronizacionSupabase_(
        origen.hoja,
        origen.mapa,
        candidato
      )) {
        resultado.estadoFinal = 'ABORTADA_SIN_ACTUALIZAR_FILA';
        return;
      }

      if (errorRemoto) {
        const actualizada = actualizarErrorSincronizacionCitaSupabase_(
          origen.hoja,
          origen.mapa,
          candidato,
          resumirErrorSincronizacionCitaSupabase_(errorRemoto),
          new Date()
        );
        resultado.estadoFinal = actualizada
          ? SINCRONIZACION_CITA_SUPABASE_ESTADO_ERROR_
          : 'ABORTADA_SIN_ACTUALIZAR_FILA';
        return;
      }

      actualizarCitaSincronizadaSupabase_(
        origen.hoja,
        origen.mapa,
        candidato,
        supabaseId,
        new Date()
      );
      resultado.estadoFinal =
        SINCRONIZACION_CITA_SUPABASE_ESTADO_SINCRONIZADA_;
      resultado.exito = true;
    });
  } catch (error) {
    if (resultado.estadoFinal === 'ABORTADA') {
      resultado.estadoFinal = 'ABORTADA_SIN_ACTUALIZAR_FILA';
    }
  }

  return resultado;
}

/**
 * Sincroniza una sola cita: la última fila PENDIENTE que supera el preflight.
 * Requiere CONFIRMAR_SINCRONIZACION_CITA_SUPABASE=SI en Script Properties.
 */
function sincronizarUltimaCitaPendienteSupabase() {
  let resultado = crearResultadoSincronizacionCitaSupabase_();

  try {
    exigirConfirmacionSincronizacionCitaSupabase_();

    const identidad = ejecutarConScriptLockSincronizacionCitaSupabase_(
      function() {
        const origen = obtenerHojaReconciliacionCitasSupabase_();
        const candidato =
          capturarUltimaCitaPendienteSincronizacionSupabase_(
            origen.hoja,
            origen.mapa
          );

        if (!candidato) {
          throw new Error(
            'No existe una fila PENDIENTE con identidad y payload persistido válidos.'
          );
        }

        return {
          fila: candidato.fila,
          operationId: candidato.operationId,
          legacyId: candidato.legacyId,
          timestamp: candidato.fechaRegistro
        };
      }
    );

    resultado = sincronizarCitaPersistidaSupabase_(
      identidad.fila,
      identidad.operationId,
      identidad.legacyId,
      identidad.timestamp
    );
  } catch (error) {
    resultado.estadoFinal = 'ABORTADA_SIN_ACTUALIZAR_FILA';
  }

  registrarResultadoSincronizacionCitaSupabase_(resultado);
  return resultado;
}

/**
 * Reintenta una sola cita: la última fila ERROR con identidad persistida
 * válida. Requiere la misma confirmación administrativa que la sincronización
 * manual de filas PENDIENTE.
 */
function reintentarUltimaCitaErrorSupabase() {
  let resultado = crearResultadoSincronizacionCitaSupabase_();

  try {
    exigirConfirmacionSincronizacionCitaSupabase_();

    const identidad = ejecutarConScriptLockSincronizacionCitaSupabase_(
      function() {
        const origen = obtenerHojaReconciliacionCitasSupabase_();
        const candidato = capturarUltimaCitaErrorSincronizacionSupabase_(
          origen.hoja,
          origen.mapa
        );

        if (!candidato) {
          throw new Error(
            'No existe una fila ERROR con identidad y payload persistido válidos.'
          );
        }

        return {
          fila: candidato.fila,
          operationId: candidato.operationId,
          legacyId: candidato.legacyId,
          timestamp: candidato.fechaRegistro
        };
      }
    );

    resultado = sincronizarCitaPersistidaSupabase_(
      identidad.fila,
      identidad.operationId,
      identidad.legacyId,
      identidad.timestamp
    );
  } catch (error) {
    resultado.estadoFinal = 'ABORTADA_SIN_ACTUALIZAR_FILA';
  }

  registrarResultadoSincronizacionCitaSupabase_(resultado);
  return resultado;
}
