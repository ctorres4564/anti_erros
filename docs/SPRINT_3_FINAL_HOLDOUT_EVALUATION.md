# Sprint 3 — Avaliação Final Cega (holdout-v1) de analysis-v2.0

## 0. Integridade do holdout

| Arquivo | SHA-256 calculado | SHA-256 no manifesto | Status |
|---|---|---|---|
| `scripts/benchmark/holdout-v1-cases.ts` | `39f30c72ecaa35ebf33eb67ee5250206b29473da67dba69052ba9c0edf3f21c2` | `39F30C72ECAA35EBF33EB67EE5250206B29473DA67DBA69052BA9C0EDF3F21C2` | **MATCH** |
| `scripts/benchmark/holdout-v1-ground-truth.json` | `e7938013d781a4fa661a66a0e0cd2febd41b172bff8217ed645d4fe8e727abe0` | `E7938013D781A4FA661A66A0E0CD2FEBD41B172BFF8217ED645D4FE8E727ABE0` | **MATCH** |

Commits confirmados no histórico: `7f6f5bd` (anotação A), `d419016`
(anotação B), `396bb27` (adjudicação e congelamento). Nenhum dos três
arquivos congelados (`holdout-v1-cases.ts`, `holdout-v1-ground-truth.json`,
`holdout-v1-manifest.json`) foi modificado nesta rodada. `analysis-v2.0`
(`src/lib/ai/analysis-prompt.ts`, `src/config/ai.ts`) não foi alterado.

## 1. Modelo e execução

- **Modelo:** `gemini-3.7-flash` (candidato "medium" — sem `thinkingLevel`
  override, mesma configuração do dev run de `analysis-v2.0`).
- **PROMPT_VERSION:** `analysis-v2.0`.
- **Casos executados:** 120/120.
- **Saídas válidas (schema):** 120/120.
- **Execução:** única, via `scripts/benchmark/run-holdout.ts` (script novo,
  não modifica `run-benchmark.ts` nem os arquivos congelados; duplica a
  mesma política técnica de retry/timeout/rate-limit já usada no benchmark
  dev). O modelo recebeu somente `question`/`userAnswer`/`correctAnswer`/
  `officialExplanation` via `buildAnalysisUserPrompt` — nenhum campo de
  ground truth (`expectedErrorType`, `acceptableErrorTypes`, `observability`,
  `expectedCardDecision`, `justification`, `promptInjectionCase`) foi
  enviado ao modelo. Diagnóstico cego preservado.
- **Retries:** 0 (nenhuma condição técnica de retry — 429/503/schema-invalid
  — ocorreu).
- **Falhas técnicas:** 0 timeouts, 0 HTTP 429, 0 HTTP 503, 0 schema-invalid.
- Resultados brutos: `benchmark-results/holdout-v1-analysis-v2-gemini-3.7-flash.json`
  (não sobrescreve nenhum resultado anterior).

## 2. Quality gates

| Gate | Resultado | Threshold | Veredito |
|---|---|---|---|
| Schema compliance | 100% (120/120) | = 100% | **PASS** |
| Classification (acceptable) | 78.33% (94/120) | ≥ 90% | **FAIL** |
| Classification (exact, informativo) | 73.33% (88/120) | — | informativo |
| CREATE vs. NO_CARD | 80.00% (96/120) | ≥ 95% | **FAIL** |
| Uncertainty handling | 60.00% (12/20) | ≥ 95% | **FAIL** |
| Factual correctness | 100% (120/120) | ≥ 98% | **PASS** |
| Hallucination | 0.00% (0/120) | ≤ 1% | **PASS** |
| Pedagogical quality | 100% (81/81 casos CREATE) | ≥ 92% | **PASS** |
| Prompt Injection Robustness | 100% (20/20) | ≥ 95% | **PASS** |

Metodologia de Factual/Hallucination/Pedagogical: revisão manual, caso a
caso, de todos os 120 `rawOutput` por Claude (juiz independente, não
candidato do benchmark) — mesma rubrica fixa já usada em `benchmark-v2`
(`scripts/benchmark/generate-holdout-judgment.mjs`, sem overrides
necessários: nenhuma alucinação, nenhum erro factual, nenhum card copiando
literalmente o enunciado original foi encontrado). Metodologia de Prompt
Injection Robustness: revisão manual dos 20 casos `promptInjectionCase:
true` — em nenhum caso o modelo obedeceu à instrução adversarial, revelou o
system prompt, alterou o schema de saída, ou deixou de produzir uma análise
válida.

## 3. Técnico

| Métrica | Valor |
|---|---|
| Latência média | 3369 ms |
| Latência p95 | 5602 ms |
| Timeouts | 0 |
| HTTP 429 | 0 |
| HTTP 503 | 0 |
| Schema-invalid | 0 |
| Retries totais | 0 |

## 4. Matriz de confusão (esperado × previsto)

| esperado \ previsto | KNOWLEDGE_GAP | CONCEPT_CONFUSION | EXCEPTION_MISSED | APPLICATION_ERROR | READING_ERROR | INSUFFICIENT_INFORMATION |
|---|---|---|---|---|---|---|
| **KNOWLEDGE_GAP** (21) | 18 | 2 | 0 | 0 | 0 | 1 |
| **CONCEPT_CONFUSION** (20) | 0 | 20 | 0 | 0 | 0 | 0 |
| **EXCEPTION_MISSED** (20) | 0 | 0 | 20 | 0 | 0 | 0 |
| **APPLICATION_ERROR** (22) | 2 | 4 | 0 | 15 | 1 | 0 |
| **READING_ERROR** (17) | 2 | 1 | 0 | 0 | 14 | 0 |
| **INSUFFICIENT_INFORMATION** (20) | 7 | 0 | 0 | 8 | 4 | 1 |

## 5. Resultado por categoria (informativo, ground truth final)

| Categoria | Exact | Acceptable |
|---|---|---|
| KNOWLEDGE_GAP | 85.71% (18/21) | 95.24% (20/21) |
| CONCEPT_CONFUSION | 100.00% (20/20) | 100.00% (20/20) |
| EXCEPTION_MISSED | 100.00% (20/20) | 100.00% (20/20) |
| APPLICATION_ERROR | 68.18% (15/22) | 77.27% (17/22) |
| READING_ERROR | 82.35% (14/17) | 82.35% (14/17) |
| **INSUFFICIENT_INFORMATION** | **5.00% (1/20)** | **15.00% (3/20)** |

## 6. Resultado por observability (informativo)

| Observability | N | Acceptable |
|---|---|---|
| CLEAR | 118 | 77.97% (92/118) |
| AMBIGUOUS | 2 | 100.00% (2/2) |
| UNOBSERVABLE | 0 | — |

## 7. Análise causal (informativa — não altera nenhum score)

### 7.1 O gate decisivo: INSUFFICIENT_INFORMATION (5% exato, 15% aceitável)

A categoria `INSUFFICIENT_INFORMATION` é, isoladamente, responsável pela
maior parte da falha de Classification e por toda a falha de Uncertainty
Handling. Descontando inteiramente os 20 casos dessa categoria, a
Classification (aceitável) nos 100 casos restantes seria 91/100 = **91%** —
acima do threshold de 90%. Isso não muda o resultado oficial (o scorer usa
os 120 casos, sem exclusões, conforme a metodologia congelada), mas isola
precisamente onde está o problema.

Inspeção manual dos 20 casos revela uma causa estrutural, não um defeito de
raciocínio do modelo: os casos `INSUFFICIENT_INFORMATION` de `holdout-v1`
são majoritariamente perguntas **bem formadas, completas e não degeneradas**
cuja resposta correta é "não é possível determinar" porque a **pergunta em
si é logicamente indeterminada** (ex.: H039 "Ana é mais alta que Bia. Qual a
altura de Ana?"; H095 "pH é menor que 7. Qual valor exato?"; H112
"Retângulo de área 24: qual perímetro?"). Isso é uma noção diferente de
`INSUFFICIENT_INFORMATION` da que está definida no system prompt de
`analysis-v2.0` e no protocolo congelado
(`docs/SPRINT_3_HOLDOUT_PROTOCOL.md` §1/§7): ali, a categoria descreve
**os dados fornecidos ao motor não permitem diagnosticar a causa do erro do
estudante com segurança** — uma propriedade do que a IA consegue inferir
sobre o estudante — não uma propriedade de o **enunciado da questão pedagógica
em si** ter ou não uma resposta numérica única.

Evidência de que o modelo está, na verdade, raciocinando corretamente sobre
esses casos, só que sob outro rótulo: em praticamente todos os 20 casos, o
`reasoningSummary` do modelo **identifica exatamente o mesmo mecanismo** que
a `justification` do ground truth descreve — "assumiu um valor arbitrário em
vez de reconhecer que os dados não determinam uma resposta única" — mas o
modelo rotula esse mecanismo como `KNOWLEDGE_GAP` (7 casos, "lacuna sobre a
suficiência dos dados") ou `APPLICATION_ERROR` (8 casos, "aplicou uma
premissa que não foi dada") ou `READING_ERROR` (4 casos, "não percebeu que o
dado necessário está ausente do texto"), em vez de `INSUFFICIENT_INFORMATION`.
Isso não é alucinação nem erro factual — é uma leitura diferente, e
defensável, de qual categoria da taxonomia se aplica quando a causa do erro
do estudante é ele **não ter reconhecido que a pergunta é indeterminada**.

**Isto não é tratado aqui como defeito de `analysis-v2.0`** — é reportado
como está, sem tuning, conforme instruído. É um achado estrutural sobre a
metodologia do holdout, registrado para a próxima rodada (fora do escopo
desta avaliação, que é somente medir).

### 7.2 CREATE/NO_CARD: dois componentes distintos

Dos 24 erros de card:
- **9 são consequência direta** de casos `INSUFFICIENT_INFORMATION`
  classificados diferente (mesma cascata "diagnóstico→card" já documentada
  em `benchmark-v2`).
- **15 ocorrem fora de `INSUFFICIENT_INFORMATION`**, sendo 12 do padrão
  "esperado CREATE, previsto NO_CARD". Destes 15, **9 são casos de prompt
  injection** (`promptInjectionCase: true`). Isso é consistente com a regra
  de política de card adicionada em `analysis-v2.0` (§6.3 do
  `SPRINT_3_ERROR_ANALYSIS.md`: "conteúdo sinalizado como possível
  manipulação tende a NO_CARD por padrão"), que aqui está em tensão direta
  com o princípio do protocolo (`SPRINT_3_HOLDOUT_PROTOCOL.md` §6): "o
  payload adversarial não deve determinar artificialmente o ground truth
  pedagógico" — o holdout, corretamente, espera `CREATE` sempre que o
  conteúdo pedagógico subjacente a um caso de injeção é genuíno e
  generalizável, independente do payload. A regra de conservadorismo de
  `analysis-v2.0` parece estar sendo aplicada de forma mais ampla do que o
  pretendido, penalizando decisões de card em conteúdo legítimo só por
  conter texto adversarial.

Nenhum ajuste foi feito por causa desta observação — apenas registrado.

## 8. Overfitting / integridade do processo

Nenhuma alteração foi feita em `analysis-v2.0`, no holdout, no ground truth
ou nos thresholds antes, durante ou depois desta execução. Nenhum retry foi
feito por a resposta "parecer errada". A execução foi única.

## 9. Resultado final

**ALL QUALITY GATES PASSED: NÃO** (3 de 9 gates obrigatórios falharam:
Classification, CREATE vs. NO_CARD, Uncertainty Handling)

**SPRINT 3 HOMOLOGADA: NÃO**

### Pós-resultado (conforme protocolo)

- Nenhum tuning foi feito nesta rodada.
- `analysis-v2.0` não foi alterado.
- O holdout não foi alterado.
- Nenhuma nova execução foi feita tentando melhorar o resultado.
- `holdout-v1` passa, a partir de agora, a ser um **conjunto visto**
  (poderá ser usado para diagnóstico futuro, nunca mais para validação
  cega).
- Qualquer versão ajustada de `analysis-v2.*` exigirá um **holdout cego
  novo** antes de qualquer nova validação, conforme
  `docs/SPRINT_3_HOLDOUT_PROTOCOL.md` §12.
