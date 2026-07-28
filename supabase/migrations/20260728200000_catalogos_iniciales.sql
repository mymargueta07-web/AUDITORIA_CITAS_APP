-- SISTEMA DE CITAS - APP PROJECT
-- Catálogos iniciales exportados el 2026-07-28 desde Google Sheets.

begin;

-- Sucursales físicas y call centers del catálogo exportado.
-- EN LINEA ya fue creada como VIRTUAL en la primera migración.
insert into public.sucursales (nombre, tipo, activo)
values
  ('CALL CENTER / CENTRAL', 'CALL_CENTER', true),
  ('MERLIOT', 'FISICA', true),
  ('SANTA FE', 'FISICA', true),
  ('AGUILARES', 'FISICA', true),
  ('CIUDAD ARCE', 'FISICA', true),
  ('CHALATENANGO', 'FISICA', true),
  ('LA PALMA', 'FISICA', true),
  ('USULUTAN', 'FISICA', true),
  ('SANTA ROSA DE LIMA', 'FISICA', true),
  ('CALL CENTER CHALATENANGO', 'CALL_CENTER', true),
  ('SONSONATE', 'FISICA', true)
on conflict do nothing;

-- Valida la sucursal requerida antes de crear alias y relaciones.
do $$
begin
  if not exists (
    select 1
    from public.sucursales
    where lower(nombre) = lower('CALL CENTER / CENTRAL')
  ) then
    raise exception
      'Falta la sucursal requerida: CALL CENTER / CENTRAL';
  end if;
end;
$$;

-- BANK es un alias de CALL CENTER / CENTRAL, no una sucursal canónica.
insert into public.sucursal_aliases (alias, sucursal_id)
select
  'BANK',
  s.id
from public.sucursales as s
where lower(s.nombre) = lower('CALL CENTER / CENTRAL')
on conflict do nothing;

-- Procesos exportados, sin corregir ni normalizar sus textos.
insert into public.procesos (nombre, activo)
values
  ('H2B', true),
  ('VISA TRABAJO CANADA', true),
  ('VISA TRABAJO USA / CANADA', true),
  ('TURISMO USA', true),
  ('TURISMO MEXICO', true),
  ('TURISMO CANADÁ', true),
  ('RESIDENCIA', true),
  ('PERDON MIGRATORIOS(WAIVER)', true),
  ('FORMULARIO DE SOSTENIMIENTO', true),
  ('CARTA DE INVITACIÓN', true),
  ('ASESORIAS', true),
  ('RETIRO DE PASAPORTE', true),
  ('CITAS PROXIMAS USA', true),
  ('CITA MEXICO', true),
  ('BOLETO', true),
  ('PAQUETE TURISTICO', true),
  ('CHECK IN', true),
  ('FOTOS', true),
  ('EXÁMENES MÉDICOS', true),
  ('NOTARIZACIÓN DE DOCUMENTO', true),
  ('SOLVENCIA', true),
  ('TRADUCCIÓN DE DOCUMENTO', true),
  ('GREEN CARD', true),
  ('RENOVACIÓN DE PASAPORTE AMERICANO', true),
  ('ESCALADO', true),
  ('CITAS SERGURO SOCIAL', true),
  ('TRAMITE DE PENSION', true),
  ('COPIAS', true),
  ('ESCANEO DE DOCUMENTOS', true),
  ('ITINERARIO DE VUELO', true),
  ('TRASPASO DE CIUDADANIA', true),
  ('CARTA DE TRANSPORTACION', true),
  ('FORMULARIO DS 160', true),
  ('VISA K1', true),
  ('FORMULARIOS DE RESIDENCIA', true),
  ('ASISTENCIA DE VIAJE', true)
on conflict do nothing;

-- Orígenes exportados, sin agregar la opción especial Otro.
insert into public.origenes (nombre, activo)
values
  ('REDES SOCIALES', true),
  ('RECOMENDACION', true),
  ('TIKTOK', true),
  ('TIKTOK LIVE', true),
  ('REDES MARLON', true),
  ('TIKTOK LIC MARLON', true),
  ('PERIFONEO', true),
  ('VOLANTEO', true),
  ('INSTAGRAM', true),
  ('MESSENGER', true),
  ('ATENCION AL CLIENTE', true)
on conflict do nothing;

-- Fuente temporal determinista para los 44 asesores exportados.
create temporary table tmp_catalogo_asesores (
  orden integer primary key,
  nombre text not null,
  sucursal_json text not null,
  activo boolean not null,
  unique (nombre, sucursal_json)
) on commit drop;

insert into tmp_catalogo_asesores (
  orden,
  nombre,
  sucursal_json,
  activo
)
values
  (1, 'SANDRA ARTIGA', 'AGUILARES', true),
  (2, 'REINERY MARTINEZ', 'AGUILARES', true),
  (3, 'YAMILETH CORADO', 'AGUILARES', true),
  (4, 'JONATHAN ZELAYA', 'AGUILARES', false),
  (5, 'MARLON DOMINGUEZ', 'BANK', true),
  (6, 'ALEJANDRA PLEITEZ', 'BANK', true),
  (7, 'ALEJANDRO QUINTANILLA', 'BANK', true),
  (8, 'CESAR MENJIVAR', 'BANK', true),
  (9, 'ARMANDO ARGUETA', 'BANK', true),
  (10, 'ORLANDO CORTEZ', 'BANK', true),
  (11, 'ANDREA GARCIA', 'CALL CENTER / CENTRAL', true),
  (12, 'CINTHYA RAMIREZ', 'CALL CENTER / CENTRAL', false),
  (13, 'FELIX PEREZ', 'CALL CENTER / CENTRAL', true),
  (14, 'MARIA JOSE FIGUEROA', 'CALL CENTER / CENTRAL', false),
  (15, 'SARAI RODRIGUEZ', 'CALL CENTER / CENTRAL', true),
  (16, 'MANUEL BRIZUELA', 'CALL CENTER / CENTRAL', false),
  (17, 'KENIA GUTIERREZ', 'CALL CENTER CHALATENANGO', true),
  (18, 'ROSALY LEVERON', 'CALL CENTER CHALATENANGO', true),
  (19, 'BRENDA VALLE', 'CALL CENTER CHALATENANGO', true),
  (20, 'ADRIANA HERNANDEZ', 'CALL CENTER CHALATENANGO', true),
  (21, 'GABRIEL MENJIVAR', 'CHALATENANGO', true),
  (22, 'KENYA ALDANA', 'CHALATENANGO', true),
  (23, 'JONATHAN RODRIGUEZ', 'CHALATENANGO', true),
  (24, 'MAIRA PORTILLO', 'CHALATENANGO', true),
  (25, 'MARY GALDAMEZ', 'CHALATENANGO', true),
  (26, 'KAREN HENRIQUEZ', 'CHALATENANGO', true),
  (27, 'ALEJANDRA DIAZ', 'CIUDAD ARCE', true),
  (28, 'JOSE LOPEZ', 'CIUDAD ARCE', true),
  (29, 'KRISCIA LINARES', 'CIUDAD ARCE', true),
  (30, 'HEISEL RAMOS', 'LA PALMA', true),
  (31, 'DAYANA ESCOBAR', 'LA PALMA', false),
  (32, 'KARLA RIVAS', 'LA PALMA', true),
  (33, 'ESTELA CASTRO', 'MERLIOT', true),
  (34, 'PAOLA CARCAMO', 'MERLIOT', true),
  (35, 'ABIGAIL GUZMAN', 'MERLIOT', true),
  (36, 'ANDREA RECINOS', 'MERLIOT', false),
  (37, 'PRISCILLA ARENIVAR', 'MERLIOT', true),
  (38, 'LESLIE ROSALES', 'SANTA FE', false),
  (39, 'ISMAEL HERNANDEZ', 'SANTA FE', false),
  (40, 'CLAUDIA LOPEZ', 'SANTA FE', false),
  (41, 'JENNIFER FUENTES', 'SANTA ROSA DE LIMA', true),
  (42, 'YAQUELINE UMAÑA', 'SANTA ROSA DE LIMA', true),
  (43, 'RUTH ALVARADO', 'USULUTAN', true),
  (44, 'HECTOR PARADA', 'USULUTAN', true);

-- Confirma el contenido de la fuente y todas sus sucursales requeridas.
do $$
declare
  v_total integer;
  v_bank integer;
  v_faltantes text;
begin
  select count(*)
  into v_total
  from tmp_catalogo_asesores;

  if v_total <> 44 then
    raise exception
      'El catálogo temporal debe contener 44 asesores; contiene %',
      v_total;
  end if;

  select count(*)
  into v_bank
  from tmp_catalogo_asesores
  where sucursal_json = 'BANK';

  if v_bank <> 6 then
    raise exception
      'Se esperaban 6 asesores BANK; se encontraron %',
      v_bank;
  end if;

  select string_agg(requerida.nombre, ', ' order by requerida.nombre)
  into v_faltantes
  from (
    select distinct
      case
        when sucursal_json = 'BANK'
          then 'CALL CENTER / CENTRAL'
        else sucursal_json
      end as nombre
    from tmp_catalogo_asesores
  ) as requerida
  left join public.sucursales as s
    on s.nombre = requerida.nombre
  where s.id is null;

  if v_faltantes is not null then
    raise exception
      'Faltan sucursales requeridas para los asesores: %',
      v_faltantes;
  end if;
end;
$$;

-- Inserta cada asesor una sola vez; conserva activos e inactivos.
insert into public.asesores (
  nombre,
  activo,
  nombre_legacy
)
select
  t.nombre,
  t.activo,
  t.nombre
from tmp_catalogo_asesores as t
where not exists (
  select 1
  from public.asesores as a
  where a.nombre = t.nombre
    and a.nombre_legacy = t.nombre
)
order by t.orden;

-- Relaciona cada asesor con su sucursal; BANK usa la sucursal canónica.
insert into public.asesor_sucursales (
  asesor_id,
  sucursal_id
)
select
  asesor_resuelto.id,
  s.id
from tmp_catalogo_asesores as t
cross join lateral (
  select a.id
  from public.asesores as a
  where a.nombre = t.nombre
    and a.nombre_legacy = t.nombre
  order by a.created_at, a.id
  limit 1
) as asesor_resuelto
join public.sucursales as s
  on s.nombre = case
    when t.sucursal_json = 'BANK'
      then 'CALL CENTER / CENTRAL'
    else t.sucursal_json
  end
on conflict do nothing;

-- Validaciones finales; cualquier diferencia revierte toda la transacción.
do $$
declare
  v_total integer;
  v_inactivos integer;
  v_bank_relaciones integer;
  v_estados_incorrectos integer;
begin
  select count(*) into v_total from public.sucursales;
  if v_total <> 12 then
    raise exception
      'Se esperaban 12 sucursales; se encontraron %',
      v_total;
  end if;

  select count(*) into v_total from public.sucursal_aliases;
  if v_total <> 1 then
    raise exception
      'Se esperaba 1 alias de sucursal; se encontraron %',
      v_total;
  end if;

  select count(*) into v_total from public.procesos;
  if v_total <> 36 then
    raise exception
      'Se esperaban 36 procesos; se encontraron %',
      v_total;
  end if;

  select count(*) into v_total from public.origenes;
  if v_total <> 11 then
    raise exception
      'Se esperaban 11 orígenes; se encontraron %',
      v_total;
  end if;

  select count(*) into v_total from public.asesores;
  if v_total <> 44 then
    raise exception
      'Se esperaban 44 asesores; se encontraron %',
      v_total;
  end if;

  select count(*) into v_total from public.asesor_sucursales;
  if v_total <> 44 then
    raise exception
      'Se esperaban 44 relaciones asesor-sucursal; se encontraron %',
      v_total;
  end if;

  if exists (
    select 1
    from public.sucursales
    where lower(nombre) = lower('BANK')
  ) then
    raise exception
      'BANK no debe existir como sucursal canónica';
  end if;

  if not exists (
    select 1
    from public.sucursal_aliases as sa
    join public.sucursales as s
      on s.id = sa.sucursal_id
    where lower(sa.alias) = lower('BANK')
      and lower(s.nombre) = lower('CALL CENTER / CENTRAL')
  ) then
    raise exception
      'El alias BANK no apunta a CALL CENTER / CENTRAL';
  end if;

  select count(*)
  into v_bank_relaciones
  from tmp_catalogo_asesores as t
  join public.asesores as a
    on a.nombre = t.nombre
    and a.nombre_legacy = t.nombre
  join public.asesor_sucursales as relacion
    on relacion.asesor_id = a.id
  join public.sucursales as s
    on s.id = relacion.sucursal_id
  where t.sucursal_json = 'BANK'
    and s.nombre = 'CALL CENTER / CENTRAL';

  if v_bank_relaciones <> 6 then
    raise exception
      'Se esperaban 6 asesores BANK relacionados con CALL CENTER / CENTRAL; se encontraron %',
      v_bank_relaciones;
  end if;

  select count(*)
  into v_inactivos
  from public.asesores
  where activo = false;

  if v_inactivos <> 9 then
    raise exception
      'Se esperaban 9 asesores inactivos; se encontraron %',
      v_inactivos;
  end if;

  select count(*)
  into v_estados_incorrectos
  from tmp_catalogo_asesores as t
  join public.asesores as a
    on a.nombre = t.nombre
    and a.nombre_legacy = t.nombre
  where a.activo is distinct from t.activo;

  if v_estados_incorrectos <> 0 then
    raise exception
      'Hay % asesores cuyo estado activo no coincide con el JSON',
      v_estados_incorrectos;
  end if;
end;
$$;

commit;
