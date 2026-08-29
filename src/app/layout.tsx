import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { AuthNavigation } from "@/components/auth/AuthNavigation";
import { createClient } from "@/lib/supabase/server";
import { themeInitializationScript } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Anti-Erros | Método Aprender",
  description: "Entenda causas prováveis dos seus erros e receba uma ação prática para estudar melhor.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="min-h-screen flex flex-col font-sans">
        <Script
          id="theme-initializer"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeInitializationScript }}
        />
        <header className="border-b bg-card/60 backdrop-blur-md sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
            <Link href="/" className="flex min-h-11 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <span className="text-xl font-bold tracking-tight text-primary">
                Anti-Erros
              </span>
              <span className="hidden text-xs bg-primary/10 text-primary font-medium px-2 py-0.5 rounded-full sm:inline">
                Método Aprender
              </span>
            </Link>
            <AuthNavigation authenticated={Boolean(user)} />
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
