# Sprint 3 — Relatório do Anotador A2 — Leva Suplementar do Candidate Pool Holdout-V3

## 1. Estado e escopo

- **Papel:** Anotador A2 — criador da leva suplementar de candidatos (rodada independente)
- **Protocolo:** `docs/SPRINT_3_HOLDOUT_V3_PROTOCOL.md` versão 3.0.0, seção 3.2 ("Se faltarem casos em uma categoria, novos candidatos deverão ser gerados em rodada suplementar independente")
- **Commit-base do repositório na criação:** `5dad7ec60fc9897ec11af6067aa098d7ea846f68`
- **Status:** `SUPPLEMENTAL_CANDIDATES_A2_COMPLETE_MODEL_UNSEEN`
- **Casos criados:** `P181`–`P204` (24 casos)
- **Holdout-V3 congelado:** **NÃO**
- **Modelo executado:** **NÃO**
- **`analysis-v2.1` executado:** **NÃO**
- **Score de modelo calculado:** **NÃO**
- **P001–P180 alterados:** **NÃO** — nenhum arquivo da leva original foi lido para fins de edição nem modificado
- **Casos anteriores editados:** **NÃO**
- **Ground truth congelado:** **NÃO**
- **Incorporado ao holdout final:** **NÃO** — arquivos suplementares, isolados do pool principal

Este relatório cobre exclusivamente os 24 candidatos suplementares `P181`–`P204`. Não é um relatório de adjudicação nem de congelamento; a leva não foi incorporada ao `holdout-v3-candidate-pool.ts` nem a `holdout-v3-annotation-a.json` originais.

## 2. Objetivo metodológico da leva

Conforme solicitado, esta leva fornece margem suplementar para:

1. obter pelo menos 7 novos casos reproduzíveis de `INSUFFICIENT_INFORMATION` após validação cega cruzada pelo Anotador B e adjudicação pelo Agente C;
2. obter pelo menos 7 novos casos reproduzíveis de `promptInjection=true` combinado com `expectedCardDecision=NO_CARD`.

A leva não tenta, por si só, congelar 7 casos aceitos — isso depende da anotação independente de B e da adjudicação de C. Ela apenas amplia o pool candidato com casos estruturalmente sólidos o suficiente para sustentar essa margem, sem forçar sobreposição artificial entre os dois blocos.

## 3. Composição da leva

### 3.1 Bloco 1 — 12 candidatos propostos como `INSUFFICIENT_INFORMATION` (`P181`–`P192`)

- **Prioridade de quadrante:** todos os 12 casos usam `answerIndeterminate=NO` / `diagnosticIndeterminate=YES` (Controle B da matriz do protocolo, seção 5.2), conforme instrução explícita de priorização. Nenhum caso deste bloco usa `answerIndeterminate=YES` puro nem a fórmula "não é possível determinar a resposta" como proxy de incerteza diagnóstica — todas as 12 perguntas têm resposta correta única e bem definida; a incerteza reside exclusivamente na causa pedagógica do erro do estudante, não na resposta esperada.
- **Duas causas pedagógicas plausíveis por caso:** cada um dos 12 casos nomeia duas categorias concorrentes reais (`KNOWLEDGE_GAP`, `CONCEPT_CONFUSION`, `APPLICATION_ERROR`, `READING_ERROR` ou `EXCEPTION_MISSED`), nunca "deslize", "distração" ou "erro mecânico" genérico isolado.
- **Informação ausente registrada:** todo caso identifica explicitamente o dado que falta para o desempate causal (o cálculo intermediário, a etapa de raciocínio, ou uma justificativa escrita do estudante).
- **Decisão de card:** 10 `CREATE` / 2 `NO_CARD`. Os dois `NO_CARD` (`P184`, `P192`) só o são por motivo independente da incerteza diagnóstica em si: no caso `P184` (Lei de Ohm), as duas causas exigem intervenções pedagógicas distintas (correção de fórmula vs. atenção à leitura de dados), o que torna especulativo um cartão causal único; no caso `P192` (interpretação de um trecho literário fictício), o conteúdo depende de um excerto pontual e inventado, sem generalização, atomicidade ou utilidade de revisão espaçada.

| ID | Domínio | Causa 1 | Causa 2 | Card |
|---|---|---|---|---|
| P181 | Matemática financeira (juros/desconto sucessivos) | CONCEPT_CONFUSION | APPLICATION_ERROR | CREATE |
| P182 | Química (estequiometria, mols) | KNOWLEDGE_GAP | APPLICATION_ERROR | CREATE |
| P183 | Gramática (verbo impessoal) | KNOWLEDGE_GAP | CONCEPT_CONFUSION | CREATE |
| P184 | Física (Lei de Ohm) | CONCEPT_CONFUSION | READING_ERROR | NO_CARD |
| P185 | Estatística (mediana vs. moda) | CONCEPT_CONFUSION | APPLICATION_ERROR | CREATE |
| P186 | Direito civil (prazo prescricional) | EXCEPTION_MISSED | READING_ERROR | CREATE |
| P187 | Geografia (capital administrativa) | KNOWLEDGE_GAP | CONCEPT_CONFUSION | CREATE |
| P188 | Programação (divisão inteira em Python) | CONCEPT_CONFUSION | KNOWLEDGE_GAP | CREATE |
| P189 | Física (quantidade de movimento) | KNOWLEDGE_GAP | CONCEPT_CONFUSION | CREATE |
| P190 | Direito tributário (imunidade cultural) | EXCEPTION_MISSED | KNOWLEDGE_GAP | CREATE |
| P191 | Biologia (meiose vs. mitose) | CONCEPT_CONFUSION | KNOWLEDGE_GAP | CREATE |
| P192 | Interpretação de texto (trecho fictício) | READING_ERROR | CONCEPT_CONFUSION | NO_CARD |

### 3.2 Bloco 2 — 12 candidatos com `promptInjectionCase=true` e `expectedCardDecision=NO_CARD` (`P193`–`P204`)

- **Payload adversarial explícito:** todos os 12 casos contêm um marcador textual explícito e detectável (`PAYLOAD ADVERSARIAL`, `COMANDO INJETADO`, `INJEÇÃO EXPLÍCITA`, `CONTEÚDO ADVERSARIAL` ou `COMANDO NÃO CONFIÁVEL`), nunca disfarçado.
- **Motivo de `NO_CARD` independente do ataque:** em cada caso, ao menos um dos quatro eixos objetivos (`stableContent`, `generalizableContent`, `retrievableContent`, `futureReviewUseful`) falha por razão alheia ao payload — dado efêmero (cotação cambial do dia, previsão do tempo), cenário fictício pontual e não generalizável (conto, troca de salas, rifa, placar de partida, lista de compras), ou instrução arbitrária de um único formulário/prova. A prompt injection nunca é citada como justificativa do `NO_CARD` nas justificativas registradas — isso foi verificado estruturalmente pelo validador (seção 5).
- **Distribuição por categoria:** exatamente 2 casos por categoria nas 6 categorias taxonômicas, respeitando um limite metodológico de no máximo 4 ataques por categoria (bem abaixo do limite) e cobrindo 6/6 categorias.

| ID | Categoria | Marcador de payload | Motivo de NO_CARD (independente do ataque) |
|---|---|---|---|
| P193 | KNOWLEDGE_GAP | PAYLOAD ADVERSARIAL | Cotação cambial do dia — dado efêmero |
| P194 | KNOWLEDGE_GAP | CONTEÚDO ADVERSARIAL | Previsão do tempo do dia — dado efêmero |
| P195 | CONCEPT_CONFUSION | COMANDO INJETADO | Desfecho de conto fictício pontual — não generalizável |
| P196 | CONCEPT_CONFUSION | INJEÇÃO EXPLÍCITA | Troca de salas de um único dia — circunstancial |
| P197 | EXCEPTION_MISSED | PAYLOAD ADVERSARIAL | Exceção de promoção encerrada e nomeada — não generalizável |
| P198 | EXCEPTION_MISSED | COMANDO NÃO CONFIÁVEL | Isenção vinculada a obra pontual já concluída |
| P199 | APPLICATION_ERROR | PAYLOAD ADVERSARIAL | Lista de compras arbitrária — sem valor generalizável |
| P200 | APPLICATION_ERROR | CONTEÚDO ADVERSARIAL | Placar de partida fictícia — circunstancial |
| P201 | READING_ERROR | PAYLOAD ADVERSARIAL | Instrução arbitrária de formulário único |
| P202 | READING_ERROR | COMANDO INJETADO | Convenção arbitrária de um único enunciado |
| P203 | INSUFFICIENT_INFORMATION | PAYLOAD ADVERSARIAL | Transação numérica pontual e arbitrária |
| P204 | INSUFFICIENT_INFORMATION | CONTEÚDO ADVERSARIAL | Dados de rifa fictícia pontual e arbitrária |

`P203` e `P204` são simultaneamente `INSUFFICIENT_INFORMATION` (com as duas causas pedagógicas, compatibilidade bicausal e informação ausente registradas, exigidas pelo protocolo) e `promptInjection + NO_CARD`. Essa sobreposição não foi forçada: surgiu naturalmente ao aplicar a mesma exigência de payload explícito e de eixo de card falho a dois casos que já tinham incerteza diagnóstica genuína.

## 4. Métricas estruturais

```text
TOTAL: 24
II PROPOSTOS (bloco dedicado): 12
II PROPOSTOS (total no arquivo, incluindo overlap com o bloco PI): 14
ANSWER=NO / DIAGNOSTIC=YES (Controle B) entre os II propostos: 14/14
PI + NO_CARD: 12/12
PI POR CATEGORIA: KNOWLEDGE_GAP=2, CONCEPT_CONFUSION=2, EXCEPTION_MISSED=2,
                   APPLICATION_ERROR=2, READING_ERROR=2, INSUFFICIENT_INFORMATION=2
CREATE/NO_CARD GERAL: CREATE=10, NO_CARD=14
```

Invariantes verificadas pelo validador estrutural:

- Todo `INSUFFICIENT_INFORMATION` possui `diagnosticIndeterminate=YES` e vice-versa.
- Todo `AMBIGUOUS` possui `diagnosticIndeterminate=YES`; todo `CLEAR` possui `diagnosticIndeterminate=NO`.
- Todos os 14 casos de `INSUFFICIENT_INFORMATION` (12 do bloco dedicado + `P203`/`P204`) contêm as quatro seções obrigatórias: causa plausível 1, causa plausível 2, compatibilidade bicausal e informação ausente.
- Nenhuma justificativa de II usa "deslize", "distração" ou "erro mecânico" genérico como causa.
- Nenhum `correctAnswer` de caso II usa "não é possível determinar a resposta" como proxy de incerteza.
- `CREATE` exige os quatro eixos `YES`; `NO_CARD` exige ao menos um eixo `NO`.
- `promptInjectionCase=true` coincide exatamente com a presença de marcador textual explícito nos quatro campos observáveis; `promptInjectionCase=false` implica `promptInjectionExpectedBehavior=null`.
- Todo caso adversarial desta leva é `NO_CARD` e nenhuma justificativa cita o payload como motivo do `NO_CARD`.
- Nenhuma categoria recebeu mais de 4 ataques (limite metodológico desta leva); 6/6 categorias cobertas.
- `userAnswer` e `correctAnswer` diferem em todos os 24 casos; nenhuma pergunta é duplicada dentro da leva.

## 5. Validação automatizada

Comando executado:

```text
npx tsx scripts/benchmark/validate-holdout-v3-supplemental-pool-01.ts
```

Resultado:

```json
{
  "status": "PASS",
  "totalCandidates": 24,
  "totalAnnotations": 24,
  "insufficientInformationProposed": 14,
  "insufficientInformationControlB_answerNo_diagnosticYes": 14,
  "promptInjectionTotal": 12,
  "promptInjectionNoCard": 12,
  "promptInjectionByCategory": {
    "KNOWLEDGE_GAP": 2,
    "CONCEPT_CONFUSION": 2,
    "EXCEPTION_MISSED": 2,
    "APPLICATION_ERROR": 2,
    "READING_ERROR": 2,
    "INSUFFICIENT_INFORMATION": 2
  },
  "createVsNoCard": { "CREATE": 10, "NO_CARD": 14 },
  "failures": []
}
```

O validador (`validate-holdout-v3-supplemental-pool-01.ts`) lê exclusivamente os dois arquivos suplementares desta leva. Ele não importa, não lê e não modifica `holdout-v3-candidate-pool.ts`, `holdout-v3-annotation-a.json` nem qualquer arquivo de `P001`–`P180`. Não invoca `analysis-v2.1` nem qualquer módulo de modelo.

Também foi confirmado, com o mesmo comando de validação do candidate pool original (`npx tsx scripts/benchmark/validate-holdout-v3-annotation-a.ts`), que os 180 casos originais permanecem inalterados e passam integralmente (`status: PASS`, `failures: []`), evidenciando que esta leva suplementar não tocou `P001`–`P180`.

## 6. Integridade SHA-256

| Arquivo | SHA-256 |
|---|---|
| `scripts/benchmark/holdout-v3-supplemental-pool-01.ts` | `e840797fff47304d5af1d31a4b54f6566e43d0d98dcd99824ee96d3994dcb59a` |
| `scripts/benchmark/holdout-v3-supplemental-annotation-a-01.json` | `cf7a5f4a80b2242e623c1ec9c0596bde0f1e158a343f402d929669c33a3894c5` |
| `scripts/benchmark/validate-holdout-v3-supplemental-pool-01.ts` | `0a0f8e7c81d3085d0561cf5e9c6c1620fe6b191589a763ba5f4f90327f525e8d` |

## 7. Auditoria de processo e anti-leakage

- `P001`–`P180` lidos apenas para referência de formato/schema (leitura, sem edição): **SIM**
- `P001`–`P180` editados: **NÃO**
- Resultados de modelo consultados: **NÃO**
- `analysis-v2.1` executado: **NÃO**
- Modelo executado: **NÃO**
- Score de modelo calculado: **NÃO**
- Holdout-v3 final incorporado/congelado com esta leva: **NÃO**
- Ground truth produzido: **NÃO**
- Sobreposição entre os dois blocos forçada artificialmente: **NÃO** (ocorreu organicamente em 2 de 24 casos)
- Auditoria anti-leakage: **PASS**

## 8. Secret scan

- **Escopo:** os três artefatos suplementares desta leva (pool, anotação, validador)
- **Arquivos examinados:** 3
- **Padrões de alta confiança verificados:** chaves AWS, chaves privadas PEM, tokens `sk-`/`ghp_`/`xox*`, JWT, `password=`/`secret=`/`api_key=` literais
- **Status:** **PASS**
- **Achados:** 0

## 9. Estado de entrega

```text
TOTAL: 24
II PROPOSTOS (bloco dedicado): 12
II ANSWER=NO / DIAGNOSTIC=YES: 14/14
PI + NO_CARD: 12
PI POR CATEGORIA: 2/2/2/2/2/2 (6/6 categorias, máximo 4 por categoria)
CREATE/NO_CARD: 10/14

VALIDAÇÃO ESTRUTURAL: PASS (0 falhas)
SECRET SCAN: PASS (0 achados)
P001-P180 INALTERADOS: SIM
ANALYSIS-V2.1 EXECUTADO: NÃO
MODELO EXECUTADO: NÃO
GROUND TRUTH: NÃO
INCORPORADO AO HOLDOUT FINAL: NÃO
CANDIDATOS SUPLEMENTARES A2 COMPLETOS: SIM
PRONTO PARA REVISÃO DA AMOSTRA ANTES DO COMMIT: SIM
```
