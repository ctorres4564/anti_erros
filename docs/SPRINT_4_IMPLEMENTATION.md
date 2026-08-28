# Sprint 4 — Interface do MVP e fluxo do usuário

**Data:** 28 de agosto de 2026
**Branch:** `agent/sprint-4-mvp-ui`
**Status:** implementação completa para revisão.

## Contexto preservado

A Sprint 4 parte do encerramento formal da Sprint 3 no commit `8d4edd1e2d0de2ef6b5529007d4bdc3206a2dd2c`.

- Sprint 3: **CLOSED**
- Modelo: **PROVISIONAL**
- Validação causal: **INCONCLUSIVE**
- Benchmarks, holdouts, prompt, modelo e thresholds: **não alterados**
- Gemini ou outro modelo durante esta implementação: **não executado**

## Auditoria inicial

### Estado anterior da interface

A landing enviava o visitante diretamente ao login. A área autenticada confirmava somente que a conta estava pronta. Não existiam formulário de análise, preview, claim na interface, resultado completo ou histórico.

### Contratos disponíveis e reutilizados

- `POST /api/analyses/preview`: análise anônima com Turnstile, rate limit e persistência em `pending_analyses`; retorna somente a projeção parcial.
- `POST /api/analyses`: análise autenticada com sessão, onboarding, cota e `Idempotency-Key`; retorna o resultado completo.
- `POST /api/pending-analyses/claim`: resgata o resultado já calculado usando sessão e cookie/token de uso único, sem nova inferência.
- Supabase `analyses`: leitura das próprias análises já permitida por grant e RLS, suficiente para histórico e detalhe em Server Components sem endpoint adicional.

### Fluxo de autenticação disponível

Magic Link/PKCE, callback SSR, onboarding obrigatório e sessão Supabase foram reutilizados sem criar um segundo mecanismo de autenticação. O cookie HttpOnly `claim_token` atravessa autenticação e onboarding no mesmo navegador.

### Divergências encontradas

- A UI anterior e alguns textos usavam “diagnóstico”, incompatível com o encerramento da Sprint 3. A camada de apresentação agora usa linguagem probabilística.
- O mapper de claim persistia `discipline` e `recommended_action`, mas não os devolvia no resultado completo. A projeção foi corrigida sem alterar schema, prompt, modelo ou taxonomia.
- O claim existia no backend, mas não era acionado pela experiência autenticada.
- O histórico tinha suporte de banco/RLS, mas nenhuma interface.

## Escopo implementado

### Landing e nova análise anônima

A rota `/` agora contém uma experiência mobile-first para registrar o erro com os campos do contrato real:

- questão;
- resposta do usuário;
- resposta correta;
- autopercepção estruturada;
- explicação oficial opcional em área expansível.

O formulário possui labels reais, exemplos curtos, validação Zod, erros associados aos campos, estado de carregamento, bloqueio imediato contra envio duplicado e mensagens recuperáveis para falha de rede/API.

A autopercepção é coletada, mas a regra de isolamento do backend permanece intacta: ela não é enviada ao provedor.

### Turnstile

Foi criado um widget explícito com `next/script` e os estados:

- carregando;
- verificado;
- falha/expiração;
- tentar novamente.

Produção exige `NEXT_PUBLIC_TURNSTILE_SITE_KEY` no cliente e `TURNSTILE_SECRET_KEY` no servidor. Não existe bypass novo para produção. O comportamento local já previsto pelo backend foi preservado quando as chaves não estão configuradas.

### Preview anônimo

O preview apresenta exclusivamente:

- causa provável em label amigável;
- conceito;
- disciplina;
- comparação independente com a autopercepção;
- CTA “Ver análise completa”.

Resposta correta, explicação completa, ação recomendada e flashcard não aparecem antes do gate. O transporte do `claimToken` ocorre exclusivamente pelo cookie HttpOnly; o token não integra o JSON público, não fica acessível ao JavaScript e não é persistido em storage.

### Gate de autenticação e claim

O CTA encaminha ao Magic Link existente com contexto de continuidade. Depois do callback e do onboarding, `/app` detecta o cookie HttpOnly e chama o endpoint de claim uma única vez.

O fluxo trata:

- sessão expirada;
- onboarding incompleto;
- token inválido;
- token já utilizado;
- token expirado;
- limite diário;
- falha de rede ou serviço.

Tokens inválidos, já usados ou expirados têm o cookie terminal removido. Limite diário e falhas temporárias preservam a possibilidade de resgate posterior. O claim continua atômico e sem nova inferência.

### Resultado completo

O componente de resultado apresenta:

1. questão analisada;
2. resposta do usuário;
3. resposta correta;
4. disciplina e conceito;
5. causa provável em label amigável;
6. resumo da análise;
7. ação recomendada em maior destaque;
8. decisão de flashcard e conteúdo retornado, quando aplicável.

`errorType` e `cardAction` não são exibidos como enums crus. A confiança é comunicada por faixas operacionais, sem percentual de falsa precisão. Uma função exclusiva de apresentação neutraliza formulações assertivas antigas eventualmente presentes em resultados persistidos, sem alterar os dados de domínio.

Para `NO_CARD`, a tela explica que a ação prática é preferível. Para `CREATE_*`, mostra somente o card fornecido pela API e oferece cópia; nenhum card é gerado no frontend.

### Área autenticada e histórico

`/app` agora oferece:

- recuperação de análise pendente;
- resultado mais recente;
- formulário de nova análise autenticada;
- histórico das 25 análises mais recentes;
- estado vazio;
- estado de histórico temporariamente indisponível;
- acesso ao detalhe protegido.

A rota `/app/analises/[id]` lê diretamente pelo cliente Supabase SSR sob RLS e retorna `not-found` quando a análise não existe ou não pertence ao usuário.

**HISTORY BACKEND GAP: NO.** O contrato de leitura existente foi suficiente; nenhum endpoint novo foi criado.

## Decisões de UX e linguagem

- A ação recomendada recebe maior contraste e peso visual que o rótulo causal.
- A interface usa “causa provável”, “o erro pode estar relacionado a...” e “com base nas informações fornecidas...”.
- Conclusões definitivas e linguagem de determinação pela IA não são apresentadas.
- O formulário mantém uma coluna no mobile e limita largura/conteúdo em telas grandes.
- Cards verticais permitem leitura e screenshot sem depender de modal.
- IDs internos, token de claim, prompt, observabilidade e detalhes do provedor não são exibidos.

## Estados e acessibilidade

Foram implementados estados de loading, vazio, sucesso, validação, erro de API, falha de rede, sessão não autenticada, token expirado e not-found.

Os componentes usam:

- labels associadas a todos os campos;
- mensagens de erro com `aria-describedby`;
- `role="alert"` e `role="status"` quando apropriado;
- foco programático no resultado novo;
- foco visível por teclado;
- alvos principais com pelo menos 40–44 px;
- headings e landmarks semânticos;
- ícones decorativos com `aria-hidden`.

## Responsividade verificada

A landing foi aberta localmente sem submeter o formulário e verificada em:

- 375 × 900 px;
- 768 × 1024 px;
- 1440 × 1000 px.

Resultados: HTTP 200, conteúdo presente, zero overlay do Next.js, zero erro de console, zero overflow horizontal, nenhum controle fora da viewport, labels presentes e foco de teclado visível.

## Testes adicionados

Foram adicionados 15 testes unitários cobrindo:

- contrato e payload do preview;
- descarte do token de claim pela UI;
- resposta fora do schema;
- falha de rede;
- `Idempotency-Key` autenticada;
- claim por cookie HttpOnly;
- token expirado e inválido;
- tradução dos enums;
- faixas de confiança;
- linguagem conservadora;
- projeção parcial;
- resultado completo;
- `NO_CARD`;
- `CREATE_*`.

A integração de pending claim ganhou assertivas para `discipline` e `recommendedAction`, além da prova preexistente de que o claim não chama a IA novamente.

## Regressão

| Verificação | Resultado |
| --- | --- |
| Typecheck | **PASS** — `npx tsc --noEmit` |
| Lint | **PASS** — `npm run lint` |
| Unit | **PASS** — 168/168 em 13 arquivos |
| Integration | **PASS** — 63 aprovados e 11 ignorados; Gemini explicitamente desabilitado |
| Build | **PASS** — `npm run build` |

Os 11 testes ignorados dependem do Gemini real ou da aplicação local E2E em execução. Nenhum modelo foi chamado para obter estes resultados.

## Gaps restantes

- Configurar as chaves públicas/privadas reais do Turnstile no ambiente de produção e validar o domínio durante o hardening.
- Executar E2E completo de Magic Link em navegador e preview real somente em rodada autorizada que permita a infraestrutura necessária; não foi feito para evitar qualquer inferência real.
- Confirmação/correção de disciplina e feedback pós-análise constam no PRD consolidado, mas não possuem endpoint dedicado no backend atual. Nenhum endpoint foi inventado silenciosamente; ficam registrados para uma rodada futura de produto/backend.
- A convenção `middleware.ts` está depreciada no Next.js 16, mas a migração para `proxy.ts` foi adiada por não ser necessária ao fluxo e para evitar refatoração lateral.

## Itens explicitamente adiados

Não foram implementados novo modelo, nova taxonomia, SRS/FSRS, gamificação, dashboard administrativo, analytics avançado, upsell, pagamento, nova arquitetura backend ou redesign amplo de marca.

## Veredito

SPRINT 4 IMPLEMENTATION: **COMPLETE**
READY FOR SPRINT 4 REVIEW: **YES**
