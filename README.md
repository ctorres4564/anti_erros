# Anti-Erros | Método Aprender

Aplicação web desenvolvida para estudantes e concurseiros que buscam diagnosticar falhas cognitivas em questões resolvidas e gerar flashcards cirúrgicos baseados no **Método Aprender**.

---

## 🚀 Objetivo do Projeto

O **Anti-Erros** automatiza a análise pedagógica de erros cometidos em questões:
1. Identifica a causa raiz do erro (ex: Falta de Atenção, Lacuna Teórica, Interpretação, Pegadinha).
2. Fornece uma explicação didática concisa focada no conceito necessário para o acerto.
3. Avalia a pertinência de gerar um flashcard e cria o card com Frente (pergunta cirúrgica) e Verso (resposta direta).
4. Oferece cópia em 1 clique e histórico do estudante, servindo como motor de atração para o e-book *Método Aprender*.

---

## 🛠️ Stack Tecnológica

- **Framework:** [Next.js 16.3.3](https://nextjs.org/) (App Router, React 19, TypeScript Strict)
- **Estilização:** [Tailwind CSS](https://tailwindcss.com/) + Tokens shadcn/ui
- **Banco de Dados & Auth:** [Supabase](https://supabase.com/) (PostgreSQL 15+, Row Level Security, Supabase Auth SSR)
- **Inteligência Artificial:** [Google Gemini Flash](https://ai.google.dev/) via Server-Side SDK com Structured Outputs (JSON Schema)
- **Validação de Schemas:** [Zod](https://zod.dev/)
- **Testes Unitários:** [Vitest](https://vitest.dev/)

---

## 📁 Estrutura de Diretórios

```text
c:/anti_erros/
├── docs/                      # Documentação técnica e arquitetura
│   ├── ARCHITECTURE.md        # Arquitetura e especificação técnica consolidada
│   ├── PRD.docx               # Documento de Requisitos de Produto original
│   └── SPRINT_1_SETUP.md      # Guia de setup e decisões da Sprint 1
├── prompts/                   # Referências de prompts de IA
│   └── analysis-prompt.md     # Prompt do motor pedagógico
├── scripts/                   # Scripts de automação, benchmark e verificação
│   └── verify-env.ts          # Validador de variáveis de ambiente
├── src/                       # Código-fonte da aplicação
│   ├── app/                   # App Router (páginas, layouts, rotas de API)
│   │   ├── globals.css        # Variáveis de tema e estilos base
│   │   ├── layout.tsx         # Layout raiz semântico
│   │   └── page.tsx           # Página inicial
│   ├── components/            # Componentes reutilizáveis de interface
│   ├── lib/                   # Utilitários e instâncias de clientes
│   │   ├── supabase/          # Clientes Supabase (browser, server, admin, middleware)
│   │   └── utils.ts           # Helper cn para classes CSS
│   ├── services/              # Serviços de negócio e integrações
│   ├── types/                 # Definições de tipos TypeScript (Database types)
│   └── utils/                 # Funções auxiliares gerais
├── supabase/                  # Banco de dados e infraestrutura
│   └── migrations/            # Migrações SQL numeradas e versionadas
│       ├── 0001_initial_schema.sql
│       ├── 0002_private_cleanup_rpc.sql
│       └── 0003_rls_policies.sql
├── tests/                     # Suítes de testes automatizados
│   └── unit/                  # Testes unitários com Vitest
├── .env.example               # Exemplo seguro de variáveis de ambiente
├── .gitignore                 # Arquivos ignorados pelo controle de versão
├── package.json               # Dependências fixadas e scripts
├── tailwind.config.ts         # Configuração de tema do Tailwind
├── tsconfig.json              # Configuração do compilador TypeScript
└── vitest.config.ts           # Configuração do runner Vitest
```

---

## 📦 Instruções de Instalação e Execução

### Pré-requisitos
- Node.js 20+ ou 22+
- npm 10+
- Conta no [Supabase](https://supabase.com) (ou instância local do Supabase)

### Passo a Passo

1. **Clonar e instalar dependências:**
   ```bash
   npm install
   ```

2. **Configurar variáveis de ambiente:**
   ```bash
   cp .env.example .env.local
   ```
   *Preencha as variáveis no arquivo `.env.local` com suas credenciais do Supabase e Gemini.*

3. **Executar a suíte de testes:**
   ```bash
   npm run test
   ```

4. **Iniciar o ambiente de desenvolvimento:**
   ```bash
   npm run dev
   ```
   Acesse [http://localhost:3000](http://localhost:3000) no seu navegador.
