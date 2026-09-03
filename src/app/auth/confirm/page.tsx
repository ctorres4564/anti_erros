import { ConfirmMagicLink } from '@/components/auth/ConfirmMagicLink';

interface AuthConfirmPageProps {
  searchParams: Promise<{
    token_hash?: string;
    type?: string;
    next?: string;
    claim_ref?: string;
  }>;
}

// Página intermediária: o GET apenas recebe e preserva os parâmetros do link
// de e-mail. Nenhuma validação de token (verifyOtp) acontece aqui — só após
// o clique explícito do usuário, na Server Action `confirmMagicLink`.
export default async function AuthConfirmPage({ searchParams }: AuthConfirmPageProps) {
  const params = await searchParams;

  return (
    <div className="min-h-[70vh] flex items-center justify-center py-6 px-4">
      <ConfirmMagicLink
        tokenHash={params.token_hash ?? null}
        type={params.type ?? null}
        next={params.next ?? null}
        claimReference={params.claim_ref ?? null}
      />
    </div>
  );
}
