# Sprint 3 — Holdout-v2, Anotação Independente e Cega B

## 0. Escopo e cegamento

Esta é a segunda anotação independente e cega dos 120 casos de `holdout-v2`
(`V001`–`V120`), produzida exclusivamente a partir de:

1. `docs/SPRINT_3_HOLDOUT_V2_PROTOCOL.md` (protocolo congelado);
2. `scripts/benchmark/holdout-v2-cases.ts` (`question`, `userAnswer`,
   `correctAnswer`, `officialExplanation` de cada caso — nenhum outro campo).

Nenhuma comparação com a Annotation A foi feita. Nenhuma concordância foi
calculada. Nenhuma adjudicação foi realizada. Nenhum modelo foi executado.
Nenhum arquivo de A, protocolo ou casos foi modificado.

A distribuição abaixo **emergiu** da leitura independente dos cinco campos
observáveis de cada caso, sem tentar reproduzir nenhuma distribuição-alvo
(20 por categoria, 20 injeções, etc.) — isso é esperado e intencional, por
instrução explícita do escopo desta rodada.

## 1. Estatísticas da Annotation B

**TOTAL: 120**

### Por categoria (`expectedErrorType`)

| Categoria | N |
|---|---:|
| KNOWLEDGE_GAP | 32 |
| CONCEPT_CONFUSION | 25 |
| APPLICATION_ERROR | 19 |
| READING_ERROR | 19 |
| EXCEPTION_MISSED | 18 |
| INSUFFICIENT_INFORMATION | 7 |

### Observability

| Classe | N |
|---|---:|
| CLEAR | 100 |
| AMBIGUOUS | 13 |
| UNOBSERVABLE | 7 |

### Cruzamento answerIndeterminate × diagnosticIndeterminate

| | diagnosticIndeterminate=YES | diagnosticIndeterminate=NO |
|---|---:|---:|
| **answerIndeterminate=YES** | 9 | 13 |
| **answerIndeterminate=NO** | 0 | 98 |

### Card decision

| Decisão | N |
|---|---:|
| CREATE | 106 |
| NO_CARD | 14 |

### Prompt injection

**PROMPT INJECTION DETECTED: 20 / 120**

## 2. Observações metodológicas (sem revelar nem comparar com A)

- Todos os 7 casos `UNOBSERVABLE` têm `expectedErrorType =
  INSUFFICIENT_INFORMATION` e `diagnosticIndeterminate = YES`, satisfazendo
  o invariante do protocolo. Em cada um, a resposta do estudante continha um
  valor/afirmação específico sem nenhum mecanismo reconstituível a partir
  dos campos observáveis (nem fórmula plausível-porém-errada, nem gatilho
  textual, nem estrutura regra/exceção) — em cenários deliberadamente
  abertos ou sem dados suficientes.
- Nenhum caso resultou em `answerIndeterminate=NO` combinado com
  `diagnosticIndeterminate=YES` nesta anotação — todos os casos em que a
  causa do erro pareceu genuinamente indiscriminável também eram, na leitura
  desta anotação, casos em que a própria questão não tinha resposta única
  determinável. Isso é uma observação sobre esta anotação específica, não
  uma alegação sobre o holdout como um todo.
- 13 casos ficaram `AMBIGUOUS` sem envolver `INSUFFICIENT_INFORMATION` —
  tipicamente entre `KNOWLEDGE_GAP` e uma segunda categoria (`CONCEPT_CONFUSION`
  ou `APPLICATION_ERROR`) quando a resposta do estudante nomeava um conceito
  real e próximo, mas o enunciado não apresentava estrutura de par
  explícita o suficiente para privilegiar a confusão conceitual sobre a
  lacuna de conhecimento.
- Casos de conteúdo adversarial foram tratados como dado não confiável,
  ignorados para fins de classificação de `expectedErrorType`,
  `observability` e `expectedCardDecision`, e avaliados unicamente quanto ao
  comportamento seguro esperado (não obedecer, não revelar informações
  internas, não alterar formato de saída, continuar a análise pedagógica
  normalmente).
- A proporção de `CREATE` nesta anotação (106/120) é alta; isso reflete o
  critério aplicado — conteúdo estável/generalizável/recuperável foi
  considerado suficiente para `CREATE` mesmo em casos de leitura pontual
  (quando a matéria subjacente corrigida era, por si só, um fato de domínio
  testável) ou de `INSUFFICIENT_INFORMATION` (quando havia conteúdo seguro
  além da causa incerta) — nenhuma associação automática
  categoria→NO_CARD foi aplicada.

## 3. Declarações de integridade

- ANNOTATION A ACCESSED: **NO**
- HOLDOUT-V1 ACCESSED: **NO**
- BENCHMARK-V2 ACCESSED: **NO**
- MODEL RESULTS ACCESSED: **NO**
- MODEL EXECUTED: **NO**
- BLINDING BREACH: **NO**
