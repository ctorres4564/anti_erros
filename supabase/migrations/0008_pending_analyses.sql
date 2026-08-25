-- ==============================================================================
-- MIGRAÇÃO 0008: Tabela pending_analyses, anonymous_events, colunas aditivas
-- em analyses e RPC de claim atômico com débito de cota e TTL de 24h
-- ==============================================================================

-- 1. Colunas aditivas em public.analyses para conformidade com PRD v1.2
ALTER TABLE public.analyses
    ADD COLUMN IF NOT EXISTS user_attribution TEXT,
    ADD COLUMN IF NOT EXISTS discipline TEXT,
    ADD COLUMN IF NOT EXISTS discipline_confirmed TEXT,
    ADD COLUMN IF NOT EXISTS ai_user_agreement BOOLEAN,
    ADD COLUMN IF NOT EXISTS recommended_action TEXT,
    ADD COLUMN IF NOT EXISTS latency_ms INT,
    ADD COLUMN IF NOT EXISTS user_feedback TEXT,
    ADD COLUMN IF NOT EXISTS user_feedback_attribution TEXT;

-- 2. Tabela de análises pendentes (server-only, sem escrita/leitura direta do browser)
CREATE TABLE IF NOT EXISTS public.pending_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    anonymous_id TEXT NOT NULL,
    claim_token_hash TEXT NOT NULL UNIQUE,
    question TEXT NOT NULL,
    user_answer TEXT NOT NULL,
    correct_answer TEXT NOT NULL,
    user_attribution TEXT NOT NULL,
    official_explanation TEXT,
    discipline TEXT NOT NULL,
    concept TEXT NOT NULL,
    probable_error_type TEXT NOT NULL,
    confidence NUMERIC(4,3) NOT NULL,
    reasoning_summary TEXT NOT NULL,
    recommended_action TEXT NOT NULL,
    card_action TEXT NOT NULL DEFAULT 'NO_CARD',
    suggested_flashcard_front TEXT,
    suggested_flashcard_back TEXT,
    model_version TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    latency_ms INT NOT NULL,
    ip_hmac TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CLAIMED', 'EXPIRED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
    claimed_at TIMESTAMPTZ,
    claimed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 3. Tabela de telemetria anônima (server-only)
CREATE TABLE IF NOT EXISTS public.anonymous_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    anonymous_id TEXT NOT NULL,
    event_name TEXT NOT NULL,
    pending_analysis_id UUID REFERENCES public.pending_analyses(id) ON DELETE SET NULL,
    properties JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. RLS estrito nas novas tabelas
ALTER TABLE public.pending_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anonymous_events ENABLE ROW LEVEL SECURITY;

-- Revoga qualquer acesso direto para clientes anônimos ou autenticados
REVOKE ALL ON public.pending_analyses FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.anonymous_events FROM PUBLIC, anon, authenticated;

-- Concede privilégios exclusivos para o backend (service_role)
GRANT ALL ON public.pending_analyses TO service_role;
GRANT ALL ON public.anonymous_events TO service_role;

-- 5. RPC: Claim atômico de análise pendente após autenticação
CREATE OR REPLACE FUNCTION public.claim_pending_analysis(
    p_user_id UUID,
    p_claim_token_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_pending public.pending_analyses%ROWTYPE;
    v_analysis_id UUID;
    v_quota public.daily_quotas%ROWTYPE;
    v_today DATE := CURRENT_DATE;
    v_agreement BOOLEAN;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'p_user_id é obrigatório para claim';
    END IF;
    IF p_claim_token_hash IS NULL OR length(trim(p_claim_token_hash)) = 0 THEN
        RAISE EXCEPTION 'p_claim_token_hash é obrigatório para claim';
    END IF;

    -- 1. Buscar a análise pendente
    SELECT * INTO v_pending
    FROM public.pending_analyses
    WHERE claim_token_hash = p_claim_token_hash
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'NOT_FOUND', 'message', 'Análise pendente não encontrada.');
    END IF;

    IF v_pending.status = 'CLAIMED' THEN
        RETURN jsonb_build_object('status', 'ALREADY_CLAIMED', 'message', 'Esta análise já foi resgatada.');
    END IF;

    IF v_pending.status = 'EXPIRED' OR v_pending.expires_at < timezone('utc'::text, now()) THEN
        UPDATE public.pending_analyses
        SET status = 'EXPIRED'
        WHERE id = v_pending.id;
        RETURN jsonb_build_object('status', 'EXPIRED', 'message', 'Esta análise expirou (limite de 24 horas).');
    END IF;

    -- 2. Garantir e verificar cota diária do usuário
    INSERT INTO public.daily_quotas (user_id, quota_date, daily_limit, used_count, reserved_count)
    VALUES (p_user_id, v_today, 5, 0, 0)
    ON CONFLICT (user_id, quota_date) DO NOTHING;

    SELECT * INTO v_quota
    FROM public.daily_quotas
    WHERE user_id = p_user_id AND quota_date = v_today
    FOR UPDATE;

    IF v_quota.used_count + v_quota.reserved_count >= v_quota.daily_limit THEN
        RETURN jsonb_build_object('status', 'LIMIT_REACHED', 'limit', v_quota.daily_limit);
    END IF;

    -- 3. Calcular concordância com a autopercepção
    v_agreement := (
        (v_pending.user_attribution = 'NAO_SABIA_CONTEUDO' AND v_pending.probable_error_type = 'KNOWLEDGE_GAP') OR
        (v_pending.user_attribution = 'CONFUNDI_CONCEITOS' AND v_pending.probable_error_type = 'CONCEPT_CONFUSION') OR
        (v_pending.user_attribution = 'ESQUECI_EXCECAO' AND v_pending.probable_error_type = 'EXCEPTION_MISSED') OR
        (v_pending.user_attribution = 'ERRO_APLICACAO' AND v_pending.probable_error_type = 'APPLICATION_ERROR') OR
        (v_pending.user_attribution = 'ERRO_LEITURA' AND v_pending.probable_error_type = 'READING_ERROR')
    );

    -- 4. Inserir em analyses definitivas
    INSERT INTO public.analyses (
        user_id,
        raw_question,
        user_answer,
        correct_answer,
        user_hypothesis,
        official_explanation,
        error_type,
        root_cause_explanation,
        learning_gap_concept,
        card_action,
        suggested_flashcard_front,
        suggested_flashcard_back,
        is_flashcard_worthy,
        ai_confidence,
        model_version,
        prompt_version,
        user_attribution,
        discipline,
        ai_user_agreement,
        recommended_action,
        latency_ms,
        created_at
    )
    VALUES (
        p_user_id,
        v_pending.question,
        v_pending.user_answer,
        v_pending.correct_answer,
        NULL,
        v_pending.official_explanation,
        v_pending.probable_error_type,
        v_pending.reasoning_summary,
        v_pending.concept,
        v_pending.card_action,
        v_pending.suggested_flashcard_front,
        v_pending.suggested_flashcard_back,
        (v_pending.card_action <> 'NO_CARD'),
        v_pending.confidence,
        v_pending.model_version,
        v_pending.prompt_version,
        v_pending.user_attribution,
        v_pending.discipline,
        v_agreement,
        v_pending.recommended_action,
        v_pending.latency_ms,
        timezone('utc'::text, now())
    )
    RETURNING id INTO v_analysis_id;

    -- 5. Atualizar cota
    UPDATE public.daily_quotas
    SET used_count = used_count + 1, updated_at = timezone('utc'::text, now())
    WHERE user_id = p_user_id AND quota_date = v_today;

    -- 6. Atualizar pending_analyses
    UPDATE public.pending_analyses
    SET status = 'CLAIMED',
        claimed_at = timezone('utc'::text, now()),
        claimed_by_user_id = p_user_id
    WHERE id = v_pending.id;

    -- 7. Registrar telemetria anônima de claim
    INSERT INTO public.anonymous_events (anonymous_id, event_name, pending_analysis_id, properties)
    VALUES (
        v_pending.anonymous_id,
        'pending_claimed',
        v_pending.id,
        jsonb_build_object('claimed_by_user_id', p_user_id, 'analysis_id', v_analysis_id)
    );

    RETURN jsonb_build_object(
        'status', 'CLAIMED',
        'analysis_id', v_analysis_id
    );
END;
$$;

-- Restrições estritas de privilégio para a RPC de claim
REVOKE EXECUTE ON FUNCTION public.claim_pending_analysis(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_pending_analysis(UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_pending_analysis(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pending_analysis(UUID, TEXT) TO service_role;

-- 6. RPC para limpeza e purga de análises pendentes expiradas
CREATE OR REPLACE FUNCTION public.cleanup_expired_pending_analyses()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_count INT := 0;
BEGIN
    WITH expired_rows AS (
        UPDATE public.pending_analyses
        SET status = 'EXPIRED'
        WHERE status = 'PENDING'
          AND expires_at < timezone('utc'::text, now())
        RETURNING id, anonymous_id
    )
    INSERT INTO public.anonymous_events (anonymous_id, event_name, pending_analysis_id, properties)
    SELECT anonymous_id, 'pending_expired', id, '{}'::jsonb
    FROM expired_rows;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_expired_pending_analyses() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_pending_analyses() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_pending_analyses() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_pending_analyses() TO service_role;
