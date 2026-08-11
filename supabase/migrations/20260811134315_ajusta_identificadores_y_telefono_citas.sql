-- SISTEMA DE CITAS - APP PROJECT
-- Ajustes previos a la importación idempotente de RegistroCitas.

begin;

-- legacy_id conserva el valor histórico, sin imponer unicidad.
drop index if exists public.citas_source_system_legacy_id_uidx;

create index if not exists citas_source_system_legacy_id_idx
  on public.citas (source_system, legacy_id)
  where legacy_id is not null;

-- Clave técnica opcional para que futuros importadores sean idempotentes.
alter table public.citas
  add column if not exists source_record_key text;

create unique index if not exists citas_source_system_source_record_key_uidx
  on public.citas (source_system, source_record_key)
  where source_record_key is not null;

-- numero_normalizado puede quedar nulo cuando el original no contiene un
-- teléfono utilizable. El valor no nulo solo puede contener dígitos.
alter table public.citas
  alter column numero_normalizado drop not null;

alter table public.citas
  drop constraint if exists citas_numero_normalizado_digitos_check;

alter table public.citas
  add constraint citas_numero_normalizado_digitos_check
  check (
    numero_normalizado is null
    or numero_normalizado ~ '^[0-9]+$'
  );

-- Regla canónica: conserva todos los dígitos, incluido 503; los valores
-- sin dígitos o compuestos exclusivamente por ceros no son normalizables.
create or replace function public.normalizar_numero_telefono(p_numero text)
returns text
language plpgsql
immutable
strict
set search_path = public
as $$
declare
  v_digitos text;
begin
  v_digitos := regexp_replace(btrim(p_numero), '[^0-9]', '', 'g');

  if v_digitos = '' or v_digitos ~ '^0+$' then
    return null;
  end if;

  return v_digitos;
end;
$$;

-- Recalcula siempre el valor normalizado a partir del original, incluso si
-- un cliente intenta actualizar numero_normalizado directamente.
create or replace function public.normalizar_numero_cita()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.numero_normalizado :=
    public.normalizar_numero_telefono(new.numero_original);
  return new;
end;
$$;

drop trigger if exists citas_normalizar_numero_before_write on public.citas;

create trigger citas_normalizar_numero_before_write
before insert or update of numero_original, numero_normalizado on public.citas
for each row
execute function public.normalizar_numero_cita();

-- Validaciones estructurales; no insertan ni modifican citas.
do $$
declare
  v_predicado text;
begin
  if not exists (
    select 1
    from pg_class as clase
    join pg_index as indice on indice.indexrelid = clase.oid
    where clase.relname = 'citas_source_system_legacy_id_idx'
      and indice.indisunique = false
  ) then
    raise exception
      'Falta el índice no único para source_system y legacy_id';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'citas'
      and column_name = 'source_record_key'
      and is_nullable = 'YES'
  ) then
    raise exception 'source_record_key debe existir y aceptar null';
  end if;

  select pg_get_expr(indice.indpred, indice.indrelid)
  into v_predicado
  from pg_class as clase
  join pg_index as indice on indice.indexrelid = clase.oid
  where clase.relname = 'citas_source_system_source_record_key_uidx'
    and indice.indisunique;

  if v_predicado is null
     or v_predicado not like '%source_record_key IS NOT NULL%' then
    raise exception
      'Falta la unicidad parcial para source_system y source_record_key';
  end if;

  if public.normalizar_numero_telefono('+503 7123-4567') <> '50371234567' then
    raise exception 'La normalización no debe eliminar el prefijo 503';
  end if;

  if public.normalizar_numero_telefono('000-000') is not null then
    raise exception 'Un número compuesto solo por ceros debe normalizarse a null';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'citas'
      and column_name = 'numero_normalizado'
      and is_nullable = 'YES'
  ) then
    raise exception 'numero_normalizado debe aceptar null';
  end if;

  if not exists (
    select 1
    from pg_class as tabla
    join pg_attribute as atributo
      on atributo.attrelid = tabla.oid
    join pg_index as indice
      on indice.indrelid = tabla.oid
    where tabla.oid = 'public.citas'::regclass
      and atributo.attname = 'codigo'
      and atributo.attnum = any(indice.indkey)
      and indice.indisunique
  ) then
    raise exception 'codigo debe conservar un índice único';
  end if;

  if not exists (
    select 1
    from pg_trigger as disparador
    join pg_proc as funcion on funcion.oid = disparador.tgfoid
    where disparador.tgrelid = 'public.citas'::regclass
      and disparador.tgname = 'citas_asignar_codigo_before_insert'
      and funcion.proname = 'asignar_codigo_cita'
      and not disparador.tgisinternal
  ) then
    raise exception 'codigo debe conservar su trigger de generación';
  end if;
end;
$$;

commit;
