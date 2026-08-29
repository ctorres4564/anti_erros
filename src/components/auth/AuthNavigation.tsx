import Link from 'next/link';
import { UserRound } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LogoutButton } from '@/components/auth/LogoutButton';

export function AuthNavigation({ authenticated }: { authenticated: boolean }) {
  return (
    <nav aria-label="Navegação principal" className="flex items-center gap-1 text-sm font-medium sm:gap-2">
      {authenticated ? (
        <>
          <Link
            href="/app"
            className="hidden min-h-10 items-center rounded-lg px-2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:inline-flex sm:px-3"
          >
            Minhas análises
          </Link>
          <Link
            href="/conta"
            aria-label="Minha conta"
            className="inline-flex h-11 min-w-11 items-center justify-center rounded-lg px-2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:min-w-0 sm:px-3"
          >
            <UserRound className="h-4 w-4 sm:hidden" aria-hidden="true" />
            <span className="hidden sm:inline">Minha conta</span>
          </Link>
        </>
      ) : null}
      <ThemeToggle />
      {authenticated ? (
        <LogoutButton />
      ) : (
        <Link
          href="/login"
          className="inline-flex min-h-10 items-center rounded-lg border bg-card px-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Entrar
        </Link>
      )}
    </nav>
  );
}
