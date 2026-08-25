-- ==============================================================================
-- MIGRAÇÃO 0002: Schema Privado e RPC Atômica de Limpeza de Reservas Expiradas
-- ==============================================================================

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.cleanup_expired_reservations(target_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    rec RECORD;
BEGIN
    -- Identifica e marca todos os locks PENDING expirados como FAILED em uma única operação
    FOR rec IN
        WITH expired_locks AS (
            UPDATE public.idempotency_locks
            SET status = 'FAILED', updated_at = timezone('utc'::text, now())
            WHERE user_id = target_user_id
              AND status = 'PENDING'
              AND expires_at < timezone('utc'::text, now())
            RETURNING quota_date, 1 AS count_expired
        )
        SELECT quota_date, COUNT(*) as total_expired
        FROM expired_locks
        GROUP BY quota_date
    LOOP
        -- Estorna exatamente o montante de locks expirados da respectiva data da cota
        UPDATE public.daily_quotas
        SET reserved_count = GREATEST(0, reserved_count - rec.total_expired),
            updated_at = timezone('utc'::text, now())
        WHERE user_id = target_user_id
          AND quota_date = rec.quota_date;
    END LOOP;
END;
$$;

-- Restrição absoluta de privilégios de execução:
-- Apenas o backend autenticado com service_role pode executar
REVOKE EXECUTE ON FUNCTION private.cleanup_expired_reservations(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.cleanup_expired_reservations(UUID) TO service_role;
