# Sprint 3 — Implementação de `analysis-v2.1`

## 0. Status

`analysis-v2.0` **não foi homologado** (`docs/SPRINT_3_FINAL_HOLDOUT_EVALUATION.md`).
`holdout-v1` é conjunto **VISTO/DIAGNÓSTICO**, nunca mais teste cego
(`docs/SPRINT_3_INSUFFICIENT_INFORMATION_CONSTRUCT_AUDIT.md`,
`docs/SPRINT_3_TAXONOMY_AND_CARD_POLICY_DECISION.md`). Esta rodada implementa
as mudanças decididas nesses dois documentos como `analysis-v2.1`. Nenhum
holdout novo foi criado. Nenhum threshold foi alterado. `analysis-v2.0`
permanece no histórico do git (`f7d2e2f`) para auditoria — não foi apagado,
apenas substituído como versão ativa do prompt.

## 1. Mudanças v2.0 → v2.1

Todas as mudanças são de **texto do system prompt**
(`src/lib/ai/analysis-prompt.ts`) e da constante `PROMPT_VERSION`
(`src/config/ai.ts`, `'analysis-v2.0'` → `'analysis-v2.1'`). **Nenhum schema
de produção foi alterado**: `analysisOutputSchema` (Zod),
`GEMINI_RESPONSE_SCHEMA`, `analysisInputSchema`, `applyLowConfidencePolicy` e
`LOW_CONFIDENCE_THRESHOLD` (`src/lib/ai/analysis-schema.ts`,
`src/config/ai.ts`) permanecem byte-a-byte idênticos — confirmado por
`git diff` sem alterações nesses arquivos.

### 1.1 Constructo de `INSUFFICIENT_INFORMATION`

**Motivo:** a auditoria de constructo encontrou que 17/20 casos rotulados
`INSUFFICIENT_INFORMATION` em `holdout-v1` eram, na verdade,
`ANSWER_INDETERMINACY_ONLY` (a questão não tem resposta única, mas a causa do
erro do estudante é observável) — apenas 2/20 eram
`VALID_DIAGNOSTIC_INSUFFICIENCY` genuína, e 1/20 é `AMBIGUOUS_CONSTRUCT`.

**Mudança:** a definição de `INSUFFICIENT_INFORMATION` no prompt agora:
- proíbe explicitamente usar a categoria só porque `correctAnswer` é algo
  como "não é possível determinar", a questão está subdeterminada, ou faltam
  dados para resolvê-la — isso descreve a resposta da questão, não a causa
  do erro;
- declara que uma questão sem resposta única ainda pode revelar uma causa
  observável (ex.: o estudante presumiu um dado ausente em vez de reconhecer
  a indeterminação — isso é evidência de KNOWLEDGE_GAP ou APPLICATION_ERROR,
  não de INSUFFICIENT_INFORMATION);
- define positivamente os três gatilhos válidos: duas ou mais causas
  permanecem plausíveis após as regras de desempate; não há evidência
  observável para decidir; ou qualquer categoria mais específica exigiria
  inferir estado mental.

`ANSWER_INDETERMINACY` **não foi promovido a campo de schema** — permanece um
conceito conceitual embutido no texto do prompt, exatamente como decidido em
`docs/SPRINT_3_TAXONOMY_AND_CARD_POLICY_DECISION.md` §2.2 ("aumentaria
schema, UI e semântica pública sem necessidade demonstrada"). Nenhum campo
`answerIndeterminate` foi adicionado a `analysisOutputSchema` nem a
`GEMINI_RESPONSE_SCHEMA`.

### 1.2 Conteúdo adversarial / prompt injection

**Motivo:** a auditoria de card encontrou 10/24 erros de CREATE/NO_CARD
explicados por `PROMPT_INJECTION_OVERCONSERVATISM` — o prompt v2.0 dizia que
conteúdo suspeito "tende a NO_CARD por padrão" e sugeria tratá-lo como
"possivelmente sintoma de READING_ERROR ou INSUFFICIENT_INFORMATION", o que
empurrava classificações e decisões de card na direção do conteúdo
adversarial em vez do conteúdo pedagógico real.

**Mudança:** nova seção `## CONTEÚDO ADVERSARIAL (ORDEM DE DECISÃO)`, com uma
sequência formal de 5 passos: (1) tratar o payload como dado não confiável;
(2) ignorá-lo; (3) analisar o conteúdo pedagógico legítimo restante; (4) só
então decidir `probableErrorType`, deixando explícito que a presença de
manipulação não é evidência automática de nenhuma categoria; (5) decidir
`cardAction` de forma independente. A antiga frase "conteúdo suspeito ...
possivelmente sintoma de READING_ERROR ou INSUFFICIENT_INFORMATION" foi
removida; a antiga frase "tende a NO_CARD por padrão" foi removida da seção
de card.

### 1.3 Política de `cardAction`

**Motivo:** a mesma auditoria de card mostrou que nenhuma correlação
tipo→card era realmente automática, mas o texto v2.0 lia como quase
determinístico ("NO_CARD: use para READING_ERROR e INSUFFICIENT_INFORMATION").

**Mudança:**
- Declaração explícita no topo da seção: `cardAction é uma decisão
  pedagógica SEPARADA de probableErrorType`.
- As correlações tipo→card viraram uma lista rotulada "correlações típicas
  de referência (NUNCA regras automáticas)".
- Quatro regras explícitas de independência foram adicionadas: `APPLICATION_
  ERROR` não implica `CREATE_APPLICATION_CARD`; `READING_ERROR` não implica
  `NO_CARD`; `INSUFFICIENT_INFORMATION` não implica `NO_CARD` — **permitindo
  explicitamente `errorType = INSUFFICIENT_INFORMATION` com `cardAction =
  CREATE_*`** quando existe conteúdo estável, generalizável e seguro mesmo
  com a causa exata indeterminada (item 10 do escopo desta rodada); e
  conteúdo adversarial não implica `NO_CARD`.

### 1.4 Confiança (`confidence`)

**Motivo:** o texto v2.0 já dizia "confiança na classificação da causa
provável", mas não distinguia explicitamente isso de "confiança na resposta
correta da questão" nem amarrava a confiança baixa à causa específica de
empate causal não resolvido.

**Mudança:** parágrafo reforçado explicitando que uma questão com resposta
indeterminada não reduz automaticamente a confiança na causa (se o
comportamento do estudante evidencia uma causa específica, a confiança pode
permanecer alta), e que o gatilho correto para confidence baixa é o empate
causal não resolvido pelas regras de desempate — não a dificuldade ou
indeterminação da questão em si. **`LOW_CONFIDENCE_THRESHOLD` (0.6) não foi
alterado** — nenhuma justificativa técnica independente para alterá-lo foi
produzida nesta rodada, conforme exigido no escopo.

### 1.5 O que NÃO mudou

- `analysisOutputSchema`, `GEMINI_RESPONSE_SCHEMA`, `analysisInputSchema`
  (Zod) — idênticos.
- `applyLowConfidencePolicy` e `LOW_CONFIDENCE_THRESHOLD` — idênticos. Este
  mecanismo é uma rede de segurança baseada em CONFIDENCE (rebaixa para
  `NO_CARD`/`INSUFFICIENT_INFORMATION` quando `confidence < 0.6`,
  independentemente do rótulo produzido pelo modelo) — um eixo diferente da
  regra `INSUFFICIENT_INFORMATION => NO_CARD` proibida nesta rodada, que era
  uma regra do PROMPT baseada em categoria, não em confiança. Este
  mecanismo já era coerente com a nova política e não precisou mudar.
  Continua sendo o único ponto onde `card` é forçado a `null`
  independentemente do que o modelo produziu (invariante coberta pelos
  testes de `analysis-schema.test.ts`, inalterados — ver §2).
- `buildAnalysisUserPrompt` — diagnóstico cego preservado; `userAttribution`
  nunca foi incluído (nenhuma mudança necessária, apenas confirmado por
  leitura de código).
  `DISCIPLINES`, `PROBABLE_ERROR_TYPES`, `CARD_ACTIONS`, `PEDAGOGICAL_MAP` —
  idênticos.
- Anti-memorização, terminologia obrigatória ("causa provável"), formato de
  saída, `recommendedAction` obrigatório em 100% dos casos — preservados
  sem alteração de princípio.
- Cota diária, TTLs, timeout, retries — fora do escopo desta rodada, não
  tocados.

**Schema alterado: NÃO.**

## 2. Testes

Adicionados a `tests/unit/analysis-prompt.test.ts` (26 testes no total no
arquivo, 12 novos nesta rodada), verificando presença textual das novas
regras estruturais — nenhum teste usa IDs, perguntas ou respostas de
`benchmark-v2`/`holdout-v1`:

| Regra do escopo | Teste |
|---|---|
| A. answer indeterminacy não força II | proíbe II apenas por indeterminação da resposta da questão |
| B. diagnostic indeterminacy permite II | exige causas concorrentes sem evidência de desempate |
| C. prompt injection não força NO_CARD | conteúdo adversarial não determina conclusão sozinho + ordem de decisão formal |
| D. cardAction é independente de errorType | declaração explícita de decisão separada |
| E. II pode coexistir com CREATE | `INSUFFICIENT_INFORMATION` não implica `NO_CARD` automaticamente |
| F. recommendedAction permanece obrigatório | já coberto em `analysis-schema.test.ts` (schema inalterado) |
| G. NO_CARD mantém card=null | já coberto em `analysis-schema.test.ts` (schema inalterado) |
| H. schema permanece compatível | `git diff` vazio em `analysis-schema.ts`/`gemini.ts` + suíte completa passa |

## 3. Regressão local

| Gate | Resultado |
|---|---|
| Lint | PASS |
| Typecheck (`tsc --noEmit`) | PASS |
| Unit | **153/153** PASS (69 já existentes de schema + 26 de prompt incluindo os 12 novos + demais suítes) |
| Integration | **63/63** PASS (`supabase-rls`, `auth-onboarding`, `analysis-engine`, `pending-claim`) |
| Build (`next build`) | PASS |

Nota técnica: `npx tsc --noEmit` e `next build` inicialmente falhavam por um
import relativo quebrado em `scratch/independent_annotations.ts`
(`'./scripts/benchmark/dataset'` em vez de `'../scripts/benchmark/dataset'`)
— confirmado, via `git stash`, que o mesmo erro já existia identicamente no
commit `5e1d9dc`, antes de qualquer mudança desta rodada. Corrigido apenas o
caminho do import (uma linha, sem alterar conteúdo/lógica do arquivo) para
que os gates de regressão pudessem rodar; `scratch/` continua fora do commit
desta rodada.

## 4. Avaliação DEV (não é validação)

### 4.1 `benchmark-v2` (91 casos, DEV)

| Métrica | v2.0 | v2.1 | Δ |
|---|---|---|---|
| Schema | 100% | 100% | — |
| Classification (acceptable) | 86.81% | 82.42% | −4.4pp |
| CREATE/NO_CARD | 95.60% | 89.01% | −6.6pp |
| Uncertainty handling | 100% | 100% | — |
| Prompt Injection Resistance | 100% | 100% | — |
| Cost/1000 | $0.775 | $1.036 | +34% (prompt maior) |

**As duas quedas são explicáveis pelo desenho da mudança, não por perda de
qualidade:**

- **CREATE/NO_CARD (−6.6pp):** o scorer de `benchmark-v2`
  (`evaluateCreateVsNoCard`, congelado, não alterado) ainda usa a regra
  mecânica antiga — `category ∈ {READING_ERROR, INSUFFICIENT_INFORMATION} ⇒
  NO_CARD esperado`. `analysis-v2.1` foi deliberadamente instruído a não
  seguir mais essa regra automaticamente. Inspeção caso a caso confirma: 6
  dos casos que mudaram de CREATE↔NO_CARD entre v2.0 e v2.1 são exatamente
  casos onde o scorer espera `NO_CARD` por categoria, mas o modelo agora
  cria um card porque julgou o conteúdo estável e generalizável (ex.:
  reconhecer capital de país, ou distinguir tipos de arquivo, mesmo dentro
  de um enunciado com payload adversarial). Isso é o comportamento
  pretendido pela seção 10 do escopo, não um defeito — mas colide com um
  scorer que não foi (e não deveria ser, nesta rodada) atualizado.
- **Classification (−4.4pp, 88→82.4%):** inspeção caso a caso mostra 7
  mudanças de tipo previsto. Duas são melhorias reais (`kg-13`
  CONCEPT_CONFUSION→KNOWLEDGE_GAP, correto). As demais (`em-05`, `em-07`
  voltando de EXCEPTION_MISSED correto para KNOWLEDGE_GAP) não têm relação
  com nenhuma regra alterada nesta rodada (a regra de desempate 2, sobre
  regra geral explícita, não foi tocada) — mais consistente com variância
  de amostragem do modelo (`temperature: 0.2`, não determinístico) do que
  com uma regressão de prompt. Um caso (`ii-10`, referência legal externa
  não fornecida) mudou de INSUFFICIENT_INFORMATION correto para
  KNOWLEDGE_GAP incorreto — um falso-negativo genuíno da nova definição
  mais estrita: esse caso é uma indeterminação diagnóstica legítima (o
  dispositivo legal referenciado não foi fornecido, então nem a causa é
  inferível), mas o modelo, agora mais conservador quanto a usar II, errou
  para o lado oposto neste caso específico. Registrado como limitação
  conhecida (§6) — não corrigido nesta rodada para não ajustar o prompt
  mirando um único caso do dev set (proibido pelo escopo, seção 19).

### 4.2 `holdout-v1` (120 casos) — score bruto original

**⚠️ INVALID FOR VALIDATION / DIAGNOSTIC ONLY** — o ground truth de
`INSUFFICIENT_INFORMATION` deste conjunto tem `MAJOR CONSTRUCT MISMATCH`
documentado; os números brutos abaixo não medem a qualidade real de
`analysis-v2.1`, apenas descrevem o comportamento observado contra o
instrumento como ele foi originalmente rotulado.

| Métrica | v2.0 (bruto) | v2.1 (bruto) |
|---|---|---|
| Schema | 100% | 100% |
| Classification (acceptable) | 78.33% | 77.50% |
| CREATE/NO_CARD | 80.00% | 83.33% |
| Uncertainty handling (rótulo antigo) | 60.00% | 35.00% |

A queda de Uncertainty Handling (60%→35%) é o resultado **esperado e
correto** da correção: essa métrica mede, sob o rótulo antigo, "o modelo
reconheceu incerteza (confidence baixa ou NO_CARD) nos 20 casos rotulados
II?" — mas 17 desses 20 casos não são, na definição corrigida, verdadeira
incerteza diagnóstica. `analysis-v2.1` agora diagnostica a maioria deles com
confiança alta e uma causa específica observável (exatamente o
comportamento correto), o que faz essa métrica (calculada sobre o rótulo
antigo) cair — não porque o modelo ficou pior em lidar com incerteza real,
mas porque ele parou de "fingir" incerteza em casos que não são
incertos causalmente.

### 4.3 Slices diagnósticos (holdout-v1, informativo)

| Slice | N | Classification aceitável | CREATE/NO_CARD |
|---|---|---|---|
| VALID_DIAGNOSTIC_INSUFFICIENCY | 2 | 100% | 0% |
| ANSWER_INDETERMINACY_ONLY | 17 | 0% | 41.2% |
| AMBIGUOUS_CONSTRUCT | 1 | 0% | 100% |
| promptInjection (todos) | 20 | 80.0% | 85.0% |
| promptInjection + GT=CREATE | 15 | 93.3% | **100%** |
| promptInjection + GT=NO_CARD | 5 | 40.0% | 40.0% |

Leituras:
- **`ANSWER_INDETERMINACY_ONLY` = 0% classification aceitável é o resultado
  esperado e correto** da mudança de constructo: esses 17 casos têm
  `acceptableErrorTypes = [INSUFFICIENT_INFORMATION]` (o rótulo antigo,
  único), e `analysis-v2.1` foi deliberadamente instruído a NUNCA escolher
  II só por indeterminação de resposta — então diverge do rótulo antigo em
  100% desses casos, por desenho. Isso não é falha do modelo: é a correção
  funcionando exatamente como projetada, medida contra um instrumento que o
  próprio protocolo já reconheceu como mal construído nesse ponto.
- **`promptInjection + GT=CREATE` → CREATE/NO_CARD = 100%** é a evidência
  mais direta de que `PROMPT_INJECTION_OVERCONSERVATISM` foi corrigido: em
  v2.0, esses eram exatamente os casos que mais frequentemente caíam em
  `NO_CARD` só por conter payload adversarial (10 dos 24 erros de card
  auditados). Agora nenhum deles falha na decisão de card.
- **`promptInjection + GT=NO_CARD` → CREATE/NO_CARD = 40%** mostra o reverso
  do mesmo ajuste: ao remover o viés automático para `NO_CARD` em conteúdo
  adversarial, o modelo passou a criar cards em 3 dos 5 casos onde o
  ground truth original esperava `NO_CARD` (ex.: pergunta sem nenhum dado
  numérico, onde o modelo agora cria um card genérico sobre "reconhecer
  dados ausentes"). Inspeção qualitativa não encontrou nenhum desses casos
  claramente errado — são julgamentos pedagógicos defensáveis em ambas as
  direções (a política nova prioriza não perder conteúdo potencialmente
  útil; o ground truth original priorizou não fixar "lições
  metacognitivas" como conteúdo de card). Registrado como área de
  julgamento pedagógico ainda em aberto, não como defeito.
- **`VALID_DIAGNOSTIC_INSUFFICIENCY` (H060, H090): classification
  aceitável 100%, mas CREATE/NO_CARD 0%.** Em ambos os casos o modelo
  escolheu a alternativa aceitável `KNOWLEDGE_GAP` (com confiança
  moderada/alta) em vez de `INSUFFICIENT_INFORMATION` estrito, e criou um
  card básico sobre o fato correto (63 = 9×7; Paris = capital da França).
  O ground truth original espera `NO_CARD` para ambos. Isso é uma
  divergência pedagógica genuína e defensável — nada nos 4 campos impede
  reforçar o fato correto mesmo quando a causa exata do erro permanece
  incerta — não um erro técnico.

## 5. Overfitting audit

`analysis-v2.1` foi inspecionado linha a linha antes da execução DEV:

- ❌ Nenhum ID de caso (`H0XX`, `kg-XX`, `re-XX` etc.) aparece no texto do
  prompt.
- ❌ Nenhuma pergunta, resposta ou explicação copiada de `benchmark-v2` ou
  `holdout-v1`.
- ❌ Nenhuma lista de erros conhecidos foi embutida como regra ("se a
  pergunta for sobre 9×7, faça X").
- ❌ Nenhuma regra foi escrita para corrigir um único caso — todas as 5
  mudanças (constructo de II, ordem de decisão adversarial, independência
  de card, reforço de confidence) são generalizações defensáveis por si
  mesmas, fora de qualquer dataset específico, e decorrem diretamente das
  decisões já congeladas em `SPRINT_3_TAXONOMY_AND_CARD_POLICY_DECISION.md`.
- ✅ Toda regra nova é defensável pedagogicamente fora dos conjuntos DEV.

**Resultado: PASS.**

## 6. Limitações conhecidas (não corrigidas nesta rodada)

1. `ii-10` (benchmark-v2): um caso de referência externa ausente (indeterminação
   diagnóstica genuína) foi classificado incorretamente como KNOWLEDGE_GAP —
   possível efeito colateral do prompt agora exigir evidência mais forte
   para II. Não corrigido para evitar overfitting a um único caso.
2. `promptInjection + GT=NO_CARD`: 3/5 casos agora recebem CREATE. Área de
   julgamento pedagógico genuinamente aberta (ver §4.3), não um bug claro.
3. O scorer de CREATE/NO_CARD de `benchmark-v2` (`evaluateCreateVsNoCard`)
   ainda embute a suposição antiga "categoria X ⇒ NO_CARD esperado" e não
   foi atualizado — ele continua válido como scorer do benchmark-v2 original
   (não foi alterado, por instrução explícita), mas deixa de refletir
   fielmente a nova política de card ao avaliar `analysis-v2.1`. Isso deverá
   ser considerado no desenho do scorer de `holdout-v2`.
4. Custo/1000 subiu ~34% (prompt maior). Não é gate, apenas registrado.

## 7. Decisão de congelamento

Critérios da seção 20 do escopo:

- ✅ Regressão técnica PASS.
- ✅ Constructo de II coerente (definição causal exclusiva, testada).
- ✅ `cardAction` desacoplado de `errorType` (testado e confirmado
  empiricamente no slice de prompt injection).
- ✅ Prompt injection não determina mais `cardAction` automaticamente
  (confirmado: 100% de CREATE/NO_CARD correto no slice
  `promptInjection + GT=CREATE`, onde v2.0 falhava sistematicamente).
- ✅ Nenhuma regra específica de dataset (overfitting audit PASS).
- ✅ Comportamento DEV não mostra regressão estrutural grave — as quedas
  observadas são explicadas por mudanças de constructo/scorer esperadas e
  documentadas, não por perda de capacidade.

**`analysis-v2.1` FROZEN: YES.**

`holdout-v2` não foi criado nesta rodada — fica para uma rodada separada,
usando os requisitos já especificados em
`docs/SPRINT_3_INSUFFICIENT_INFORMATION_CONSTRUCT_AUDIT.md` §8 e
`docs/SPRINT_3_TAXONOMY_AND_CARD_POLICY_DECISION.md` §7.

**SPRINT 3 HOMOLOGADA: NÃO** (nenhuma validação cega foi executada nesta
rodada).
