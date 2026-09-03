# Sprint 5 — Ativação de produção e prontidão para piloto

## Status

- Implementação técnica da Sprint 5: **COMPLETE**
- Modelo: **PROVISIONAL**
- Validação causal: **INCONCLUSIVE** (decisão encerrada na Sprint 3)
- Turnstile code ready: **YES**
- Turnstile production configuration required: **YES**
- Magic Link code ready: **YES**
- Production deployment validated: **NO — requer configuração e smoke test no ambiente real**
- Ready for limited pilot: **YES, condicionado ao checklist operacional de produção**

Nenhum benchmark, Gemini real, tuning, nova taxonomia ou alteração de threshold foi executado nesta Sprint.

## O que foi implementado

### Turnstile

- Widget frontend com a chave pública `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
- Validação server-side contra o endpoint oficial usando `TURNSTILE_SECRET_KEY`.
- Falha fechada em produção quando a chave secreta ou o token está ausente.
- Bypass local somente sem credenciais em `development`.
- Bypass de suíte automatizada somente com opt-in explícito por `TURNSTILE_TEST_BYPASS=true`, token determinístico e ambiente não produtivo. O código proíbe o bypass quando `NODE_ENV=production`, mesmo se `VITEST` e a flag forem configurados incorretamente.
- Mensagem compreensível e possibilidade de nova tentativa no frontend.

### Magic Link e claim

- Magic Link/PKCE e criação de sessão continuam sob responsabilidade do Supabase Auth.
- A credencial do claim permanece exclusivamente em cookie HttpOnly específico do pending. O cliente transporta apenas uma referência assinada e não sensível; o endpoint exige a correspondência entre ambos.
- O claim continua atômico, one-use, com TTL de 24 horas, cota e vínculo obrigatório ao usuário autenticado após onboarding.
- A operação apenas promove o resultado já persistido; não executa nova inferência.

### Confirmação de disciplina

- `PATCH /api/analyses/[id]/discipline`, protegido por sessão, onboarding, validação de enum e ownership.
- `analyses.discipline` preserva a saída original da IA.
- `analyses.discipline_confirmed` e `discipline_confirmed_at` guardam a confirmação/correção do usuário.
- A UI oferece confirmação em um passo e o histórico prioriza a disciplina confirmada.

### Feedback

- `PUT /api/analyses/[id]/feedback`, protegido por sessão, onboarding e ownership.
- Tabela separada `analysis_feedback`, com uma linha atualizável por análise.
- Valores controlados: `YES`, `PARTIALLY` e `NO`; comentário opcional limitado a 500 caracteres.
- O feedback não altera a análise, o tipo causal ou a ação recomendada original.
- RLS permite ao usuário apenas ler o próprio feedback; escrita direta do browser permanece bloqueada.

### Eventos mínimos de ativação

O funil registra os eventos essenciais:

1. `analysis_form_started`
2. `analysis_preview_completed`
3. `auth_gate_shown`
4. `auth_completed`
5. `analysis_claimed`
6. `full_result_viewed`
7. `discipline_confirmed`
8. `feedback_submitted`

Os contratos aceitam apenas eventos predefinidos. Não são enviados questão, resposta, explicação, e-mail, cookie, token, prompt interno ou chain-of-thought. Um trigger adicional zera as propriedades dos eventos anônimos de ativação, inclusive no evento legado de claim.

### UX e privacidade

- Resultado completo mantém “causa provável” e linguagem probabilística.
- Formulário avisa que a análise não é diagnóstico definitivo.
- Usuário é orientado a não incluir nome, documento, contato ou outros dados pessoais desnecessários.
- `recommendedAction`, `CREATE` e `NO_CARD` permanecem independentes do tipo causal.

## Banco e rollback

Migrations aditivas:

- `0009_sprint5_activation.sql`: timestamp de disciplina confirmada, tabela de feedback, índices, grants e RLS.
- `0010_sanitize_activation_events.sql`: sanitização defensiva dos eventos anônimos de ativação.

Ambas foram aplicadas com `npx supabase migration up --local`. Nenhuma migration homologada anterior foi reescrita.

Rollback operacional recomendado: interromper o deploy da aplicação e voltar ao artefato anterior. As novas colunas e a tabela são aditivas e podem permanecer sem afetar a versão anterior. Remoção de dados ou schema deve ser feita apenas por migration reversa explicitamente revisada; não executar `DROP` manual em produção.

## Configuração de produção

Configurar no provedor de deploy, sem prefixo público para segredos:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`
- `GEMINI_API_KEY`
- `GEMINI_MODEL_NAME`
- `NEXT_PUBLIC_APP_URL`
- versões legais e limites já descritos em `.env.example`

`TURNSTILE_TEST_BYPASS` é exclusivo para testes locais e deve estar ausente ou `false` em produção. A proteção não depende dessa configuração correta: `NODE_ENV=production` bloqueia o bypass no código. Nunca expor `TURNSTILE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` ou `GEMINI_API_KEY` com prefixo `NEXT_PUBLIC_`.

No Supabase Auth, cadastrar apenas URLs HTTPS controladas:

- Site URL do domínio canônico.
- Redirect URL exata: `https://<dominio>/auth/callback`.
- Redirects de preview/staging separados e explicitamente aprovados.

Confirmar SMTP remetente, domínio, SPF/DKIM, validade do Magic Link e política de rate limit antes de abrir o piloto.

## Validação executada

- Typecheck: **PASS**
- Lint: **PASS**
- Unit: **PASS — 181/181**
- Integration/RLS sem modelo: **PASS — 66/66; 18 ignorados (11 dependem de app/Gemini real e os 7 E2E Sprint 5 são executados separadamente contra o servidor local)**
- Sprint 5 activation API E2E HTTP sem modelo: **PASS — 7/7**
- Migration local: **PASS**
- Build: **PASS**

O teste local de Magic Link via Mailpit passou dentro da suíte de integração. Um teste crítico adicional encadeou pending com IA simulada, Magic Link, sessão e claim HTTP, confirmando uma única inferência simulada. O smoke test real do Gemini permaneceu ignorado por design. O E2E visual completo em navegador e o recebimento por SMTP real continuam como smoke tests obrigatórios no ambiente de piloto.

## Riscos residuais e decisão

- O modelo continua provisório; a saída não pode ser apresentada como diagnóstico definitivo.
- Chaves, domínio, Turnstile e SMTP reais dependem do ambiente externo.
- É necessário executar smoke test no deploy com uma conta de piloto e dados sintéticos.
- A migração `middleware.ts` para `proxy.ts` permanece pós-MVP e não bloqueia o fluxo.

Com configuração externa concluída e checklist de smoke aprovado, a aplicação está pronta para piloto limitado. Ainda não há evidência suficiente para declarar produção aberta em escala.
