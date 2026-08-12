-- SISTEMA DE CITAS - APP PROJECT
-- BANK pasa a ser una sucursal canónica y deja de ser alias de CALL CENTER.

begin;

alter table public.sucursales
  add column if not exists permite_destino boolean not null default true;

-- BANK conserva el tipo CALL_CENTER por su función histórica, pero no puede
-- utilizarse como destino.
insert into public.sucursales (
  nombre,
  tipo,
  activo,
  permite_destino
)
values (
  'BANK',
  'CALL_CENTER',
  true,
  false
)
on conflict do nothing;

update public.sucursales
set
  activo = true,
  permite_destino = false
where lower(btrim(nombre)) = lower('BANK');

update public.sucursales
set permite_destino = false
where lower(btrim(nombre)) in (
  lower('CALL CENTER / CENTRAL'),
  lower('CALL CENTER CHALATENANGO')
);

-- Elimina únicamente la antigua equivalencia BANK -> CALL CENTER / CENTRAL.
delete from public.sucursal_aliases as alias_bank
using public.sucursales as sucursal_central
where alias_bank.sucursal_id = sucursal_central.id
  and lower(btrim(alias_bank.alias)) = lower('BANK')
  and lower(btrim(sucursal_central.nombre)) =
    lower('CALL CENTER / CENTRAL');

-- Conserva relaciones existentes y agrega BANK a los seis asesores
-- confirmados por la regla de negocio.
insert into public.asesor_sucursales (
  asesor_id,
  sucursal_id
)
select
  asesor.id,
  sucursal_bank.id
from public.asesores as asesor
cross join lateral (
  select sucursal.id
  from public.sucursales as sucursal
  where lower(btrim(sucursal.nombre)) = lower('BANK')
  limit 1
) as sucursal_bank
where upper(btrim(asesor.nombre)) in (
  'MARLON DOMINGUEZ',
  'ALEJANDRA PLEITEZ',
  'ALEJANDRO QUINTANILLA',
  'CESAR MENJIVAR',
  'ARMANDO ARGUETA',
  'ORLANDO CORTEZ'
)
on conflict do nothing;

-- Repara solamente la FK de las citas cuyo texto histórico es BANK.
update public.citas as cita
set sucursal_origen_id = sucursal_bank.id
from public.sucursales as sucursal_bank
where lower(btrim(sucursal_bank.nombre)) = lower('BANK')
  and lower(btrim(cita.sucursal_origen_texto)) = lower('BANK')
  and cita.sucursal_origen_id is distinct from sucursal_bank.id;

do $$
declare
  v_bank_id uuid;
  v_central_id uuid;
  v_total integer;
begin
  select count(*)
  into v_total
  from public.sucursales
  where lower(btrim(nombre)) = lower('BANK');

  if v_total <> 1 then
    raise exception
      'BANK debe existir exactamente una vez; se encontraron % filas',
      v_total;
  end if;

  select id
  into v_bank_id
  from public.sucursales
  where lower(btrim(nombre)) = lower('BANK');

  if not exists (
    select 1
    from public.sucursales
    where id = v_bank_id
      and activo = true
      and permite_destino = false
  ) then
    raise exception 'BANK debe estar activa y no permitir destino';
  end if;

  select id
  into v_central_id
  from public.sucursales
  where lower(btrim(nombre)) = lower('CALL CENTER / CENTRAL');

  if v_central_id is null then
    raise exception 'Falta la sucursal CALL CENTER / CENTRAL';
  end if;

  if exists (
    select 1
    from public.sucursales
    where lower(btrim(nombre)) in (
      lower('CALL CENTER / CENTRAL'),
      lower('CALL CENTER CHALATENANGO')
    )
      and permite_destino is distinct from false
  ) then
    raise exception
      'Los call centers confirmados no deben permitir destino';
  end if;

  if not exists (
    select 1
    from public.sucursales
    where lower(btrim(nombre)) = lower('MERLIOT')
      and permite_destino = true
  ) then
    raise exception 'MERLIOT debe conservar permite_destino = true';
  end if;

  if exists (
    select 1
    from public.sucursal_aliases as alias_bank
    join public.sucursales as sucursal_central
      on sucursal_central.id = alias_bank.sucursal_id
    where lower(btrim(alias_bank.alias)) = lower('BANK')
      and lower(btrim(sucursal_central.nombre)) =
        lower('CALL CENTER / CENTRAL')
  ) then
    raise exception
      'Todavía existe el alias BANK -> CALL CENTER / CENTRAL';
  end if;

  if exists (
    select 1
    from public.citas
    where lower(btrim(sucursal_origen_texto)) = lower('BANK')
      and sucursal_origen_id is distinct from v_bank_id
  ) then
    raise exception
      'Hay citas BANK que no apuntan a la sucursal canónica BANK';
  end if;

  if exists (
    select 1
    from public.citas
    where lower(btrim(sucursal_origen_texto)) = lower('BANK')
      and sucursal_origen_id = v_central_id
  ) then
    raise exception
      'Hay citas BANK que todavía apuntan a CALL CENTER / CENTRAL';
  end if;

  select count(*)
  into v_total
  from (
    values
      ('MARLON DOMINGUEZ'),
      ('ALEJANDRA PLEITEZ'),
      ('ALEJANDRO QUINTANILLA'),
      ('CESAR MENJIVAR'),
      ('ARMANDO ARGUETA'),
      ('ORLANDO CORTEZ')
  ) as requerido(nombre)
  where exists (
    select 1
    from public.asesores as asesor
    join public.asesor_sucursales as relacion
      on relacion.asesor_id = asesor.id
    where upper(btrim(asesor.nombre)) = requerido.nombre
      and relacion.sucursal_id = v_bank_id
  );

  if v_total <> 6 then
    raise exception
      'Los 6 asesores confirmados deben estar relacionados con BANK; se validaron %',
      v_total;
  end if;
end;
$$;

commit;
