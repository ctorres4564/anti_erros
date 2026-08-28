import Link from 'next/link';
import { LEGAL_VERSIONS } from '@/config/legal';

export default function TermosPage() {
  return (
    <div className="max-w-3xl mx-auto py-8 space-y-6">
      <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-800 dark:text-amber-300 text-sm font-medium">
        ⚠️ <strong>REVISÃO JURÍDICA NECESSÁRIA</strong> — Este texto é um modelo técnico provisório para a versão {LEGAL_VERSIONS.terms}.
      </div>

      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Termos de Uso</h1>
        <p className="text-sm text-muted-foreground">Versão: {LEGAL_VERSIONS.terms} | Última atualização: 25 de Agosto de 2026</p>
      </div>

      <div className="prose dark:prose-invert text-sm space-y-4 text-foreground/90 leading-relaxed">
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">1. Objeto e Aceite</h2>
          <p>
            O serviço <strong>Anti-Erros | Método Aprender</strong> oferece ferramentas de análise pedagógica e geração de revisões personalizadas. Ao se cadastrar ou utilizar a plataforma, o usuário declara ter lido, compreendido e aceito integralmente as presentes condições.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">2. Uso da Conta e Responsabilidades</h2>
          <p>
            O acesso é pessoal e intransferível, autenticado unicamente via link mágico enviado ao endereço de e-mail do titular. O usuário compromete-se a manter a segurança de seu e-mail e a não submeter conteúdos ilícitos ou violadores de direitos de terceiros.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">3. Limitações e Cotas</h2>
          <p>
            A plataforma pode estabelecer cotas diárias de processamento e análise para assegurar a estabilidade e integridade operacional do sistema.
          </p>
        </section>
      </div>

      <div className="pt-6 border-t flex justify-between items-center text-sm">
        <Link href="/onboarding" className="text-primary hover:underline font-medium">
          ← Voltar para o Cadastro
        </Link>
        <Link href="/privacidade" className="text-muted-foreground hover:underline">
          Ver Política de Privacidade →
        </Link>
      </div>
    </div>
  );
}
