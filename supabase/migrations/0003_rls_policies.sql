-- ==============================================================================
-- MIGRAÇÃO 0003: Políticas de Row Level Security (RLS) - Anti-Erros
-- ==============================================================================

-- 1. Habilitação de RLS em todas as tabelas
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_consent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- 2. Tabela: profiles
-- Leitura permitida para o próprio usuário autenticado
CREATE POLICY "profiles_select_own"
ON public.profiles
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = id);

-- Escrita bloqueada para o client (Gerenciado pelo backend/triggers)
-- Nenhuma policy de INSERT, UPDATE ou DELETE para anon/authenticated

-- 3. Tabela: legal_acceptances
-- Leitura permitida para o próprio usuário autenticado
CREATE POLICY "legal_acceptances_select_own"
ON public.legal_acceptances
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

-- Inserção permitida exclusivamente via backend (service_role)

-- 4. Tabela: marketing_consent_events
-- Leitura permitida para o próprio usuário autenticado
CREATE POLICY "marketing_consent_select_own"
ON public.marketing_consent_events
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

-- Inserção permitida exclusivamente via backend (service_role)

-- 5. Tabela: daily_quotas
-- Leitura permitida para o próprio usuário autenticado (acompanhar cota restante)
CREATE POLICY "daily_quotas_select_own"
ON public.daily_quotas
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

-- Modificação e inserção permitidas exclusivamente via backend (service_role)

-- 6. Tabela: idempotency_locks
-- Totalmente isolada do cliente (Nenhuma policy de SELECT/INSERT/UPDATE para anon/authenticated)
-- Acesso 100% exclusivo do backend com service_role

-- 7. Tabela: analyses
-- Leitura de análises permitida apenas para o dono da análise
CREATE POLICY "analyses_select_own"
ON public.analyses
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

-- Exclusão de análises permitida para o dono da análise
CREATE POLICY "analyses_delete_own"
ON public.analyses
FOR DELETE
TO authenticated
USING ((SELECT auth.uid()) = user_id);

-- Inserção e alteração bloqueadas no client (Exclusivo do backend com service_role)

-- 8. Tabela: events
-- Leitura de métricas restrita a usuários administradores (via app_metadata)
CREATE POLICY "events_select_admin"
ON public.events
FOR SELECT
TO authenticated
USING (
    COALESCE(((SELECT auth.jwt()) -> 'app_metadata' ->> 'role'), '') = 'admin'
);

-- Inserção sanitizada via backend com service_role
