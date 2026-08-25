# Documentação da Sprint 1: Fundação & Setup Técnico

## 1. Visão Geral
A **Sprint 1** estabelece os alicerces de engenharia da aplicação **Anti-Erros | Método Aprender**, garantindo conformidade com padrões de segurança, LGPD, integridade relacional e compatibilidade total de runtime com Next.js 16.3.3.

---

## 2. Componentes e Estrutura Configurada

### 2.1 Stack Fixada
- **Next.js**: `16.3.3` (App Router, TypeScript strict)
- **React**: `19.0.0`
- **Tailwind CSS**: `3.4.17`
- **Supabase SSR**: `@supabase/ssr` `0.5.2`
- **Vitest**: `3.0.8`

### 2.2 Banco de Dados e Migrações (PostgreSQL / Supabase)
As migrações foram estruturadas em `supabase/migrations/`:
1. `0001_initial_schema.sql`: 7 tabelas estruturadas (`profiles`, `legal_acceptances`, `marketing_consent_events`, `daily_quotas`, `idempotency_locks`, `analyses`, `events`) e view `v_current_marketing_consent` com `security_invoker = true`.
2. `0002_private_cleanup_rpc.sql`: Schema `private` com a RPC `cleanup_expired_reservations(UUID)` restrita à `service_role`.
3. `0003_rls_policies.sql`: Habilitação de RLS em todas as tabelas e revogação de inserções arbitrárias no cliente.

### 2.3 Utilitários Supabase
- `src/lib/supabase/client.ts`: Inicializador de client no navegador.
- `src/lib/supabase/server.ts`: Inicializador de client no servidor com `getAll()` e `setAll()`.
- `src/lib/supabase/admin.ts`: Client restrito para operações backend com `service_role`.
- `src/lib/supabase/middleware.ts`: Helper de sessão para o middleware do Next.js.

---

## 3. Como Rodar o Projeto

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env.local

# 3. Executar a suíte de testes unitários
npm run test

# 4. Iniciar o servidor de desenvolvimento
npm run dev
```

---

## 4. Próximos Passos (Sprint 2)
- Implementar fluxo de autenticação com Magic Link / OTP via `@supabase/ssr`.
- Construir formulário de cadastro com aceite de Termos e consentimento de marketing.
- Criar Route Handlers `/api/legal-acceptances` e `/api/marketing-consent`.
