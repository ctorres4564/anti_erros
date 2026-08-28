-- Garante que a trilha anônima de ativação nunca receba identificadores de usuário.
CREATE OR REPLACE FUNCTION public.sanitize_anonymous_activation_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    IF NEW.event_name IN (
        'analysis_form_started',
        'analysis_preview_completed',
        'auth_gate_shown',
        'pending_claimed'
    ) THEN
        NEW.properties := '{}'::jsonb;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sanitize_anonymous_activation_event ON public.anonymous_events;
CREATE TRIGGER trg_sanitize_anonymous_activation_event
BEFORE INSERT OR UPDATE ON public.anonymous_events
FOR EACH ROW EXECUTE FUNCTION public.sanitize_anonymous_activation_event();

REVOKE EXECUTE ON FUNCTION public.sanitize_anonymous_activation_event() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sanitize_anonymous_activation_event() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sanitize_anonymous_activation_event() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sanitize_anonymous_activation_event() TO service_role;
