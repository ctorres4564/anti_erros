import { ShieldCheck, Database, Zap, BookOpen } from "lucide-react";

export default function HomePage() {
  return (
    <div className="space-y-12">
      <section className="text-center space-y-4 py-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary mb-2">
          <Zap className="w-3.5 h-3.5" />
          Ambiente Inicializado com Sucesso (Sprint 1)
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl text-foreground">
          Transforme Questões Erradas em{" "}
          <span className="text-primary">Acertos Definitivos</span>
        </h1>
        <p className="max-w-2xl mx-auto text-muted-foreground text-lg">
          Diagnóstico cognitivo instantâneo por IA com metodologia pedagógica e criação
          automática de flashcards cirúrgicos.
        </p>
      </section>

      <section className="grid sm:grid-cols-3 gap-6">
        <div className="p-6 rounded-xl border bg-card text-card-foreground shadow-sm space-y-3">
          <div className="p-2.5 bg-primary/10 text-primary w-fit rounded-lg">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h2 className="font-semibold text-lg">Segurança & RLS Estrito</h2>
          <p className="text-sm text-muted-foreground">
            Políticas de banco de dados no nível de linha (RLS) com bloqueio de escrita no cliente
            e isolamento total de dados.
          </p>
        </div>

        <div className="p-6 rounded-xl border bg-card text-card-foreground shadow-sm space-y-3">
          <div className="p-2.5 bg-primary/10 text-primary w-fit rounded-lg">
            <Database className="w-5 h-5" />
          </div>
          <h2 className="font-semibold text-lg">Transação Desacoplada</h2>
          <p className="text-sm text-muted-foreground">
            Controle atômico de idempotência e cota em duas fases rápidas, sem reter locks
            durante a chamada de IA.
          </p>
        </div>

        <div className="p-6 rounded-xl border bg-card text-card-foreground shadow-sm space-y-3">
          <div className="p-2.5 bg-primary/10 text-primary w-fit rounded-lg">
            <BookOpen className="w-5 h-5" />
          </div>
          <h2 className="font-semibold text-lg">Método Aprender</h2>
          <p className="text-sm text-muted-foreground">
            Taxonomia pedagógica refinada focada na causa raiz do erro e na fixação
            ativa de conceitos-chave.
          </p>
        </div>
      </section>
    </div>
  );
}
