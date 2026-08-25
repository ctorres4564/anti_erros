import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="max-w-2xl space-y-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold uppercase tracking-wider">
          Método Aprender
        </div>

        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground">
          Anti-Erros
        </h1>

        <p className="text-lg sm:text-xl text-muted-foreground leading-relaxed max-w-lg mx-auto">
          Transforme seus erros em revisões mais úteis.
        </p>

        <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/login"
            className="w-full sm:w-auto px-8 py-3.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            COMEÇAR GRATUITAMENTE
          </Link>
        </div>
      </div>
    </div>
  );
}
