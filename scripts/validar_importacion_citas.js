'use strict';

/**
 * Simula la importación histórica de RegistroCitas sin conectarse a Supabase.
 * Uso: node scripts/validar_importacion_citas.js ruta/al/archivo.json
 */

const fs = require('fs');
const path = require('path');
const {
  ASESORES_EQUIVALENCIAS,
  PROCESOS_EQUIVALENCIAS,
  ORIGENES_EQUIVALENCIAS
} = require('./equivalencias_importacion_citas');

const RAIZ_PROYECTO = path.resolve(__dirname, '..');
const RUTA_REPORTE = path.join(
  RAIZ_PROYECTO,
  'reportes',
  'validacion_importacion_citas.json'
);
const MIGRACIONES_CATALOGOS = [
  '20260728190000_esquema_inicial_citas.sql',
  '20260728200000_catalogos_iniciales.sql',
  '20260730123000_catalogos_adicionales_importacion_citas.sql',
  '20260811134315_ajusta_identificadores_y_telefono_citas.sql',
  '20260812090937_bank_sucursal_canonica_y_destinos.sql'
];
const SOURCE_SYSTEM = 'GOOGLE_SHEETS_REGISTROCITAS';

function texto(valor) {
  return String(valor === null || valor === undefined ? '' : valor).trim();
}

function clave(valor) {
  return texto(valor).toLocaleUpperCase('es');
}

function agregarConteo(mapa, valor) {
  const nombre = texto(valor) || '(vacío)';
  mapa[nombre] = (mapa[nombre] || 0) + 1;
}

function crearEstadisticaResolucion() {
  return { directos: 0, por_equivalencia: 0, no_resueltos: 0 };
}

function registrarResolucion(estadistica, resolucion) {
  if (resolucion.clasificacion === 'DIRECTA') {
    estadistica.directos++;
  } else if (resolucion.clasificacion === 'EQUIVALENCIA') {
    estadistica.por_equivalencia++;
  } else {
    estadistica.no_resueltos++;
  }
}

function extraerBloquesInsert(sql, tabla) {
  const patron = new RegExp(
    'insert\\s+into\\s+public\\.' + tabla +
    '\\s*\\([\\s\\S]*?\\)\\s*values\\s*([\\s\\S]*?)(?:\\bon\\s+conflict\\b|;)',
    'gi'
  );
  const bloques = [];
  let coincidencia;

  while ((coincidencia = patron.exec(sql))) {
    bloques.push(coincidencia[1]);
  }

  return bloques;
}

function extraerPrimerTextoDeTuplas(bloques) {
  const valores = [];

  bloques.forEach(function(bloque) {
    const patron = /\(\s*'((?:''|[^'])*)'/g;
    let coincidencia;

    while ((coincidencia = patron.exec(bloque))) {
      valores.push(coincidencia[1].replace(/''/g, "'"));
    }
  });

  return valores;
}

function extraerEstados(sql) {
  const valores = [];

  extraerBloquesInsert(sql, 'estados').forEach(function(bloque) {
    const patron = /\(\s*'((?:''|[^'])*)'\s*,\s*'/g;
    let coincidencia;

    while ((coincidencia = patron.exec(bloque))) {
      valores.push(coincidencia[1].replace(/''/g, "'"));
    }
  });

  return valores;
}

function extraerAsesoresTemporales(sql) {
  const patronBloque = /insert\s+into\s+tmp_catalogo_asesores[\s\S]*?values\s*([\s\S]*?);/i;
  const bloque = sql.match(patronBloque);

  if (!bloque) {
    return [];
  }

  const valores = [];
  const patronFila = /\(\s*\d+\s*,\s*'((?:''|[^'])*)'\s*,/g;
  let coincidencia;

  while ((coincidencia = patronFila.exec(bloque[1]))) {
    valores.push(coincidencia[1].replace(/''/g, "'"));
  }

  return valores;
}

function crearCatalogo(valores) {
  const catalogo = new Map();

  valores.forEach(function(valor) {
    const limpio = texto(valor);
    if (limpio) {
      catalogo.set(clave(limpio), limpio);
    }
  });

  return catalogo;
}

function cargarCatalogosLocales() {
  const acumulado = {
    sucursales: [],
    asesores: [],
    procesos: [],
    origenes: [],
    estados: []
  };

  MIGRACIONES_CATALOGOS.forEach(function(nombre) {
    const ruta = path.join(RAIZ_PROYECTO, 'supabase', 'migrations', nombre);
    const sql = fs.readFileSync(ruta, 'utf8');

    acumulado.sucursales.push.apply(
      acumulado.sucursales,
      extraerPrimerTextoDeTuplas(extraerBloquesInsert(sql, 'sucursales'))
    );
    acumulado.procesos.push.apply(
      acumulado.procesos,
      extraerPrimerTextoDeTuplas(extraerBloquesInsert(sql, 'procesos'))
    );
    acumulado.origenes.push.apply(
      acumulado.origenes,
      extraerPrimerTextoDeTuplas(extraerBloquesInsert(sql, 'origenes'))
    );
    acumulado.estados.push.apply(acumulado.estados, extraerEstados(sql));
    acumulado.asesores.push.apply(
      acumulado.asesores,
      extraerAsesoresTemporales(sql)
    );
  });

  return {
    sucursales: crearCatalogo(acumulado.sucursales),
    asesores: crearCatalogo(acumulado.asesores),
    procesos: crearCatalogo(acumulado.procesos),
    origenes: crearCatalogo(acumulado.origenes),
    estados: crearCatalogo(acumulado.estados),
    sucursalAliases: Object.freeze({})
  };
}

function buscarEquivalencia(equivalencias, valor) {
  const claveBuscada = clave(valor);
  const encontrada = Object.keys(equivalencias).find(function(origen) {
    return clave(origen) === claveBuscada;
  });

  return encontrada ? equivalencias[encontrada] : null;
}

function resolverCatalogo(valor, catalogo, equivalencias) {
  const original = texto(valor);
  const equivalente = buscarEquivalencia(equivalencias || {}, original);
  const candidato = equivalente || original;
  const resuelto = catalogo.get(clave(candidato));

  if (!resuelto) {
    return {
      clasificacion: 'NO_RESUELTA',
      nombre: null,
      candidato: candidato
    };
  }

  return {
    clasificacion: equivalente ? 'EQUIVALENCIA' : 'DIRECTA',
    nombre: resuelto,
    candidato: candidato
  };
}

function resolverSucursalOrigen(registro, catalogos) {
  const original = texto(registro.sucursal_origen_texto);
  const canonica = texto(registro.sucursal_origen_canonica);
  const equivalente = clave(original) === 'BANK'
    ? 'BANK'
    : canonica || catalogos.sucursalAliases[clave(original)] || original;
  const resuelto = catalogos.sucursales.get(clave(equivalente));

  return {
    clasificacion: !resuelto
      ? 'NO_RESUELTA'
      : clave(equivalente) === clave(original)
        ? 'DIRECTA'
        : 'EQUIVALENCIA',
    nombre: resuelto || null,
    candidato: equivalente
  };
}

function validarFecha(valor, esTimestamp) {
  const textoFecha = texto(valor);
  const patron = esTimestamp
    ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/
    : /^\d{4}-(\d{2})-(\d{2})$/;

  if (!textoFecha || !patron.test(textoFecha)) {
    return false;
  }

  if (esTimestamp) {
    return !Number.isNaN(Date.parse(textoFecha));
  }

  const coincidencia = textoFecha.match(patron);
  const anio = Number(textoFecha.slice(0, 4));
  const mes = Number(coincidencia[1]);
  const dia = Number(coincidencia[2]);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));

  return (
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia
  );
}

function validarHora(valor) {
  if (valor === null || valor === undefined || valor === '') {
    return true;
  }

  const coincidencia = texto(valor).match(/^(\d{2}):(\d{2}):(\d{2})$/);

  return Boolean(
    coincidencia &&
    Number(coincidencia[1]) <= 23 &&
    Number(coincidencia[2]) <= 59 &&
    Number(coincidencia[3]) <= 59
  );
}

function telefonoNormalizable(numero) {
  const digitos = String(numero || '').replace(/\D/g, '');
  return Boolean(digitos) && !/^0+$/.test(digitos);
}

function agregarProblema(resultado, nivel, mensaje) {
  const lista = nivel === 'ERROR'
    ? resultado.errores
    : resultado.advertencias;

  if (!lista.includes(mensaje)) {
    lista.push(mensaje);
  }
}

function validarCampoTexto(resultado, registro, nombre) {
  if (!texto(registro[nombre])) {
    agregarProblema(resultado, 'ERROR', 'Campo obligatorio vacío: ' + nombre);
  }
}

function construirCitaSimulada(registro, sourceRecordKey, relaciones) {
  return {
    source_system: SOURCE_SYSTEM,
    source_record_key: sourceRecordKey,
    legacy_id: texto(registro.id_legacy) || null,
    fecha_registro: registro.fecha_registro,
    cliente: registro.cliente,
    numero_original: registro.numero_original,
    numero_normalizado_diagnostico: registro.numero_normalizado || null,
    proceso_texto: registro.proceso_texto,
    proceso_resuelto: relaciones.proceso.nombre,
    precio_texto: registro.precio_texto,
    precio_monto: registro.precio_monto,
    extras_texto: registro.extras_texto || null,
    fecha_cita: registro.fecha_cita,
    hora_cita: registro.hora_cita || null,
    cita_abierta: Boolean(registro.es_cita_abierta),
    sucursal_destino_texto_legacy: registro.sucursal_destino_texto || null,
    asesor_texto: registro.asesor_texto,
    asesor_resuelto: relaciones.asesor.nombre,
    nota: registro.nota || null,
    origen_texto: registro.origen_texto,
    origen_resuelto: relaciones.origen.nombre,
    sucursal_origen_texto: registro.sucursal_origen_texto,
    sucursal_origen_resuelta: relaciones.sucursalOrigen.nombre,
    estado_texto: registro.estado_texto,
    estado_resuelto: relaciones.estado.nombre,
    fecha_venta: registro.fecha_venta || null
  };
}

function validarRegistro(registro, metadata, catalogos, estadisticas, noResueltos) {
  const resultado = {
    fila_origen: registro.fila_origen,
    source_record_key: null,
    errores: [],
    advertencias: []
  };
  const sourceRecordKey =
    'REGISTROCITAS:' +
    texto(metadata.spreadsheet_id) +
    ':' +
    texto(registro.fila_origen) +
    ':' +
    texto(registro.fecha_registro);

  resultado.source_record_key = sourceRecordKey;

  if (!texto(metadata.spreadsheet_id) || !texto(registro.fila_origen) || !texto(registro.fecha_registro)) {
    agregarProblema(resultado, 'ERROR', 'No se puede construir source_record_key válido');
  }

  [
    'cliente',
    'numero_original',
    'proceso_texto',
    'precio_texto',
    'asesor_texto',
    'origen_texto',
    'sucursal_origen_texto',
    'estado_texto'
  ].forEach(function(campo) {
    validarCampoTexto(resultado, registro, campo);
  });

  if (!validarFecha(registro.fecha_registro, true)) {
    agregarProblema(resultado, 'ERROR', 'fecha_registro inválida');
  }

  const citaAbierta = registro.es_cita_abierta === true;
  if (citaAbierta) {
    if (registro.fecha_cita !== null || registro.hora_cita !== null) {
      agregarProblema(resultado, 'ERROR', 'Una cita abierta debe tener fecha_cita y hora_cita nulas');
    }
  } else if (!validarFecha(registro.fecha_cita, false)) {
    agregarProblema(resultado, 'ERROR', 'fecha_cita inválida');
  }

  if (!validarHora(registro.hora_cita)) {
    agregarProblema(resultado, 'ERROR', 'hora_cita inválida');
  }

  if (registro.fecha_venta && !validarFecha(registro.fecha_venta, false)) {
    agregarProblema(resultado, 'ERROR', 'fecha_venta inválida');
  }

  if (registro.precio_monto === null || registro.precio_monto === undefined) {
    agregarProblema(resultado, 'ADVERTENCIA', 'precio_monto sin monto único');
  } else if (typeof registro.precio_monto !== 'number' || !Number.isFinite(registro.precio_monto)) {
    agregarProblema(resultado, 'ERROR', 'precio_monto no es numérico');
  }

  if (!telefonoNormalizable(registro.numero_original)) {
    agregarProblema(resultado, 'ADVERTENCIA', 'Teléfono no normalizable');
  }

  const relaciones = {
    asesor: resolverCatalogo(registro.asesor_texto, catalogos.asesores, ASESORES_EQUIVALENCIAS),
    proceso: resolverCatalogo(registro.proceso_texto, catalogos.procesos, PROCESOS_EQUIVALENCIAS),
    origen: resolverCatalogo(registro.origen_texto, catalogos.origenes, ORIGENES_EQUIVALENCIAS),
    sucursalOrigen: resolverSucursalOrigen(registro, catalogos),
    estado: resolverCatalogo(registro.estado_texto, catalogos.estados, {})
  };

  registrarResolucion(estadisticas.asesores, relaciones.asesor);
  registrarResolucion(estadisticas.procesos, relaciones.proceso);
  registrarResolucion(estadisticas.origenes, relaciones.origen);
  registrarResolucion(estadisticas.sucursales_origen, relaciones.sucursalOrigen);
  registrarResolucion(estadisticas.estados, relaciones.estado);

  [
    ['asesores', 'asesor', 'ADVERTENCIA'],
    ['procesos', 'proceso', 'ADVERTENCIA'],
    ['origenes', 'origen', 'ADVERTENCIA'],
    ['sucursales_origen', 'sucursalOrigen', 'ADVERTENCIA'],
    ['estados', 'estado', 'ERROR']
  ].forEach(function(regla) {
    const tipo = regla[0];
    const nombreRelacion = regla[1];
    const nivel = regla[2];
    const relacion = relaciones[nombreRelacion];

    if (relacion.clasificacion === 'NO_RESUELTA') {
      agregarConteo(noResueltos[tipo], registro[
        nombreRelacion === 'sucursalOrigen'
          ? 'sucursal_origen_texto'
          : nombreRelacion + '_texto'
      ]);
      agregarProblema(resultado, nivel, tipo + ' no resuelto');
    }
  });

  if (!Array.isArray(registro.destinos_candidatos)) {
    agregarProblema(
      resultado,
      'ERROR',
      'destinos_candidatos debe ser un array'
    );
  }

  const destinos = Array.isArray(registro.destinos_candidatos)
    ? registro.destinos_candidatos
    : [];

  if (destinos.length > 1) {
    estadisticas.citas_con_destinos_multiples++;
  }

  const destinosSimulados = destinos.map(function(destino, indice) {
    const resolucion = resolverCatalogo(
      destino,
      catalogos.sucursales,
      catalogos.sucursalAliases
    );

    estadisticas.destinos.total_candidatos++;
    registrarResolucion(estadisticas.destinos, resolucion);

    if (resolucion.clasificacion === 'NO_RESUELTA') {
      agregarConteo(noResueltos.destinos, destino);
      agregarProblema(resultado, 'ADVERTENCIA', 'Destino no resuelto: ' + texto(destino));
      return null;
    }

    estadisticas.filas_simuladas_cita_destinos++;
    return {
      cita_source_record_key: sourceRecordKey,
      sucursal_nombre: resolucion.nombre,
      orden: indice + 1
    };
  }).filter(Boolean);

  resultado.cita_simulada = construirCitaSimulada(
    registro,
    sourceRecordKey,
    relaciones
  );
  resultado.destinos_simulados = destinosSimulados;
  return resultado;
}

function imprimirResumen(resumen) {
  console.log('\nVALIDACIÓN DE IMPORTACIÓN DE CITAS');
  console.log('TOTAL REGISTROS:', resumen.total_registros);
  console.log('LISTOS PARA IMPORTAR:', resumen.listos_para_importar);
  console.log('CON ERRORES:', resumen.con_errores);
  console.log('CON ADVERTENCIAS:', resumen.con_advertencias);
  console.log('SOURCE_RECORD_KEY DUPLICADOS:', resumen.source_record_key_duplicados);
  console.log('LEGACY_ID REPETIDOS:', resumen.legacy_id_repetidos);
  console.log('TELÉFONOS NO NORMALIZABLES:', resumen.telefonos_no_normalizables);
  console.log('PRECIOS SIN MONTO ÚNICO:', resumen.precios_sin_monto_unico);

  ['asesores', 'procesos', 'origenes', 'sucursales_origen', 'estados', 'destinos'].forEach(function(tipo) {
    const datos = resumen[tipo];
    console.log(
      tipo.toUpperCase() + ':',
      'directos', datos.directos + ',',
      'por equivalencia', datos.por_equivalencia + ',',
      'no resueltos', datos.no_resueltos
    );
  });

  console.log('DESTINOS - total candidatos:', resumen.destinos.total_candidatos);
  console.log('CITAS CON DESTINOS MÚLTIPLES:', resumen.citas_con_destinos_multiples);
  console.log('FILAS SIMULADAS CITA_DESTINOS:', resumen.filas_simuladas_cita_destinos);
}

function ejecutar(rutaEntrada, opciones) {
  const contenido = JSON.parse(fs.readFileSync(rutaEntrada, 'utf8'));
  const catalogos = cargarCatalogosLocales();
  const reporte = {
    metadata: {
      archivo_origen: path.resolve(rutaEntrada),
      generado_en: new Date().toISOString(),
      version_exportador: contenido.metadata && contenido.metadata.version_exportador,
      spreadsheet_id: contenido.metadata && contenido.metadata.spreadsheet_id,
      source_system: SOURCE_SYSTEM
    },
    resumen: {},
    no_resueltos: {
      asesores: {}, procesos: {}, origenes: {}, sucursales_origen: {}, estados: {}, destinos: {}
    },
    legacy_id_repetidos: [],
    source_record_key_duplicados: [],
    registros_con_error: []
  };

  if (!contenido || typeof contenido !== 'object' || !contenido.metadata || !contenido.resumen || !Array.isArray(contenido.registros)) {
    throw new Error('El JSON debe contener metadata, resumen y registros.');
  }

  if (contenido.metadata.version_exportador !== '1.1') {
    throw new Error('version_exportador incompatible: se requiere 1.1.');
  }

  const estadisticas = {
    asesores: crearEstadisticaResolucion(),
    procesos: crearEstadisticaResolucion(),
    origenes: crearEstadisticaResolucion(),
    sucursales_origen: crearEstadisticaResolucion(),
    estados: crearEstadisticaResolucion(),
    destinos: Object.assign(crearEstadisticaResolucion(), { total_candidatos: 0 }),
    citas_con_destinos_multiples: 0,
    filas_simuladas_cita_destinos: 0
  };
  const porSourceRecordKey = new Map();
  const porLegacyId = new Map();
  const resultados = contenido.registros.map(function(registro) {
    const resultado = validarRegistro(
      registro,
      contenido.metadata,
      catalogos,
      estadisticas,
      reporte.no_resueltos
    );

    const sourceKey = resultado.source_record_key;
    if (!porSourceRecordKey.has(sourceKey)) {
      porSourceRecordKey.set(sourceKey, []);
    }
    porSourceRecordKey.get(sourceKey).push(resultado);

    const legacyId = texto(registro.id_legacy);
    if (legacyId) {
      if (!porLegacyId.has(legacyId)) {
        porLegacyId.set(legacyId, []);
      }
      porLegacyId.get(legacyId).push(resultado);
    }

    return resultado;
  });

  porSourceRecordKey.forEach(function(registros, sourceKey) {
    if (registros.length > 1) {
      reporte.source_record_key_duplicados.push({
        source_record_key: sourceKey,
        cantidad: registros.length,
        filas_origen: registros.map(function(registro) { return registro.fila_origen; })
      });
      registros.forEach(function(registro) {
        agregarProblema(registro, 'ERROR', 'source_record_key duplicado');
      });
    }
  });

  porLegacyId.forEach(function(registros, legacyId) {
    if (registros.length > 1) {
      reporte.legacy_id_repetidos.push({
        legacy_id: legacyId,
        cantidad: registros.length,
        filas_origen: registros.map(function(registro) { return registro.fila_origen; })
      });
      registros.forEach(function(registro) {
        agregarProblema(registro, 'ADVERTENCIA', 'legacy_id repetido');
      });
    }
  });

  const conErrores = resultados.filter(function(resultado) {
    return resultado.errores.length > 0;
  });
  const conAdvertencias = resultados.filter(function(resultado) {
    return resultado.advertencias.length > 0;
  });

  reporte.registros_con_error = conErrores.map(function(resultado) {
    return {
      fila_origen: resultado.fila_origen,
      source_record_key: resultado.source_record_key,
      errores: resultado.errores,
      advertencias: resultado.advertencias
    };
  });
  reporte.resumen = {
    total_registros: resultados.length,
    listos_para_importar: resultados.length - conErrores.length,
    con_errores: conErrores.length,
    con_advertencias: conAdvertencias.length,
    source_record_key_duplicados: reporte.source_record_key_duplicados.length,
    legacy_id_repetidos: reporte.legacy_id_repetidos.length,
    telefonos_no_normalizables: resultados.filter(function(resultado) {
      return resultado.advertencias.includes('Teléfono no normalizable');
    }).length,
    precios_sin_monto_unico: resultados.filter(function(resultado) {
      return resultado.advertencias.includes('precio_monto sin monto único');
    }).length,
    asesores: estadisticas.asesores,
    procesos: estadisticas.procesos,
    origenes: estadisticas.origenes,
    sucursales_origen: estadisticas.sucursales_origen,
    estados: estadisticas.estados,
    destinos: estadisticas.destinos,
    citas_con_destinos_multiples: estadisticas.citas_con_destinos_multiples,
    filas_simuladas_cita_destinos: estadisticas.filas_simuladas_cita_destinos
  };

  fs.mkdirSync(path.dirname(RUTA_REPORTE), { recursive: true });
  fs.writeFileSync(RUTA_REPORTE, JSON.stringify(reporte, null, 2) + '\n', 'utf8');
  if (!opciones || opciones.silencioso !== true) {
    imprimirResumen(reporte.resumen);
    console.log('REPORTE:', RUTA_REPORTE);
  }

  return {
    codigo: reporte.resumen.con_errores === 0 ? 0 : 1,
    reporte: reporte,
    resultados: resultados
  };
}

function principal() {
  const rutaEntrada = process.argv[2];

  if (!rutaEntrada) {
    console.error('Uso: node scripts/validar_importacion_citas.js ruta/al/archivo.json');
    return 2;
  }

  try {
    return ejecutar(rutaEntrada).codigo;
  } catch (error) {
    console.error('ERROR DE VALIDACIÓN:', error.message);
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = principal();
}

module.exports = {
  SOURCE_SYSTEM: SOURCE_SYSTEM,
  cargarCatalogosLocales: cargarCatalogosLocales,
  ejecutar: ejecutar,
  resolverCatalogo: resolverCatalogo,
  resolverSucursalOrigen: resolverSucursalOrigen
};
