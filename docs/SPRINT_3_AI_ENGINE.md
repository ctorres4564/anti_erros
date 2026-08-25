# Documentação da Sprint 3: Motor de Análise de IA

## 1. Visão Geral

A Sprint 3 implementa o motor server-side que recebe uma questão errada pelo
estudante, chama o Gemini para determinar a **causa provável** do erro e
decide — de forma pedagógica, não mecânica — se um flashcard deve ser gerado.

O sistema **não é** um gerador automático de flashcards. É um analisador de
erros que primeiro busca compreender o erro; só depois decide se um card é
uma boa resposta pedagógica. `NO_CARD` é uma saída legítima e frequente.

## 2. Fluxo

```
Usuário autenticado
  → POST /api/analyses (Idempotency-Key: UUID)
  → sessão + onboarding verificados (401 / 403)
  → input validado com Zod estrito (400)
  → Fase 1: reserva atômica de cota (RPC reserve_analysis_slot)
      → LIMIT_REACHED (429) | PENDING (409) | COMPLETED (200, replay) | RESERVED
  → chamada ao Gemini FORA de qualquer transação de banco
  → Fase 2a (sucesso): RPC complete_analysis — persiste, debita cota, COMPLETED
  → Fase 2b (falha/timeout/schema inválido): RPC fail_analysis — estorna reserva, FAILED
  → resposta sanitizada ao cliente
```

Implementado em:
- `src/app/api/analyses/route.ts` — Route Handler.
- `src/services/analysis.ts` — orquestração das 2 fases.
- `src/lib/ai/` — schemas (`analysis-schema.ts`), prompt (`analysis-prompt.ts`), adapter Gemini (`gemini.ts`), resolução de client (`resolve-client.ts`).
- `src/config/ai.ts` — configuração centralizada (única fonte de verdade).
- `supabase/migrations/0007_analysis_engine.sql` — colunas novas + RPCs `reserve_analysis_slot`, `complete_analysis`, `fail_analysis`.

## 3. Taxonomia da Causa Provável (`probableErrorType`)

Categorias fechadas, sem exceções:

| Categoria | Significado |
| --- | --- |
| `KNOWLEDGE_GAP` | Não conhecia a informação/regra/conceito necessário. |
| `CONCEPT_CONFUSION` | Confundiu dois conceitos próximos. |
| `EXCEPTION_MISSED` | Conhece a regra geral, errou por não considerar exceção. |
| `APPLICATION_ERROR` | Conhecimento presente, mas aplicado incorretamente. |
| `READING_ERROR` | Erro decorre de leitura/atenção, não de lacuna de conhecimento. |
| `INSUFFICIENT_INFORMATION` | Dados insuficientes para inferir com segurança. |

O sistema nunca afirma "a causa do seu erro foi..." — sempre "causa provável
do erro" ou formulação equivalente (imposto no system prompt e testado em
`tests/unit/analysis-prompt.test.ts`).

## 4. Decisão de Flashcard (`cardAction`)

```
CREATE_BASIC_CARD | CREATE_DISCRIMINATION_CARD | CREATE_EXCEPTION_CARD | CREATE_APPLICATION_CARD | NO_CARD
```

Mapa pedagógico inicial (referência, não regra mecânica — o prompt instrui a
IA a usar julgamento pedagógico para o caso concreto):

```
KNOWLEDGE_GAP           → geralmente CREATE_BASIC_CARD
CONCEPT_CONFUSION       → geralmente CREATE_DISCRIMINATION_CARD
EXCEPTION_MISSED        → geralmente CREATE_EXCEPTION_CARD
APPLICATION_ERROR       → pode gerar CREATE_APPLICATION_CARD
READING_ERROR           → NO_CARD
INSUFFICIENT_INFORMATION → NO_CARD
```

Invariante obrigatória, garantida por `analysisOutputSchema` (discriminated
union Zod) **e** por constraint de banco (`chk_analyses_card_consistency`):
`cardAction = NO_CARD ⇔ card = null`.

Anti-memorização: o prompt proíbe explicitamente transformar a questão
original diretamente em frente do card — o card deve ser uma abstração
pedagógica do conceito, não uma cópia do enunciado.

## 5. Structured Output

`src/lib/ai/analysis-schema.ts` define `analysisOutputSchema` (Zod
discriminated union por `cardAction`) e `analysisInputSchema` (`.strict()`,
rejeita qualquer campo fora de `question`/`userAnswer`/`correctAnswer`/
`officialExplanation` — incluindo tentativas de enviar `user_id`, `role`,
`confidence`, `error_type`, `card_action` etc. do navegador).

O Gemini é chamado com `responseMimeType: application/json` e um
`responseSchema` espelhando o Zod. A resposta é sempre revalidada no servidor
com Zod antes de qualquer persistência — nunca se confia apenas no
`responseSchema` do provedor.

`reasoningSummary` é uma justificativa curta (1-3 frases) para o usuário,
nunca uma transcrição de chain-of-thought — o system prompt instrui isso
explicitamente e nenhum raciocínio interno é solicitado ou persistido.

## 6. Confiança e Threshold

`confidence` ∈ [0.0, 1.0] representa confiança na **classificação**, não uma
probabilidade científica. `LOW_CONFIDENCE_THRESHOLD = 0.6`
(`src/config/ai.ts`). Política de defesa em profundidade
(`applyLowConfidencePolicy`, independente do prompt): se `confidence` estiver
abaixo do threshold e o modelo propôs `CREATE_*`, a decisão é rebaixada para
`NO_CARD` no próprio servidor — nunca se gera card de baixa confiança "para
preencher a saída". A classificação de causa provável é preservada.

## 7. Cota Diária

`DAILY_ANALYSIS_LIMIT = 5` (`src/config/ai.ts`, única fonte — nunca
hardcoded em outro lugar). A verificação considera `used_count +
reserved_count < daily_limit`, nunca apenas análises finalizadas.

## 8. Arquitetura de 2 Fases (sem transação aberta durante a IA)

**Fase 1 — `reserve_analysis_slot` (RPC, transação curta):**
1. Mutex `pg_advisory_xact_lock` por `(user_id, idempotency_key)` — essencial:
   sem ele, duas requisições concorrentes com a mesma chave NOVA podiam
   ambas passar pelo `SELECT ... FOR UPDATE` (que não trava uma linha
   inexistente) e criar duas reservas. Achado real durante os testes de
   integração desta sprint, corrigido antes da homologação.
2. `private.cleanup_expired_reservations(user_id)` — mecanismo já homologado
   na Sprint 1, reaproveitado sem alteração.
3. Garante linha de `daily_quotas` do dia atual.
4. Verifica `used_count + reserved_count < daily_limit`.
5. Cria (ou reabre, em caso de retry pós-`FAILED`) o lock como `PENDING`,
   `quota_date` = hoje, `expires_at` = agora + TTL.
6. `reserved_count += 1`.

A chamada ao Gemini ocorre **inteiramente fora** de qualquer transação de
banco — nunca há `BEGIN → chamar Gemini → COMMIT`.

**Fase 2a — sucesso (`complete_analysis`, transação curta):**
verifica lock ainda `PENDING` e não expirado → insere em `analyses` →
`reserved_count -= 1`, `used_count += 1` → lock `COMPLETED` com
`analysis_id`.

**Fase 2b — falha (`fail_analysis`, transação curta):**
`reserved_count -= 1` (nunca negativo, `GREATEST(0, ...)`) → lock `FAILED`.
`used_count` nunca aumenta em caso de falha — a cota nunca é debitada
permanentemente por um erro da IA.

## 9. Idempotência

Header `Idempotency-Key` (UUID) obrigatório. Escopo: `(user_id,
idempotency_key)` — chaves de usuários diferentes nunca colidem, mesmo com o
mesmo valor de UUID. Semântica:

- `COMPLETED` → retorna a análise já persistida, sem nova chamada de IA, sem
  debitar cota novamente.
- `PENDING` (não expirado) → `409`, requisição concorrente em andamento.
- `FAILED` → permite retry: a mesma chave é reaberta como nova reserva.

## 10. RPCs

`reserve_analysis_slot`, `complete_analysis` e `fail_analysis` são
`SECURITY DEFINER`, `SET search_path = ''`, com `REVOKE` de
`PUBLIC`/`anon`/`authenticated` e `GRANT` exclusivo a `service_role`.
Deliberadamente no schema **`public`** (não `private`) — confirmado
empiricamente que, com `db.schemas = ["public","graphql_public"]` no
PostgREST, uma função em `private` não é alcançável via `admin.rpc(...)`
(o client real do backend usa a REST API do Supabase, não uma conexão direta
ao Postgres). O mesmo padrão já usado em `public.complete_onboarding` na
Sprint 2 foi replicado aqui, e testado via chamada REST real antes de
qualquer teste automatizado.

## 11. Tratamento de Falhas

| Cenário | HTTP | Efeito na cota |
| --- | --- | --- |
| Sem sessão | 401 | — |
| Onboarding incompleto | 403 | — |
| Payload inválido / campo proibido | 400 | — |
| `Idempotency-Key` ausente/inválida | 400 | — |
| Requisição concorrente em andamento | 409 | reserva mantida (da 1ª) |
| Cota diária esgotada | 429 (`DAILY_LIMIT_REACHED`, `limit`) | — |
| Timeout do Gemini | 503 | estornada |
| Erro HTTP do Gemini | 502 | estornada |
| Resposta fora do schema (após retry) | 422 | estornada |
| Erro interno inesperado | 500 | — |

Nenhuma resposta de erro expõe stack trace, chave de API ou detalhes
internos — apenas um código de erro estável e uma mensagem genérica.

## 12. Retries e Timeout

`AI_MAX_SCHEMA_RETRIES = 1`: no máximo 1 nova tentativa quando a resposta
viola o schema estruturado (nunca loop ilimitado). Timeout explícito
`AI_REQUEST_TIMEOUT_MS` via `AbortController` — nunca deixa a chamada
pendurada; ao expirar, sempre libera a reserva (`fail_analysis`). O valor
(45s) foi calibrado empiricamente a partir da latência real observada em
modelos gemini-3.x com "thinking" variável — ver
`docs/SPRINT_3_MODEL_BENCHMARK.md`.

## 13. Segurança

- `SUPABASE_SERVICE_ROLE_KEY` e `GEMINI_API_KEY` são lidos exclusivamente
  server-side (`process.env` dentro de Route Handlers/serviços); nunca em
  Client Component, nunca prefixados com `NEXT_PUBLIC_`, nunca logados, nunca
  incluídos em qualquer resposta HTTP.
- Zero escrita direta do navegador: nenhuma policy `INSERT`/`UPDATE` foi
  adicionada para `authenticated` em `daily_quotas`, `idempotency_locks`,
  `analyses` ou `events` — toda escrita passa pelas RPCs `SECURITY DEFINER`
  restritas a `service_role` (regressão confirmada em
  `tests/integration/supabase-rls.test.ts` e `analysis-engine.test.ts`).
- Prompt injection: o system prompt declara explicitamente que o conteúdo de
  `question`/`userAnswer`/`correctAnswer`/`officialExplanation` é dado a
  analisar, nunca instrução. Testado com tentativas reais embutidas no
  dataset de benchmark (`tags: ['prompt-injection']`).
- Payload hostil: campos como `user_id`, `role`, `confidence`, `error_type`,
  `card_action` nunca são aceitos do cliente (`analysisInputSchema.strict()`
  rejeita qualquer campo desconhecido com 400); identidade e privilégios
  vêm exclusivamente da sessão do servidor.

## 14. Limitações Conhecidas

- Sem busca externa/RAG nesta sprint — o modelo trabalha exclusivamente com
  os 4 campos de entrada, por desenho.
- `learning_gap_concept`/`coreConcept` é um rótulo curto gerado pelo modelo,
  não uma taxonomia própria fechada (fica em texto livre validado apenas por
  tamanho).
- O benchmark real de 90 casos ficou limitado pela cota diária do tier
  gratuito da chave usada nesta sprint — ver
  `docs/SPRINT_3_MODEL_BENCHMARK.md` para o resultado exato e o bloqueador.
- Interface de usuário para o motor pertence à Sprint 4 (fora de escopo
  aqui).
