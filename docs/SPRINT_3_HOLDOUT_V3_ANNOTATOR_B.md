# Sprint 3 — Relatório do Anotador B Independente e Cego

## Escopo

Anotação independente dos 180 candidatos P001–P180, baseada exclusivamente nos quatro campos observáveis do candidate pool e nas regras do protocolo Holdout-V3. Nenhuma distribuição externa foi usada como meta e nenhuma anotação de outro avaliador foi consultada.

## Distribuições finais

### Tipo de erro

| Tipo | Casos |
|---|---:|
| KNOWLEDGE_GAP | 31 |
| CONCEPT_CONFUSION | 38 |
| EXCEPTION_MISSED | 30 |
| APPLICATION_ERROR | 26 |
| READING_ERROR | 41 |
| INSUFFICIENT_INFORMATION | 14 |
| **Total** | **180** |

### Observabilidade

| Observabilidade | Casos |
|---|---:|
| CLEAR | 166 |
| AMBIGUOUS | 2 |
| UNOBSERVABLE | 12 |
| **Total** | **180** |

### Combinações answerIndeterminate / diagnosticIndeterminate

| answerIndeterminate | diagnosticIndeterminate | Casos |
|---|---|---:|
| NO | NO | 141 |
| NO | YES | 13 |
| YES | NO | 25 |
| YES | YES | 1 |
| **Total** |  | **180** |

### Decisão de card

| Decisão | Casos |
|---|---:|
| CREATE | 153 |
| NO_CARD | 27 |
| **Total** | **180** |

### Prompt injection

| Detectada | Casos |
|---|---:|
| true | 29 |
| false | 151 |
| **Total** | **180** |

Todas as 29 detecções possuem comportamento seguro explícito; os demais 151 registros possuem `promptInjectionExpectedBehavior: null`. O eixo de segurança foi mantido separado do diagnóstico pedagógico e da decisão de card.

## Controles de consistência

O validador de B verifica apenas consistência interna do artefato B e não lê nem compara anotações de A. As verificações incluem:

- array ordenado e completo com P001–P180, sem duplicatas;
- enums e tipos dos campos;
- inclusão de `expectedErrorType` em `acceptableErrorTypes`;
- equivalência entre `INSUFFICIENT_INFORMATION` e `diagnosticIndeterminate: YES`;
- coerência entre observabilidade e indeterminação diagnóstica;
- presença dos quatro elementos causais exigidos nas justificativas de II;
- regra objetiva de card: `CREATE` se e somente se os quatro critérios forem `YES`;
- coerência entre detecção de injeção e comportamento seguro esperado.

Resultado da validação estrutural: **PASS — 180/180 casos válidos**.

Secret scan direcionado aos três artefatos B: **PASS — nenhum padrão de credencial ou chave privada detectado**.

## Declarações de cegamento e execução

- Annotation A accessed NO
- previous holdouts accessed NO
- model results accessed NO
- model executed NO
- blinding breach NO
- READY FOR REPRODUCIBILITY ANALYSIS YES

