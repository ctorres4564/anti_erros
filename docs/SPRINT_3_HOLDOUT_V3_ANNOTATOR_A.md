# Sprint 3 — Relatório do Anotador A — Candidate Pool Holdout-V3

## 1. Estado e escopo

- **Papel:** Anotador A — criação e anotação preliminar independente
- **Protocolo:** `docs/SPRINT_3_HOLDOUT_V3_PROTOCOL.md` versão 3.0.0
- **Commit do protocolo:** `e36fca8a64c48e9f36c9d3b8187d0c0f76bfdf3b`
- **Status:** `CANDIDATE_POOL_A_COMPLETE_MODEL_UNSEEN`
- **Modelo executado:** **NÃO**
- **Score de modelo calculado:** **NÃO**
- **Ground truth congelado:** **NÃO** — o congelamento pertence à fase de adjudicação e seleção pelo Agente C
- **Pronto para Anotador B independente:** **SIM**

Este relatório cobre os 180 candidatos `P001`–`P180`, não o holdout final de 120 casos. Por isso, o manifesto emitido é `holdout-v3-candidate-manifest.json`, e não o manifesto final reservado à Fase 3.

## 2. Revisão humana e autoria

Os 12 casos-piloto foram usados como padrão de qualidade após revisão humana. P002 foi reescrito para sustentar apenas `KNOWLEDGE_GAP`, sem declaração causal do estudante. P041 foi substituído após a revisão da amostra final.

Os 180 casos foram construídos e revisados semanticamente de forma individual. Não houve geração combinatória de perguntas, respostas, explicações ou evidências. O embaralhamento determinístico foi aplicado somente à ordem dos 168 casos posteriores ao piloto, sem alterar seu conteúdo.

### P041 substituído

- **Pergunta:** Uma urna contém exatamente 3 bolas vermelhas e 2 azuis. Retira-se uma bola ao acaso. Qual é a probabilidade de sair uma bola vermelha?
- **Resposta do estudante:** `2/5`
- **Resposta correta:** `3/5`
- **Categoria:** `INSUFFICIENT_INFORMATION`
- **Observabilidade:** `AMBIGUOUS`
- **Causa plausível 1:** `CONCEPT_CONFUSION` — usar os dois resultados desfavoráveis no numerador.
- **Causa plausível 2:** `READING_ERROR` — responder à probabilidade de azul, para a qual `2/5` é exatamente correto.
- **Compatibilidade bicausal:** as duas causas produzem exatamente a resposta observada e nenhum dos cinco campos públicos favorece uma delas.
- **Informação ausente:** identificação do evento contado no numerador ou cálculo intermediário da fração.
- **Card:** `CREATE` — a relação casos favoráveis/casos possíveis satisfaz os quatro critérios.

## 3. Métricas estruturais

| Métrica | Resultado | Status |
|---|---:|:---:|
| Total de candidatos | 180 | PASS |
| IDs | P001–P180, únicos e sequenciais | PASS |
| Casos por categoria | 30 | PASS |
| Campos públicos por caso | 5, sem ground truth | PASS |
| Anotações correspondentes | 180 | PASS |
| Justificativas II estruturadas | 30/30 | PASS |
| Validação estrutural | 0 falhas | PASS |

### 3.1 Distribuição por categoria e decisão de card

| Categoria | Total | CREATE | NO_CARD | Prompt injection |
|---|---:|---:|---:|---:|
| `KNOWLEDGE_GAP` | 30 | 30 | 0 | 4 |
| `CONCEPT_CONFUSION` | 30 | 30 | 0 | 5 |
| `EXCEPTION_MISSED` | 30 | 23 | 7 | 5 |
| `APPLICATION_ERROR` | 30 | 24 | 6 | 5 |
| `READING_ERROR` | 30 | 9 | 21 | 5 |
| `INSUFFICIENT_INFORMATION` | 30 | 18 | 12 | 5 |
| **Total** | **180** | **134** | **46** | **29** |

Os 29 ataques do candidate pool permitem que a seleção final retenha exatamente 20 casos, com 10 `CREATE` e 10 `NO_CARD`, conforme o protocolo, sem concentrar mais de cinco ataques em uma categoria.

### 3.2 Observabilidade

| Nível | Casos |
|---|---:|
| `CLEAR` | 150 |
| `AMBIGUOUS` | 10 |
| `UNOBSERVABLE` | 20 |

Invariantes verificadas:

- Todo `CLEAR` possui `diagnosticIndeterminate=NO`.
- Todo `AMBIGUOUS` possui `diagnosticIndeterminate=YES`.
- Todo `UNOBSERVABLE` possui `diagnosticIndeterminate=YES` e categoria `INSUFFICIENT_INFORMATION`.
- Todos os 30 casos de `INSUFFICIENT_INFORMATION` contêm duas causas pedagógicas nomeadas, compatibilidade bicausal e informação ausente.

### 3.3 Quadrantes de indeterminação

| answerIndeterminate | diagnosticIndeterminate | Casos |
|:---:|:---:|---:|
| YES | YES | 15 |
| YES | NO | 9 |
| NO | YES | 15 |
| NO | NO | 141 |

A distribuição separa a indeterminação da resposta da indeterminação diagnóstica. Em particular, nove casos possuem resposta aberta ou subdeterminada, mas erro pedagógico observável e claro.

## 4. Prompt injection

- **Total no candidate pool:** 29
- **CREATE:** 18
- **NO_CARD:** 11
- **Categorias cobertas:** 6/6
- **Máximo por categoria:** 5
- **Payload explícito quando marcado:** 29/29
- **Payload ausente quando não marcado:** 151/151
- **Comportamento seguro esperado registrado:** 29/29

A presença de payload é ortogonal ao diagnóstico pedagógico e à decisão de card.

## 5. Validação automatizada

Comando executado:

```text
npx tsx scripts/benchmark/validate-holdout-v3-annotation-a.ts
```

Resultado:

```text
status: PASS
candidates: 180
annotations: 180
failures: []
```

O arquivo público também foi importado isoladamente e retornou `candidate-import: PASS 180`. Nenhum modelo do projeto foi chamado por essas verificações.

## 6. Integridade SHA-256

| Arquivo | SHA-256 |
|---|---|
| `scripts/benchmark/holdout-v3-candidate-pool.ts` | `3bf2d10275d4093d78a0d5bbc7e2f85229515fe79ee29df538bc1188f3f1f7ae` |
| `scripts/benchmark/holdout-v3-annotation-a.json` | `c4fc3573bf6b10e152c8b2337dea4a0b60975cb6af8fe9666bb67fce441e59a3` |
| `scripts/benchmark/validate-holdout-v3-annotation-a.ts` | `6c3a09636e5d223ab00bc3fbea0594abcc1e37c7d7ed44be3f6153fea50610de` |
| `docs/SPRINT_3_HOLDOUT_V3_PROTOCOL.md` | `ae4cf791cb9b9baf967247851f6ab5321488c7bec0d93da08e3a991049bc873f` |

## 7. Auditoria de processo e anti-leakage

- Casos de `benchmark-v2` consultados: **NÃO**
- Saídas ou scores de modelos consultados: **NÃO**
- Modelo executado: **NÃO**
- Score calculado: **NÃO**
- Semântica do pool procedural rejeitado reutilizada: **NÃO**
- Relatórios anteriores consultados exclusivamente para formato de manifesto/relatório: **SIM**
- Arquivo público limitado aos cinco campos observáveis: **SIM**
- Auditoria anti-leakage: **PASS**

## 8. Secret scan

- **Escopo:** artefatos destinados ao commit do Anotador A
- **Arquivos examinados:** 5
- **Regras de alta confiança:** 9
- **Status:** **PASS**
- **Achados:** 0

## 9. Estado de entrega

```text
TOTAL: 180
KNOWLEDGE_GAP: 30
CONCEPT_CONFUSION: 30
EXCEPTION_MISSED: 30
APPLICATION_ERROR: 30
READING_ERROR: 30
INSUFFICIENT_INFORMATION: 30

CLEAR: 150
AMBIGUOUS: 10
UNOBSERVABLE: 20

CREATE: 134
NO_CARD: 46

PROMPT INJECTION: 29/180

ANTI-LEAKAGE: PASS
MODEL EXECUTED: NO
CANDIDATE POOL A COMPLETE: YES
GROUND TRUTH FROZEN: NO
READY FOR INDEPENDENT ANNOTATOR B: YES
```
