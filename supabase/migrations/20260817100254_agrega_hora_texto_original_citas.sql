-- SISTEMA DE CITAS - APP PROJECT
-- Conserva la representación textual histórica de la hora sin alterar TIME.

begin;

alter table public.citas
  add column if not exists hora_texto_original text;

comment on column public.citas.hora_texto_original is
  'Representación textual histórica visible de la hora en Google Sheets para compatibilidad con datos legacy.';

commit;
