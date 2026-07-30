# Propuesta de equivalencias para importar citas

Fuente revisada: `registro_citas_supabase_20260730_110615.json`

La exportación contiene 519 registros. Las equivalencias y los nuevos valores
canónicos de este informe ya fueron confirmados. Los textos originales deben
conservarse en los campos de texto; las equivalencias se usarán únicamente para
resolver relaciones con los catálogos.

## 1. Equivalencias confirmadas

| Entidad | Valor histórico | Valor canónico | Registros afectados |
|---|---|---|---:|
| Asesor | `PRISCILA ARENIVAR` | `PRISCILLA ARENIVAR` | 17 |
| Proceso | `TURISMO CANADA` | `TURISMO CANADÁ` | 1 |
| Proceso | `RENOVACIÓN VISA USA` | `RENOVACIÓN DE VISA USA` | 1 |
| Proceso | `RENOVACION USA` | `RENOVACIÓN DE VISA USA` | 1 |
| Proceso | `RENOVASION DE VISA AMERICANA` | `RENOVACIÓN DE VISA USA` | 1 |
| Proceso | `VISA DE PATROCINO` | `VISA DE PATROCINIO` | 1 |
| Origen | `ATENCIÓN AL CLIENTE` | `ATENCION AL CLIENTE` | 3 |
| Origen | `Atención al cliente` | `ATENCION AL CLIENTE` | 0 |
| Origen | `Línea fija` | `LINEA FIJA` | 1 |
| Origen | `TIK TOK LIC MARLON` | `TIKTOK LIC MARLON` | 1 |
| Origen | `TIK TOK LIVE LIC MARLON` | `TIKTOK LIVE LIC MARLON` | 2 |

`Atención al cliente` no aparece en esta exportación, pero se conserva como
equivalencia confirmada para importaciones históricas posteriores.

## 2. Procesos nuevos confirmados

| Valor encontrado | Registros afectados | Observación |
|---|---:|---|
| `CURRICULUM VITAE` | 1 | Agregar al catálogo |
| `ETAPA NVC` | 1 | Agregar al catálogo |
| `H2B USA / CAD` | 7 | Agregar al catálogo como proceso independiente |
| `RENOVACIÓN DE VISA USA` | 1 directo; 3 variantes (4 en total) | Agregar como canónico para sus tres variantes históricas |
| `VISA DE PATROCINIO` | 0 directos; 1 con variante | Agregar como canónico de `VISA DE PATROCINO` |

## 3. Orígenes nuevos confirmados

| Valor encontrado | Registros afectados | Observación |
|---|---:|---|
| `LINEA FIJA` | 2 directos; 1 variante (3 en total) | Agregar como canónico de `Línea fija` |
| `TIKTOK LIVE LIC MARLON` | 0 directos; 2 con variante | Agregar como canónico de `TIK TOK LIVE LIC MARLON` |

## 4. Decisiones pendientes

No quedan decisiones pendientes para los asesores, procesos u orígenes no
reconocidos en esta exportación.

## Criterio de importación recomendado

1. Conservar siempre `asesor_texto`, `proceso_texto` y `origen_texto` sin
   modificaciones.
2. Aplicar las equivalencias solo al buscar la clave foránea correspondiente.
3. Crear primero los procesos y orígenes nuevos confirmados para que las
   equivalencias puedan resolver sus claves foráneas.
4. Como protección general, si una relación no pudiera resolverse durante la
   importación, importar la cita con su texto original y dejar la clave foránea
   en `null`, sin rechazarla.
