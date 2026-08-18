-- SISTEMA DE CITAS - APP PROJECT
-- Corrige la resolución de nombres entre columnas SQL y variables OUT del RPC.

begin;

create or replace function public.insertar_cita_con_destinos(
  p_cita jsonb,
  p_destinos uuid[]
)
returns table (
  id uuid,
  codigo text,
  source_record_key text,
  destinos_insertados integer,
  reutilizada boolean
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_cita_id uuid;
  v_codigo text;
  v_source_record_key text;
  v_insertada boolean := false;
  v_destinos_existentes uuid[];
  v_destinos_solicitados uuid[] := coalesce(p_destinos, array[]::uuid[]);
  v_total_destinos integer;
begin
  if p_cita is null or jsonb_typeof(p_cita) <> 'object' then
    raise exception 'p_cita debe ser un objeto JSON';
  end if;

  if nullif(btrim(p_cita ->> 'source_system'), '') is null then
    raise exception 'source_system es obligatorio';
  end if;

  if nullif(btrim(p_cita ->> 'source_record_key'), '') is null then
    raise exception 'source_record_key es obligatorio';
  end if;

  if nullif(btrim(p_cita ->> 'legacy_id'), '') is null then
    raise exception 'legacy_id es obligatorio';
  end if;

  if nullif(btrim(p_cita ->> 'fecha_registro'), '') is null then
    raise exception 'fecha_registro es obligatorio';
  end if;

  if nullif(btrim(p_cita ->> 'cliente'), '') is null then
    raise exception 'cliente es obligatorio';
  end if;

  if nullif(btrim(p_cita ->> 'numero_original'), '') is null then
    raise exception 'numero_original es obligatorio';
  end if;

  if nullif(btrim(p_cita ->> 'proceso_texto'), '') is null then
    raise exception 'proceso_texto es obligatorio';
  end if;

  if nullif(btrim(p_cita ->> 'precio_texto'), '') is null then
    raise exception 'precio_texto es obligatorio';
  end if;

  if nullif(btrim(p_cita ->> 'asesor_texto'), '') is null then
    raise exception 'asesor_texto es obligatorio';
  end if;

  if nullif(btrim(p_cita ->> 'origen_texto'), '') is null then
    raise exception 'origen_texto es obligatorio';
  end if;

  if nullif(btrim(p_cita ->> 'sucursal_origen_texto'), '') is null then
    raise exception 'sucursal_origen_texto es obligatorio';
  end if;

  if nullif(btrim(p_cita ->> 'sucursal_destino_texto_legacy'), '') is null then
    raise exception 'sucursal_destino_texto_legacy es obligatorio';
  end if;

  if nullif(btrim(p_cita ->> 'estado_codigo'), '') is null then
    raise exception 'estado_codigo es obligatorio';
  end if;

  if nullif(btrim(p_cita ->> 'proceso_id'), '') is null then
    raise exception 'proceso_id es obligatorio';
  end if;

  if nullif(btrim(p_cita ->> 'origen_id'), '') is null then
    raise exception 'origen_id es obligatorio';
  end if;

  if nullif(btrim(p_cita ->> 'asesor_id'), '') is null then
    raise exception 'asesor_id es obligatorio';
  end if;

  if nullif(btrim(p_cita ->> 'sucursal_origen_id'), '') is null then
    raise exception 'sucursal_origen_id es obligatorio';
  end if;

  if (p_cita ->> 'numero_normalizado') is distinct from
     public.normalizar_numero_telefono(p_cita ->> 'numero_original') then
    raise exception 'numero_normalizado no corresponde a numero_original';
  end if;

  if not exists (
       select 1
       from public.procesos as proceso
       where proceso.id = (p_cita ->> 'proceso_id')::uuid
         and proceso.activo = true
  ) then
    raise exception 'proceso_id no existe o está inactivo';
  end if;

  if not exists (
       select 1
       from public.origenes as origen
       where origen.id = (p_cita ->> 'origen_id')::uuid
         and origen.activo = true
  ) then
    raise exception 'origen_id no existe o está inactivo';
  end if;

  if not exists (
       select 1
       from public.asesores as asesor
       where asesor.id = (p_cita ->> 'asesor_id')::uuid
         and asesor.activo = true
  ) then
    raise exception 'asesor_id no existe o está inactivo';
  end if;

  if not exists (
       select 1
       from public.sucursales as sucursal
       where sucursal.id = (p_cita ->> 'sucursal_origen_id')::uuid
         and sucursal.activo = true
  ) then
    raise exception 'sucursal_origen_id no existe o está inactiva';
  end if;

  if not exists (
       select 1
       from public.asesor_sucursales as relacion
       where relacion.asesor_id = (p_cita ->> 'asesor_id')::uuid
         and relacion.sucursal_id =
           (p_cita ->> 'sucursal_origen_id')::uuid
  ) then
    raise exception 'asesor_id no pertenece a sucursal_origen_id';
  end if;

  if not exists (
    select 1
    from public.estados as estado
    where estado.codigo = p_cita ->> 'estado_codigo'
      and estado.activo = true
  ) then
    raise exception 'estado_codigo no existe o está inactivo';
  end if;

  if cardinality(v_destinos_solicitados) = 0 then
    raise exception 'Debe existir al menos una sucursal destino';
  end if;

  if exists (
    select 1
    from unnest(v_destinos_solicitados) as destino(sucursal_id)
    where destino.sucursal_id is null
  ) then
    raise exception 'La lista de destinos contiene UUID nulo';
  end if;

  if (
    select count(*)
    from unnest(v_destinos_solicitados) as destino(sucursal_id)
  ) <> (
    select count(distinct destino.sucursal_id)
    from unnest(v_destinos_solicitados) as destino(sucursal_id)
  ) then
    raise exception 'La lista de destinos contiene sucursales repetidas';
  end if;

  if exists (
    select 1
    from unnest(v_destinos_solicitados) as destino(sucursal_id)
    left join public.sucursales as sucursal
      on sucursal.id = destino.sucursal_id
    where sucursal.id is null
       or sucursal.activo is distinct from true
       or sucursal.permite_destino is distinct from true
  ) then
    raise exception 'Existe una sucursal destino inexistente o no habilitada';
  end if;

  insert into public.citas (
    source_system,
    source_record_key,
    legacy_id,
    fecha_registro,
    cliente,
    numero_original,
    numero_normalizado,
    proceso_id,
    proceso_texto,
    precio_texto,
    precio_monto,
    extras,
    fecha_cita,
    cita_abierta,
    hora_cita,
    hora_texto_original,
    asesor_id,
    asesor_texto,
    nota,
    origen_id,
    origen_texto,
    sucursal_origen_id,
    sucursal_origen_texto,
    sucursal_destino_texto_legacy,
    estado_codigo,
    fecha_venta
  )
  values (
    btrim(p_cita ->> 'source_system'),
    btrim(p_cita ->> 'source_record_key'),
    nullif(p_cita ->> 'legacy_id', ''),
    (p_cita ->> 'fecha_registro')::timestamptz,
    p_cita ->> 'cliente',
    p_cita ->> 'numero_original',
    p_cita ->> 'numero_normalizado',
    nullif(p_cita ->> 'proceso_id', '')::uuid,
    p_cita ->> 'proceso_texto',
    p_cita ->> 'precio_texto',
    nullif(p_cita ->> 'precio_monto', '')::numeric,
    p_cita ->> 'extras',
    nullif(p_cita ->> 'fecha_cita', '')::date,
    coalesce((p_cita ->> 'cita_abierta')::boolean, false),
    nullif(p_cita ->> 'hora_cita', '')::time,
    p_cita ->> 'hora_texto_original',
    nullif(p_cita ->> 'asesor_id', '')::uuid,
    p_cita ->> 'asesor_texto',
    p_cita ->> 'nota',
    nullif(p_cita ->> 'origen_id', '')::uuid,
    p_cita ->> 'origen_texto',
    nullif(p_cita ->> 'sucursal_origen_id', '')::uuid,
    p_cita ->> 'sucursal_origen_texto',
    p_cita ->> 'sucursal_destino_texto_legacy',
    p_cita ->> 'estado_codigo',
    nullif(p_cita ->> 'fecha_venta', '')::date
  )
  on conflict (source_system, source_record_key)
    where source_record_key is not null
  do nothing
  returning citas.id, citas.codigo, citas.source_record_key
  into v_cita_id, v_codigo, v_source_record_key;

  if v_cita_id is not null then
    v_insertada := true;

    insert into public.cita_destinos (
      cita_id,
      sucursal_id,
      orden
    )
    select
      v_cita_id,
      destino.sucursal_id,
      destino.orden::integer
    from unnest(v_destinos_solicitados)
      with ordinality as destino(sucursal_id, orden);
  else
    select cita.id, cita.codigo, cita.source_record_key
    into v_cita_id, v_codigo, v_source_record_key
    from public.citas as cita
    where cita.source_system = btrim(p_cita ->> 'source_system')
      and cita.source_record_key = btrim(p_cita ->> 'source_record_key');

    if v_cita_id is null then
      raise exception 'No se pudo insertar ni recuperar la cita idempotente';
    end if;

    if not exists (
      select 1
      from public.citas as cita
      where cita.id = v_cita_id
        and cita.legacy_id is not distinct from nullif(p_cita ->> 'legacy_id', '')
        and cita.fecha_registro is not distinct from
          (p_cita ->> 'fecha_registro')::timestamptz
        and cita.cliente is not distinct from p_cita ->> 'cliente'
        and cita.numero_original is not distinct from p_cita ->> 'numero_original'
        and cita.numero_normalizado is not distinct from
          p_cita ->> 'numero_normalizado'
        and cita.proceso_id is not distinct from
          nullif(p_cita ->> 'proceso_id', '')::uuid
        and cita.proceso_texto is not distinct from p_cita ->> 'proceso_texto'
        and cita.precio_texto is not distinct from p_cita ->> 'precio_texto'
        and cita.precio_monto is not distinct from
          nullif(p_cita ->> 'precio_monto', '')::numeric
        and cita.extras is not distinct from p_cita ->> 'extras'
        and cita.fecha_cita is not distinct from
          nullif(p_cita ->> 'fecha_cita', '')::date
        and cita.cita_abierta is not distinct from
          coalesce((p_cita ->> 'cita_abierta')::boolean, false)
        and cita.hora_cita is not distinct from
          nullif(p_cita ->> 'hora_cita', '')::time
        and cita.hora_texto_original is not distinct from
          p_cita ->> 'hora_texto_original'
        and cita.asesor_id is not distinct from
          nullif(p_cita ->> 'asesor_id', '')::uuid
        and cita.asesor_texto is not distinct from p_cita ->> 'asesor_texto'
        and cita.nota is not distinct from p_cita ->> 'nota'
        and cita.origen_id is not distinct from
          nullif(p_cita ->> 'origen_id', '')::uuid
        and cita.origen_texto is not distinct from p_cita ->> 'origen_texto'
        and cita.sucursal_origen_id is not distinct from
          nullif(p_cita ->> 'sucursal_origen_id', '')::uuid
        and cita.sucursal_origen_texto is not distinct from
          p_cita ->> 'sucursal_origen_texto'
        and cita.sucursal_destino_texto_legacy is not distinct from
          p_cita ->> 'sucursal_destino_texto_legacy'
        and cita.estado_codigo is not distinct from p_cita ->> 'estado_codigo'
        and cita.fecha_venta is not distinct from
          nullif(p_cita ->> 'fecha_venta', '')::date
    ) then
      raise exception 'source_record_key ya existe con un payload diferente';
    end if;
  end if;

  select coalesce(
    array_agg(destino.sucursal_id order by destino.orden),
    array[]::uuid[]
  )
  into v_destinos_existentes
  from public.cita_destinos as destino
  where destino.cita_id = v_cita_id;

  if v_destinos_existentes is distinct from v_destinos_solicitados then
    raise exception 'source_record_key ya existe con destinos diferentes';
  end if;

  v_total_destinos := cardinality(v_destinos_existentes);

  return query
  select
    v_cita_id,
    v_codigo,
    v_source_record_key,
    v_total_destinos,
    not v_insertada;
end;
$$;

revoke all on function public.insertar_cita_con_destinos(jsonb, uuid[])
  from public, anon, authenticated;

grant execute on function public.insertar_cita_con_destinos(jsonb, uuid[])
  to service_role;

commit;
