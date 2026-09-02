-- MIGRAÇÃO 0011: contrato analysis-v2.2 com raciocínio relatado opcional
-- Mantém official_explanation e user_hypothesis para compatibilidade histórica.

ALTER TABLE public.analyses
    ADD COLUMN IF NOT EXISTS student_reasoning TEXT;

ALTER TABLE public.pending_analyses
    ADD COLUMN IF NOT EXISTS student_reasoning TEXT;

COMMENT ON COLUMN public.analyses.student_reasoning IS
    'Relato opcional do estudante sobre como chegou à resposta; evidência não autoritativa.';
COMMENT ON COLUMN public.pending_analyses.student_reasoning IS
    'Cópia server-only do relato opcional preservada durante o fluxo anônimo e claim.';

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
        student_reasoning,
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
        v_pending.student_reasoning,
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

REVOKE EXECUTE ON FUNCTION public.claim_pending_analysis(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_pending_analysis(UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_pending_analysis(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pending_analysis(UUID, TEXT) TO service_role;
