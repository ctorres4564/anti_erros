'use client';

import { useCallback, useRef, useState } from 'react';
import { AlertCircle, Loader2, Sparkles } from 'lucide-react';
import { anonymousAnalysisInputSchema } from '@/lib/ai/analysis-schema';
import { USER_ATTRIBUTIONS, USER_ATTRIBUTION_LABELS } from '@/config/ai';
import {
  AnalysisApiError,
  submitAnonymousPreview,
  submitAuthenticatedAnalysis,
} from '@/lib/analysis-api-client';
import type { AnalysisFormValues, AnalysisPreview, AnalysisView } from '@/types/analysis';
import { TurnstileWidget } from './TurnstileWidget';

type AnalysisFormMode = 'anonymous' | 'authenticated';
type FormField = keyof AnalysisFormValues;
type FieldErrors = Partial<Record<FormField, string>>;

interface AnalysisFormProps {
  mode: AnalysisFormMode;
  onPreview?: (preview: AnalysisPreview) => void;
  onAnalysis?: (analysis: AnalysisView) => void;
}

interface TextFieldProps {
  id: FormField;
  label: string;
  value: string;
  placeholder: string;
  error?: string;
  disabled: boolean;
  rows?: number;
  required?: boolean;
  onChange: (value: string) => void;
}

const formSchema = anonymousAnalysisInputSchema.omit({ turnstileToken: true });
const isLocalTurnstileBypass =
  !process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && process.env.NODE_ENV !== 'production';

const initialValues: AnalysisFormValues = {
  question: '',
  userAnswer: '',
  correctAnswer: '',
  officialExplanation: '',
  userAttribution: 'NAO_SEI',
};

function TextField({
  id,
  label,
  value,
  placeholder,
  error,
  disabled,
  rows = 3,
  required = true,
  onChange,
}: TextFieldProps) {
  const errorId = `${id}-error`;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold text-foreground">
        {label} {required ? <span className="text-destructive">*</span> : <span className="font-normal text-muted-foreground">(opcional)</span>}
      </label>
      <textarea
        id={id}
        name={id}
        value={value}
        rows={rows}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-y rounded-xl border bg-background px-3.5 py-3 text-sm leading-relaxed outline-none transition focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
      />
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function messageForError(error: unknown): string {
  if (!(error instanceof AnalysisApiError)) {
    return 'Não foi possível concluir a análise. Tente novamente.';
  }

  switch (error.kind) {
    case 'AUTH':
      return 'Sua sessão expirou. Entre novamente para continuar.';
    case 'ONBOARDING':
      return 'Conclua seu cadastro antes de enviar uma nova análise.';
    case 'LIMIT':
      return 'Seu limite de análises foi atingido. Tente novamente no próximo período disponível.';
    case 'IN_PROGRESS':
      return 'Esta análise já está em processamento. Aguarde alguns instantes.';
    case 'NETWORK':
      return error.message;
    case 'VALIDATION':
      return 'Revise os campos e a verificação de segurança antes de tentar novamente.';
    default:
      return 'O serviço está temporariamente indisponível. Seus dados não foram enviados novamente; tente mais tarde.';
  }
}

export function AnalysisForm({ mode, onPreview, onAnalysis }: AnalysisFormProps) {
  const submittingRef = useRef(false);
  const [values, setValues] = useState<AnalysisFormValues>(initialValues);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string>();
  const [turnstileReady, setTurnstileReady] = useState(
    mode === 'authenticated' || isLocalTurnstileBypass
  );
  const [turnstileResetSignal, setTurnstileResetSignal] = useState(0);

  const updateField = (field: FormField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  };

  const handleTurnstileChange = useCallback((token: string | undefined, status: 'loading' | 'verified' | 'failed') => {
    setTurnstileToken(token);
    setTurnstileReady(status === 'verified');
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current) return;

    setFormError(null);
    const parsed = formSchema.safeParse(values);
    if (!parsed.success) {
      const flattened = parsed.error.flatten().fieldErrors;
      const nextErrors: FieldErrors = {};
      for (const field of Object.keys(flattened) as FormField[]) {
        nextErrors[field] = flattened[field]?.[0];
      }
      setFieldErrors(nextErrors);
      return;
    }

    if (mode === 'anonymous' && !turnstileReady) {
      setFormError('Conclua a verificação de segurança antes de enviar.');
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      if (mode === 'anonymous') {
        const preview = await submitAnonymousPreview(parsed.data, turnstileToken);
        onPreview?.(preview);
      } else {
        const analysis = await submitAuthenticatedAnalysis(parsed.data);
        onAnalysis?.(analysis);
      }
    } catch (error) {
      setFormError(messageForError(error));
      if (mode === 'anonymous' && error instanceof AnalysisApiError && error.status === 403) {
        setTurnstileResetSignal((current) => current + 1);
      }
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate aria-busy={isSubmitting}>
      {formError ? (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{formError}</p>
        </div>
      ) : null}

      <TextField
        id="question"
        label="Questão"
        value={values.question}
        placeholder="Cole o enunciado completo da questão."
        error={fieldErrors.question}
        disabled={isSubmitting}
        rows={5}
        onChange={(value) => updateField('question', value)}
      />

      <div className="grid gap-5 md:grid-cols-2">
        <TextField
          id="userAnswer"
          label="Sua resposta"
          value={values.userAnswer}
          placeholder="O que você marcou ou respondeu?"
          error={fieldErrors.userAnswer}
          disabled={isSubmitting}
          onChange={(value) => updateField('userAnswer', value)}
        />
        <TextField
          id="correctAnswer"
          label="Resposta correta"
          value={values.correctAnswer}
          placeholder="Informe o gabarito correto."
          error={fieldErrors.correctAnswer}
          disabled={isSubmitting}
          onChange={(value) => updateField('correctAnswer', value)}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="userAttribution" className="block text-sm font-semibold text-foreground">
          Por que você acha que errou? <span className="text-destructive">*</span>
        </label>
        <select
          id="userAttribution"
          value={values.userAttribution}
          disabled={isSubmitting}
          onChange={(event) => updateField('userAttribution', event.target.value)}
          className="min-h-12 w-full rounded-xl border bg-background px-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
        >
          {USER_ATTRIBUTIONS.map((attribution) => (
            <option key={attribution} value={attribution}>
              {USER_ATTRIBUTION_LABELS[attribution]}
            </option>
          ))}
        </select>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Sua percepção é comparada depois, mas não é enviada ao modelo durante a análise.
        </p>
      </div>

      <details className="group rounded-xl border bg-muted/20 p-4">
        <summary className="cursor-pointer text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary">
          Adicionar explicação oficial (opcional)
        </summary>
        <div className="pt-4">
          <TextField
            id="officialExplanation"
            label="Explicação oficial"
            value={values.officialExplanation ?? ''}
            placeholder="Cole a justificativa do gabarito, se houver."
            error={fieldErrors.officialExplanation}
            disabled={isSubmitting}
            required={false}
            onChange={(value) => updateField('officialExplanation', value)}
          />
        </div>
      </details>

      {mode === 'anonymous' ? (
        <TurnstileWidget onChange={handleTurnstileChange} resetSignal={turnstileResetSignal} />
      ) : null}

      <p className="rounded-lg bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
        A análise indica uma causa provável com base no texto fornecido; não é um diagnóstico definitivo.
        Evite incluir nome, documento, contato ou outros dados pessoais desnecessários.
      </p>

      <button
        type="submit"
        disabled={isSubmitting || (mode === 'anonymous' && !turnstileReady)}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Analisando com cuidado…
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {mode === 'anonymous' ? 'Analisar meu erro' : 'Criar nova análise'}
          </>
        )}
      </button>
    </form>
  );
}
