'use strict';

/**
 * Importa citas históricas de forma controlada.
 * Uso: node scripts/importar_citas_supabase.js archivo.json --dry-run [--offset=N] [--limit=N]
 */

const fs = require('fs');
const path = require('path');
const {
  SOURCE_SYSTEM,
  ejecutar: validarArchivo
} = require('./validar_importacion_citas');

const RAIZ_PROYECTO = path.resolve(__dirname, '..');
const RUTA_REPORTE = path.join(
  RAIZ_PROYECTO,
  'reportes',
  'importacion_citas_ultimo.json'
);
const TAMANO_LOTE = 50;

function texto(valor) {
  return String(valor === null || valor === undefined ? '' : valor).trim();
}

function clave(valor) {
  return texto(valor).toLocaleUpperCase('es');
}

function leerArgumentos(argumentos) {
  const opciones = {
    archivo: null,
    dryRun: false,
    preflight: false,
    confirm: false,
    offset: 0,
    limit: null
  };

  argumentos.forEach(function(argumento) {
    if (argumento === '--dry-run') {
      opciones.dryRun = true;
    } else if (argumento === '--preflight') {
      opciones.preflight = true;
    } else if (argumento === '--confirm') {
      opciones.confirm = true;
    } else if (argumento.indexOf('--limit=') === 0) {
      opciones.limit = Number(argumento.slice('--limit='.length));
    } else if (argumento.indexOf('--offset=') === 0) {
      opciones.offset = Number(argumento.slice('--offset='.length));
    } else if (!opciones.archivo && argumento.indexOf('--') !== 0) {
      opciones.archivo = argumento;
    } else {
      throw new Error('Argumento no reconocido: ' + argumento);
    }
  });

  if (!opciones.archivo) {
    throw new Error('Falta el archivo JSON de exportación.');
  }

  if (opciones.dryRun && opciones.preflight) {
    throw new Error('--dry-run y --preflight no se pueden usar juntos.');
  }

  if (!Number.isInteger(opciones.offset) || opciones.offset < 0) {
    throw new Error('--offset debe ser un entero mayor o igual a 0.');
  }

  if (
    opciones.limit !== null &&
    (!Number.isInteger(opciones.limit) || opciones.limit < 1)
  ) {
    throw new Error('--limit debe ser un entero mayor o igual a 1.');
  }

  return opciones;
}

function crearReporte(opciones) {
  return {
    modo: opciones.dryRun
      ? 'dry-run'
      : opciones.preflight
        ? 'preflight'
        : 'real',
    fecha: new Date().toISOString(),
    archivo: path.resolve(opciones.archivo),
    offset: opciones.offset,
    limit: opciones.limit,
    seleccionados: 0,
    nuevos: 0,
    existentes: 0,
    insertados: 0,
    fallidos: 0,
    incompletos: 0,
    destinos_insertados: 0,
    errores: []
  };
}

function guardarReporte(reporte) {
  fs.mkdirSync(path.dirname(RUTA_REPORTE), { recursive: true });
  fs.writeFileSync(
    RUTA_REPORTE,
    JSON.stringify(reporte, null, 2) + '\n',
    'utf8'
  );
}

function cargarRegistrosSeleccionados(opciones) {
  const contenido = JSON.parse(fs.readFileSync(opciones.archivo, 'utf8'));
  const validacion = validarArchivo(opciones.archivo, { silencioso: true });

  if (validacion.codigo !== 0) {
    throw new Error(
      'La validación previa detectó errores estructurales. Revisa reportes/validacion_importacion_citas.json.'
    );
  }

  const finSeleccion = opciones.limit === null
    ? undefined
    : opciones.offset + opciones.limit;
  const resultados = validacion.resultados.slice(
    opciones.offset,
    finSeleccion
  );
  const registros = contenido.registros.slice(
    opciones.offset,
    finSeleccion
  );

  return resultados.map(function(resultado, indice) {
    return {
      registro: registros[indice],
      validacion: resultado,
      cita: resultado.cita_simulada,
      destinos: resultado.destinos_simulados
    };
  });
}

function construirPayloadCita(cita, ids) {
  const procesoId = ids.procesos.get(clave(cita.proceso_resuelto));
  const asesorId = ids.asesores.get(clave(cita.asesor_resuelto));
  const origenId = ids.origenes.get(clave(cita.origen_resuelto));
  const sucursalOrigenId = ids.sucursales.get(
    clave(cita.sucursal_origen_resuelta)
  );
  const estadoCodigo = ids.estados.get(clave(cita.estado_resuelto));

  const faltantes = [];
  [
    ['proceso', cita.proceso_resuelto, procesoId],
    ['asesor', cita.asesor_resuelto, asesorId],
    ['origen', cita.origen_resuelto, origenId],
    ['sucursal_origen', cita.sucursal_origen_resuelta, sucursalOrigenId],
    ['estado', cita.estado_resuelto, estadoCodigo]
  ].forEach(function(referencia) {
    if (referencia[1] && !referencia[2]) {
      faltantes.push(referencia[0] + ': ' + referencia[1]);
    }
  });

  if (faltantes.length > 0) {
    throw new Error('Catálogos faltantes en Supabase: ' + faltantes.join(', '));
  }

  return {
    source_system: SOURCE_SYSTEM,
    source_record_key: cita.source_record_key,
    legacy_id: cita.legacy_id,
    fecha_registro: cita.fecha_registro,
    cliente: cita.cliente,
    numero_original: cita.numero_original,
    proceso_id: procesoId || null,
    proceso_texto: cita.proceso_texto,
    precio_texto: cita.precio_texto,
    precio_monto: cita.precio_monto,
    extras: cita.extras_texto,
    fecha_cita: cita.fecha_cita,
    cita_abierta: cita.cita_abierta,
    hora_cita: cita.hora_cita,
    asesor_id: asesorId || null,
    asesor_texto: cita.asesor_texto,
    nota: cita.nota,
    origen_id: origenId || null,
    origen_texto: cita.origen_texto,
    sucursal_origen_id: sucursalOrigenId || null,
    sucursal_origen_texto: cita.sucursal_origen_texto,
    sucursal_destino_texto_legacy: cita.sucursal_destino_texto_legacy,
    estado_codigo: estadoCodigo,
    fecha_venta: cita.fecha_venta
  };
}

function construirMuestraDryRun(seleccionados) {
  return seleccionados.slice(0, 5).map(function(item) {
    const cita = item.cita;

    return {
      source_system: SOURCE_SYSTEM,
      source_record_key: cita.source_record_key,
      legacy_id: cita.legacy_id,
      fecha_registro: cita.fecha_registro,
      cliente: cita.cliente,
      numero_original: cita.numero_original,
      proceso_texto: cita.proceso_texto,
      proceso_resuelto: cita.proceso_resuelto,
      precio_texto: cita.precio_texto,
      precio_monto: cita.precio_monto,
      extras: cita.extras_texto,
      fecha_cita: cita.fecha_cita,
      cita_abierta: cita.cita_abierta,
      hora_cita: cita.hora_cita,
      sucursal_destino_texto_legacy: cita.sucursal_destino_texto_legacy,
      asesor_texto: cita.asesor_texto,
      asesor_resuelto: cita.asesor_resuelto,
      origen_texto: cita.origen_texto,
      origen_resuelto: cita.origen_resuelto,
      sucursal_origen_texto: cita.sucursal_origen_texto,
      sucursal_origen_resuelta: cita.sucursal_origen_resuelta,
      estado_codigo: cita.estado_resuelto,
      fecha_venta: cita.fecha_venta
    };
  });
}

function imprimirDryRun(reporte, muestra) {
  console.log('TOTAL SELECCIONADOS:', reporte.seleccionados);
  console.log('NUEVOS SIMULADOS:', reporte.nuevos);
  console.log('CITAS A INSERTAR:', reporte.nuevos);
  console.log('DESTINOS A INSERTAR:', reporte.destinos_a_insertar);
  console.log('CON ADVERTENCIAS:', reporte.con_advertencias);
  console.log('CON ERRORES:', reporte.errores.length);
  console.log('MUESTRA PUBLIC.CITAS:');
  console.log(JSON.stringify(muestra, null, 2));
}

function obtenerClienteSupabase() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const faltantes = [];

  if (!url) {
    faltantes.push('SUPABASE_URL');
  }
  if (!serviceRoleKey) {
    faltantes.push('SUPABASE_SERVICE_ROLE_KEY');
  }

  if (faltantes.length > 0) {
    throw new Error(
      'Faltan variables de entorno: ' + faltantes.join(', ')
    );
  }

  let createClient;
  try {
    createClient = require('@supabase/supabase-js').createClient;
  } catch (error) {
    throw new Error(
      'Falta @supabase/supabase-js. Instálalo antes del modo real con: npm install @supabase/supabase-js'
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function cargarCatalogosRemotos(cliente) {
  const consultas = await Promise.all([
    cliente.from('sucursales').select('id,nombre'),
    cliente.from('asesores').select('id,nombre'),
    cliente.from('procesos').select('id,nombre'),
    cliente.from('origenes').select('id,nombre'),
    cliente.from('estados').select('codigo')
  ]);
  const nombres = ['sucursales', 'asesores', 'procesos', 'origenes', 'estados'];
  const catalogos = {};

  consultas.forEach(function(respuesta, indice) {
    if (respuesta.error) {
      throw new Error('No se pudo cargar ' + nombres[indice] + ': ' + respuesta.error.message);
    }
  });

  catalogos.sucursales = new Map();
  catalogos.asesores = new Map();
  catalogos.procesos = new Map();
  catalogos.origenes = new Map();
  catalogos.estados = new Map();

  consultas[0].data.forEach(function(fila) { catalogos.sucursales.set(clave(fila.nombre), fila.id); });
  consultas[1].data.forEach(function(fila) { catalogos.asesores.set(clave(fila.nombre), fila.id); });
  consultas[2].data.forEach(function(fila) { catalogos.procesos.set(clave(fila.nombre), fila.id); });
  consultas[3].data.forEach(function(fila) { catalogos.origenes.set(clave(fila.nombre), fila.id); });
  consultas[4].data.forEach(function(fila) { catalogos.estados.set(clave(fila.codigo), fila.codigo); });

  return catalogos;
}

function resumenCatalogo(nombre, requeridos, mapa) {
  const valores = Array.from(requeridos);
  const faltantes = valores.filter(function(valor) {
    return !mapa.has(clave(valor));
  });

  return {
    nombre: nombre,
    requeridos: valores.length,
    encontrados: valores.length - faltantes.length,
    faltantes: faltantes
  };
}

function construirResumenCatalogos(seleccionados, ids) {
  const requeridos = {
    sucursales: new Set(),
    asesores: new Set(),
    procesos: new Set(),
    origenes: new Set(),
    estados: new Set()
  };

  seleccionados.forEach(function(item) {
    const cita = item.cita;
    if (cita.sucursal_origen_resuelta) requeridos.sucursales.add(cita.sucursal_origen_resuelta);
    if (cita.asesor_resuelto) requeridos.asesores.add(cita.asesor_resuelto);
    if (cita.proceso_resuelto) requeridos.procesos.add(cita.proceso_resuelto);
    if (cita.origen_resuelto) requeridos.origenes.add(cita.origen_resuelto);
    if (cita.estado_resuelto) requeridos.estados.add(cita.estado_resuelto);
    item.destinos.forEach(function(destino) {
      requeridos.sucursales.add(destino.sucursal_nombre);
    });
  });

  return {
    sucursales: resumenCatalogo('SUCURSALES', requeridos.sucursales, ids.sucursales),
    asesores: resumenCatalogo('ASESORES', requeridos.asesores, ids.asesores),
    procesos: resumenCatalogo('PROCESOS', requeridos.procesos, ids.procesos),
    origenes: resumenCatalogo('ORIGENES', requeridos.origenes, ids.origenes),
    estados: resumenCatalogo('ESTADOS', requeridos.estados, ids.estados)
  };
}

function comprobarEsquemaLocal() {
  const inicial = fs.readFileSync(
    path.join(RAIZ_PROYECTO, 'supabase', 'migrations', '20260728190000_esquema_inicial_citas.sql'),
    'utf8'
  );
  const ajuste = fs.readFileSync(
    path.join(RAIZ_PROYECTO, 'supabase', 'migrations', '20260811134315_ajusta_identificadores_y_telefono_citas.sql'),
    'utf8'
  );

  return {
    fuente: 'migraciones locales',
    source_record_key_definida: /add column if not exists source_record_key text/i.test(ajuste),
    legacy_id_no_unico: /create index if not exists citas_source_system_legacy_id_idx/i.test(ajuste),
    numero_normalizado_nullable: /alter column numero_normalizado drop not null/i.test(ajuste),
    columnas_citas: [
      'source_system', 'source_record_key', 'legacy_id', 'fecha_registro',
      'cliente', 'numero_original', 'proceso_id', 'proceso_texto',
      'precio_texto', 'precio_monto', 'extras', 'fecha_cita', 'cita_abierta',
      'hora_cita', 'asesor_id', 'asesor_texto', 'nota', 'origen_id',
      'origen_texto', 'sucursal_origen_id', 'sucursal_origen_texto',
      'sucursal_destino_texto_legacy', 'estado_codigo', 'fecha_venta'
    ].filter(function(columna) {
      return inicial.indexOf(columna) !== -1 || ajuste.indexOf(columna) !== -1;
    }),
    columnas_cita_destinos: ['cita_id', 'sucursal_id', 'orden']
  };
}

async function consultarExistentes(cliente, seleccionados) {
  const existentes = new Set();
  const keys = seleccionados.map(function(item) {
    return item.cita.source_record_key;
  });

  for (const lote of dividirEnLotes(keys, TAMANO_LOTE)) {
    const respuesta = await cliente
      .from('citas')
      .select('source_record_key')
      .eq('source_system', SOURCE_SYSTEM)
      .in('source_record_key', lote);

    if (respuesta.error) {
      throw new Error('No se pudieron consultar citas existentes: ' + respuesta.error.message);
    }

    respuesta.data.forEach(function(fila) {
      existentes.add(fila.source_record_key);
    });
  }

  return existentes;
}

function imprimirResumenCatalogo(catalogos) {
  Object.keys(catalogos).forEach(function(tipo) {
    const catalogo = catalogos[tipo];
    console.log(
      catalogo.nombre + ':',
      'REQUERIDAS ' + catalogo.requeridos + ',',
      'ENCONTRADAS ' + catalogo.encontrados + ',',
      'FALTANTES ' + catalogo.faltantes.length + '.',
      catalogo.faltantes.length === 0
        ? 'OK'
        : 'FALTAN ' + catalogo.faltantes.join(', ')
    );
  });
}

async function ejecutarPreflight(seleccionados, reporte) {
  const cliente = obtenerClienteSupabase();
  const ids = await cargarCatalogosRemotos(cliente);
  const catalogos = construirResumenCatalogos(seleccionados, ids);
  const faltantes = Object.keys(catalogos).reduce(function(total, tipo) {
    return total.concat(catalogos[tipo].faltantes);
  }, []);
  const esquema = comprobarEsquemaLocal();
  const comprobacionColumna = await cliente
    .from('citas')
    .select('source_record_key')
    .limit(1);

  if (comprobacionColumna.error) {
    reporte.errores.push({
      etapa: 'preflight_esquema_remoto',
      mensaje: 'No se pudo confirmar source_record_key: ' + comprobacionColumna.error.message
    });
  }

  const existentes = await consultarExistentes(cliente, seleccionados);
  const nuevos = seleccionados.filter(function(item) {
    return !existentes.has(item.cita.source_record_key);
  });
  const destinosSeleccionados = seleccionados.reduce(function(total, item) {
    return total.concat(item.destinos);
  }, []);
  const destinosNoResueltos = destinosSeleccionados.filter(function(destino) {
    return !ids.sucursales.has(clave(destino.sucursal_nombre));
  }).length;
  const destinosResueltos = destinosSeleccionados.length - destinosNoResueltos;
  const filasDestinosNuevos = nuevos.reduce(function(total, item) {
    return total + item.destinos.length;
  }, 0);

  reporte.nuevos = nuevos.length;
  reporte.existentes = existentes.size;
  reporte.destinos_resueltos = destinosResueltos;
  reporte.destinos_no_resueltos = destinosNoResueltos;
  reporte.filas_cita_destinos_que_se_crearian = filasDestinosNuevos;
  reporte.catalogos = catalogos;
  reporte.comprobaciones_esquema = esquema;
  const existeH2bUsaCad = ids.procesos.has(clave('H2B USA / CAD'));
  if (faltantes.length > 0) {
    reporte.errores.push({
      etapa: 'preflight_catalogos',
      mensaje: 'Faltan catálogos requeridos: ' + faltantes.join(', ')
    });
  }

  if (!existeH2bUsaCad) {
    reporte.errores.push({
      etapa: 'preflight_catalogos',
      mensaje: 'Falta el proceso requerido H2B USA / CAD.'
    });
  }

  const payloads = reporte.errores.length === 0
    ? nuevos.map(function(item) { return construirPayloadCita(item.cita, ids); })
    : [];
  const muestraDestinos = nuevos.reduce(function(total, item) {
    return total.concat(item.destinos.map(function(destino) {
      return {
        cita_source_record_key: item.cita.source_record_key,
        sucursal_id: ids.sucursales.get(clave(destino.sucursal_nombre)),
        sucursal_nombre: destino.sucursal_nombre,
        orden: destino.orden
      };
    }));
  }, []).slice(0, 5);

  reporte.payloads_validos = payloads.length;
  reporte.muestra_payloads_citas = payloads.slice(0, 5);
  reporte.muestra_cita_destinos = muestraDestinos;
  reporte.comprobaciones_especiales = {
    source_record_key_columna_remota: !comprobacionColumna.error,
    legacy_id_repetible: esquema.legacy_id_no_unico,
    numero_normalizado_nullable: esquema.numero_normalizado_nullable,
    proceso_h2b_usa_cad: existeH2bUsaCad,
    bank_resuelve_bank: seleccionados.every(function(item) {
      return clave(item.cita.sucursal_origen_texto) !== 'BANK' ||
        clave(item.cita.sucursal_origen_resuelta) === 'BANK';
    }),
    payload_no_envia_codigo: payloads.every(function(payload) {
      return !Object.prototype.hasOwnProperty.call(payload, 'codigo');
    }),
    primeras_cinco_con_fk_reales:
      payloads.length >= Math.min(5, nuevos.length)
  };

  console.log('\nPRE-FLIGHT SUPABASE - SOLO LECTURA');
  console.log('TOTAL SELECCIONADOS:', reporte.seleccionados);
  console.log('NUEVAS:', reporte.nuevos);
  console.log('EXISTENTES:', reporte.existentes);
  console.log('CATÁLOGOS:');
  imprimirResumenCatalogo(catalogos);
  console.log('DESTINOS RESUELTOS:', reporte.destinos_resueltos);
  console.log('DESTINOS NO RESUELTOS:', reporte.destinos_no_resueltos);
  console.log('FILAS CITA_DESTINOS QUE SE CREARÍAN:', reporte.filas_cita_destinos_que_se_crearian);
  console.log('PAYLOADS VÁLIDOS:', reporte.payloads_validos);
  console.log('ERRORES:', reporte.errores.length);
  console.log('MUESTRA PUBLIC.CITAS:');
  console.log(JSON.stringify(reporte.muestra_payloads_citas, null, 2));
  console.log('MUESTRA CITA_DESTINOS:');
  console.log(JSON.stringify(reporte.muestra_cita_destinos, null, 2));
  console.log(
    reporte.errores.length === 0
      ? 'RESULTADO: PRE-FLIGHT APROBADO'
      : 'RESULTADO: PRE-FLIGHT FALLIDO'
  );

  return reporte.errores.length === 0 ? 0 : 1;
}

function dividirEnLotes(elementos, tamano) {
  const lotes = [];
  for (let indice = 0; indice < elementos.length; indice += tamano) {
    lotes.push(elementos.slice(indice, indice + tamano));
  }
  return lotes;
}

async function importarModoReal(seleccionados, reporte) {
  const cliente = obtenerClienteSupabase();
  const ids = await cargarCatalogosRemotos(cliente);
  const preparados = seleccionados.map(function(item) {
    return {
      item: item,
      payload: construirPayloadCita(item.cita, ids)
    };
  });

  for (const lote of dividirEnLotes(preparados, TAMANO_LOTE)) {
    const keys = lote.map(function(preparado) {
      return preparado.payload.source_record_key;
    });
    const existentes = await cliente
      .from('citas')
      .select('id,source_record_key')
      .eq('source_system', SOURCE_SYSTEM)
      .in('source_record_key', keys);

    if (existentes.error) {
      throw new Error('No se pudieron consultar citas existentes: ' + existentes.error.message);
    }

    const keysExistentes = new Set(
      existentes.data.map(function(fila) { return fila.source_record_key; })
    );
    const nuevos = lote.filter(function(preparado) {
      return !keysExistentes.has(preparado.payload.source_record_key);
    });
    reporte.existentes += lote.length - nuevos.length;
    reporte.nuevos += nuevos.length;

    if (nuevos.length === 0) {
      continue;
    }

    const insercion = await cliente
      .from('citas')
      .insert(nuevos.map(function(preparado) { return preparado.payload; }))
      .select('id,source_record_key');

    if (insercion.error) {
      reporte.fallidos += nuevos.length;
      reporte.errores.push({ etapa: 'insertar_citas', mensaje: insercion.error.message });
      continue;
    }

    reporte.insertados += insercion.data.length;
    const idsPorKey = new Map(
      insercion.data.map(function(fila) { return [fila.source_record_key, fila.id]; })
    );
    const destinos = [];

    nuevos.forEach(function(preparado) {
      const citaId = idsPorKey.get(preparado.payload.source_record_key);
      preparado.item.destinos.forEach(function(destino) {
        const sucursalId = ids.sucursales.get(clave(destino.sucursal_nombre));
        if (!citaId || !sucursalId) {
          reporte.incompletos++;
          reporte.errores.push({
            etapa: 'preparar_destinos',
            source_record_key: preparado.payload.source_record_key,
            mensaje: 'No se pudo resolver el UUID de la cita o sucursal destino.'
          });
          return;
        }
        destinos.push({ cita_id: citaId, sucursal_id: sucursalId, orden: destino.orden });
      });
    });

    if (destinos.length > 0) {
      const insercionDestinos = await cliente.from('cita_destinos').insert(destinos);
      if (insercionDestinos.error) {
        const keysIncompletos = new Set(destinos.map(function(destino) { return destino.cita_id; }));
        reporte.incompletos += keysIncompletos.size;
        reporte.errores.push({ etapa: 'insertar_destinos', mensaje: insercionDestinos.error.message });
      } else {
        reporte.destinos_insertados += destinos.length;
      }
    }
  }
}

async function principal() {
  let opciones;
  try {
    opciones = leerArgumentos(process.argv.slice(2));
  } catch (error) {
    console.error('ERROR:', error.message);
    return 2;
  }

  const reporte = crearReporte(opciones);

  try {
    const seleccionados = cargarRegistrosSeleccionados(opciones);
    reporte.seleccionados = seleccionados.length;
    reporte.con_advertencias = seleccionados.filter(function(item) {
      return item.validacion.advertencias.length > 0;
    }).length;

    if (opciones.dryRun) {
      reporte.nuevos = seleccionados.length;
      reporte.destinos_a_insertar = seleccionados.reduce(function(total, item) {
        return total + item.destinos.length;
      }, 0);
      imprimirDryRun(reporte, construirMuestraDryRun(seleccionados));
      guardarReporte(reporte);
      return 0;
    }

    if (opciones.preflight) {
      const codigoPreflight = await ejecutarPreflight(
        seleccionados,
        reporte
      );
      guardarReporte(reporte);
      return codigoPreflight;
    }

    console.log('ATENCIÓN: MODO REAL DE IMPORTACIÓN');
    console.log('archivo:', reporte.archivo);
    console.log('offset:', opciones.offset);
    console.log('limit:', opciones.limit === null ? 'todos' : opciones.limit);
    console.log('total seleccionado:', reporte.seleccionados);

    if (!opciones.confirm) {
      console.error(
        'No se insertó nada. Confirma explícitamente con: node scripts/importar_citas_supabase.js ' +
        opciones.archivo + ' --offset=' + opciones.offset +
        (opciones.limit === null ? '' : ' --limit=' + opciones.limit) +
        ' --confirm'
      );
      guardarReporte(reporte);
      return 2;
    }

    await importarModoReal(seleccionados, reporte);
    guardarReporte(reporte);
    return reporte.fallidos || reporte.incompletos ? 1 : 0;
  } catch (error) {
    reporte.errores.push({ etapa: 'prevalidacion_o_configuracion', mensaje: error.message });
    guardarReporte(reporte);
    console.error('ERROR:', error.message);
    return 1;
  }
}

principal().then(function(codigo) {
  process.exitCode = codigo;
});
