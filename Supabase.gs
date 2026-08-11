/**
 * Capa aislada de solo lectura para Supabase.
 * No se invoca desde los flujos operativos actuales de Google Sheets.
 */

const SUPABASE_MAXIMO_LIMIT_CITAS_ = 100;

function obtenerConfiguracionSupabase_() {
  const propiedades = PropertiesService.getScriptProperties();
  const url = String(
    propiedades.getProperty('SUPABASE_URL') || ''
  ).trim();
  const serviceRoleKey = String(
    propiedades.getProperty('SUPABASE_SERVICE_ROLE_KEY') || ''
  ).trim();

  if (!url) {
    throw new Error(
      'Falta configurar la propiedad SUPABASE_URL en Script Properties.'
    );
  }

  if (!serviceRoleKey) {
    throw new Error(
      'Falta configurar la propiedad SUPABASE_SERVICE_ROLE_KEY en Script Properties.'
    );
  }

  return {
    url: url.replace(/\/+$/, ''),
    serviceRoleKey: serviceRoleKey
  };
}

function supabaseRequest_(ruta, opciones) {
  const configuracion = obtenerConfiguracionSupabase_();
  const metodo = String(
    (opciones && opciones.method) || 'GET'
  ).toUpperCase();

  if (metodo !== 'GET') {
    throw new Error(
      'La capa Supabase está actualmente bloqueada en modo SOLO LECTURA. Método no permitido: ' +
      metodo
    );
  }

  const respuesta = UrlFetchApp.fetch(
    configuracion.url + '/rest/v1/' + ruta,
    {
      method: 'get',
      headers: {
        apikey: configuracion.serviceRoleKey,
        Authorization: 'Bearer ' + configuracion.serviceRoleKey,
        'Content-Type': 'application/json'
      },
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
      // Mantiene el contenido de texto cuando no es JSON.
    }

    throw new Error(
      'Error Supabase HTTP ' + codigoHttp +
      ' en ruta ' + ruta + ': ' + mensaje
    );
  }

  return contenido ? JSON.parse(contenido) : null;
}

function normalizarEnteroSupabase_(valor, predeterminado, maximo) {
  if (valor === undefined || valor === null || valor === '') {
    return predeterminado;
  }

  const numero = Number(valor);

  if (!Number.isInteger(numero) || numero < 0 || numero > maximo) {
    throw new Error(
      'Parámetro inválido. Debe ser un entero entre 0 y ' + maximo + '.'
    );
  }

  return numero;
}

function obtenerCitasSupabase_(opciones) {
  const opcionesConsulta = opciones || {};
  const limit = normalizarEnteroSupabase_(
    opcionesConsulta.limit,
    10,
    SUPABASE_MAXIMO_LIMIT_CITAS_
  );
  const offset = normalizarEnteroSupabase_(
    opcionesConsulta.offset,
    0,
    Number.MAX_SAFE_INTEGER
  );
  const campos = [
    'id',
    'codigo',
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
  const ruta =
    'citas?select=' + campos.join(',') +
    '&order=fecha_registro.asc' +
    '&limit=' + limit +
    '&offset=' + offset;

  return supabaseRequest_(ruta, { method: 'GET' });
}

function obtenerDestinosCitasSupabase_(idsCitas) {
  const ids = Array.from(new Set(
    (idsCitas || []).filter(function(id) {
      return Boolean(id);
    })
  ));

  if (ids.length === 0) {
    return [];
  }

  const idsSerializados = ids.map(function(id) {
    return encodeURIComponent(id);
  }).join(',');
  const destinos = supabaseRequest_(
    'cita_destinos?select=cita_id,sucursal_id,orden' +
    '&cita_id=in.(' + idsSerializados + ')' +
    '&order=cita_id.asc,orden.asc',
    { method: 'GET' }
  );

  if (!destinos || destinos.length === 0) {
    return [];
  }

  const idsSucursales = Array.from(new Set(
    destinos.map(function(destino) {
      return destino.sucursal_id;
    }).filter(Boolean)
  ));
  const sucursales = supabaseRequest_(
    'sucursales?select=id,nombre&id=in.(' +
    idsSucursales.map(function(id) {
      return encodeURIComponent(id);
    }).join(',') +
    ')',
    { method: 'GET' }
  );
  const nombresSucursales = {};

  (sucursales || []).forEach(function(sucursal) {
    nombresSucursales[sucursal.id] = sucursal.nombre;
  });

  return destinos.map(function(destino) {
    return {
      cita_id: destino.cita_id,
      sucursal_id: destino.sucursal_id,
      sucursal_nombre:
        nombresSucursales[destino.sucursal_id] || null,
      orden: destino.orden
    };
  });
}

function obtenerCitasConDestinosSupabase_(opciones) {
  const citas = obtenerCitasSupabase_(opciones);
  const destinos = obtenerDestinosCitasSupabase_(
    citas.map(function(cita) {
      return cita.id;
    })
  );
  const destinosPorCita = {};

  destinos.forEach(function(destino) {
    if (!destinosPorCita[destino.cita_id]) {
      destinosPorCita[destino.cita_id] = [];
    }

    destinosPorCita[destino.cita_id].push({
      sucursal_id: destino.sucursal_id,
      sucursal_nombre: destino.sucursal_nombre,
      orden: destino.orden
    });
  });

  return citas.map(function(cita) {
    const copia = {};

    Object.keys(cita).forEach(function(campo) {
      copia[campo] = cita[campo];
    });

    copia.destinos = (destinosPorCita[cita.id] || [])
      .slice()
      .sort(function(a, b) {
        return a.orden - b.orden;
      });

    return copia;
  });
}

function probarConfiguracionSupabase() {
  obtenerConfiguracionSupabase_();

  Logger.log('SUPABASE_URL: CONFIGURADA');
  Logger.log('SUPABASE_SERVICE_ROLE_KEY: CONFIGURADA');
}

function probarLecturaCitasSupabase() {
  const citas = obtenerCitasConDestinosSupabase_({
    limit: 5,
    offset: 0
  });
  const muestra = citas.map(function(cita) {
    return {
      codigo: cita.codigo,
      legacy_id: cita.legacy_id,
      cliente: cita.cliente,
      numero_original: cita.numero_original,
      numero_normalizado: cita.numero_normalizado,
      proceso_texto: cita.proceso_texto,
      fecha_cita: cita.fecha_cita,
      hora_cita: cita.hora_cita,
      sucursal_origen_texto: cita.sucursal_origen_texto,
      sucursal_destino_texto_legacy:
        cita.sucursal_destino_texto_legacy,
      estado_codigo: cita.estado_codigo,
      destinos: cita.destinos.map(function(destino) {
        return {
          sucursal_nombre: destino.sucursal_nombre,
          orden: destino.orden
        };
      })
    };
  });

  Logger.log('SUPABASE - PRUEBA LECTURA');
  Logger.log('CITAS RECIBIDAS: ' + citas.length);
  Logger.log(JSON.stringify(muestra, null, 2));

  return muestra;
}
