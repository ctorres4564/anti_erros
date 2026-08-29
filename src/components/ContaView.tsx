'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { updateProfileSchema, marketingConsentSchema } from '@/lib/validation';
import {
  User,
  Mail,
  Bell,
  LogOut,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowLeft,
  ShieldCheck,
} from 'lucide-react';

interface ContaViewProps {
  initialProfile: {
    fullName: string;
    email: string;
    marketingConsented: boolean;
  };
}

export function ContaView({ initialProfile }: ContaViewProps) {
  const router = useRouter();
  const [fullName, setFullName] = useState(initialProfile.fullName);
  const [marketingConsented, setMarketingConsented] = useState(initialProfile.marketingConsented);

  const [nameMessage, setNameMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [marketingMessage, setMarketingMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [isUpdatingName, startNameTransition] = useTransition();
  const [isUpdatingMarketing, startMarketingTransition] = useTransition();
  const [isLoggingOut, startLogoutTransition] = useTransition();

  const handleUpdateName = (e: React.FormEvent) => {
    e.preventDefault();
    setNameMessage(null);

    const validation = updateProfileSchema.safeParse({ fullName });
    if (!validation.success) {
      setNameMessage({ type: 'error', text: validation.error.errors[0]?.message || 'Nome inválido.' });
      return;
    }

    startNameTransition(async () => {
      try {
        const response = await fetch('/api/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validation.data),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setNameMessage({ type: 'error', text: data.error || 'Falha ao atualizar o nome.' });
          return;
        }

        setNameMessage({ type: 'success', text: 'Nome atualizado com sucesso!' });
        router.refresh();
      } catch (err) {
        console.error('Erro ao atualizar nome:', err);
        setNameMessage({ type: 'error', text: 'Erro de comunicação ao salvar o nome.' });
      }
    });
  };

  const handleToggleMarketing = (newValue: boolean) => {
    setMarketingMessage(null);

    const validation = marketingConsentSchema.safeParse({ consented: newValue });
    if (!validation.success) {
      setNameMessage({ type: 'error', text: 'Valor inválido.' });
      return;
    }

    startMarketingTransition(async () => {
      try {
        const response = await fetch('/api/marketing-consent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validation.data),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setMarketingMessage({ type: 'error', text: data.error || 'Falha ao atualizar preferências.' });
          return;
        }

        setMarketingConsented(data.consented ?? newValue);
        setMarketingMessage({
          type: 'success',
          text: newValue
            ? 'Comunicações de marketing ativadas com sucesso.'
            : 'Comunicações de marketing revogadas com sucesso.',
        });
        router.refresh();
      } catch (err) {
        console.error('Erro ao atualizar marketing:', err);
        setMarketingMessage({ type: 'error', text: 'Erro de comunicação ao atualizar preferências.' });
      }
    });
  };

  const handleLogout = () => {
    startLogoutTransition(async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
        router.push('/login');
        router.refresh();
      } catch (err) {
        console.error('Erro ao deslogar:', err);
        router.push('/login');
        router.refresh();
      }
    });
  };

  return (
    <div className="max-w-3xl mx-auto py-8 space-y-8 px-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 pb-4 border-b">
        <div className="flex items-center gap-3">
          <Link
            href="/app"
            className="p-2 rounded-lg border hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
            title="Voltar para a aplicação"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Minha Conta</h1>
            <p className="text-xs text-muted-foreground">Gerencie seus dados e preferências de consentimento</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 text-xs font-medium transition-colors disabled:opacity-50"
        >
          {isLoggingOut ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
          <span>Sair</span>
        </button>
      </div>

      <div className="space-y-6">
        {/* Seção 1: Dados de Perfil */}
        <div className="p-6 bg-card border rounded-xl shadow-sm space-y-5">
          <div className="flex items-center gap-2 text-foreground font-semibold text-sm">
            <User className="w-4 h-4 text-primary" />
            <span>Informações Pessoais</span>
          </div>

          <form onSubmit={handleUpdateName} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="fullName" className="block text-xs font-medium text-muted-foreground">
                Nome completo
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={isUpdatingName}
                  className="flex-1 px-3.5 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={isUpdatingName || fullName.trim() === initialProfile.fullName.trim() || fullName.trim().length < 2}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-xs hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 shrink-0"
                >
                  {isUpdatingName ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  <span>Salvar Nome</span>
                </button>
              </div>
            </div>

            {nameMessage && (
              <div
                className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                  nameMessage.type === 'success'
                    ? 'border border-success/20 bg-success/10 text-success'
                    : 'bg-destructive/10 border border-destructive/20 text-destructive'
                }`}
              >
                {nameMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{nameMessage.text}</span>
              </div>
            )}
          </form>

          {/* E-mail (Somente leitura) */}
          <div className="space-y-1.5 pt-3 border-t">
            <label className="block text-xs font-medium text-muted-foreground">
              E-mail autenticado (Fonte canônica)
            </label>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border">
              <div className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">{initialProfile.email}</span>
              </div>
              <span className="rounded bg-success/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-success">
                Verificado
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              O e-mail é gerido exclusivamente pelo sistema de autenticação e não pode ser alterado diretamente.
            </p>
          </div>
        </div>

        {/* Seção 2: Preferências de Consentimento LGPD */}
        <div className="p-6 bg-card border rounded-xl shadow-sm space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-foreground font-semibold text-sm">
              <Bell className="w-4 h-4 text-primary" />
              <span>Comunicações e Ofertas (Marketing)</span>
            </div>
            <span
              className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                marketingConsented
                  ? 'bg-success/10 text-success'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {marketingConsented ? 'Ativo' : 'Desativado'}
            </span>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            Autorizo o envio de e-mails com conteúdos pedagógicos, novidades da plataforma e ofertas do Método Aprender.
            Você pode revogar ou ativar essa permissão a qualquer momento.
          </p>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => handleToggleMarketing(!marketingConsented)}
              disabled={isUpdatingMarketing}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-2 disabled:opacity-50 ${
                marketingConsented
                  ? 'bg-muted hover:bg-muted/80 text-foreground border'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              }`}
            >
              {isUpdatingMarketing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              <span>{marketingConsented ? 'Revogar Consentimento' : 'Ativar Comunicações'}</span>
            </button>
          </div>

          {marketingMessage && (
            <div
              className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                marketingMessage.type === 'success'
                  ? 'border border-success/20 bg-success/10 text-success'
                  : 'bg-destructive/10 border border-destructive/20 text-destructive'
              }`}
            >
              {marketingMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{marketingMessage.text}</span>
            </div>
          )}
        </div>

        {/* Seção 3: Conformidade Legal */}
        <div className="p-4 bg-muted/30 border rounded-lg flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-success" />
            <span>Termos e Política de Privacidade aceitos e auditáveis.</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/termos" target="_blank" className="text-primary hover:underline">
              Termos
            </Link>
            <Link href="/privacidade" target="_blank" className="text-primary hover:underline">
              Privacidade
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
