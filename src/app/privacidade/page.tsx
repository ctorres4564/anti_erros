import Link from 'next/link';
import { LEGAL_VERSIONS } from '@/config/legal';

export default function PrivacidadePage() {
  return (
    <div className="max-w-3xl mx-auto py-8 space-y-6">
      <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-800 dark:text-amber-300 text-sm font-medium">
        ⚠️ <strong>REVISÃO JURÍDICA NECESSÁRIA</strong> — Este texto é um modelo técnico provisório em conformidade com a LGPD para a versão {LEGAL_VERSIONS.privacy}.
      </div>

      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Política de Privacidade</h1>
        <p className="text-sm text-muted-foreground">Versão: {LEGAL_VERSIONS.privacy} | Última atualização: 25 de Agosto de 2026</p>
      </div>

      <div className="prose dark:prose-invert text-sm space-y-4 text-foreground/90 leading-relaxed">
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">1. Coleta e Finalidade dos Dados</h2>
          <p>
            Coletamos apenas os dados essenciais para o fornecimento do serviço (e-mail para autenticação, nome para identificação no perfil e registros de aceites de termos para conformidade legal com a Lei Geral de Proteção de Dados - LGPD).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">2. Consentimento de Marketing Segregado</h2>
          <p>
            Comunicações de novidades, conteúdos e ofertas são estritamente opcionais, mantidas em histórico auditável e podem ser ativadas ou revogadas a qualquer momento nas preferências da conta.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">3. Direitos do Titular</h2>
          <p>
            O titular possui direito de confirmação de tratamento, acesso, retificação de nome e revogação de consentimentos a qualquer momento.
          </p>
        </section>
      </div>

      <div className="pt-6 border-t flex justify-between items-center text-sm">
        <Link href="/onboarding" className="text-primary hover:underline font-medium">
          ← Voltar para o Cadastro
        </Link>
        <Link href="/termos" className="text-muted-foreground hover:underline">
          Ver Termos de Uso →
        </Link>
      </div>
    </div>
  );
}
