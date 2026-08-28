import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Anti-Erros | Método Aprender",
  description: "Entenda causas prováveis dos seus erros e receba uma ação prática para estudar melhor.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen flex flex-col font-sans">
        <header className="border-b bg-card/60 backdrop-blur-md sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
            <Link href="/" className="flex min-h-11 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <span className="text-xl font-bold tracking-tight text-primary">
                Anti-Erros
              </span>
              <span className="text-xs bg-primary/10 text-primary font-medium px-2 py-0.5 rounded-full">
                Método Aprender
              </span>
            </Link>
            <nav aria-label="Navegação principal" className="flex items-center gap-2 text-sm font-medium">
              <Link href="/app" className="hidden min-h-10 items-center rounded-lg px-3 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:inline-flex">
                Minhas análises
              </Link>
              <Link href="/login" className="inline-flex min-h-10 items-center rounded-lg border bg-card px-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                Entrar
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1 max-w-6xl mx-auto px-4 py-8 w-full">
          {children}
        </main>
        <footer className="border-t py-6 text-center text-xs text-muted-foreground bg-card/40">
          <p>© 2026 Anti-Erros | Método Aprender. Análises indicam causas prováveis, não conclusões definitivas.</p>
        </footer>
      </body>
    </html>
  );
}
