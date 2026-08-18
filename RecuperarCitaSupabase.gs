/**
 * Implementación de Recuperar cita desde Supabase.
 * La función pública selecciona esta fuente mediante Script Property.
 */

const RECUPERAR_CITA_SUPABASE_TAMANO_PAGINA_ = 100;
const RECUPERAR_CITA_SUPABASE_MAXIMO_PAGINAS_ = 100;

function obtenerCandidatasRecuperarCitaSupabase_(numeroConsulta) {
  const compararUltimosOcho = numeroConsulta.length >= 8;
  const numeroFiltro = compararUltimosOcho
    ? numeroConsulta.slice(-8)
    : numeroConsulta;
  const candidatas = [];
  let offset = 0;

  for (
    let pagina = 0;
    pagina < RECUPERAR_CITA_SUPABASE_MAXIMO_PAGINAS_;
    pagina++
  ) {
    const opcionesPagina = {
      limit: RECUPERAR_CITA_SUPABASE_TAMANO_PAGINA_,
      offset: offset
    };
    const lote = numeroConsulta === '0'
      ? obtenerCitasRecuperarNumeroOriginalCeroSupabase_(opcionesPagina)
      : obtenerCitasRecuperarPorNumeroSupabase_(Object.assign(
        opcionesPagina,
        {
          numeroNormalizado: numeroFiltro,
          compararUltimosOcho: compararUltimosOcho
        }
      ));

    candidatas.push.apply(candidatas, lote);

    if (lote.length < RECUPERAR_CITA_SUPABASE_TAMANO_PAGINA_) {
      return candidatas.filter(function(cita) {
        return numerosCitaCoinciden_(
          numeroConsulta,
          normalizarNumeroCita_(cita.numero_original)
        );
      });
    }

    offset += RECUPERAR_CITA_SUPABASE_TAMANO_PAGINA_;
  }

  throw new Error(
    'La búsqueda de citas superó el máximo seguro de ' +
    RECUPERAR_CITA_SUPABASE_MAXIMO_PAGINAS_ + ' páginas.'
  );
}

function obtenerFilaOrigenRecuperarCitaSupabase_(sourceRecordKey) {
  const coincidencia = String(sourceRecordKey || '').match(
    /^REGISTROCITAS:[^:]+:(\d+):/
  );

  return coincidencia ? Number(coincidencia[1]) : null;
}

function ordenarCandidatasRecuperarCitaSupabase_(candidatas) {
  return (candidatas || []).map(function(cita, indice) {
    return {
      cita: cita,
      indice: indice,
      filaOrigen: obtenerFilaOrigenRecuperarCitaSupabase_(
        cita.source_record_key
      )
    };
  }).sort(function(a, b) {
    if (a.filaOrigen !== null && b.filaOrigen !== null) {
      return a.filaOrigen - b.filaOrigen;
    }

    if (a.filaOrigen !== null) {
      return -1;
    }

    if (b.filaOrigen !== null) {
      return 1;
    }

    return a.indice - b.indice;
  }).map(function(elemento) {
    return elemento.cita;
  });
}

function agruparDestinosRecuperarCitaSupabase_(destinos) {
  const destinosPorCita = {};

  (destinos || []).forEach(function(destino) {
    if (!destinosPorCita[destino.cita_id]) {
      destinosPorCita[destino.cita_id] = [];
    }

    destinosPorCita[destino.cita_id].push(destino);
  });

  Object.keys(destinosPorCita).forEach(function(citaId) {
    destinosPorCita[citaId].sort(function(a, b) {
      return Number(a.orden) - Number(b.orden);
    });
  });

  return destinosPorCita;
}

function formatearFechaRecuperarCitaSupabase_(valor) {
  const texto = String(valor || '').trim();
  const partes = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!partes) {
    return texto;
  }

  return partes[3] + '/' + partes[2] + '/' + partes[1];
}

function mapearCitaRecuperadaSupabase_(cita, destinos) {
  const sucursalDestino =
    cita.sucursal_destino_texto_legacy ||
    (destinos || []).map(function(destino) {
      return destino.sucursal_nombre;
    }).filter(Boolean).join(', ');
  const resultado = {
    id: cita.legacy_id || '',
    cliente: cita.cliente || '',
    proceso: cita.proceso_texto || '',
    numero: cita.numero_original || '',
    precio: cita.precio_texto || '',
    extras: cita.extras || '',
    fecha: cita.cita_abierta === true
      ? 'cita abierta'
      : formatearFechaRecuperarCitaSupabase_(cita.fecha_cita),
    sucursalDestino: sucursalDestino || '',
    asesor: cita.asesor_texto || '',
    nota: cita.nota || '',
    origen: cita.origen_texto || '',
    sucursalOrigen: cita.sucursal_origen_texto || '',
    estado: cita.estado_codigo || '',
    fechaVenta: formatearFechaRecuperarCitaSupabase_(cita.fecha_venta),
    hora: cita.hora_texto_original || cita.hora_cita || ''
  };

  resultado.resumen = construirResumenCitaRecuperada_(resultado);

  return resultado;
}

function buscarCitasPorNumeroSupabase_(numeroBuscado) {
  try {
    const numeroConsulta = normalizarNumeroCita_(numeroBuscado);

    if (!numeroConsulta) {
      throw new Error('Debe ingresar un número de contacto.');
    }

    const candidatas = ordenarCandidatasRecuperarCitaSupabase_(
      obtenerCandidatasRecuperarCitaSupabase_(numeroConsulta)
    );
    const destinos = obtenerDestinosCitasSupabase_(
      candidatas.map(function(cita) {
        return cita.id;
      })
    );
    const destinosPorCita = agruparDestinosRecuperarCitaSupabase_(destinos);
    const resultados = candidatas.map(function(cita) {
      return mapearCitaRecuperadaSupabase_(
        cita,
        destinosPorCita[cita.id] || []
      );
    });

    return {
      ok: true,
      total: resultados.length,
      numeroBuscado: numeroBuscado,
      resultados: resultados
    };
  } catch (error) {
    console.error(
      'Error en buscarCitasPorNumeroSupabase_:',
      error
    );

    return {
      ok: false,
      mensaje: error.message || error.toString()
    };
  }
}

function enmascararNumeroRecuperarCita_(numero) {
  const digitos = normalizarNumeroCita_(numero);

  if (digitos.length <= 4) {
    return '*'.repeat(digitos.length);
  }

  return '*'.repeat(digitos.length - 4) + digitos.slice(-4);
}

function compararRespuestasRecuperarCita_(sheets, supabase) {
  const diferencias = [];

  ['ok', 'total', 'numeroBuscado'].forEach(function(campo) {
    if (sheets[campo] !== supabase[campo]) {
      diferencias.push({ campo: campo });
    }
  });

  if (sheets.mensaje !== supabase.mensaje) {
    diferencias.push({ campo: 'mensaje' });
  }

  const resultadosSheets = sheets.resultados || [];
  const resultadosSupabase = supabase.resultados || [];
  const totalComparar = Math.max(
    resultadosSheets.length,
    resultadosSupabase.length
  );
  const campos = [
    'id',
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
    'estado',
    'fechaVenta',
    'hora',
    'resumen'
  ];

  for (let indice = 0; indice < totalComparar; indice++) {
    const citaSheets = resultadosSheets[indice];
    const citaSupabase = resultadosSupabase[indice];

    if (!citaSheets || !citaSupabase) {
      diferencias.push({
        indice: indice,
        campo: 'resultado_ausente',
        legacy_id_sheets: citaSheets ? citaSheets.id : '',
        legacy_id_supabase: citaSupabase ? citaSupabase.id : ''
      });
      continue;
    }

    campos.forEach(function(campo) {
      if (citaSheets[campo] !== citaSupabase[campo]) {
        diferencias.push({
          indice: indice,
          campo: campo,
          legacy_id_sheets: citaSheets.id,
          legacy_id_supabase: citaSupabase.id
        });
      }
    });
  }

  return diferencias;
}

function compararRecuperarCitaSheetsVsSupabase() {
  const CASOS_PRUEBA = [
    { tipo: 'UNA COINCIDENCIA', numero: '79217391' },
    { tipo: 'VARIAS COINCIDENCIAS', numero: '61090434' },
    { tipo: 'FORMATO HORA LEGACY', numero: '64973152' },
    { tipo: 'NO ENCONTRADO', numero: '99999999' },
    { tipo: 'LEGACY ESPECIAL', numero: '0' }
  ];
  const resumen = [];
  const diferenciasGlobales = [];

  Logger.log('RECUPERAR CITA - COMPARACIÓN');

  CASOS_PRUEBA.forEach(function(caso) {
    const sheets = buscarCitasPorNumeroSheets_(caso.numero);
    const supabase = buscarCitasPorNumeroSupabase_(caso.numero);
    const diferencias = compararRespuestasRecuperarCita_(
      sheets,
      supabase
    );
    diferencias.forEach(function(diferencia) {
      diferenciasGlobales.push(Object.assign({
        tipo: caso.tipo,
        numero: enmascararNumeroRecuperarCita_(caso.numero)
      }, diferencia));
    });

    Logger.log(
      'NUMERO: ' + enmascararNumeroRecuperarCita_(caso.numero)
    );
    Logger.log('SHEETS: ' + (sheets.total || 0));
    Logger.log('SUPABASE: ' + (supabase.total || 0));
    Logger.log('DIFERENCIAS: ' + diferencias.length);

    resumen.push({
      tipo: caso.tipo,
      numero: enmascararNumeroRecuperarCita_(caso.numero),
      sheets: sheets.total || 0,
      supabase: supabase.total || 0,
      diferencias: diferencias.length
    });
  });

  if (diferenciasGlobales.length > 0) {
    Logger.log(JSON.stringify(diferenciasGlobales.slice(0, 10), null, 2));
  }

  return {
    casos: resumen,
    totalDiferencias: diferenciasGlobales.length,
    muestra: diferenciasGlobales.slice(0, 10)
  };
}

function probarRecuperarCitaSupabase() {
  const NUMERO_PRUEBA = '79217391';
  const resultado = buscarCitasPorNumeroSupabase_(NUMERO_PRUEBA);
  const legacyIds = (resultado.resultados || []).map(function(cita) {
    return cita.id;
  });

  Logger.log(
    'NUMERO CONSULTADO: ' + enmascararNumeroRecuperarCita_(NUMERO_PRUEBA)
  );
  Logger.log('RESULTADOS: ' + (resultado.total || 0));
  Logger.log('LEGACY IDS ENCONTRADOS: ' + legacyIds.join(', '));

  return {
    ok: resultado.ok,
    total: resultado.total || 0,
    legacyIds: legacyIds
  };
}

function diagnosticarHoraRecuperarCita() {
  const NUMERO_PRUEBA = '64973152';
  const LEGACY_ID_PRUEBA = '515';
  const sheets = buscarCitasPorNumeroSheets_(NUMERO_PRUEBA);
  const supabase = buscarCitasPorNumeroSupabase_(NUMERO_PRUEBA);
  const citaSheets = (sheets.resultados || []).find(function(cita) {
    return String(cita.id) === LEGACY_ID_PRUEBA;
  });
  const citaSupabase = (supabase.resultados || []).find(function(cita) {
    return String(cita.id) === LEGACY_ID_PRUEBA;
  });

  Logger.log('LEGACY ID: ' + LEGACY_ID_PRUEBA);
  Logger.log('HORA SHEETS: ' + (citaSheets ? citaSheets.hora : 'NO ENCONTRADA'));
  Logger.log(
    'HORA SUPABASE: ' +
    (citaSupabase ? citaSupabase.hora : 'NO ENCONTRADA')
  );
}
