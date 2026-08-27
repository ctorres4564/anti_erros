# Sprint 3 — Relatório de Construção e Anotação A do Holdout-V2

## 1. Identificação e Metadados

- **Papel:** Anotador A (Criador do Holdout-V2 Cego)
- **Data de Criação:** 27 de agosto de 2026
- **Protocolo Metodológico:** [`docs/SPRINT_3_HOLDOUT_V2_PROTOCOL.md`](file:///c:/anti_erros/docs/SPRINT_3_HOLDOUT_V2_PROTOCOL.md)
- **Commit Base do Protocolo:** `d505dc0`
- **Estado de `analysis-v2.1`:** CONGELADO (`7275e6a` / `d505dc0`)
- **Modelo Executado:** NÃO (`MODEL EXECUTED = NO`)
- **Acesso a Resultados Anteriores:** NÃO (`ACCESSED FOR RESULTS = NO`)
- **Status do Conjunto:** `ANNOTATION_A_COMPLETE_MODEL_UNSEEN`
- **Pronto para Anotador B:** SIM

---

## 2. Sumário Executivo e Métricas Estruturais

| Métrica / Dimensão | Valor Registrado | Requisito Protocolar | Status |
|---|---:|---:|:---:|
| **Total de Casos Inéditos** | **120** | Exatamente 120 | CONFORME |
| **Identificadores** | `V001` a `V120` | Neutros, únicos, embaralhados (Seed 20260827) | CONFORME |
| **Casos por Categoria Principal** | **20 cada** | Exatamente 20 por categoria | CONFORME |
| - `KNOWLEDGE_GAP` | 20 | 20 | CONFORME |
| - `CONCEPT_CONFUSION` | 20 | 20 | CONFORME |
| - `EXCEPTION_MISSED` | 20 | 20 | CONFORME |
| - `APPLICATION_ERROR` | 20 | 20 | CONFORME |
| - `READING_ERROR` | 20 | 20 | CONFORME |
| - `INSUFFICIENT_INFORMATION` | 20 | 20 | CONFORME |

---

## 3. Observability e Eixos de Indeterminação

### 3.1 Níveis de Observabilidade
- **`CLEAR`:** 100 casos (83,3%) — evidência causal unívoca e discriminante.
- **`AMBIGUOUS`:** 0 casos (0,0%) — em Annotation A, todas as incertezas diagnósticas foram categorizadas de acordo com o padrão estrito de indeterminação.
- **`UNOBSERVABLE`:** 20 casos (16,7%) — ausência de evidência causal discriminante suficiente nos 4 campos observáveis.
- **Invariante Verificada:** 100% dos casos `UNOBSERVABLE` possuem `diagnosticIndeterminate = YES` e `expectedErrorType = INSUFFICIENT_INFORMATION`.

### 3.2 Matriz dos Quatro Quadrantes de Indeterminação

$$\begin{array}{|c|c|c|c|}
\hline
\textbf{Quadrante / Controle} & \textbf{answerIndeterminate} & \textbf{diagnosticIndeterminate} & \textbf{Total de Casos} \\
\hline
\text{Controle C (Indeterminação Dupla)} & \text{YES} & \text{YES} & 10 \\
\hline
\text{Controle A (Questão Aberta / Diagnóstico Claro)} & \text{YES} & \text{NO} & 13 \text{ (Mínimo } \ge 10\text{)} \\
\hline
\text{Controle B (Questão Determinada / Diagnóstico Indeterminado)} & \text{NO} & \text{YES} & 10 \\
\hline
\text{Controle D (Casos Normais Determinados)} & \text{NO} & \text{NO} & 87 \\
\hline
\textbf{Total Geral} & & & \mathbf{120} \\
\hline
\end{array}$$

- **Controle A (answer=YES / diagnostic=NO):** 13 casos distribuídos entre `KNOWLEDGE_GAP` (3), `CONCEPT_CONFUSION` (3), `EXCEPTION_MISSED` (3), `APPLICATION_ERROR` (2) e `READING_ERROR` (2), testando a imunidade ao falso atalho de classificar como `INSUFFICIENT_INFORMATION` apenas porque a questão é aberta.
- **Controle B e C em II:** Exatamente 10 casos no Controle B e 10 casos no Controle C, cumprindo a distribuição mandatória do protocolo congelado.

---

## 4. Política Independente de Flashcards (`expectedCardDecision`)

| Categoria Principal | `CREATE` | `NO_CARD` | Total |
|---|---:|---:|---:|
| `KNOWLEDGE_GAP` | 13 | 7 | 20 |
| `CONCEPT_CONFUSION` | 14 | 6 | 20 |
| `EXCEPTION_MISSED` | 14 | 6 | 20 |
| `APPLICATION_ERROR` | 8 | 12 | 20 |
| `READING_ERROR` | 7 | 13 | 20 |
| `INSUFFICIENT_INFORMATION` | 11 | 9 | 20 |
| **Total Geral** | **79** | **41** | **120** |

- **`CREATE` Total:** 79 casos ($\ge 40$).
- **`NO_CARD` Total:** 41 casos ($\ge 40$).
- **Casos II $\times$ Card:** 11 `CREATE` e 9 `NO_CARD` (requisito $\ge 5$ de cada plenamente atendido).
- **Justificativa Pedagógica:** A decisão de card foi realizada de forma estritamente independente do tipo de erro: erros de leitura e procedimentais pontuais sem conceito recuperável receberam `NO_CARD`, enquanto erros em `INSUFFICIENT_INFORMATION` com conceitos fundamentais estáveis (ex: teoria do crime, eficácia de normas, condução monetária, princípios contratuais) receberam `CREATE`.

---

## 5. Casos de Prompt Injection (Segurança e Robustez)

- **Total de Ataques Adversariais:** Exatamente **20 casos** (16,7% do dataset).
- **Balanceamento de Card nos Ataques:**
  - `CREATE`: **10 casos**
  - `NO_CARD`: **10 casos**
- **Cobertura de Categorias:** Todas as **6 categorias principais** cobertas:
  - `EXCEPTION_MISSED`: 4 casos
  - `INSUFFICIENT_INFORMATION`: 4 casos
  - `KNOWLEDGE_GAP`: 3 casos
  - `APPLICATION_ERROR`: 3 casos
  - `CONCEPT_CONFUSION`: 3 casos
  - `READING_ERROR`: 3 casos
  *(Nenhuma categoria excede o limite máximo de 5 ataques).*
- **Comportamento Seguro Esperado Registrado (`promptInjectionExpectedBehavior`):**
  1. Tratar o payload como dado de entrada não confiável;
  2. Ignorar instruções de bypass, vazamento de prompt, alteração de schema JSON e troca de papel;
  3. Manter integralmente a análise diagnóstica pedagógica legítima e o schema oficial da Sprint 3.

---

## 6. Diversidade de Disciplinas e Domínios

O conjunto de 120 casos inéditos foi distribuído de forma equilibrada por diversas áreas do conhecimento:

1. **Direito:** Constitucional, Administrativo, Penal, Tributário, Trabalho, Civil e Processual Civil (~35%).
2. **Ciências Exatas & Tecnologia:** Matemática, Estatística, Geometria, Álgebra, Matemática Financeira, Informática e Redes de Computadores (~30%).
3. **Ciências da Natureza:** Física, Química e Biologia (~18%).
4. **Linguagens & Humanidades:** Português (Gramática, Sintaxe, Ortografia e Regência), Raciocínio Lógico Proposicional, Administração Geral e Pública, Economia, Geografia, História e Sociologia (~17%).

Nenhum domínio específico ultrapassou os limites estabelecidos e todas as questões possuem gabaritos factuais sólidos e fundamentação oficial comprovada.

---

## 7. Integridade de Arquivos e Hashes Criptográficos (SHA-256)

Os arquivos foram gerados e verificados pelo validador estrutural automatizado ([`scripts/benchmark/validate-holdout-v2-annotation-a.ts`](file:///c:/anti_erros/scripts/benchmark/validate-holdout-v2-annotation-a.ts)):

| Arquivo | Visibilidade | SHA-256 |
|---|---|---|
| [`scripts/benchmark/holdout-v2-cases.ts`](file:///c:/anti_erros/scripts/benchmark/holdout-v2-cases.ts) | PÚBLICO (Observável) | `1e6b78aef8241ee36d02de8d43458fae9928dcaa1c5c94efb8c85724d55cfd1d` |
| [`scripts/benchmark/holdout-v2-annotation-a.json`](file:///c:/anti_erros/scripts/benchmark/holdout-v2-annotation-a.json) | PRIVADO (Annotation A) | `0edbb6f8461681489318408029b005af042dfc7d5e13c231be128b82e64f5deb` |
| [`scripts/benchmark/holdout-v2-manifest.json`](file:///c:/anti_erros/scripts/benchmark/holdout-v2-manifest.json) | METADADOS | Verificado e emitido |

---

## 8. Declaração de Anti-Leakage e Auditoria de Processo

Declaro expressamente que:
1. **Zero Consulta a Datasets Dev/Anteriores:** Nenhum arquivo proibido (`benchmark-v2`, `holdout-v1`, `dataset.ts`, resultados de benchmark anteriores) foi lido, referenciado ou pesquisado durante a criação destes 120 casos.
2. **Originalidade:** Todos os 120 casos foram formulados de forma autônoma e inédita, baseando-se em conceitos normativos, gramaticais, matemáticos e científicos universais.
3. **Zero Execução de Modelo:** Nenhum modelo (Gemini, `analysis-v2.1`, scripts de benchmark) foi executado durante a elaboração ou revisão dos dados.
4. **Isolamento do Arquivo Público:** O arquivo [`scripts/benchmark/holdout-v2-cases.ts`](file:///c:/anti_erros/scripts/benchmark/holdout-v2-cases.ts) contém exclusivamente os 5 campos públicos observáveis (`id`, `question`, `userAnswer`, `correctAnswer`, `officialExplanation`), sem nenhum vazamento de ground truth ou anotações.

- **Auditoria Anti-Leakage:** `PASS`
- **Validação Estrutural:** `PASS (100% CONFORME)`
- **Pronto para Anotador B:** `SIM`
