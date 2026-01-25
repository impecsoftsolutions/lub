/*
  Rename pending_cities_master to cities_master and create compatibility view.
*/

DO $$
DECLARE
  v_relkind "char";
BEGIN
  IF to_regclass('public.cities_master') IS NOT NULL THEN
    SELECT c.relkind INTO v_relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'cities_master';

    IF v_relkind = 'r' THEN
      ALTER TABLE public.cities_master RENAME TO cities_master_legacy;
    END IF;
  END IF;
END $$;

ALTER TABLE public.pending_cities_master RENAME TO cities_master;

DROP VIEW IF EXISTS public.pending_cities_master;
CREATE VIEW public.pending_cities_master AS
SELECT * FROM public.cities_master;

GRANT SELECT ON public.pending_cities_master TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pending_cities_master TO authenticated;
