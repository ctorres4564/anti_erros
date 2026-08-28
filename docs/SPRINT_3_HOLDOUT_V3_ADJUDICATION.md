# Sprint 3 — Auditoria de Reprodutibilidade e Seleção do Holdout-V3

## 1. Veredito

**HOLDOUT-V3 NOT READY.** O candidate pool contém apenas **13** casos de `INSUFFICIENT_INFORMATION` reproduzidos bilateralmente com `diagnosticIndeterminate=YES`, contra a cota final de 20. A seleção máxima quota-alinhada sem forçar casos fracos contém **113/120** candidatos.

Os seis gates inter-anotadores passam quando recalculados nessa seleção parcial de 113 casos. Isso não substitui os requisitos de composição: faltam sete II e o bloco de prompt injection contém 17 `CREATE` e 3 `NO_CARD`, em vez de 10/10.

Nenhum modelo foi executado. Nenhum ground truth foi criado. Nenhum hash foi congelado. O freeze exige uma etapa posterior expressamente autorizada.

## 2. Escopo e anti-leakage

A auditoria consultou exclusivamente:

- `docs/SPRINT_3_HOLDOUT_V3_PROTOCOL.md`
- `scripts/benchmark/holdout-v3-candidate-pool.ts`
- `scripts/benchmark/holdout-v3-annotation-a.json`
- `scripts/benchmark/holdout-v3-annotation-b.json`
- `scripts/benchmark/holdout-v3-candidate-manifest.json`
- `docs/SPRINT_3_HOLDOUT_V3_ANNOTATOR_A.md`
- `docs/SPRINT_3_HOLDOUT_V3_ANNOTATOR_B.md`

Resultados de modelos, `benchmark-v2`, holdout-v1/v2 e analysis-v2.1 não foram lidos para adjudicação. `MODEL EXECUTED = NO`.

## 3. Pool pre-adjudication

| Métrica | Resultado | Threshold | Gate |
|---|---:|---:|:---:|
| Error type exact agreement | 153/180 (85,00%) | informativo | — |
| Error type acceptable bilateral | 153/180 (85,00%) | >=90% | FAIL |
| Answer indeterminacy agreement | 178/180 (98,89%) | >=90% | PASS |
| Diagnostic indeterminacy agreement | 162/180 (90,00%) | >=90% | PASS |
| Diagnostic YES positive agreement | 26/44 (59,09%) | >=80% | FAIL |
| Card decision agreement | 145/180 (80,56%) | >=85% | FAIL |
| Prompt injection detection agreement | 180/180 (100,00%) | >=95% | PASS |

O positive agreement usa `2 × bothYes / (A_yes + B_yes)`: 13 casos YES/YES, 30 YES em A e 14 YES em B.

### Matriz de confusão A × B

| A \ B | KG | CC | EM | APP | RE | II |
|---|---:|---:|---:|---:|---:|---:|
| KG | 30 | 0 | 0 | 0 | 0 | 0 |
| CC | 0 | 30 | 0 | 0 | 0 | 0 |
| EM | 0 | 0 | 30 | 0 | 0 | 0 |
| APP | 0 | 6 | 0 | 24 | 0 | 0 |
| RE | 1 | 1 | 0 | 1 | 26 | 1 |
| II | 0 | 1 | 0 | 1 | 15 | 13 |

### Divergências nos quatro critérios de card

| Critério | Divergências | IDs |
|---|---:|---|
| `stableContent` | 32 | P009, P010, P014, P016, P019, P030, P032, P035, P036, P042, P056, P062, P063, P068, P071, P072, P074, P076, P081, P083, P085, P088, P100, P104, P108, P123, P137, P147, P148, P166, P171, P174 |
| `generalizableContent` | 35 | P011, P016, P030, P032, P036, P055, P063, P065, P068, P069, P072, P074, P076, P081, P083, P085, P089, P090, P093, P094, P096, P100, P108, P114, P123, P129, P133, P135, P137, P147, P148, P166, P168, P171, P174 |
| `retrievableContent` | 30 | P011, P030, P032, P036, P055, P063, P065, P068, P069, P074, P076, P081, P084, P089, P090, P093, P094, P096, P108, P114, P123, P129, P135, P136, P137, P147, P166, P168, P171, P178 |
| `futureReviewUseful` | 35 | P011, P016, P030, P032, P036, P055, P063, P065, P068, P069, P072, P074, P076, P081, P083, P085, P089, P090, P093, P094, P096, P100, P108, P114, P123, P129, P133, P135, P137, P147, P148, P166, P168, P171, P174 |

Os 27 desacordos de decisão de card foram examinados eixo a eixo. Regras locais/circunstanciais e lapsos operacionais foram resolvidos como `NO_CARD`; conteúdo estável, generalizável, atômico e útil foi resolvido como `CREATE`. A injeção foi tratada como ortogonal. As decisões e justificativas caso a caso constam no JSON de adjudicação.

## 4. Candidate states

| Estado | Casos |
|---|---:|
| ACCEPT | 126 |
| ADJUDICATE | 36 |
| REJECT | 18 |

### Rejected by reason

- `NON_REPRODUCIBLE_II`: 17 — P012, P036, P041, P063, P066, P068, P074, P076, P081, P098, P123, P145, P153, P160, P161, P165, P179.
- `STRUCTURAL_FACTUAL_DEFECT`: 1 — P108.

P108 foi auditado sem correção. O enunciado pede uma única afirmação incorreta, mas tanto B (“todo retângulo é quadrado”) quanto C (“todo losango é quadrado”) são incorretas. O gabarito cita somente B; portanto, o caso possui defeito material e foi rejeitado.

### Regra forte de II

Somente 13 candidatos satisfazem simultaneamente A=II, B=II e `diagnosticIndeterminate=YES` em ambos: P011, P084, P091, P093, P096, P112, P127, P133, P135, P136, P143, P168 e P178.

Todos os 13 registram, na adjudicação, causa plausível 1, causa plausível 2, compatibilidade bicausal e informação ausente. Nenhuma intenção de A foi usada como evidência.

## 5. Seleção parcial

| Categoria | Selecionados | Alvo |
|---|---:|---:|
| KNOWLEDGE_GAP | 20 | 20 |
| CONCEPT_CONFUSION | 20 | 20 |
| EXCEPTION_MISSED | 20 | 20 |
| APPLICATION_ERROR | 20 | 20 |
| READING_ERROR | 20 | 20 |
| INSUFFICIENT_INFORMATION | 13 | 20 |
| **Total** | **113** | **120** |

Outras contagens:

- `diagnosticIndeterminate=YES`: 13.
- `answer=NO / diagnostic=YES`: 13, acima do mínimo de 8.
- `answer=YES / diagnostic=NO`: 10, atingindo o controle A.
- Prompt injections: 20, distribuídas nas seis categorias.
- Prompt injection por card: 17 `CREATE`, 3 `NO_CARD`; requisito 10/10 não atendido.
- Card no conjunto parcial: 92 `CREATE`, 21 `NO_CARD`.

Para completar um instrumento válido são necessários pelo menos sete novos II reproduzíveis e sete novos ataques `NO_CARD`. Sob o máximo de cinco ataques por categoria, no máximo três dos novos II podem simultaneamente preencher a lacuna de ataques na categoria II; portanto, o pool suplementar mínimo é de **11 candidatos únicos**: sete II, dos quais até três também ataques `NO_CARD`, e quatro ataques `NO_CARD` fora de II.

## 6. Gates na seleção parcial de 113

| Gate | Resultado | Threshold | Status |
|---|---:|---:|:---:|
| Error type acceptable bilateral | 113/113 (100,00%) | >=90% | PASS |
| Answer indeterminacy | 112/113 (99,12%) | >=90% | PASS |
| Diagnostic indeterminacy | 113/113 (100,00%) | >=90% | PASS |
| Diagnostic YES positive agreement | 26/26 (100,00%) | >=80% | PASS |
| Card decision | 97/113 (85,84%) | >=85% | PASS |
| Prompt injection detection | 113/113 (100,00%) | >=95% | PASS |

Esses PASS são condicionais à seleção parcial e não autorizam freeze: faltam sete casos e o balanceamento 10/10 dos ataques não existe.

## 7. Validação, segurança e estado final

- JSON de adjudicação: 180 candidatos únicos, estados 126/36/18, 13 II admissíveis estruturados.
- JSON de seleção: 113 IDs únicos, todos admissíveis, categorias 20/20/20/20/20/13.
- Secret scan direcionado aos artefatos oficiais: PASS, zero achados de alta confiança.
- Ground truth criado: NÃO.
- Hashes congelados: NÃO.
- Manifesto atualizado para FROZEN: NÃO.
- `holdout-v3-cases.ts` criado: NÃO.
- `holdout-v3-ground-truth.json` criado: NÃO.
- Modelo executado: NÃO.

```text
FINAL REPRODUCIBILITY GATES: PASS na seleção parcial 113/113; instrumento final inexistente
HOLDOUT-V3 READY: NO
GROUND TRUTH FROZEN: NO
MODEL EXECUTED: NO
READY FOR FINAL analysis-v2.1 EVALUATION: NO
```
