-- ==============================================================================
-- MIGRAÇÃO 0006: Atomicidade do Onboarding e Constraint de Aceites Legais
-- ==============================================================================

-- 1. Constraint de Unicidade para evitar duplicatas em retries concorrentes de aceites legais
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_legal_acceptances_user_policy'
    ) THEN
        ALTER TABLE public.legal_acceptances
        ADD CONSTRAINT uq_legal_acceptances_user_policy UNIQUE (user_id, policy_version);
    END IF;
END $$;

-- 2. Procedimento atômico de onboarding executável exclusivamente pelo backend (service_role)
CREATE OR REPLACE FUNCTION public.complete_onboarding(
    p_user_id UUID,
    p_full_name TEXT,
    p_email TEXT,
    p_policy_version TEXT,
    p_marketing_consented BOOLEAN,
    p_ip_address TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_profile public.profiles;
    v_current_marketing BOOLEAN;
BEGIN
    -- Validações básicas de segurança no banco
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'p_user_id é obrigatório';
    END IF;
    IF p_full_name IS NULL OR length(trim(p_full_name)) < 2 THEN
        RAISE EXCEPTION 'p_full_name inválido (mínimo 2 caracteres)';
    END IF;
    IF p_email IS NULL OR position('@' in p_email) = 0 THEN
        RAISE EXCEPTION 'p_email inválido';
    END IF;
    IF p_policy_version IS NULL OR length(trim(p_policy_version)) = 0 THEN
        RAISE EXCEPTION 'p_policy_version é obrigatório';
    END IF;

    -- 1. Upsert atômico no Perfil
    INSERT INTO public.profiles (id, full_name, email, created_at, updated_at)
    VALUES (
        p_user_id,
        trim(p_full_name),
        trim(lower(p_email)),
        timezone('utc'::text, now()),
        timezone('utc'::text, now())
    )
    ON CONFLICT (id) DO UPDATE
    SET
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        updated_at = timezone('utc'::text, now())
    RETURNING * INTO v_profile;

    -- 2. Registro de Aceite dos Termos e Privacidade (Idempotente)
    INSERT INTO public.legal_acceptances (
        user_id,
        terms_accepted,
        privacy_accepted,
        policy_version,
        ip_address,
        user_agent,
        created_at
    )
    VALUES (
        p_user_id,
        true,
        true,
        trim(p_policy_version),
        p_ip_address,
        p_user_agent,
        timezone('utc'::text, now())
    )
    ON CONFLICT (user_id, policy_version) DO NOTHING;

    -- 3. Registro de Consentimento de Marketing (Append-only e idempotente)
    SELECT consented INTO v_current_marketing
    FROM public.marketing_consent_events
    WHERE user_id = p_user_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_current_marketing IS NULL OR v_current_marketing <> p_marketing_consented THEN
        INSERT INTO public.marketing_consent_events (
            user_id,
            consented,
            policy_version,
            ip_address,
            user_agent,
            created_at
        )
        VALUES (
            p_user_id,
            p_marketing_consented,
            trim(p_policy_version),
            p_ip_address,
            p_user_agent,
            timezone('utc'::text, now())
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'profile_id', v_profile.id,
        'full_name', v_profile.full_name,
        'email', v_profile.email
    );
END;
$$;

-- Restrições rigorosas de execução: BLOQUEADO para PUBLIC, anon e authenticated. PERMITIDO apenas para service_role.
REVOKE EXECUTE ON FUNCTION public.complete_onboarding(UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_onboarding(UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.complete_onboarding(UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.complete_onboarding(UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT) TO service_role;
