-- SISTEMA DE CITAS - APP PROJECT
-- Esquema inicial para una migración progresiva desde Google Sheets.

-- UUID aleatorios compatibles con Supabase.
create extension if not exists pgcrypto with schema extensions;

-- Mantiene updated_at sincronizado en las tablas mutables.
create or replace function public.actualizar_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Catálogo canónico de sucursales.
create table public.sucursales (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sucursales_nombre_no_vacio_check
    check (nombre = btrim(nombre) and nombre <> ''),
  constraint sucursales_tipo_check
    check (tipo in ('FISICA', 'VIRTUAL', 'CALL_CENTER'))
);

create unique index sucursales_nombre_lower_uidx
  on public.sucursales (lower(nombre));

-- Alias que resuelven nombres históricos hacia una sucursal canónica.
create table public.sucursal_aliases (
  alias text primary key,
  sucursal_id uuid not null
    references public.sucursales(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint sucursal_aliases_alias_no_vacio_check
    check (alias = btrim(alias) and alias <> '')
);

create unique index sucursal_aliases_alias_lower_uidx
  on public.sucursal_aliases (lower(alias));

-- Asesores; el nombre no es único globalmente.
create table public.asesores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activo boolean not null default true,
  nombre_legacy text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint asesores_nombre_no_vacio_check
    check (nombre = btrim(nombre) and nombre <> '')
);

-- Relación muchos a muchos entre asesores y sucursales.
create table public.asesor_sucursales (
  asesor_id uuid not null
    references public.asesores(id) on delete cascade,
  sucursal_id uuid not null
    references public.sucursales(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (asesor_id, sucursal_id)
);

create index asesor_sucursales_sucursal_id_idx
  on public.asesor_sucursales (sucursal_id);

-- Catálogo de procesos.
create table public.procesos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint procesos_nombre_no_vacio_check
    check (nombre = btrim(nombre) and nombre <> '')
);

create unique index procesos_nombre_lower_uidx
  on public.procesos (lower(nombre));

-- Catálogo de orígenes.
create table public.origenes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint origenes_nombre_no_vacio_check
    check (nombre = btrim(nombre) and nombre <> '')
);

create unique index origenes_nombre_lower_uidx
  on public.origenes (lower(nombre));

-- Catálogo contractual de estados.
create table public.estados (
  codigo text primary key,
  descripcion text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint estados_codigo_no_vacio_check
    check (codigo = btrim(codigo) and codigo <> ''),
  constraint estados_descripcion_no_vacia_check
    check (descripcion = btrim(descripcion) and descripcion <> '')
);

-- Secuencia global para el código visible de las citas.
create sequence public.citas_codigo_seq
  as bigint
  start with 1
  increment by 1
  minvalue 1
  no cycle;

-- Normaliza teléfonos salvadoreños y conserva otros prefijos internacionales.
create or replace function public.normalizar_numero_telefono(p_numero text)
returns text
language plpgsql
immutable
strict
set search_path = public
as $$
declare
  v_texto text := btrim(p_numero);
  v_digitos text;
begin
  v_digitos := regexp_replace(v_texto, '[^0-9]', '', 'g');

  if v_texto ~ '^\+503'
     and left(v_digitos, 3) = '503' then
    v_digitos := substring(v_digitos from 4);
  elsif length(v_digitos) = 11
        and left(v_digitos, 3) = '503' then
    v_digitos := right(v_digitos, 8);
  end if;

  return v_digitos;
end;
$$;

-- Tabla principal de citas.
create table public.citas (
  id uuid primary key default gen_random_uuid(),
  source_system text not null,
  legacy_id text,
  codigo text not null unique,
  fecha_registro timestamptz not null default now(),
  cliente text not null,
  numero_original text not null,
  numero_normalizado text not null,
  proceso_id uuid
    references public.procesos(id) on delete set null,
  proceso_texto text not null,
  precio_texto text not null,
  precio_monto numeric(12, 2),
  extras text,
  fecha_cita date,
  cita_abierta boolean not null default false,
  hora_cita time,
  asesor_id uuid
    references public.asesores(id) on delete set null,
  asesor_texto text not null,
  nota text,
  origen_id uuid
    references public.origenes(id) on delete set null,
  origen_texto text not null,
  sucursal_origen_id uuid
    references public.sucursales(id) on delete set null,
  sucursal_origen_texto text not null,
  sucursal_destino_texto_legacy text,
  estado_codigo text not null
    references public.estados(codigo) on delete restrict,
  fecha_venta date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint citas_source_system_no_vacio_check
    check (source_system = btrim(source_system) and source_system <> ''),
  constraint citas_codigo_numerico_check
    check (codigo ~ '^[0-9]+$'),
  constraint citas_cliente_no_vacio_check
    check (cliente = btrim(cliente) and cliente <> ''),
  constraint citas_numero_original_no_vacio_check
    check (btrim(numero_original) <> ''),
  constraint citas_numero_normalizado_digitos_check
    check (numero_normalizado ~ '^[0-9]+$'),
  constraint citas_proceso_texto_no_vacio_check
    check (btrim(proceso_texto) <> ''),
  constraint citas_precio_texto_no_vacio_check
    check (btrim(precio_texto) <> ''),
  constraint citas_asesor_texto_no_vacio_check
    check (btrim(asesor_texto) <> ''),
  constraint citas_origen_texto_no_vacio_check
    check (btrim(origen_texto) <> ''),
  constraint citas_sucursal_origen_texto_no_vacio_check
    check (btrim(sucursal_origen_texto) <> ''),
  constraint citas_fecha_segun_tipo_check
    check (
      (
        cita_abierta
        and fecha_cita is null
        and hora_cita is null
      )
      or
      (
        not cita_abierta
        and fecha_cita is not null
      )
    )
);

-- Evita repetir una misma fila legada sin impedir legacy_id nulos.
create unique index citas_source_system_legacy_id_uidx
  on public.citas (source_system, legacy_id)
  where legacy_id is not null;

-- Índices de búsqueda y reportes de citas.
create index citas_numero_normalizado_idx
  on public.citas (numero_normalizado);

create index citas_fecha_registro_idx
  on public.citas (fecha_registro);

create index citas_fecha_cita_idx
  on public.citas (fecha_cita);

create index citas_fecha_venta_idx
  on public.citas (fecha_venta);

create index citas_estado_codigo_idx
  on public.citas (estado_codigo);

create index citas_sucursal_origen_id_idx
  on public.citas (sucursal_origen_id);

create index citas_asesor_id_idx
  on public.citas (asesor_id);

create index citas_sucursal_origen_fecha_registro_idx
  on public.citas (sucursal_origen_id, fecha_registro);

create index citas_estado_fecha_venta_idx
  on public.citas (estado_codigo, fecha_venta);

create index citas_sucursal_origen_fecha_cita_idx
  on public.citas (sucursal_origen_id, fecha_cita);

-- Destinos normalizados de una cita; conserva el orden de selección.
create table public.cita_destinos (
  cita_id uuid not null
    references public.citas(id) on delete cascade,
  sucursal_id uuid not null
    references public.sucursales(id) on delete restrict,
  orden integer not null,
  created_at timestamptz not null default now(),
  primary key (cita_id, sucursal_id),
  constraint cita_destinos_cita_orden_unique
    unique (cita_id, orden),
  constraint cita_destinos_orden_positivo_check
    check (orden >= 1)
);

create index cita_destinos_sucursal_id_idx
  on public.cita_destinos (sucursal_id);

-- Asigna el código visible de forma transaccional mediante la secuencia.
create or replace function public.asignar_codigo_cita()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_numero bigint;
begin
  if new.codigo is null or btrim(new.codigo) = '' then
    v_numero := nextval('public.citas_codigo_seq');

    new.codigo := case
      when v_numero < 10000 then lpad(v_numero::text, 4, '0')
      else v_numero::text
    end;
  end if;

  return new;
end;
$$;

-- Deriva siempre el número normalizado desde el valor original.
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

create trigger citas_asignar_codigo_before_insert
before insert on public.citas
for each row
execute function public.asignar_codigo_cita();

create trigger citas_normalizar_numero_before_write
before insert or update of numero_original on public.citas
for each row
execute function public.normalizar_numero_cita();

-- Triggers de mantenimiento de updated_at.
create trigger sucursales_actualizar_updated_at
before update on public.sucursales
for each row
execute function public.actualizar_updated_at();

create trigger asesores_actualizar_updated_at
before update on public.asesores
for each row
execute function public.actualizar_updated_at();

create trigger procesos_actualizar_updated_at
before update on public.procesos
for each row
execute function public.actualizar_updated_at();

create trigger origenes_actualizar_updated_at
before update on public.origenes
for each row
execute function public.actualizar_updated_at();

create trigger estados_actualizar_updated_at
before update on public.estados
for each row
execute function public.actualizar_updated_at();

create trigger citas_actualizar_updated_at
before update on public.citas
for each row
execute function public.actualizar_updated_at();

-- Estados iniciales equivalentes a la lista actual de Google Sheets.
insert into public.estados (codigo, descripcion)
values
  ('EN ESPERA DE CITA', 'En espera de cita'),
  ('REPROGRAMADA', 'Reprogramada'),
  ('VENTA CERRADA', 'Venta cerrada'),
  ('CANCELADA', 'Cancelada'),
  ('SIN RESPUESTA', 'Sin respuesta'),
  ('BO', 'BO');

-- Destino virtual confirmado para el formulario.
insert into public.sucursales (nombre, tipo)
values ('EN LINEA', 'VIRTUAL');

-- BANK se insertará en sucursal_aliases cuando exista
-- la sucursal canónica CALL CENTER / CENTRAL.

-- RLS queda habilitado; las políticas se definirán en una migración posterior.
alter table public.sucursales
  enable row level security;

alter table public.sucursal_aliases
  enable row level security;

alter table public.asesores
  enable row level security;

alter table public.asesor_sucursales
  enable row level security;

alter table public.procesos
  enable row level security;

alter table public.origenes
  enable row level security;

alter table public.estados
  enable row level security;

alter table public.citas
  enable row level security;

alter table public.cita_destinos
  enable row level security;
