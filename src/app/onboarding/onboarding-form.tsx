'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { onboardingSchema } from '@/lib/validation';
import { User, CheckSquare, Square, AlertCircle, Loader2 } from 'lucide-react';

export function OnboardingForm({ claimReference }: { claimReference: string | null }) {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acknowledgePrivacy, setAcknowledgePrivacy] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const validation = onboardingSchema.safeParse({
      fullName,
      acceptTerms,
      acknowledgePrivacy,
      marketingConsent,
    });

    if (!validation.success) {
      setErrorMessage(validation.error.errors[0]?.message || 'Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch('/api/onboarding', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(validation.data),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          setErrorMessage(data.error || 'Falha ao concluir o cadastro. Tente novamente.');
          return;
        }

        // Cadastro concluído com sucesso, redirecionar para a aplicação
        router.push(
          claimReference ? `/app?claim_ref=${encodeURIComponent(claimReference)}` : '/app'
        );
        router.refresh();
      } catch (err) {
        console.error('Erro ao enviar onboarding:', err);
        setErrorMessage('Erro de comunicação com o servidor. Tente novamente.');
      }
    });
  };

  const isFormValid = fullName.trim().length >= 2 && acceptTerms && acknowledgePrivacy;

  return (
    <div className="min-h-[75vh] flex items-center justify-center py-8 px-4">
      <div className="w-full max-w-lg mx-auto p-6 sm:p-8 bg-card border rounded-xl shadow-sm space-y-6">
        <div className="space-y-2 text-center">
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-semibold">
            Etapa Final
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Complete seu Cadastro</h1>
          <p className="text-sm text-muted-foreground">
            Precisamos apenas do seu nome e dos seus consentimentos legais para liberar seu acesso.
          </p>
          <p className="text-xs text-muted-foreground">
            Se você chegou por uma análise pendente, ela será recuperada após esta etapa sem novo processamento.
          </p>
        </div>

        {errorMessage && (
          <div className="p-3.5 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-3 text-destructive text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Nome Completo */}
          <div className="space-y-1.5">
            <label htmlFor="fullName" className="block text-sm font-medium text-foreground">
              Nome completo <span className="text-destructive">*</span>
            </label>
            <div className="relative">
              <input
                id="fullName"
                type="text"
                placeholder="Como deseja ser chamado(a)"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={isPending}
                required
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-50"
              />
              <User className="w-4 h-4 text-muted-foreground absolute left-3.5 top-3.5" />
            </div>
          </div>

          <div className="space-y-3.5 pt-2 border-t text-sm">
            {/* Termos de Uso (Obrigatório) */}
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                disabled={isPending}
                className="sr-only"
              />
              <div className="mt-0.5 text-primary shrink-0">
                {acceptTerms ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 text-muted-foreground" />}
              </div>
              <span className="text-xs sm:text-sm text-foreground/90">
                Li e aceito os{' '}
                <Link href="/termos" target="_blank" className="text-primary font-medium hover:underline">
                  Termos de Uso
                </Link>
                . <span className="text-destructive">*</span>
              </span>
            </label>

            {/* Política de Privacidade (Obrigatório) */}
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={acknowledgePrivacy}
                onChange={(e) => setAcknowledgePrivacy(e.target.checked)}
                disabled={isPending}
                className="sr-only"
              />
              <div className="mt-0.5 text-primary shrink-0">
                {acknowledgePrivacy ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 text-muted-foreground" />}
              </div>
              <span className="text-xs sm:text-sm text-foreground/90">
                Declaro que li a{' '}
                <Link href="/privacidade" target="_blank" className="text-primary font-medium hover:underline">
                  Política de Privacidade
                </Link>
                . <span className="text-destructive">*</span>
              </span>
            </label>

            {/* Consentimento de Marketing (Opcional, desmarcado por padrão) */}
            <label className="flex items-start gap-3 cursor-pointer select-none pt-1">
              <input
                type="checkbox"
                checked={marketingConsent}
                onChange={(e) => setMarketingConsent(e.target.checked)}
                disabled={isPending}
                className="sr-only"
              />
              <div className="mt-0.5 text-primary shrink-0">
                {marketingConsent ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 text-muted-foreground" />}
              </div>
              <span className="text-xs sm:text-sm text-muted-foreground">
                Quero receber conteúdos, novidades e ofertas do Método Aprender por e-mail. <span className="text-xs text-muted-foreground/80">(Opcional)</span>
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={isPending || !isFormValid}
            className="w-full py-3 px-4 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 mt-4"
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>CONCLUINDO CADASTRO...</span>
              </>
            ) : (
              'CONCLUIR CADASTRO'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
