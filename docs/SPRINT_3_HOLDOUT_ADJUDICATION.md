# Sprint 3 — Adjudicação do Holdout Cego v1

## 0. Papel do Agente C

Este documento registra a adjudicação independente do holdout cego v1 pelo
Agente C, atuando como adjudicador imparcial entre Anotador A (commit
`7f6f5bd`) e Anotador B (commit `d419016`).

**Princípio aplicado:** nenhum anotador vence automaticamente. Cada
divergência foi decidida exclusivamente pelos cinco campos observáveis do
caso e pelas regras congeladas do protocolo
(`docs/SPRINT_3_HOLDOUT_PROTOCOL.md`).

**Anti-leakage confirmado:**
- analysis-v2.0 NÃO foi executado contra o holdout.
- Nenhum resultado de modelo foi consultado.
- Nenhum caso foi alterado durante a adjudicação.
- O ground truth foi finalizado exclusivamente com A, B, casos e protocolo.

---

## 1. Métricas pré-adjudicação (CONGELADAS)

Estas métricas foram calculadas **antes** de qualquer decisão de
adjudicação e não foram alteradas posteriormente.

| Métrica | Valor |
|---|---|
| Error type exact agreement | 115/120 (95,83%) |
| A principal accepted by B (A ∈ B.acceptable) | 115/120 (95,83%) |
| B principal accepted by A (B ∈ A.acceptable) | 116/120 (96,67%) |
| Bilateral acceptable agreement | 116/120 (96,67%) |
| Observability exact agreement | 100/120 (83,33%) |
| Card decision exact agreement | 91/120 (75,83%) |
| Prompt injection agreement | 120/120 (100,00%) |

### 1.1 Matriz de observabilidade A × B

|  | B:CLEAR | B:AMBIGUOUS | B:UNOBSERVABLE |
|---|---|---|---|
| **A:CLEAR** | 100 | 0 | 0 |
| **A:AMBIGUOUS** | 18 | 0 | 0 |
| **A:UNOBSERVABLE** | 0 | 2 | 0 |

### 1.2 Matriz de confusão de error type A × B

|  | KG | CC | EM | AE | RE | II |
|---|---|---|---|---|---|---|
| **KG** | 20 | 0 | 0 | 0 | 0 | 0 |
| **CC** | 0 | 20 | 0 | 0 | 0 | 0 |
| **EM** | 0 | 0 | 20 | 0 | 0 | 0 |
| **AE** | 0 | 0 | 0 | 20 | 0 | 0 |
| **RE** | 1 | 0 | 0 | 2 | 17 | 0 |
| **II** | 1 | 0 | 0 | 1 | 0 | 18 |

---

## 2. Divergências

| Tipo | Contagem |
|---|---|
| Total cases with any divergence | 45 |
| Error type divergences | 5 |
| Acceptable error types divergences | 30 |
| Observability divergences | 20 |
| Card decision divergences | 29 |
| Prompt injection divergences | 0 |

### 2.1 Análise dos padrões de divergência

**Padrão dominante:** O Anotador A tendeu sistematicamente a:
1. Classificar casos como AMBIGUOUS onde B viu CLEAR (18 dos 20 casos de
   divergência de observabilidade).
2. Incluir alternativas adicionais em `acceptableErrorTypes` (geralmente
   KNOWLEDGE_GAP).
3. Atribuir NO_CARD onde B atribuiu CREATE.

**Padrão do Anotador B:** Tendeu a ser mais restritivo em
`acceptableErrorTypes` mas mais generoso em `expectedCardDecision`,
classificando mais casos como CREATE quando identificava conteúdo
generalizável.

### 2.2 Casos com divergência de error type (5 casos)

| ID | A | B | Decisão | Motivo resumido |
|---|---|---|---|---|
| H024 | READING_ERROR | KNOWLEDGE_GAP | **KNOWLEDGE_GAP** | Sem sinal de leitura ignorada per protocolo §5 |
| H027 | READING_ERROR | APPLICATION_ERROR | **APPLICATION_ERROR** | Erro de identificação/contagem, não de leitura do enunciado |
| H060 | INSUFFICIENT_INFO | APPLICATION_ERROR | **INSUFFICIENT_INFO** | OfficialExplanation confirma causa não inferível |
| H088 | READING_ERROR | APPLICATION_ERROR | **APPLICATION_ERROR** | Sem negação/restrição violada; procedimento reconstituível |
| H090 | INSUFFICIENT_INFO | KNOWLEDGE_GAP | **INSUFFICIENT_INFO** | Causa genuinamente indistinguível |

---

## 3. Princípios aplicados na adjudicação

### 3.1 READING_ERROR estrito

Aplicação rigorosa do protocolo §5: READING_ERROR exige sinal observável
(negação, comando, restrição, unidade, qualificador). Nos 5 casos de
divergência de error type, 3 envolviam A classificando como READING_ERROR
onde não havia sinal do protocolo §5. Em todos os 3, B prevaleceu.

### 3.2 Observabilidade

Dos 20 casos de divergência de observabilidade:
- 18 eram A=AMBIGUOUS vs B=CLEAR
- 2 eram A=UNOBSERVABLE vs B=AMBIGUOUS

Nos 18 AMBIGUOUS→CLEAR: em quase todos os casos, A incluiu uma alternativa
(geralmente KNOWLEDGE_GAP) que não era genuinamente defensável pelos
critérios do protocolo §3. B prevaleceu em todos os 18.

Nos 2 UNOBSERVABLE→AMBIGUOUS (H060, H090): o nível AMBIGUOUS foi confirmado
(duas categorias genuinamente defensáveis, mas não estritamente
inobservável). O expectedErrorType foi mantido como INSUFFICIENT_INFORMATION
por ser a leitura mais conservadora.

### 3.3 Card decision

Dos 29 casos de divergência:
- 22 eram A=NO_CARD, B=CREATE → B prevaleceu em 20, A prevaleceu em 2
- 4 eram A=CREATE, B=NO_CARD → B prevaleceu em todos os 4
- 3 envolviam também divergência de error type

O padrão é claro: B foi mais criterioso ao avaliar generalizabilidade do
conteúdo. Muitos dos NO_CARD de A eram para casos com procedimentos
reconstituíveis e generalizáveis (conversões, precedência, proporção,
perímetro vs área).

### 3.4 AcceptableErrorTypes

Divergências de acceptable foram de dois tipos:
1. **A incluía alternativas que B não incluía** (geralmente KNOWLEDGE_GAP
   adicionado a APPLICATION_ERROR ou CONCEPT_CONFUSION): na maioria,
   B prevaleceu — a alternativa não era genuinamente defensável quando
   havia evidência clara do tipo principal.
2. **B incluía alternativas que A não incluía** (geralmente CONCEPT_CONFUSION
   adicionado a KNOWLEDGE_GAP): na maioria, B prevaleceu — a alternativa
   era genuinamente defensável.

---

## 4. Ground truth final

### Distribuição por error type

| Categoria | Contagem |
|---|---|
| KNOWLEDGE_GAP | 21 |
| CONCEPT_CONFUSION | 20 |
| EXCEPTION_MISSED | 20 |
| APPLICATION_ERROR | 22 |
| READING_ERROR | 17 |
| INSUFFICIENT_INFORMATION | 20 |

### Observabilidade

| Classe | Contagem |
|---|---|
| CLEAR | 118 |
| AMBIGUOUS | 2 |
| UNOBSERVABLE | 0 |

### Card decision

| Decisão | Contagem |
|---|---|
| CREATE | 85 |
| NO_CARD | 35 |

### Prompt injection

Casos com prompt injection: **20/120**

---

## 5. Integridade

| Item | Valor |
|---|---|
| Cases SHA-256 | `39F30C72ECAA35EBF33EB67EE5250206B29473DA67DBA69052BA9C0EDF3F21C2` |
| Ground truth SHA-256 | `E7938013D781A4FA661A66A0E0CD2FEBD41B172BFF8217ED645D4FE8E727ABE0` |
| Structural validation | PASS |
| Secret scan | PASS |
| Model executed | NO |
| Model results accessed | NO |
| Cases modified | NO |
| Ground truth frozen | YES |

---

## 6. Status

- **ADJUDICATION COMPLETE**: YES
- **GROUND TRUTH FROZEN**: YES
- **READY FOR FINAL MODEL EVALUATION**: YES
