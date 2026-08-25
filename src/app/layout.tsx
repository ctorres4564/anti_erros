import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Anti-Erros | Método Aprender",
  description: "Diagnóstico inteligente de erros em questões e gerador de flashcards cirúrgicos.",
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
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-primary">
                Anti-Erros
              </span>
              <span className="text-xs bg-primary/10 text-primary font-medium px-2 py-0.5 rounded-full">
                Método Aprender
              </span>
            </div>
            <nav className="text-sm font-medium text-muted-foreground flex items-center gap-4">
              <span>Fundação V1.0</span>
            </nav>
          </div>
        </header>
        <main className="flex-1 max-w-6xl mx-auto px-4 py-8 w-full">
          {children}
        </main>
        <footer className="border-t py-6 text-center text-xs text-muted-foreground bg-card/40">
          <p>© 2026 Anti-Erros | Método Aprender. Todos os direitos reservados.</p>
        </footer>
      </body>
    </html>
  );
}
