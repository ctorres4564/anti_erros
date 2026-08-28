-- Sprint 5: ativação do piloto (disciplina confirmada e feedback separado).

ALTER TABLE public.analyses
    ADD COLUMN IF NOT EXISTS discipline_confirmed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.analysis_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id UUID NOT NULL UNIQUE REFERENCES public.analyses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    rating TEXT NOT NULL CHECK (rating IN ('YES', 'PARTIALLY', 'NO')),
    comment TEXT CHECK (comment IS NULL OR char_length(comment) <= 500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_analysis_feedback_owner UNIQUE (analysis_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_analysis_feedback_user_updated
    ON public.analysis_feedback(user_id, updated_at DESC);

ALTER TABLE public.analysis_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own analysis feedback" ON public.analysis_feedback;
CREATE POLICY "Users can view own analysis feedback"
    ON public.analysis_feedback FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

REVOKE ALL ON public.analysis_feedback FROM PUBLIC;
REVOKE ALL ON public.analysis_feedback FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.analysis_feedback FROM authenticated;
GRANT SELECT ON public.analysis_feedback TO authenticated;
GRANT ALL ON public.analysis_feedback TO service_role;

COMMENT ON COLUMN public.analyses.discipline IS
    'Disciplina original inferida pela IA; nunca sobrescrita pela confirmação do usuário.';
COMMENT ON COLUMN public.analyses.discipline_confirmed IS
    'Disciplina confirmada ou corrigida pelo proprietário, restrita ao enum da aplicação.';
COMMENT ON TABLE public.analysis_feedback IS
    'Feedback pós-resultado separado da saída original da análise.';
