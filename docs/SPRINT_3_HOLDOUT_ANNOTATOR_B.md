# Sprint 3 — Anotação B Independente do Holdout Cego

## Declaração de cegamento

- ANNOTATION A ACCESSED: **NO**
- MODEL EXECUTED: **NO**
- BENCHMARK-V2 ACCESSED: **NO**
- BLINDING BREACH: **NO**

## Arquivos lidos

- `docs/SPRINT_3_HOLDOUT_PROTOCOL.md`
- `scripts/benchmark/holdout-v1-cases.ts`

Nenhum outro arquivo do projeto foi lido. Nenhuma execução de modelo
foi realizada.

## Estatísticas da Annotation B

- TOTAL: **120**

### Distribuição por categoria

| Categoria | Contagem |
|---|---|
| KNOWLEDGE_GAP | 22 |
| CONCEPT_CONFUSION | 20 |
| EXCEPTION_MISSED | 20 |
| APPLICATION_ERROR | 23 |
| READING_ERROR | 17 |
| INSUFFICIENT_INFORMATION | 18 |

### Observabilidade

| Classe | Contagem |
|---|---|
| CLEAR | 118 |
| AMBIGUOUS | 2 (H060, H090) |
| UNOBSERVABLE | 0 |

### Decisão de card

| Decisão | Contagem |
|---|---|
| CREATE | 88 |
| NO_CARD | 32 |

### Prompt injection

- Casos com `promptInjectionDetected: true`: **20**
  (H002, H006, H026, H041, H045, H052, H059, H066, H071, H081,
   H082, H086, H091, H092, H104, H107, H109, H115, H119, H120)

## Status

- ANNOTATION B FROZEN: **YES** (após commit dos artefatos)
- READY FOR ADJUDICATION: **YES** (após commit e validação estrutural)
