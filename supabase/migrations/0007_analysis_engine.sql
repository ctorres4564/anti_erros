-- ==============================================================================
-- MIGRAÇÃO 0007: Motor de Análise de IA — Colunas de Card/Explicação e RPCs
-- de Reserva/Conclusão/Falha de Cota (Fluxo Transacional em 2 Fases)
-- ==============================================================================

-- 1. Colunas adicionais necessárias para a Sprint 3
ALTER TABLE public.analyses
    ADD COLUMN IF NOT EXISTS official_explanation TEXT,
    ADD COLUMN IF NOT EXISTS card_action TEXT NOT NULL DEFAULT 'NO_CARD';

-- Alinha o default de is_flashcard_worthy ao default de card_action ('NO_CARD' => false),
-- para que INSERTs que não especifiquem nenhum dos dois continuem consistentes.
ALTER TABLE public.analyses
    ALTER COLUMN is_flashcard_worthy SET DEFAULT false;

-- 2. Taxonomia fechada de causa provável do erro
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_analyses_error_type'
    ) THEN
        ALTER TABLE public.analyses
        ADD CONSTRAINT chk_analyses_error_type CHECK (
            error_type IN (
                'KNOWLEDGE_GAP',
                'CONCEPT_CONFUSION',
                'EXCEPTION_MISSED',
                'APPLICATION_ERROR',
                'READING_ERROR',
                'INSUFFICIENT_INFORMATION'
            )
        );
    END IF;
END $$;

-- 3. Ações possíveis de flashcard
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_analyses_card_action'
    ) THEN
        ALTER TABLE public.analyses
        ADD CONSTRAINT chk_analyses_card_action CHECK (
            card_action IN (
                'CREATE_BASIC_CARD',
                'CREATE_DISCRIMINATION_CARD',
                'CREATE_EXCEPTION_CARD',
                'CREATE_APPLICATION_CARD',
                'NO_CARD'
            )
        );
    END IF;
END $$;

-- 4. Invariante: card_action = NO_CARD <=> sem frente/verso; CREATE_* <=> frente/verso obrigatórios
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_analyses_card_consistency'
    ) THEN
        ALTER TABLE public.analyses
        ADD CONSTRAINT chk_analyses_card_consistency CHECK (
            (card_action = 'NO_CARD' AND suggested_flashcard_front IS NULL AND suggested_flashcard_back IS NULL)
            OR
            (card_action <> 'NO_CARD' AND suggested_flashcard_front IS NOT NULL AND suggested_flashcard_back IS NOT NULL)
        );
    END IF;
END $$;

-- 5. is_flashcard_worthy deve refletir exatamente card_action (coluna mantida por compatibilidade/consulta)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_analyses_flashcard_worthy_consistency'
    ) THEN
        ALTER TABLE public.analyses
        ADD CONSTRAINT chk_analyses_flashcard_worthy_consistency CHECK (
            is_flashcard_worthy = (card_action <> 'NO_CARD')
        );
    END IF;
END $$;

-- ==============================================================================
-- 6. RPC: Reserva atômica de vaga de análise (Fase 1 — transação curta)
--    Exposta em `public` (e não em `private`) para ser alcançável via PostgREST
--    pelo backend usando o client service_role (mesmo padrão de
--    public.complete_onboarding, já homologado na Sprint 2).
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.reserve_analysis_slot(
    p_user_id UUID,
    p_idempotency_key TEXT,
    p_ttl_seconds INT DEFAULT 120
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_lock public.idempotency_locks%ROWTYPE;
    v_lock_found BOOLEAN := false;
    v_quota public.daily_quotas%ROWTYPE;
    v_today DATE := current_date;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'p_user_id é obrigatório';
    END IF;
    IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
        RAISE EXCEPTION 'p_idempotency_key é obrigatório';
    END IF;
    IF p_ttl_seconds IS NULL OR p_ttl_seconds <= 0 THEN
        p_ttl_seconds := 120;
    END IF;

    -- Mutex por (user_id, idempotency_key): "SELECT ... FOR UPDATE" não protege uma
    -- linha que ainda não existe, então duas requisições concorrentes com a MESMA
    -- chave nova poderiam ambas passar pelo bloco "v_lock_found = false" e criar
    -- duas reservas/análises. O advisory lock serializa toda a função para a mesma
    -- combinação (user, key); libera automaticamente ao fim da transação.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_idempotency_key, 0));

    -- Libera reservas expiradas do usuário antes de decidir (mecanismo já homologado na Sprint 1)
    PERFORM private.cleanup_expired_reservations(p_user_id);

    -- Trava a linha de lock existente (se houver) para decisão idempotente atômica
    SELECT * INTO v_lock
    FROM public.idempotency_locks
    WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key
    FOR UPDATE;
    v_lock_found := FOUND;

    IF v_lock_found THEN
        IF v_lock.status = 'COMPLETED' THEN
            RETURN jsonb_build_object('status', 'COMPLETED', 'lockId', v_lock.id, 'analysisId', v_lock.analysis_id);
        ELSIF v_lock.status = 'PENDING' AND v_lock.expires_at > timezone('utc'::text, now()) THEN
            RETURN jsonb_build_object('status', 'PENDING', 'lockId', v_lock.id, 'expiresAt', v_lock.expires_at);
        END IF;
        -- status = 'FAILED' (ou PENDING expirado remanescente da mesma corrida): segue para reabrir como retry
    END IF;

    -- Garante a linha de cota do dia atual
    INSERT INTO public.daily_quotas (user_id, quota_date)
    VALUES (p_user_id, v_today)
    ON CONFLICT (user_id, quota_date) DO NOTHING;

    SELECT * INTO v_quota
    FROM public.daily_quotas
    WHERE user_id = p_user_id AND quota_date = v_today
    FOR UPDATE;

    IF v_quota.used_count + v_quota.reserved_count >= v_quota.daily_limit THEN
        RETURN jsonb_build_object('status', 'LIMIT_REACHED', 'limit', v_quota.daily_limit);
    END IF;

    IF v_lock_found THEN
        UPDATE public.idempotency_locks
        SET status = 'PENDING',
            quota_date = v_today,
            analysis_id = NULL,
            expires_at = timezone('utc'::text, now()) + make_interval(secs => p_ttl_seconds),
            updated_at = timezone('utc'::text, now())
        WHERE id = v_lock.id
        RETURNING id INTO v_lock.id;
    ELSE
        INSERT INTO public.idempotency_locks (user_id, idempotency_key, quota_date, status, expires_at)
        VALUES (p_user_id, p_idempotency_key, v_today, 'PENDING', timezone('utc'::text, now()) + make_interval(secs => p_ttl_seconds))
        RETURNING id INTO v_lock.id;
    END IF;

    UPDATE public.daily_quotas
    SET reserved_count = reserved_count + 1,
        updated_at = timezone('utc'::text, now())
    WHERE user_id = p_user_id AND quota_date = v_today;

    RETURN jsonb_build_object('status', 'RESERVED', 'lockId', v_lock.id, 'quotaDate', v_today);
END;
$$;

-- ==============================================================================
-- 7. RPC: Conclusão da análise (Fase 2 — sucesso, transação curta)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.complete_analysis(
    p_user_id UUID,
    p_lock_id UUID,
    p_raw_question TEXT,
    p_user_answer TEXT,
    p_correct_answer TEXT,
    p_official_explanation TEXT,
    p_error_type TEXT,
    p_root_cause_explanation TEXT,
    p_learning_gap_concept TEXT,
    p_card_action TEXT,
    p_suggested_flashcard_front TEXT,
    p_suggested_flashcard_back TEXT,
    p_ai_confidence NUMERIC,
    p_model_version TEXT,
    p_prompt_version TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_lock public.idempotency_locks%ROWTYPE;
    v_analysis_id UUID;
BEGIN
    SELECT * INTO v_lock
    FROM public.idempotency_locks
    WHERE id = p_lock_id AND user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Lock de idempotência não encontrado para este usuário';
    END IF;

    IF v_lock.status <> 'PENDING' THEN
        RAISE EXCEPTION 'Lock de idempotência não está em estado PENDING (atual: %)', v_lock.status;
    END IF;

    IF v_lock.expires_at <= timezone('utc'::text, now()) THEN
        RAISE EXCEPTION 'Lock de idempotência expirado';
    END IF;

    INSERT INTO public.analyses (
        user_id, raw_question, user_answer, correct_answer, user_hypothesis,
        error_type, root_cause_explanation, learning_gap_concept,
        suggested_flashcard_front, suggested_flashcard_back, is_flashcard_worthy,
        card_action, official_explanation, ai_confidence, model_version, prompt_version
    ) VALUES (
        p_user_id, p_raw_question, p_user_answer, p_correct_answer, NULL,
        p_error_type, p_root_cause_explanation, p_learning_gap_concept,
        p_suggested_flashcard_front, p_suggested_flashcard_back, (p_card_action <> 'NO_CARD'),
        p_card_action, p_official_explanation, p_ai_confidence, p_model_version, p_prompt_version
    )
    RETURNING id INTO v_analysis_id;

    UPDATE public.daily_quotas
    SET reserved_count = GREATEST(0, reserved_count - 1),
        used_count = used_count + 1,
        updated_at = timezone('utc'::text, now())
    WHERE user_id = p_user_id AND quota_date = v_lock.quota_date;

    UPDATE public.idempotency_locks
    SET status = 'COMPLETED',
        analysis_id = v_analysis_id,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_lock_id;

    RETURN jsonb_build_object('analysisId', v_analysis_id);
END;
$$;

-- ==============================================================================
-- 8. RPC: Falha da análise (Fase 2 — falha/timeout, transação curta)
--    A falha nunca consome cota: apenas estorna a reserva e marca o lock.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.fail_analysis(
    p_user_id UUID,
    p_lock_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_lock public.idempotency_locks%ROWTYPE;
BEGIN
    SELECT * INTO v_lock
    FROM public.idempotency_locks
    WHERE id = p_lock_id AND user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'NOT_FOUND');
    END IF;

    IF v_lock.status = 'PENDING' THEN
        UPDATE public.idempotency_locks
        SET status = 'FAILED', updated_at = timezone('utc'::text, now())
        WHERE id = p_lock_id;

        UPDATE public.daily_quotas
        SET reserved_count = GREATEST(0, reserved_count - 1),
            updated_at = timezone('utc'::text, now())
        WHERE user_id = p_user_id AND quota_date = v_lock.quota_date;
    END IF;

    RETURN jsonb_build_object('status', 'FAILED');
END;
$$;

-- ==============================================================================
-- 9. Privilégios: exclusivos de service_role, revogados de PUBLIC/anon/authenticated
-- ==============================================================================
REVOKE EXECUTE ON FUNCTION public.reserve_analysis_slot(UUID, TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_analysis_slot(UUID, TEXT, INT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.complete_analysis(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_analysis(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.fail_analysis(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_analysis(UUID, UUID) TO service_role;
