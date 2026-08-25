-- ==============================================================================
-- MIGRAÇÃO 0005: Concessão de Privilégios Base (GRANT) Ausentes nas Tabelas
-- ==============================================================================
-- Achado empírico: as migrations 0001-0004 nunca concederam privilégios de
-- tabela (SELECT/INSERT/UPDATE/DELETE) para anon/authenticated/service_role.
-- Sem esse GRANT de base, o Postgres nunca chega a avaliar as policies de RLS
-- (erro "permission denied for table ..."), inclusive para service_role.
-- Este é o menor conjunto de GRANTs necessário para que as policies já
-- definidas em 0003/0004 produzam efeito, sem alterar o desenho de acesso.

-- Achado adicional: o schema `private` (criado em 0002) nunca recebeu USAGE
-- para service_role, então nem a EXECUTE grant já existente em 0002 era
-- alcançável (erro insufficient_privilege ao resolver o schema).
GRANT USAGE ON SCHEMA private TO service_role;

-- service_role: acesso total de backend em todas as tabelas de negócio
GRANT ALL ON public.profiles, public.legal_acceptances, public.marketing_consent_events,
  public.daily_quotas, public.idempotency_locks, public.analyses, public.events
  TO service_role;
GRANT SELECT ON public.v_current_marketing_consent TO service_role;

-- authenticated: apenas o necessário para as policies "select_own"/"delete_own" existentes
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.legal_acceptances TO authenticated;
GRANT SELECT ON public.marketing_consent_events TO authenticated;
GRANT SELECT ON public.v_current_marketing_consent TO authenticated;
GRANT SELECT ON public.daily_quotas TO authenticated;
GRANT SELECT, DELETE ON public.analyses TO authenticated;
GRANT SELECT ON public.events TO authenticated;

-- idempotency_locks: nenhuma concessão para anon/authenticated (100% backend/service_role),
-- conforme desenho já documentado em 0003_rls_policies.sql.
