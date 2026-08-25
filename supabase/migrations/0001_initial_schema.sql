-- ==============================================================================
-- MIGRAÇÃO 0001: Esquema Relacional Inicial - Anti-Erros | Método Aprender
-- ==============================================================================

-- 1. Profiles (Sincronizado com auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Aceites Legais Obrigatórios (LGPD - Termos e Privacidade)
CREATE TABLE IF NOT EXISTS public.legal_acceptances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    terms_accepted BOOLEAN NOT NULL DEFAULT true,
    privacy_accepted BOOLEAN NOT NULL DEFAULT true,
    policy_version TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Consentimento de Marketing (Append-Only Log)
CREATE TABLE IF NOT EXISTS public.marketing_consent_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    consented BOOLEAN NOT NULL,
    policy_version TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- View para consulta do estado atual de marketing com security_invoker
CREATE OR REPLACE VIEW public.v_current_marketing_consent
WITH (security_invoker = true) AS
SELECT DISTINCT ON (user_id)
    id,
    user_id,
    consented,
    policy_version,
    created_at
FROM public.marketing_consent_events
ORDER BY user_id, created_at DESC;

-- 4. Cotas Diárias de Análise
CREATE TABLE IF NOT EXISTS public.daily_quotas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    quota_date DATE NOT NULL DEFAULT CURRENT_DATE,
    daily_limit INT NOT NULL DEFAULT 5,
    used_count INT NOT NULL DEFAULT 0,
    reserved_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_user_quota_date UNIQUE(user_id, quota_date),
    CONSTRAINT chk_quota_limit CHECK (used_count + reserved_count <= daily_limit)
);

-- 5. Controle de Idempotência e Bloqueio Atômico
CREATE TABLE IF NOT EXISTS public.idempotency_locks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL,
    quota_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT NOT NULL CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED')),
    analysis_id UUID,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '120 seconds'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_user_idempotency UNIQUE(user_id, idempotency_key)
);

-- 6. Análises e Diagnósticos Pedagógicos
CREATE TABLE IF NOT EXISTS public.analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    raw_question TEXT NOT NULL,
    user_answer TEXT NOT NULL,
    correct_answer TEXT NOT NULL,
    user_hypothesis TEXT,
    error_type TEXT NOT NULL,
    root_cause_explanation TEXT NOT NULL,
    learning_gap_concept TEXT NOT NULL,
    suggested_flashcard_front TEXT,
    suggested_flashcard_back TEXT,
    is_flashcard_worthy BOOLEAN NOT NULL DEFAULT true,
    ai_confidence NUMERIC(4,3) NOT NULL,
    model_version TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 7. Telemetria e Analytics Operacional Sanitizado (Sem PII)
CREATE TABLE IF NOT EXISTS public.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    event_name TEXT NOT NULL,
    session_id TEXT,
    properties JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Índices de Desempenho
CREATE INDEX IF NOT EXISTS idx_analyses_user_created ON public.analyses(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_name_created ON public.events(event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_locks_lookup ON public.idempotency_locks(user_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_quotas_lookup ON public.daily_quotas(user_id, quota_date);
