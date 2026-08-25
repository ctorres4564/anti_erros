-- ==============================================================================
-- MIGRAÇÃO 0004: Função Centralizada is_admin() e Adequação de Policies
-- ==============================================================================

-- Função helper centralizada para verificação de administrador.
-- Usada por todas as policies que restringem acesso a administradores.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO service_role;

-- Adequar a policy events_select_admin para usar is_admin()
DROP POLICY IF EXISTS "events_select_admin" ON public.events;

CREATE POLICY "events_select_admin"
ON public.events
FOR SELECT
TO authenticated
USING (public.is_admin());
