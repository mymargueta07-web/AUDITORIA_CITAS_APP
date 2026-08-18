/**
 * Preparación aislada de escritura de citas en Supabase.
 *
 * guardarCita() invoca esta capa indirectamente mediante la sincronización
 * controlada. La única escritura posible requiere confirmación interna
 * server-side y el RPC transaccional definido en
 * supabase/migrations/20260818111209_insertar_cita_con_destinos.sql.
 */

const ESCRITURA_CITA_SUPABASE_SOURCE_SYSTEM_ =
  'GOOGLE_SHEETS_REGISTROCITAS';
const ESCRITURA_CITA_SUPABASE_CONFIRMACION_ =
  'CONFIRMAR_INSERTAR_CITA_SUPABASE';
const ESCRITURA_CITA_SUPABASE_RPC_ =
  'insertar_cita_con_destinos';

function crearContextoEscrituraCitaSupabase_(
  operationId,
  legacyId,
  fechaRegistro,
  filaSheets
) {
  const idOperacion = normalizarOperationIdCita_(operationId);
  const idLegacy = String(legacyId || '').trim();
  const numeroFila = Number(filaSheets);

  if (!idLegacy) {
    throw new Error('legacyId persistido es obligatorio.');
  }

  if (
    Object.prototype.toString.call(fechaRegistro) !== '[object Date]' ||
    isNaN(fechaRegistro.getTime())
  ) {
    throw new Error('fechaRegistro persistida debe ser un Date válido.');
  }

  if (!Number.isInteger(numeroFila) || numeroFila < 2) {
    throw new Error('filaSheets debe ser un entero mayor o igual a 2.');
  }

  return {
    sourceRecordKey:
      'REGISTROCITAS:DUAL_WRITE:' + idOperacion,
    fechaRegistro: fechaRegistro,
    legacyId: idLegacy,
    operationId: idOperacion,
    filaSheets: numeroFila
  };
}

function claveCatalogoEscrituraCitaSupabase_(valor) {
  return String(valor === null || valor === undefined ? '' : valor)
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function agregarCatalogoEscrituraCitaSupabase_(mapa, clave, fila) {
  if (!clave) {
    return;
  }

  if (!mapa[clave]) {
    mapa[clave] = [];
  }

  mapa[clave].push(fila);
}

function cargarCatalogosEscrituraCitaSupabase_() {
  const sucursales = supabaseRequest_(
    'sucursales?select=id,nombre,activo,permite_destino&order=nombre.asc,id.asc',
    { method: 'GET' }
  ) || [];
  const aliases = supabaseRequest_(
    'sucursal_aliases?select=alias,sucursal_id&order=alias.asc',
    { method: 'GET' }
  ) || [];
  const procesos = supabaseRequest_(
    'procesos?select=id,nombre,activo&order=nombre.asc,id.asc',
    { method: 'GET' }
  ) || [];
  const origenes = supabaseRequest_(
    'origenes?select=id,nombre,activo&order=nombre.asc,id.asc',
    { method: 'GET' }
  ) || [];
  const asesores = supabaseRequest_(
    'asesores?select=id,nombre,activo&order=nombre.asc,id.asc',
    { method: 'GET' }
  ) || [];
  const relacionesAsesor = supabaseRequest_(
    'asesor_sucursales?select=asesor_id,sucursal_id&order=asesor_id.asc,sucursal_id.asc',
    { method: 'GET' }
  ) || [];
  const estados = supabaseRequest_(
    'estados?select=codigo,activo&order=codigo.asc',
    { method: 'GET' }
  ) || [];
  const resultado = {
    sucursalesPorNombre: {},
    sucursalesPorId: {},
    aliasesSucursal: {},
    procesosPorNombre: {},
    origenesPorNombre: {},
    asesoresPorNombre: {},
    sucursalesPorAsesor: {},
    estadosPorCodigo: {}
  };

  sucursales.forEach(function(fila) {
    const clave = claveCatalogoEscrituraCitaSupabase_(fila.nombre);
    agregarCatalogoEscrituraCitaSupabase_(
      resultado.sucursalesPorNombre,
      clave,
      fila
    );
    resultado.sucursalesPorId[fila.id] = fila;
  });

  aliases.forEach(function(fila) {
    resultado.aliasesSucursal[
      claveCatalogoEscrituraCitaSupabase_(fila.alias)
    ] = fila.sucursal_id;
  });

  procesos.forEach(function(fila) {
    agregarCatalogoEscrituraCitaSupabase_(
      resultado.procesosPorNombre,
      claveCatalogoEscrituraCitaSupabase_(fila.nombre),
      fila
    );
  });

  origenes.forEach(function(fila) {
    agregarCatalogoEscrituraCitaSupabase_(
      resultado.origenesPorNombre,
      claveCatalogoEscrituraCitaSupabase_(fila.nombre),
      fila
    );
  });

  asesores.forEach(function(fila) {
    agregarCatalogoEscrituraCitaSupabase_(
      resultado.asesoresPorNombre,
      claveCatalogoEscrituraCitaSupabase_(fila.nombre),
      fila
    );
  });

  relacionesAsesor.forEach(function(fila) {
    if (!resultado.sucursalesPorAsesor[fila.asesor_id]) {
      resultado.sucursalesPorAsesor[fila.asesor_id] = {};
    }
    resultado.sucursalesPorAsesor[fila.asesor_id][fila.sucursal_id] = true;
  });

  estados.forEach(function(fila) {
    resultado.estadosPorCodigo[
      claveCatalogoEscrituraCitaSupabase_(fila.codigo)
    ] = fila;
  });

  return resultado;
}

function resolverUnicoCatalogoEscrituraCitaSupabase_(mapa, texto) {
  const candidatos =
    mapa[claveCatalogoEscrituraCitaSupabase_(texto)] || [];
  const activos = candidatos.filter(function(fila) {
    return fila.activo === true;
  });

  if (candidatos.length === 0) {
    return { estado: 'NO_ENCONTRADO', fila: null };
  }

  if (activos.length === 0) {
    return { estado: 'INACTIVO', fila: null };
  }

  if (activos.length > 1) {
    return { estado: 'AMBIGUO', fila: null };
  }

  return { estado: 'RESUELTO', fila: activos[0] };
}

function resolverSucursalEscrituraCitaSupabase_(catalogos, texto) {
  const clave = claveCatalogoEscrituraCitaSupabase_(texto);
  const directa = catalogos.sucursalesPorNombre[clave] || [];

  if (directa.length > 0) {
    return resolverUnicoCatalogoEscrituraCitaSupabase_(
      catalogos.sucursalesPorNombre,
      texto
    );
  }

  const idAlias = catalogos.aliasesSucursal[clave];
  const filaAlias = idAlias ? catalogos.sucursalesPorId[idAlias] : null;

  if (!filaAlias) {
    return { estado: 'NO_ENCONTRADO', fila: null };
  }

  if (filaAlias.activo !== true) {
    return { estado: 'INACTIVO', fila: null };
  }

  return { estado: 'RESUELTO', fila: filaAlias };
}

function resolverAsesorEscrituraCitaSupabase_(
  catalogos,
  texto,
  sucursalOrigenId
) {
  const candidatos = catalogos.asesoresPorNombre[
    claveCatalogoEscrituraCitaSupabase_(texto)
  ] || [];
  const activos = candidatos.filter(function(asesor) {
    return asesor.activo === true;
  });

  if (candidatos.length === 0) {
    return { estado: 'NO_ENCONTRADO', fila: null };
  }

  if (activos.length === 0) {
    return { estado: 'INACTIVO', fila: null };
  }

  if (!sucursalOrigenId) {
    return activos.length === 1
      ? { estado: 'RESUELTO', fila: activos[0] }
      : { estado: 'AMBIGUO', fila: null };
  }

  const relacionados = activos.filter(function(asesor) {
    return Boolean(
      catalogos.sucursalesPorAsesor[asesor.id] &&
      catalogos.sucursalesPorAsesor[asesor.id][sucursalOrigenId]
    );
  });

  if (relacionados.length === 0) {
    return { estado: 'SIN_RELACION_SUCURSAL', fila: null };
  }

  return relacionados.length === 1
    ? { estado: 'RESUELTO', fila: relacionados[0] }
    : { estado: 'AMBIGUO', fila: null };
}

function registrarResolucionFkEscrituraCitaSupabase_(
  resolucion,
  campo,
  errores,
  advertencias
) {
  if (resolucion.estado === 'RESUELTO') {
    return;
  }

  if (resolucion.estado === 'NO_ENCONTRADO') {
    errores.push(
      campo + ' no existe en el catálogo activo.'
    );
    return;
  }

  if (resolucion.estado === 'INACTIVO') {
    errores.push(
      campo + ' no puede usar un registro inactivo del catálogo.'
    );
    return;
  }

  if (resolucion.estado === 'SIN_RELACION_SUCURSAL') {
    errores.push(
      campo + ' no está relacionado con la sucursal origen seleccionada.'
    );
    return;
  }

  errores.push(
    campo + ' no se pudo resolver de forma única en el catálogo.'
  );
}

function validarTextoRequeridoEscrituraCitaSupabase_(
  datos,
  propiedad,
  errores
) {
  const valor = String(
    datos[propiedad] === null || datos[propiedad] === undefined
      ? ''
      : datos[propiedad]
  );

  if (!valor.trim()) {
    errores.push('Falta el campo obligatorio: ' + propiedad + '.');
  }

  return valor;
}

function prepararEscrituraCitaSupabase_(datos, contexto) {
  const entrada = datos || {};
  const ctx = contexto || {};
  const errores = [];
  const advertencias = [];
  const zonaHoraria = Session.getScriptTimeZone();
  const cliente = validarTextoRequeridoEscrituraCitaSupabase_(
    entrada,
    'cliente',
    errores
  );
  const proceso = validarTextoRequeridoEscrituraCitaSupabase_(
    entrada,
    'proceso',
    errores
  );
  const numeroOriginal = validarTextoRequeridoEscrituraCitaSupabase_(
    entrada,
    'numero',
    errores
  );
  const precioTexto = validarTextoRequeridoEscrituraCitaSupabase_(
    entrada,
    'precio',
    errores
  );
  const fechaTexto = validarTextoRequeridoEscrituraCitaSupabase_(
    entrada,
    'fecha',
    errores
  );
  const destinosTexto = validarTextoRequeridoEscrituraCitaSupabase_(
    entrada,
    'sucursalDestino',
    errores
  );
  const asesor = validarTextoRequeridoEscrituraCitaSupabase_(
    entrada,
    'asesor',
    errores
  );
  const origen = validarTextoRequeridoEscrituraCitaSupabase_(
    entrada,
    'origen',
    errores
  );
  const estadoTexto = validarTextoRequeridoEscrituraCitaSupabase_(
    entrada,
    'estado',
    errores
  );
  const sucursalOrigen = validarTextoRequeridoEscrituraCitaSupabase_(
    entrada,
    'sucursalOrigen',
    errores
  );
  const sourceRecordKey = String(ctx.sourceRecordKey || '').trim();
  const fechaRegistro = ctx.fechaRegistro;

  if (!sourceRecordKey) {
    errores.push('Falta sourceRecordKey para la escritura idempotente.');
  }

  if (
    Object.prototype.toString.call(fechaRegistro) !== '[object Date]' ||
    isNaN(fechaRegistro.getTime())
  ) {
    errores.push('fechaRegistro debe ser un Date válido y compartido por ambas fuentes.');
  }

  if (cliente !== cliente.trim()) {
    errores.push('cliente debe llegar sin espacios exteriores, igual que desde la UI.');
  }

  const citaAbierta =
    fechaTexto.trim().replace(/\s+/g, ' ').toUpperCase() ===
    'CITA ABIERTA';
  let fechaCita = null;
  let horaCita = null;
  const horaTextoOriginal = String(
    entrada.hora === null || entrada.hora === undefined
      ? ''
      : entrada.hora
  );

  if (citaAbierta) {
    if (horaTextoOriginal.trim()) {
      errores.push('Una cita abierta no puede tener hora.');
    }
  } else {
    const fechaInterpretada = interpretarFechaHojaSupabase_(
      null,
      fechaTexto,
      zonaHoraria,
      false
    );

    if (fechaInterpretada.error || !fechaInterpretada.valor) {
      errores.push('La fecha de cita no tiene formato DD/MM/YYYY válido.');
    } else {
      fechaCita = fechaInterpretada.valor;
    }

    if (horaTextoOriginal.trim()) {
      const horaInterpretada = interpretarHoraHojaSupabase_(
        null,
        horaTextoOriginal,
        zonaHoraria
      );

      if (horaInterpretada.error || !horaInterpretada.valor) {
        errores.push('La hora de cita no tiene un formato admitido.');
      } else {
        horaCita = horaInterpretada.valor;
      }
    }
  }

  const precio = interpretarPrecioSupabase_(precioTexto);
  if (!precio.valido) {
    advertencias.push(
      precio.multiple
        ? 'precio_monto queda null porque el texto contiene múltiples montos.'
        : 'precio_monto queda null porque el texto no contiene un monto único válido.'
    );
  }

  const fechaVentaTexto = String(
    entrada.fechaVenta === null || entrada.fechaVenta === undefined
      ? ''
      : entrada.fechaVenta
  );
  let fechaVenta = null;

  if (fechaVentaTexto.trim()) {
    const fechaVentaInterpretada = interpretarFechaHojaSupabase_(
      null,
      fechaVentaTexto,
      zonaHoraria,
      false
    );

    if (fechaVentaInterpretada.error || !fechaVentaInterpretada.valor) {
      errores.push('FECHA DE VENTA persistida no tiene un formato válido.');
    } else {
      fechaVenta = fechaVentaInterpretada.valor;
    }
  }

  const catalogos = ctx.catalogos || cargarCatalogosEscrituraCitaSupabase_();
  const resolucionSucursalOrigen =
    resolverSucursalEscrituraCitaSupabase_(catalogos, sucursalOrigen);
  const resolucionProceso = resolverUnicoCatalogoEscrituraCitaSupabase_(
    catalogos.procesosPorNombre,
    proceso
  );
  const resolucionOrigen = resolverUnicoCatalogoEscrituraCitaSupabase_(
    catalogos.origenesPorNombre,
    origen
  );
  const resolucionAsesor = resolverAsesorEscrituraCitaSupabase_(
    catalogos,
    asesor,
    resolucionSucursalOrigen.fila
      ? resolucionSucursalOrigen.fila.id
      : null
  );
  const estado = catalogos.estadosPorCodigo[
    claveCatalogoEscrituraCitaSupabase_(estadoTexto)
  ];

  registrarResolucionFkEscrituraCitaSupabase_(
    resolucionSucursalOrigen,
    'sucursal_origen_id',
    errores,
    advertencias
  );
  registrarResolucionFkEscrituraCitaSupabase_(
    resolucionProceso,
    'proceso_id',
    errores,
    advertencias
  );
  registrarResolucionFkEscrituraCitaSupabase_(
    resolucionOrigen,
    'origen_id',
    errores,
    advertencias
  );
  registrarResolucionFkEscrituraCitaSupabase_(
    resolucionAsesor,
    'asesor_id',
    errores,
    advertencias
  );
  if (!estado) {
    errores.push('estado_codigo no existe en el catálogo activo.');
  } else if (estado.activo !== true) {
    errores.push('estado_codigo no puede usar un registro inactivo.');
  }

  const nombresDestinos = extraerDestinosCandidatosSupabase_(destinosTexto);
  const destinos = [];

  if (nombresDestinos.length === 0) {
    errores.push('Debe existir al menos una sucursal destino.');
  }

  nombresDestinos.forEach(function(nombre, indice) {
    const resolucionSucursal = resolverSucursalEscrituraCitaSupabase_(
      catalogos,
      nombre
    );
    const sucursal = resolucionSucursal.fila;

    if (!sucursal) {
      errores.push(
        'Sucursal destino no habilitada o no resuelta en la posición ' +
        (indice + 1) + '.'
      );
      return;
    }

    if (sucursal.activo !== true || sucursal.permite_destino !== true) {
      errores.push(
        'La sucursal de la posición ' + (indice + 1) +
        ' no está habilitada como destino.'
      );
      return;
    }

    destinos.push({
      sucursal_id: sucursal.id,
      orden: indice + 1
    });
  });

  const numeroNormalizado = normalizarTelefonoDiagnosticoSupabase_(
    numeroOriginal
  );

  if (!numeroNormalizado) {
    advertencias.push(
      'numero_normalizado será null; numero_original se conserva sin sustituciones.'
    );
  }

  const payloadCita = {
    source_system: ESCRITURA_CITA_SUPABASE_SOURCE_SYSTEM_,
    source_record_key: sourceRecordKey,
    legacy_id:
      ctx.legacyId === null || ctx.legacyId === undefined ||
      String(ctx.legacyId).trim() === ''
        ? null
        : String(ctx.legacyId),
    fecha_registro:
      fechaRegistro instanceof Date && !isNaN(fechaRegistro.getTime())
        ? formatearFechaHoraIsoSupabase_(fechaRegistro, zonaHoraria)
        : null,
    cliente: cliente,
    numero_original: numeroOriginal,
    numero_normalizado: numeroNormalizado || null,
    proceso_id: resolucionProceso.fila ? resolucionProceso.fila.id : null,
    proceso_texto: proceso,
    precio_texto: precioTexto,
    precio_monto: precio.valido ? precio.monto : null,
    extras: String(entrada.extras || '') || null,
    fecha_cita: fechaCita,
    cita_abierta: citaAbierta,
    hora_cita: horaCita,
    hora_texto_original: horaTextoOriginal || null,
    asesor_id: resolucionAsesor.fila ? resolucionAsesor.fila.id : null,
    asesor_texto: asesor,
    nota: String(entrada.nota || '') || null,
    origen_id: resolucionOrigen.fila ? resolucionOrigen.fila.id : null,
    origen_texto: origen,
    sucursal_origen_id:
      resolucionSucursalOrigen.fila
        ? resolucionSucursalOrigen.fila.id
        : null,
    sucursal_origen_texto: sucursalOrigen,
    sucursal_destino_texto_legacy: destinosTexto,
    estado_codigo:
      estado && estado.activo === true
        ? estado.codigo
        : estadoTexto.trim().toUpperCase(),
    fecha_venta: fechaVenta
  };

  return {
    valido: errores.length === 0,
    errores: errores,
    advertencias: advertencias,
    cita: payloadCita,
    destinos: destinos,
    diagnostico: {
      numero_normalizado_esperado: numeroNormalizado,
      proceso_resuelto: Boolean(resolucionProceso.fila),
      origen_resuelto: Boolean(resolucionOrigen.fila),
      asesor_resuelto: Boolean(resolucionAsesor.fila),
      sucursal_origen_resuelta: Boolean(resolucionSucursalOrigen.fila),
      destinos_solicitados: nombresDestinos.length,
      destinos_resueltos: destinos.length
    }
  };
}

function supabaseRpcEscrituraCita_(payload) {
  const configuracion = obtenerConfiguracionSupabase_();
  const respuesta = UrlFetchApp.fetch(
    configuracion.url + '/rest/v1/rpc/' + ESCRITURA_CITA_SUPABASE_RPC_,
    {
      method: 'post',
      headers: {
        apikey: configuracion.serviceRoleKey,
        Authorization: 'Bearer ' + configuracion.serviceRoleKey,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    }
  );
  const codigoHttp = respuesta.getResponseCode();
  const contenido = respuesta.getContentText();

  if (codigoHttp < 200 || codigoHttp >= 300) {
    let mensaje = contenido;

    try {
      const errorSupabase = JSON.parse(contenido);
      mensaje = errorSupabase.message || errorSupabase.hint || contenido;
    } catch (error) {
      // Conserva el texto cuando Supabase no devuelve JSON.
    }

    throw new Error(
      'Error Supabase HTTP ' + codigoHttp +
      ' en recurso rpc/' + ESCRITURA_CITA_SUPABASE_RPC_ + ': ' + mensaje
    );
  }

  return contenido ? JSON.parse(contenido) : null;
}

function verificarEscrituraCitaSupabase_(resultadoRpc, destinosEsperados) {
  const resultado = Array.isArray(resultadoRpc)
    ? resultadoRpc[0]
    : resultadoRpc;

  if (
    !resultado || !resultado.id || !resultado.codigo ||
    !resultado.source_record_key
  ) {
    throw new Error('El RPC no devolvió los identificadores esperados.');
  }

  if (Number(resultado.destinos_insertados) !== destinosEsperados) {
    throw new Error(
      'El RPC confirmó ' + resultado.destinos_insertados +
      ' destinos; se esperaban ' + destinosEsperados + '.'
    );
  }

  return {
    id: resultado.id,
    codigo: resultado.codigo,
    sourceRecordKey: resultado.source_record_key,
    destinosInsertados: Number(resultado.destinos_insertados),
    reutilizada: resultado.reutilizada === true
  };
}

function insertarCitaSupabase_(datos, contexto) {
  const ctx = contexto || {};

  if (ctx.confirmacion !== ESCRITURA_CITA_SUPABASE_CONFIRMACION_) {
    throw new Error(
      'Escritura Supabase bloqueada: falta confirmación explícita.'
    );
  }

  if (
    !Number.isInteger(ctx.filaSheets) || ctx.filaSheets < 2 ||
    !String(ctx.legacyId || '').trim() ||
    Object.prototype.toString.call(ctx.fechaRegistro) !== '[object Date]' ||
    isNaN(ctx.fechaRegistro.getTime())
  ) {
    throw new Error(
      'Escritura Supabase bloqueada: el contexto no proviene de una fila persistida válida.'
    );
  }

  const preparacion = prepararEscrituraCitaSupabase_(datos, ctx);

  if (!preparacion.valido) {
    throw new Error(
      'Preflight Supabase rechazado: ' + preparacion.errores.join(' ')
    );
  }

  const respuesta = supabaseRpcEscrituraCita_({
    p_cita: preparacion.cita,
    p_destinos: preparacion.destinos.map(function(destino) {
      return destino.sucursal_id;
    })
  });

  return verificarEscrituraCitaSupabase_(
    respuesta,
    preparacion.destinos.length
  );
}

/**
 * Prueba manual segura. Realiza GET de catálogos y construye un payload
 * sintético; nunca invoca el RPC de escritura.
 */
function probarEscrituraCitaSupabase() {
  const datosPrueba = {
    cliente: 'PRUEBA DUAL WRITE - NO INSERTAR',
    proceso: 'PROCESO DE PRUEBA SIN CATALOGO',
    numero: '50370000001',
    precio: 'pendiente',
    extras: '',
    fecha: '31/12/2099',
    hora: '08:30 AM',
    sucursalDestino: 'EN LINEA',
    asesor: 'ASESOR DE PRUEBA SIN CATALOGO',
    nota: '',
    origen: 'ORIGEN DE PRUEBA SIN CATALOGO',
    sucursalOrigen: 'BANK',
    estado: 'EN ESPERA DE CITA',
    fechaVenta: ''
  };
  const preparacion = prepararEscrituraCitaSupabase_(datosPrueba, {
    sourceRecordKey: 'REGISTROCITAS:DUAL_WRITE:DRY-RUN',
    fechaRegistro: new Date(),
    legacyId: null
  });

  Logger.log('PRUEBA ESCRITURA CITA SUPABASE');
  Logger.log('MODO: DRY-RUN (NO INSERTA)');
  Logger.log('PAYLOAD VALIDO: ' + preparacion.valido);
  Logger.log('ERRORES: ' + preparacion.errores.length);
  Logger.log('ADVERTENCIAS: ' + preparacion.advertencias.length);
  Logger.log(
    'CATALOGOS RESUELTOS: ' +
    JSON.stringify(preparacion.diagnostico)
  );

  return preparacion;
}
