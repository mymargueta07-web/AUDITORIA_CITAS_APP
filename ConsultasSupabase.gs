/**
 * Consulta paralela de citas desde Supabase.
 * No reemplaza ni invoca las consultas actuales de Google Sheets.
 */

const CONSULTAS_SUPABASE_TAMANO_PAGINA_ = 100;
const CONSULTAS_SUPABASE_MAXIMO_PAGINAS_ = 100;

function obtenerTodasCitasConDestinosSupabase_() {
  const citas = [];
  let offset = 0;

  for (
    let pagina = 0;
    pagina < CONSULTAS_SUPABASE_MAXIMO_PAGINAS_;
    pagina++
  ) {
    const lote = obtenerCitasConDestinosSupabase_({
      limit: CONSULTAS_SUPABASE_TAMANO_PAGINA_,
      offset: offset
    });

    citas.push.apply(citas, lote);

    if (lote.length < CONSULTAS_SUPABASE_TAMANO_PAGINA_) {
      return citas;
    }

    offset += CONSULTAS_SUPABASE_TAMANO_PAGINA_;
  }

  throw new Error(
    'La paginación de citas Supabase superó el máximo seguro de ' +
    CONSULTAS_SUPABASE_MAXIMO_PAGINAS_ + ' páginas.'
  );
}

function normalizarFechaFiltroConsultaSupabase_(valor) {
  const fecha = normalizarFechaCanonicaConsultaSupabase_(valor);
  const partes = fecha.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!partes) {
    throw new Error('Fecha no válida');
  }

  const anio = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);
  const esBisiesto = anio % 4 === 0 && (anio % 100 !== 0 || anio % 400 === 0);
  const diasPorMes = [
    31,
    esBisiesto ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31
  ];

  if (mes < 1 || mes > 12 || dia < 1 || dia > diasPorMes[mes - 1]) {
    throw new Error('Fecha no válida');
  }

  return fecha;
}

function obtenerCitasPorFechaConDestinosSupabase_(fechaSeleccionada) {
  const fecha = normalizarFechaFiltroConsultaSupabase_(fechaSeleccionada);
  const citas = [];
  let offset = 0;

  for (
    let pagina = 0;
    pagina < CONSULTAS_SUPABASE_MAXIMO_PAGINAS_;
    pagina++
  ) {
    const lote = obtenerCitasConDestinosSupabase_({
      fechaCita: fecha,
      limit: CONSULTAS_SUPABASE_TAMANO_PAGINA_,
      offset: offset
    });

    citas.push.apply(citas, lote);

    if (lote.length < CONSULTAS_SUPABASE_TAMANO_PAGINA_) {
      return citas;
    }

    offset += CONSULTAS_SUPABASE_TAMANO_PAGINA_;
  }

  throw new Error(
    'La paginación de citas por fecha superó el máximo seguro de ' +
    CONSULTAS_SUPABASE_MAXIMO_PAGINAS_ + ' páginas.'
  );
}

function obtenerUniversoSucursalesConsultaSupabase_() {
  const sucursales = new Set();
  let offset = 0;

  for (
    let pagina = 0;
    pagina < CONSULTAS_SUPABASE_MAXIMO_PAGINAS_;
    pagina++
  ) {
    const lote = obtenerSucursalesOrigenCitasSupabase_({
      limit: CONSULTAS_SUPABASE_TAMANO_PAGINA_,
      offset: offset
    });

    lote.forEach(function(registro) {
      const sucursal = registro.sucursal_origen_texto || '';

      if (sucursal) {
        sucursales.add(sucursal);
      }
    });

    if (lote.length < CONSULTAS_SUPABASE_TAMANO_PAGINA_) {
      return Array.from(sucursales).sort().map(function(sucursal) {
        return { sucursal: sucursal };
      });
    }

    offset += CONSULTAS_SUPABASE_TAMANO_PAGINA_;
  }

  throw new Error(
    'La paginación del universo de sucursales superó el máximo seguro de ' +
    CONSULTAS_SUPABASE_MAXIMO_PAGINAS_ + ' páginas.'
  );
}

function getCitasRawSupabase() {
  return obtenerTodasCitasConDestinosSupabase_();
}

function formatearFechaLocalConsultaSupabase_(fecha) {
  const texto = String(fecha || '').trim();

  if (!texto) {
    return '';
  }

  const partes = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!partes) {
    return texto;
  }

  return partes[3] + '/' + partes[2] + '/' + partes[1];
}

function normalizarFechaCanonicaConsultaSupabase_(valor) {
  if (!valor) {
    return '';
  }

  if (
    Object.prototype.toString.call(valor) === '[object Date]' &&
    !isNaN(valor.getTime())
  ) {
    return Utilities.formatDate(
      valor,
      Session.getScriptTimeZone(),
      'yyyy-MM-dd'
    );
  }

  const texto = String(valor).trim();

  if (!texto || texto.toUpperCase() === 'CITA ABIERTA') {
    return '';
  }

  let partes = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

  if (partes) {
    return partes[1] + '-' +
      partes[2].padStart(2, '0') + '-' +
      partes[3].padStart(2, '0');
  }

  partes = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (partes) {
    return partes[3] + '-' +
      partes[2].padStart(2, '0') + '-' +
      partes[1].padStart(2, '0');
  }

  return '';
}

function formatearTimestampConsultaSupabase_(timestamp) {
  const fecha = new Date(timestamp);

  if (isNaN(fecha.getTime())) {
    return String(timestamp || '');
  }

  return Utilities.formatDate(
    fecha,
    Session.getScriptTimeZone(),
    'dd/MM/yyyy HH:mm:ss'
  );
}

function mapCitasSupabase(citasSupabase) {
  return (citasSupabase || []).map(function(cita) {
    const esCitaAbierta = cita.cita_abierta === true;
    const fechaCompatible = esCitaAbierta
      ? 'CITA ABIERTA'
      : formatearFechaLocalConsultaSupabase_(cita.fecha_cita);
    const destinos = (cita.destinos || []).slice().sort(function(a, b) {
      return a.orden - b.orden;
    });
    const sucursalDestino = cita.sucursal_destino_texto_legacy ||
      destinos.map(function(destino) {
        return destino.sucursal_nombre;
      }).filter(Boolean).join(', ');

    return {
      // Formato compatible con RegistroCitas y posibles consumidores futuros.
      ID: cita.legacy_id || '',
      Timestamp: formatearTimestampConsultaSupabase_(cita.fecha_registro),
      Cliente: cita.cliente || '',
      Proceso: cita.proceso_texto || '',
      Numero: cita.numero_original || '',
      Precio: cita.precio_texto || '',
      Extras: cita.extras || '',
      Fecha: fechaCompatible,
      SucursalDestino: sucursalDestino || '',
      Asesor: cita.asesor_texto || '',
      Nota: cita.nota || '',
      Origen: cita.origen_texto || '',
      SucursalOrigen: cita.sucursal_origen_texto || '',
      ESTADO: cita.estado_codigo || '',
      'FECHA DE VENTA': formatearFechaLocalConsultaSupabase_(
        cita.fecha_venta
      ),
      HORA: cita.hora_cita || '',

      // Campos técnicos y objetos normalizados disponibles solo al backend.
      supabase_id: cita.id,
      source_record_key: cita.source_record_key || '',
      codigo_supabase: cita.codigo || '',
      destinos: destinos,

      // Salida consumida por Dialogo.html / JavaScript.html.
      fecha: esCitaAbierta
        ? ''
        : normalizarFechaCanonicaConsultaSupabase_(cita.fecha_cita),
      cliente: cita.cliente || '',
      proceso: cita.proceso_texto || '',
      sucursal: cita.sucursal_origen_texto || 'SIN SUCURSAL',
      oficinaVisita: sucursalDestino || 'SIN DEFINIR',
      asesor: cita.asesor_texto || 'SIN ASESOR',
      estado: cita.estado_codigo || ''
    };
  });
}

function normalizarTextoConsultaSupabase_(valor) {
  return String(valor || '').trim().toUpperCase();
}

function coincideFiltroConsultaSupabase_(valor, filtro) {
  if (filtro === undefined || filtro === null || filtro === '') {
    return true;
  }

  return normalizarTextoConsultaSupabase_(valor).indexOf(
    normalizarTextoConsultaSupabase_(filtro)
  ) !== -1;
}

function filtrarCitasSupabase_(citas, filtros) {
  const opciones = filtros || {};

  return citas.filter(function(cita) {
    return (
      coincideFiltroConsultaSupabase_(cita.Cliente, opciones.cliente) &&
      coincideFiltroConsultaSupabase_(cita.Numero, opciones.telefono) &&
      coincideFiltroConsultaSupabase_(cita.Asesor, opciones.asesor) &&
      coincideFiltroConsultaSupabase_(cita.Proceso, opciones.proceso) &&
      coincideFiltroConsultaSupabase_(
        cita.SucursalOrigen,
        opciones.sucursalOrigen
      ) &&
      coincideFiltroConsultaSupabase_(
        cita.SucursalDestino,
        opciones.sucursalDestino
      ) &&
      coincideFiltroConsultaSupabase_(cita.ESTADO, opciones.estado) &&
      (!opciones.fecha || cita.fecha === opciones.fecha)
    );
  });
}

function construirRespuestaConsultaSupabase_(
  citasFiltradas,
  universoCitas,
  fechaConsultada
) {
  const agrupadas = agruparCitas(citasFiltradas);
  const todasSucursales = Array.from(new Set(
    universoCitas.map(function(cita) {
      return cita.sucursal;
    }).filter(function(sucursal) {
      return sucursal && sucursal !== 'SIN SUCURSAL';
    })
  )).sort();
  const sucursalesConCitas = agrupadas.map(function(grupo) {
    return grupo.sucursal;
  });
  const conjuntoConCitas = new Set(sucursalesConCitas);

  return {
    ok: true,
    total: citasFiltradas.length,
    data: agrupadas,
    resumen: {
      proyecciones: citasFiltradas.length,
      totalSucursales: todasSucursales.length,
      sucursalesConCitas: conjuntoConCitas.size,
      sucursalesSinCitas: todasSucursales.length - conjuntoConCitas.size,
      listaConCitas: sucursalesConCitas,
      listaSinCitas: todasSucursales.filter(function(sucursal) {
        return !conjuntoConCitas.has(sucursal);
      }),
      fuente: 'SUPABASE',
      fechaConsultada: fechaConsultada || null
    }
  };
}

function consultarCitasSupabase(filtros) {
  try {
    const mapeadas = mapCitasSupabase(getCitasRawSupabase());
    const filtradas = filtrarCitasSupabase_(mapeadas, filtros);

    return construirRespuestaConsultaSupabase_(
      filtradas,
      mapeadas,
      filtros && filtros.fecha
    );
  } catch (error) {
    return {
      ok: false,
      mensaje: error.message || error.toString()
    };
  }
}

function getCitasByFechaSupabase(fechaSeleccionada) {
  try {
    const fecha = normalizarFechaFiltroConsultaSupabase_(fechaSeleccionada);
    const citas = mapCitasSupabase(
      obtenerCitasPorFechaConDestinosSupabase_(fecha)
    );
    const universoSucursales = obtenerUniversoSucursalesConsultaSupabase_();

    return construirRespuestaConsultaSupabase_(
      citas,
      universoSucursales,
      fecha
    );
  } catch (error) {
    return {
      ok: false,
      mensaje: error.message || error.toString()
    };
  }
}

function probarRendimientoConsultaFechaSupabase(fecha) {
  const fechaPrueba = normalizarFechaFiltroConsultaSupabase_(fecha);
  const inicio = Date.now();
  const resultado = getCitasByFechaSupabase(fechaPrueba);
  const fin = Date.now();

  Logger.log('FECHA: ' + fechaPrueba);
  Logger.log('TOTAL: ' + (resultado.ok ? resultado.total : 0));
  Logger.log('TIEMPO_MS: ' + (fin - inicio));

  return resultado;
}

function probarRendimientoConsultaFechaSupabaseManual() {
  const FECHA_PRUEBA = '2026-07-18';

  return probarRendimientoConsultaFechaSupabase(FECHA_PRUEBA);
}

function obtenerClaveComparacionSheets_(fila, mapa, filaOrigen, ss) {
  const timestamp = fila[mapa.Timestamp - 1];
  let fechaRegistro = '';

  if (
    Object.prototype.toString.call(timestamp) === '[object Date]' &&
    !isNaN(timestamp.getTime())
  ) {
    fechaRegistro = Utilities.formatDate(
      timestamp,
      Session.getScriptTimeZone(),
      "yyyy-MM-dd'T'HH:mm:ssZ"
    ).replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  }

  return fechaRegistro
    ? 'REGISTROCITAS:' + ss.getId() + ':' + filaOrigen + ':' + fechaRegistro
    : '';
}

function obtenerRegistrosComparablesSheets_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getSheetByName(HOJA_CITAS);

  if (!hoja) {
    throw new Error('No existe la hoja: ' + HOJA_CITAS);
  }

  const datos = hoja.getDataRange().getValues();
  const mapa = obtenerMapaEncabezados_(hoja);
  const requeridas = [
    'ID', 'Timestamp', 'Cliente', 'Proceso', 'Numero', 'Fecha',
    'SucursalDestino', 'Asesor', 'Origen', 'SucursalOrigen', 'ESTADO',
    'FECHA DE VENTA'
  ];

  requeridas.forEach(function(nombre) {
    obtenerColumnaObligatoria_(mapa, nombre);
  });

  return datos.slice(1).map(function(fila, indice) {
    return {
      clave: obtenerClaveComparacionSheets_(
        fila,
        mapa,
        indice + 2,
        ss
      ),
      legacy_id: String(fila[mapa.ID - 1] || ''),
      cliente: String(fila[mapa.Cliente - 1] || ''),
      numero: String(fila[mapa.Numero - 1] || ''),
      proceso: String(fila[mapa.Proceso - 1] || ''),
      fecha: normalizarFechaConsulta_(
        fila[mapa.Fecha - 1],
        Session.getScriptTimeZone()
      ),
      sucursalDestino: String(fila[mapa.SucursalDestino - 1] || ''),
      asesor: String(fila[mapa.Asesor - 1] || ''),
      origen: String(fila[mapa.Origen - 1] || ''),
      sucursalOrigen: String(fila[mapa.SucursalOrigen - 1] || ''),
      estado: String(fila[mapa.ESTADO - 1] || ''),
      fechaVenta: normalizarFechaConsulta_(
        fila[mapa['FECHA DE VENTA'] - 1],
        Session.getScriptTimeZone()
      )
    };
  });
}

function normalizarNumeroComparacionConsultaSupabase_(valor) {
  const texto = String(valor || '').trim();

  return texto === '0' ? '' : texto;
}

function compararCamposConsultaCitas_(sheets, supabase) {
  const pares = {
    cliente: [sheets.cliente, supabase.Cliente],
    numero: [
      normalizarNumeroComparacionConsultaSupabase_(sheets.numero),
      normalizarNumeroComparacionConsultaSupabase_(supabase.Numero)
    ],
    proceso: [sheets.proceso, supabase.Proceso],
    fecha: [
      sheets.fecha,
      normalizarFechaCanonicaConsultaSupabase_(supabase.Fecha)
    ],
    sucursalDestino: [sheets.sucursalDestino, supabase.SucursalDestino],
    asesor: [sheets.asesor, supabase.Asesor],
    origen: [sheets.origen, supabase.Origen],
    sucursalOrigen: [sheets.sucursalOrigen, supabase.SucursalOrigen],
    estado: [sheets.estado, supabase.ESTADO],
    fechaVenta: [
      sheets.fechaVenta,
      normalizarFechaCanonicaConsultaSupabase_(
        supabase['FECHA DE VENTA']
      )
    ]
  };
  const diferencias = {};

  Object.keys(pares).forEach(function(campo) {
    if (String(pares[campo][0] || '') !== String(pares[campo][1] || '')) {
      diferencias[campo] = true;
    }
  });

  return Object.keys(diferencias);
}

function compararConsultaCitasSheetsVsSupabase() {
  const sheets = obtenerRegistrosComparablesSheets_();
  const supabase = mapCitasSupabase(getCitasRawSupabase());
  const supabasePorClave = {};
  const usados = {};
  const diferencias = [];
  let coincidencias = 0;
  let soloSheets = 0;

  supabase.forEach(function(cita) {
    if (cita.source_record_key) {
      supabasePorClave[cita.source_record_key] = cita;
    }
  });

  sheets.forEach(function(citaSheets) {
    const citaSupabase = supabasePorClave[citaSheets.clave];

    if (!citaSupabase) {
      soloSheets++;
      return;
    }

    usados[citaSheets.clave] = true;
    const campos = compararCamposConsultaCitas_(citaSheets, citaSupabase);

    if (campos.length === 0) {
      coincidencias++;
    } else if (diferencias.length < 10) {
      diferencias.push({
        legacy_id: citaSheets.legacy_id,
        campos: campos
      });
    }
  });

  const soloSupabase = supabase.filter(function(cita) {
    return !usados[cita.source_record_key];
  }).length;
  const resultado = {
    sheetsTotal: sheets.length,
    supabaseTotal: supabase.length,
    coincidencias: coincidencias,
    diferencias: sheets.length - coincidencias - soloSheets,
    soloSheets: soloSheets,
    soloSupabase: soloSupabase,
    ejemplosDiferencias: diferencias
  };

  Logger.log('CONSULTA CITAS - COMPARACIÓN');
  Logger.log('SHEETS TOTAL: ' + resultado.sheetsTotal);
  Logger.log('SUPABASE TOTAL: ' + resultado.supabaseTotal);
  Logger.log('COINCIDENCIAS: ' + resultado.coincidencias);
  Logger.log('DIFERENCIAS: ' + resultado.diferencias);
  Logger.log('SOLO SHEETS: ' + resultado.soloSheets);
  Logger.log('SOLO SUPABASE: ' + resultado.soloSupabase);
  Logger.log(JSON.stringify(resultado.ejemplosDiferencias, null, 2));

  return resultado;
}

function probarConsultaCitasSupabase() {
  const citas = mapCitasSupabase(getCitasRawSupabase());
  const muestra = citas.slice(0, 5).map(function(cita) {
    return {
      ID: cita.ID,
      Timestamp: cita.Timestamp,
      Cliente: cita.Cliente,
      Proceso: cita.Proceso,
      Numero: cita.Numero,
      Fecha: cita.Fecha,
      SucursalDestino: cita.SucursalDestino,
      Asesor: cita.Asesor,
      Origen: cita.Origen,
      SucursalOrigen: cita.SucursalOrigen,
      ESTADO: cita.ESTADO,
      'FECHA DE VENTA': cita['FECHA DE VENTA'],
      destinos: cita.destinos.map(function(destino) {
        return {
          sucursal_nombre: destino.sucursal_nombre,
          orden: destino.orden
        };
      })
    };
  });

  Logger.log('CONSULTA CITAS SUPABASE - PRUEBA');
  Logger.log('TOTAL: ' + citas.length);
  Logger.log(JSON.stringify(muestra, null, 2));

  return muestra;
}
