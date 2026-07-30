'use strict';

/**
 * Equivalencias mínimas para resolver relaciones durante la importación.
 *
 * Las claves conservan el texto histórico tal como aparece en la exportación.
 * Los valores representan el texto canónico que debe buscarse en Supabase.
 * Los valores nuevos se incorporarán al catálogo antes de resolver sus
 * equivalencias durante la importación.
 */
const ASESORES_EQUIVALENCIAS = Object.freeze({
  'PRISCILA ARENIVAR': 'PRISCILLA ARENIVAR'
});

const PROCESOS_EQUIVALENCIAS = Object.freeze({
  'TURISMO CANADA': 'TURISMO CANADÁ',
  'RENOVACIÓN VISA USA': 'RENOVACIÓN DE VISA USA',
  'RENOVACION USA': 'RENOVACIÓN DE VISA USA',
  'RENOVASION DE VISA AMERICANA': 'RENOVACIÓN DE VISA USA',
  'VISA DE PATROCINO': 'VISA DE PATROCINIO'
});

const ORIGENES_EQUIVALENCIAS = Object.freeze({
  'ATENCIÓN AL CLIENTE': 'ATENCION AL CLIENTE',
  'Atención al cliente': 'ATENCION AL CLIENTE',
  'Línea fija': 'LINEA FIJA',
  'TIK TOK LIC MARLON': 'TIKTOK LIC MARLON',
  'TIK TOK LIVE LIC MARLON': 'TIKTOK LIVE LIC MARLON'
});

module.exports = {
  ASESORES_EQUIVALENCIAS,
  PROCESOS_EQUIVALENCIAS,
  ORIGENES_EQUIVALENCIAS
};
