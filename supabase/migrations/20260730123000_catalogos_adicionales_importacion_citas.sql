-- SISTEMA DE CITAS - APP PROJECT
-- Catálogos canónicos adicionales requeridos por la importación histórica.

begin;

-- Procesos nuevos confirmados para las citas históricas.
insert into public.procesos (nombre, activo)
values
  ('CURRICULUM VITAE', true),
  ('ETAPA NVC', true),
  ('H2B USA / CAD', true),
  ('RENOVACIÓN DE VISA USA', true),
  ('VISA DE PATROCINIO', true)
on conflict (lower(nombre))
do update set activo = excluded.activo;

-- Orígenes nuevos confirmados para las citas históricas.
insert into public.origenes (nombre, activo)
values
  ('LINEA FIJA', true),
  ('TIKTOK LIVE LIC MARLON', true)
on conflict (lower(nombre))
do update set activo = excluded.activo;

-- Verifica que todos los valores canónicos requeridos existan y estén activos.
do $$
declare
  v_procesos_faltantes text;
  v_origenes_faltantes text;
begin
  select string_agg(requerido.nombre, ', ' order by requerido.nombre)
  into v_procesos_faltantes
  from (
    values
      ('CURRICULUM VITAE'),
      ('ETAPA NVC'),
      ('H2B USA / CAD'),
      ('RENOVACIÓN DE VISA USA'),
      ('VISA DE PATROCINIO')
  ) as requerido(nombre)
  left join public.procesos as proceso
    on lower(proceso.nombre) = lower(requerido.nombre)
   and proceso.activo = true
  where proceso.id is null;

  if v_procesos_faltantes is not null then
    raise exception
      'Faltan procesos canónicos activos para importar citas: %',
      v_procesos_faltantes;
  end if;

  select string_agg(requerido.nombre, ', ' order by requerido.nombre)
  into v_origenes_faltantes
  from (
    values
      ('LINEA FIJA'),
      ('TIKTOK LIVE LIC MARLON')
  ) as requerido(nombre)
  left join public.origenes as origen
    on lower(origen.nombre) = lower(requerido.nombre)
   and origen.activo = true
  where origen.id is null;

  if v_origenes_faltantes is not null then
    raise exception
      'Faltan orígenes canónicos activos para importar citas: %',
      v_origenes_faltantes;
  end if;
end;
$$;

commit;
