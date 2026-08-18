'use strict';

/**
 * Actualiza únicamente citas.hora_texto_original por source_record_key.
 *
 * Uso:
 * node scripts/backfill_hora_texto_original_citas.js archivo.json --dry-run
 * node scripts/backfill_hora_texto_original_citas.js archivo.json --preflight
 * node scripts/backfill_hora_texto_original_citas.js archivo.json --confirm=ACTUALIZAR_HORA_TEXTO_ORIGINAL
 */

const fs = require('fs');
const path = require('path');

const SOURCE_SYSTEM = 'GOOGLE_SHEETS_REGISTROCITAS';
const CONFIRMACION_REAL = 'ACTUALIZAR_HORA_TEXTO_ORIGINAL';
const TAMANO_LOTE_CONSULTA = 20;

function leerArgumentos(argumentos) {
  const opciones = {
    archivo: null,
    modo: null,
    confirmacion: null
  };

  argumentos.forEach(function(argumento) {
    if (argumento === '--dry-run') {
      opciones.modo = opciones.modo || 'dry-run';

      if (opciones.modo !== 'dry-run') {
        throw new Error('Solo puede seleccionarse un modo de ejecución.');
      }
    } else if (argumento === '--preflight') {
      opciones.modo = opciones.modo || 'preflight';

      if (opciones.modo !== 'preflight') {
        throw new Error('Solo puede seleccionarse un modo de ejecución.');
      }
    } else if (argumento.indexOf('--confirm=') === 0) {
      opciones.modo = opciones.modo || 'real';

      if (opciones.modo !== 'real') {
        throw new Error('Solo puede seleccionarse un modo de ejecución.');
      }

      opciones.confirmacion = argumento.slice('--confirm='.length);
    } else if (!opciones.archivo && argumento.indexOf('--') !== 0) {
      opciones.archivo = argumento;
    } else {
      throw new Error('Argumento no reconocido: ' + argumento);
    }
  });

  if (!opciones.archivo) {
    throw new Error('Falta el archivo JSON del backfill.');
  }

  if (!opciones.modo) {
    throw new Error(
      'Debe indicar --dry-run, --preflight o la confirmación real.'
    );
  }

  if (
    opciones.modo === 'real' &&
    opciones.confirmacion !== CONFIRMACION_REAL
  ) {
    throw new Error(
      'Confirmación inválida. Use --confirm=' + CONFIRMACION_REAL
    );
  }

  return opciones;
}

function cargarArchivo(rutaArchivo) {
  const rutaAbsoluta = path.resolve(rutaArchivo);
  const contenido = JSON.parse(fs.readFileSync(rutaAbsoluta, 'utf8'));

  if (
    !contenido.metadata ||
    contenido.metadata.tipo !== 'BACKFILL_HORA_TEXTO_ORIGINAL_CITAS'
  ) {
    throw new Error('El archivo no corresponde al backfill de horas.');
  }

  if (!Array.isArray(contenido.registros)) {
    throw new Error('El archivo no contiene un arreglo de registros.');
  }

  if (!Array.isArray(contenido.errores)) {
    throw new Error('El archivo no contiene el arreglo de errores esperado.');
  }

  const claves = new Set();
  const registros = contenido.registros.map(function(registro, indice) {
    const sourceRecordKey = String(registro.source_record_key || '').trim();

    if (!sourceRecordKey.startsWith('REGISTROCITAS:')) {
      throw new Error(
        'source_record_key inválida en el registro ' + (indice + 1) + '.'
      );
    }

    if (claves.has(sourceRecordKey)) {
      throw new Error(
        'source_record_key duplicada en el registro ' + (indice + 1) + '.'
      );
    }

    if (typeof registro.hora_texto_original !== 'string') {
      throw new Error(
        'hora_texto_original debe ser texto en el registro ' +
        (indice + 1) + '.'
      );
    }

    claves.add(sourceRecordKey);

    return {
      source_record_key: sourceRecordKey,
      hora_texto_original: registro.hora_texto_original
    };
  });

  return {
    ruta: rutaAbsoluta,
    registros: registros,
    erroresExportacion: contenido.errores.length
  };
}

function dividirEnLotes(valores, tamano) {
  const lotes = [];

  for (let indice = 0; indice < valores.length; indice += tamano) {
    lotes.push(valores.slice(indice, indice + tamano));
  }

  return lotes;
}

function crearResumen(archivo, registros, erroresExportacion) {
  return {
    archivo: archivo,
    citas_exportadas: registros.length,
    citas_con_hora_visible: registros.filter(function(registro) {
      return registro.hora_texto_original !== '';
    }).length,
    citas_encontradas: 0,
    citas_sin_coincidencia: 0,
    citas_con_hora_sin_coincidencia: 0,
    citas_que_se_actualizarian: 0,
    citas_sin_cambios: 0,
    citas_actualizadas: 0,
    errores_exportacion: erroresExportacion || 0,
    errores: 0
  };
}

function imprimirResumen(titulo, resumen) {
  console.log(titulo);
  console.log('CITAS EXPORTADAS:', resumen.citas_exportadas);
  console.log('CON HORA VISIBLE:', resumen.citas_con_hora_visible);
  console.log('ENCONTRADAS EN SUPABASE:', resumen.citas_encontradas);
  console.log('SIN COINCIDENCIA:', resumen.citas_sin_coincidencia);
  console.log(
    'CON HORA SIN COINCIDENCIA:',
    resumen.citas_con_hora_sin_coincidencia
  );
  console.log('SE ACTUALIZARÍAN:', resumen.citas_que_se_actualizarian);
  console.log('SIN CAMBIOS:', resumen.citas_sin_cambios);
  console.log('ACTUALIZADAS:', resumen.citas_actualizadas);
  console.log('ERRORES DE EXPORTACIÓN:', resumen.errores_exportacion);
  console.log('ERRORES:', resumen.errores);
}

function obtenerClienteSupabase() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.'
    );
  }

  let createClient;

  try {
    createClient = require('@supabase/supabase-js').createClient;
  } catch (error) {
    throw new Error(
      'Falta @supabase/supabase-js. Ejecute npm install antes del preflight.'
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function consultarCitasRemotas(cliente, registros) {
  const citas = [];
  const claves = registros.map(function(registro) {
    return registro.source_record_key;
  });

  for (const lote of dividirEnLotes(claves, TAMANO_LOTE_CONSULTA)) {
    const respuesta = await cliente
      .from('citas')
      .select('source_record_key,hora_texto_original')
      .eq('source_system', SOURCE_SYSTEM)
      .in('source_record_key', lote);

    if (respuesta.error) {
      throw new Error(
        'No se pudieron consultar las citas: ' + respuesta.error.message
      );
    }

    citas.push.apply(citas, respuesta.data || []);
  }

  return citas;
}

function prepararActualizaciones(registros, citasRemotas, resumen) {
  const remotasPorClave = new Map(
    citasRemotas.map(function(cita) {
      return [cita.source_record_key, cita];
    })
  );
  const actualizaciones = [];

  resumen.citas_encontradas = registros.filter(function(registro) {
    return remotasPorClave.has(registro.source_record_key);
  }).length;
  resumen.citas_sin_coincidencia =
    registros.length - resumen.citas_encontradas;
  resumen.citas_con_hora_sin_coincidencia = registros.filter(
    function(registro) {
      return registro.hora_texto_original !== '' &&
        !remotasPorClave.has(registro.source_record_key);
    }
  ).length;

  registros.forEach(function(registro) {
    const remota = remotasPorClave.get(registro.source_record_key);

    if (!remota || registro.hora_texto_original === '') {
      return;
    }

    if (remota.hora_texto_original === registro.hora_texto_original) {
      resumen.citas_sin_cambios++;
      return;
    }

    actualizaciones.push(registro);
  });

  resumen.citas_que_se_actualizarian = actualizaciones.length;

  return actualizaciones;
}

async function ejecutarActualizaciones(cliente, actualizaciones, resumen) {
  for (let indice = 0; indice < actualizaciones.length; indice++) {
    const registro = actualizaciones[indice];
    const respuesta = await cliente
      .from('citas')
      .update({ hora_texto_original: registro.hora_texto_original })
      .eq('source_system', SOURCE_SYSTEM)
      .eq('source_record_key', registro.source_record_key)
      .select('source_record_key');

    if (respuesta.error || !respuesta.data || respuesta.data.length !== 1) {
      resumen.errores++;
      console.error(
        'No se actualizó el registro seleccionado número ' + (indice + 1) +
        ': ' + (respuesta.error ? respuesta.error.message : 'sin coincidencia única')
      );
      continue;
    }

    resumen.citas_actualizadas++;
  }
}

async function principal(argumentos) {
  const opciones = leerArgumentos(argumentos);
  const archivo = cargarArchivo(opciones.archivo);
  const resumen = crearResumen(
    archivo.ruta,
    archivo.registros,
    archivo.erroresExportacion
  );

  if (opciones.modo === 'dry-run') {
    imprimirResumen('DRY-RUN LOCAL - SIN CONEXIÓN A SUPABASE', resumen);
    return resumen;
  }

  const cliente = obtenerClienteSupabase();
  const citasRemotas = await consultarCitasRemotas(
    cliente,
    archivo.registros
  );
  const actualizaciones = prepararActualizaciones(
    archivo.registros,
    citasRemotas,
    resumen
  );

  if (opciones.modo === 'preflight') {
    imprimirResumen('PREFLIGHT SUPABASE - SOLO LECTURA', resumen);
    return resumen;
  }

  if (resumen.errores_exportacion > 0) {
    throw new Error(
      'No se escribió nada: la exportación contiene filas sin source_record_key.'
    );
  }

  if (resumen.citas_con_hora_sin_coincidencia > 0) {
    throw new Error(
      'No se escribió nada: existen citas con hora visible sin coincidencia.'
    );
  }

  await ejecutarActualizaciones(cliente, actualizaciones, resumen);
  imprimirResumen('BACKFILL HORA TEXTO ORIGINAL - RESULTADO', resumen);

  if (resumen.errores > 0) {
    throw new Error('El backfill terminó con actualizaciones fallidas.');
  }

  return resumen;
}

if (require.main === module) {
  principal(process.argv.slice(2)).catch(function(error) {
    console.error('ERROR:', error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  CONFIRMACION_REAL,
  leerArgumentos,
  cargarArchivo,
  crearResumen,
  prepararActualizaciones,
  principal
};
