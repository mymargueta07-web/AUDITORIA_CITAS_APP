/**
 * Capa aislada de solo lectura para Supabase.
 * No se invoca desde los flujos operativos actuales de Google Sheets.
 */

const SUPABASE_MAXIMO_LIMIT_CITAS_ = 100;
const SUPABASE_MAX_IDS_POR_FILTRO_ = 20;

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
      ' en recurso ' + obtenerRecursoRutaSupabase_(ruta) + ': ' + mensaje
    );
  }

  return contenido ? JSON.parse(contenido) : null;
}

function obtenerRecursoRutaSupabase_(ruta) {
  return String(ruta || '').split('?')[0] || 'desconocido';
}

function dividirEnLotesSupabase_(valores, tamano) {
  if (!Array.isArray(valores)) {
    return [];
  }

  if (!Number.isInteger(tamano) || tamano <= 0) {
    throw new Error('El tamaño de lote Supabase debe ser un entero positivo.');
  }

  const lotes = [];

  for (let indice = 0; indice < valores.length; indice += tamano) {
    lotes.push(valores.slice(indice, indice + tamano));
  }

  return lotes;
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
  const filtroFechaCita = opcionesConsulta.fechaCita
    ? '&fecha_cita=eq.' + encodeURIComponent(opcionesConsulta.fechaCita)
    : '';
  const filtroFechaCitaAntesDe = opcionesConsulta.fechaCitaAntesDe
    ? '&fecha_cita=lt.' + encodeURIComponent(
      opcionesConsulta.fechaCitaAntesDe
    )
    : '';
  let filtroCitaAbierta = '';

  if (Object.prototype.hasOwnProperty.call(opcionesConsulta, 'citaAbierta')) {
    if (typeof opcionesConsulta.citaAbierta !== 'boolean') {
      throw new Error('citaAbierta debe ser un valor booleano.');
    }

    filtroCitaAbierta =
      '&cita_abierta=eq.' + encodeURIComponent(opcionesConsulta.citaAbierta);
  }

  const ruta =
    'citas?select=' + campos.join(',') +
    filtroFechaCita +
    filtroFechaCitaAntesDe +
    filtroCitaAbierta +
    '&order=fecha_registro.asc,id.asc' +
    '&limit=' + limit +
    '&offset=' + offset;

  return supabaseRequest_(ruta, { method: 'GET' });
}

function obtenerSucursalesOrigenCitasSupabase_(opciones) {
  const opcionesConsulta = opciones || {};
  const limit = normalizarEnteroSupabase_(
    opcionesConsulta.limit,
    100,
    SUPABASE_MAXIMO_LIMIT_CITAS_
  );
  const offset = normalizarEnteroSupabase_(
    opcionesConsulta.offset,
    0,
    Number.MAX_SAFE_INTEGER
  );
  const ruta =
    'citas?select=sucursal_origen_texto' +
    '&order=sucursal_origen_texto.asc,id.asc' +
    '&limit=' + limit +
    '&offset=' + offset;

  return supabaseRequest_(ruta, { method: 'GET' });
}

function obtenerRegistrosReporteMensualSucursalSupabase_(opciones) {
  const opcionesConsulta = opciones || {};
  const limit = normalizarEnteroSupabase_(
    opcionesConsulta.limit,
    100,
    SUPABASE_MAXIMO_LIMIT_CITAS_
  );
  const offset = normalizarEnteroSupabase_(
    opcionesConsulta.offset,
    0,
    Number.MAX_SAFE_INTEGER
  );
  const fechaRegistroDesde = String(
    opcionesConsulta.fechaRegistroDesde || ''
  ).trim();
  const fechaRegistroAntesDe = String(
    opcionesConsulta.fechaRegistroAntesDe || ''
  ).trim();
  const sucursalOrigen = String(
    opcionesConsulta.sucursalOrigen || ''
  ).trim();

  if (!fechaRegistroDesde || !fechaRegistroAntesDe || !sucursalOrigen) {
    throw new Error(
      'La consulta mensual requiere rango de fecha y sucursal de origen.'
    );
  }

  const ruta =
    'citas?select=fecha_registro,asesor_texto,sucursal_origen_texto' +
    '&fecha_registro=gte.' + encodeURIComponent(fechaRegistroDesde) +
    '&fecha_registro=lt.' + encodeURIComponent(fechaRegistroAntesDe) +
    '&sucursal_origen_texto=eq.' + encodeURIComponent(sucursalOrigen) +
    '&order=fecha_registro.asc,id.asc' +
    '&limit=' + limit +
    '&offset=' + offset;

  return supabaseRequest_(ruta, { method: 'GET' });
}

function obtenerSucursalesCitasRegistradasReporteDiarioSupabase_(opciones) {
  const opcionesConsulta = opciones || {};
  const limit = normalizarEnteroSupabase_(
    opcionesConsulta.limit,
    100,
    SUPABASE_MAXIMO_LIMIT_CITAS_
  );
  const offset = normalizarEnteroSupabase_(
    opcionesConsulta.offset,
    0,
    Number.MAX_SAFE_INTEGER
  );
  const fechaRegistroDesde = String(
    opcionesConsulta.fechaRegistroDesde || ''
  ).trim();
  const fechaRegistroAntesDe = String(
    opcionesConsulta.fechaRegistroAntesDe || ''
  ).trim();

  if (!fechaRegistroDesde || !fechaRegistroAntesDe) {
    throw new Error(
      'La consulta diaria de citas requiere un rango de fecha_registro.'
    );
  }

  const ruta =
    'citas?select=sucursal_origen_texto' +
    '&fecha_registro=gte.' + encodeURIComponent(fechaRegistroDesde) +
    '&fecha_registro=lt.' + encodeURIComponent(fechaRegistroAntesDe) +
    '&order=fecha_registro.asc,id.asc' +
    '&limit=' + limit +
    '&offset=' + offset;

  return supabaseRequest_(ruta, { method: 'GET' });
}

function obtenerSucursalesVentasCerradasReporteDiarioSupabase_(opciones) {
  const opcionesConsulta = opciones || {};
  const limit = normalizarEnteroSupabase_(
    opcionesConsulta.limit,
    100,
    SUPABASE_MAXIMO_LIMIT_CITAS_
  );
  const offset = normalizarEnteroSupabase_(
    opcionesConsulta.offset,
    0,
    Number.MAX_SAFE_INTEGER
  );
  const fechaVenta = String(opcionesConsulta.fechaVenta || '').trim();

  if (!fechaVenta) {
    throw new Error(
      'La consulta diaria de ventas requiere una fecha_venta.'
    );
  }

  const ruta =
    'citas?select=sucursal_origen_texto' +
    '&fecha_venta=eq.' + encodeURIComponent(fechaVenta) +
    '&estado_codigo=eq.' + encodeURIComponent('VENTA CERRADA') +
    '&order=sucursal_origen_texto.asc,id.asc' +
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

  const destinos = [];

  dividirEnLotesSupabase_(ids, SUPABASE_MAX_IDS_POR_FILTRO_)
    .forEach(function(loteIdsCitas) {
      const idsSerializados = loteIdsCitas.map(function(id) {
        return encodeURIComponent(id);
      }).join(',');
      const loteDestinos = supabaseRequest_(
        'cita_destinos?select=cita_id,sucursal_id,orden' +
        '&cita_id=in.(' + idsSerializados + ')' +
        '&order=cita_id.asc,orden.asc',
        { method: 'GET' }
      );

      if (loteDestinos && loteDestinos.length > 0) {
        destinos.push.apply(destinos, loteDestinos);
      }
    });

  if (destinos.length === 0) {
    return [];
  }

  destinos.sort(function(a, b) {
    const comparacionCita = String(a.cita_id).localeCompare(String(b.cita_id));

    return comparacionCita || Number(a.orden) - Number(b.orden);
  });

  const idsSucursales = Array.from(new Set(
    destinos.map(function(destino) {
      return destino.sucursal_id;
    }).filter(Boolean)
  ));
  const sucursales = [];

  dividirEnLotesSupabase_(idsSucursales, SUPABASE_MAX_IDS_POR_FILTRO_)
    .forEach(function(loteIdsSucursales) {
      const loteSucursales = supabaseRequest_(
        'sucursales?select=id,nombre&id=in.(' +
        loteIdsSucursales.map(function(id) {
          return encodeURIComponent(id);
        }).join(',') +
        ')',
        { method: 'GET' }
      );

      if (loteSucursales && loteSucursales.length > 0) {
        sucursales.push.apply(sucursales, loteSucursales);
      }
    });
  const nombresSucursales = {};

  sucursales.forEach(function(sucursal) {
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
