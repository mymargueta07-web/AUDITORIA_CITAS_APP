/**
 * ==========================================================
 * PRUEBAS TEMPORALES DE IDEMPOTENCIA - REGISTRO DE CITAS
 * ==========================================================
 *
 * Estas funciones:
 * - NO insertan filas directamente.
 * - NO modifican datos existentes directamente.
 * - NO llaman a Supabase.
 * - Solo reconstruyen una cita existente y llaman guardarCita().
 *
 * Requieren que exista al menos una fila de RegistroCitas
 * con OperationId válido.
 */


/**
 * Busca desde abajo hacia arriba la última fila que tenga
 * OperationId y Timestamp válido.
 *
 * @return {Object} Contexto de la fila seleccionada.
 */
function obtenerUltimaCitaConOperationIdParaPrueba_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getSheetByName('RegistroCitas');

  if (!hoja) {
    throw new Error('No existe la hoja RegistroCitas.');
  }

  const mapa = obtenerMapaEncabezados_(hoja);

  const encabezadosNecesarios = [
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
    'HORA',
    'OperationId'
  ];

  encabezadosNecesarios.forEach(function(encabezado) {
    obtenerColumnaObligatoria_(mapa, encabezado);
  });

  const ultimaFila = hoja.getLastRow();

  if (ultimaFila < 2) {
    throw new Error('RegistroCitas no contiene citas para probar.');
  }

  const totalColumnas = hoja.getLastColumn();

  for (let fila = ultimaFila; fila >= 2; fila--) {
    const rango = hoja.getRange(fila, 1, 1, totalColumnas);
    const valores = rango.getValues()[0];
    const visibles = rango.getDisplayValues()[0];

    const operationId = String(
      visibles[mapa.OperationId - 1] || ''
    ).trim().toLowerCase();

    if (!operationId) {
      continue;
    }

    const timestamp = valores[mapa.Timestamp - 1];

    if (
      Object.prototype.toString.call(timestamp) !== '[object Date]' ||
      isNaN(timestamp.getTime())
    ) {
      continue;
    }

    return {
      hoja: hoja,
      mapa: mapa,
      fila: fila,
      operationId: operationId,
      id: String(visibles[mapa.ID - 1] || ''),
      timestamp: timestamp,
      payload: {
        operationId: operationId,
        cliente: String(visibles[mapa.Cliente - 1] || ''),
        proceso: String(visibles[mapa.Proceso - 1] || ''),
        numero: String(visibles[mapa.Numero - 1] || ''),
        precio: String(visibles[mapa.Precio - 1] || ''),
        extras: String(visibles[mapa.Extras - 1] || ''),
        fecha: String(visibles[mapa.Fecha - 1] || ''),
        sucursalDestino: String(
          visibles[mapa.SucursalDestino - 1] || ''
        ),
        asesor: String(visibles[mapa.Asesor - 1] || ''),
        nota: String(visibles[mapa.Nota - 1] || ''),
        origen: String(visibles[mapa.Origen - 1] || ''),
        sucursalOrigen: String(
          visibles[mapa.SucursalOrigen - 1] || ''
        ),
        hora: String(visibles[mapa.HORA - 1] || ''),
        forzarDuplicado: true
      }
    };
  }

  throw new Error(
    'No se encontró ninguna cita con OperationId y Timestamp válido.'
  );
}


/**
 * Cuenta cuántas filas contienen exactamente un OperationId.
 *
 * @param {Sheet} hoja
 * @param {Object} mapa
 * @param {string} operationId
 * @return {number}
 */
function contarFilasPorOperationIdPrueba_(hoja, mapa, operationId) {
  const ultimaFila = hoja.getLastRow();

  if (ultimaFila < 2) {
    return 0;
  }

  const columna = obtenerColumnaObligatoria_(
    mapa,
    'OperationId'
  );

  const valores = hoja
    .getRange(2, columna, ultimaFila - 1, 1)
    .getDisplayValues();

  return valores.filter(function(fila) {
    return String(fila[0] || '').trim().toLowerCase() === operationId;
  }).length;
}


/**
 * Enmascara un OperationId para evitar mostrarlo completo en Logger.
 *
 * @param {string} operationId
 * @return {string}
 */
function enmascararOperationIdPrueba_(operationId) {
  const valor = String(operationId || '');

  if (valor.length <= 12) {
    return '********';
  }

  return (
    valor.slice(0, 8) +
    '-****-****-****-' +
    valor.slice(-4)
  );
}


/**
 * ==========================================================
 * PRUEBA 1
 * MISMO OperationId + MISMO PAYLOAD
 * ==========================================================
 *
 * Resultado esperado:
 *
 * FILAS ANTES == FILAS DESPUÉS
 * RESPUESTA EXITO = true
 * REUTILIZADA = true
 * MISMO ID = true
 * MISMO TIMESTAMP = true
 * FILA DUPLICADA = false
 */
function probarRetryIdempotenteCita() {
  const contexto = obtenerUltimaCitaConOperationIdParaPrueba_();

  const hoja = contexto.hoja;
  const mapa = contexto.mapa;
  const operationId = contexto.operationId;

  const filasAntes = hoja.getLastRow();
  const coincidenciasAntes = contarFilasPorOperationIdPrueba_(
    hoja,
    mapa,
    operationId
  );

  const idOriginal = contexto.id;
  const timestampOriginal = contexto.timestamp;

  const respuesta = guardarCita(contexto.payload);

  const filasDespues = hoja.getLastRow();

  // Volvemos a buscar por OperationId usando el helper operativo.
  const filaDespues = buscarFilaPorOperationId_(
    hoja,
    obtenerMapaEncabezados_(hoja),
    operationId
  );

  if (filaDespues === null) {
    throw new Error(
      'La fila original dejó de encontrarse después de la prueba.'
    );
  }

  const mapaDespues = obtenerMapaEncabezados_(hoja);
  const citaDespues = obtenerCitaPersistidaPorFila_(
    hoja,
    mapaDespues,
    filaDespues
  );

  const coincidenciasDespues = contarFilasPorOperationIdPrueba_(
    hoja,
    mapaDespues,
    operationId
  );

  const mismoId =
    String(citaDespues.id || '') === String(idOriginal || '');

  const mismoTimestamp =
    Object.prototype.toString.call(citaDespues.timestamp) ===
      '[object Date]' &&
    !isNaN(citaDespues.timestamp.getTime()) &&
    citaDespues.timestamp.getTime() === timestampOriginal.getTime();

  const filaDuplicada =
    filasDespues !== filasAntes ||
    coincidenciasDespues !== coincidenciasAntes ||
    coincidenciasDespues !== 1;

  Logger.log('PRUEBA RETRY IDEMPOTENTE');
  Logger.log(
    'OPERATION ID: ' +
    enmascararOperationIdPrueba_(operationId)
  );
  Logger.log('FILAS ANTES: ' + filasAntes);
  Logger.log('FILAS DESPUÉS: ' + filasDespues);
  Logger.log(
    'RESPUESTA EXITO: ' +
    Boolean(respuesta && respuesta.exito === true)
  );
  Logger.log(
    'REUTILIZADA: ' +
    Boolean(respuesta && respuesta.reutilizada === true)
  );
  Logger.log('MISMO ID: ' + mismoId);
  Logger.log('MISMO TIMESTAMP: ' + mismoTimestamp);
  Logger.log('FILA DUPLICADA: ' + filaDuplicada);

  return {
    exito: Boolean(respuesta && respuesta.exito === true),
    reutilizada: Boolean(
      respuesta && respuesta.reutilizada === true
    ),
    filasAntes: filasAntes,
    filasDespues: filasDespues,
    mismoId: mismoId,
    mismoTimestamp: mismoTimestamp,
    filaDuplicada: filaDuplicada
  };
}


/**
 * ==========================================================
 * PRUEBA 2
 * MISMO OperationId + PAYLOAD DIFERENTE
 * ==========================================================
 *
 * Cambia únicamente Extras en memoria.
 * La fila original NO se modifica.
 *
 * Resultado esperado:
 *
 * exito = false
 * OperationId ya existe con un payload diferente
 * FILAS ANTES == FILAS DESPUÉS
 * MISMO ID = true
 * MISMO TIMESTAMP = true
 */
function probarOperationIdPayloadDiferente() {
  const contexto = obtenerUltimaCitaConOperationIdParaPrueba_();

  const hoja = contexto.hoja;
  const mapa = contexto.mapa;
  const operationId = contexto.operationId;

  const filasAntes = hoja.getLastRow();

  const idOriginal = contexto.id;
  const timestampOriginal = contexto.timestamp;

  // Copia independiente. No modifica la fila ni el objeto original.
  const payloadAlterado = Object.assign(
    {},
    contexto.payload
  );

  payloadAlterado.extras =
    String(payloadAlterado.extras || '') +
    ' [PRUEBA PAYLOAD DIFERENTE]';

  const respuesta = guardarCita(payloadAlterado);

  const filasDespues = hoja.getLastRow();
  const mapaDespues = obtenerMapaEncabezados_(hoja);

  const filaDespues = buscarFilaPorOperationId_(
    hoja,
    mapaDespues,
    operationId
  );

  if (filaDespues === null) {
    throw new Error(
      'La fila original dejó de encontrarse después de la prueba.'
    );
  }

  const citaDespues = obtenerCitaPersistidaPorFila_(
    hoja,
    mapaDespues,
    filaDespues
  );

  const mismoId =
    String(citaDespues.id || '') === String(idOriginal || '');

  const mismoTimestamp =
    Object.prototype.toString.call(citaDespues.timestamp) ===
      '[object Date]' &&
    !isNaN(citaDespues.timestamp.getTime()) &&
    citaDespues.timestamp.getTime() === timestampOriginal.getTime();

  const sinNuevaFila = filasAntes === filasDespues;

  const mensajeEsperado =
    respuesta &&
    respuesta.exito === false &&
    respuesta.mensaje ===
      'OperationId ya existe con un payload diferente';

  Logger.log('PRUEBA OPERATION ID - PAYLOAD DIFERENTE');
  Logger.log(
    'OPERATION ID: ' +
    enmascararOperationIdPrueba_(operationId)
  );
  Logger.log('FILAS ANTES: ' + filasAntes);
  Logger.log('FILAS DESPUÉS: ' + filasDespues);
  Logger.log(
    'RESPUESTA EXITO: ' +
    Boolean(respuesta && respuesta.exito === true)
  );
  Logger.log(
    'RECHAZO ESPERADO: ' + Boolean(mensajeEsperado)
  );
  Logger.log('SIN NUEVA FILA: ' + sinNuevaFila);
  Logger.log('MISMO ID: ' + mismoId);
  Logger.log('MISMO TIMESTAMP: ' + mismoTimestamp);

  return {
    rechazoEsperado: Boolean(mensajeEsperado),
    filasAntes: filasAntes,
    filasDespues: filasDespues,
    sinNuevaFila: sinNuevaFila,
    mismoId: mismoId,
    mismoTimestamp: mismoTimestamp
  };
}