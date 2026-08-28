# Sprint 3 — Holdout-V3 Candidate Pool: Anotação Independente do Anotador B

## 0. Papel e Isolamento de Cegueira (Blinding)

Este relatório documenta a anotação cega e independente dos 180 casos candidatos
(`P001`–`P180`) do Holdout-V3, produzida pelo **Anotador B**, conforme
`docs/SPRINT_3_HOLDOUT_V3_PROTOCOL.md` (Fase 2).

**Fontes lidas (permitidas):**
- `docs/SPRINT_3_HOLDOUT_V3_PROTOCOL.md`
- `scripts/benchmark/holdout-v3-candidate-pool.ts`

**Fontes explicitamente NÃO acessadas (proibidas):**
- `holdout-v3-annotation-a.json` / `holdout-v3-candidate-annotation-a.json`
- Manifesto do candidate pool (`holdout-v3-candidate-manifest.json`)
- Relatório e validador do Anotador A (`SPRINT_3_HOLDOUT_V3_ANNOTATOR_A*.md`,
  `validate-holdout-v3-annotation-a.ts`)
- Holdout-v1 / Holdout-v2 (quaisquer arquivos)
- `benchmark-v2`
- Resultados de execução de modelos
- `analysis-v2.1`

Nenhuma dessas fontes foi lida, aberta ou referenciada durante esta anotação.
**BLINDING BREACH: NÃO.**

---

## 1. Metodologia da Anotação

Cada um dos 180 casos foi classificado exclusivamente a partir dos quatro campos
observáveis públicos (`question`, `userAnswer`, `correctAnswer`,
`officialExplanation`), sem qualquer suposição sobre a intenção do Anotador A,
conforme o Princípio Fundamental da Seção 1 do protocolo.

### 1.1 Taxonomia de `errorType` aplicada
Como o protocolo não define os seis rótulos, o Anotador B adotou definições
operacionais padrão da literatura de análise de erros pedagógicos, aplicadas
de forma consistente aos 180 casos:

- **KNOWLEDGE_GAP:** negação total ou ausência do fato/conceito básico (ex.:
  "X não existe/não ocorre"), sem indício de aplicação de um método incorreto.
- **CONCEPT_CONFUSION:** troca simétrica entre dois conceitos adjacentes
  (definições, papéis ou propriedades invertidos ponto a ponto).
- **EXCEPTION_MISSED:** o enunciado declara explicitamente uma regra geral e
  uma exceção; o aluno aplica apenas a regra geral e ignora a exceção
  informada no próprio enunciado.
- **APPLICATION_ERROR:** o aluno usa o método/fórmula correta em espírito, mas
  comete um erro específico e reconstruível na execução (operação trocada,
  termo esquecido, sinal invertido, etc.), visível a partir dos números
  observáveis.
- **READING_ERROR:** o aluno desrespeita uma restrição/instrução explícita do
  enunciado (formato de saída, escopo da resposta, quantificador lógico,
  ordem temporal) independentemente do domínio de conhecimento.
- **INSUFFICIENT_INFORMATION:** os quatro campos observáveis não permitem
  desempatar entre duas ou mais causas pedagógicas igualmente plausíveis
  (`diagnosticIndeterminate=YES`), conforme regra bicondicional forte da
  Seção 4.1 do protocolo.

### 1.2 Critério de reconstrutibilidade para erros aritméticos "em branco"
Para respostas numéricas erradas sem raciocínio explícito, o Anotador B
aplicou um teste de reconstrutibilidade: se o valor errado se explica por uma
operação alternativa identificável a partir dos números do enunciado (ex.:
somou em vez de multiplicar), o caso é `CLEAR`/`APPLICATION_ERROR`. Se o valor
errado é um "quase-acerto" sem mecanismo alternativo reconstruível (ex.: erro
de ±1 numa tabuada, sem indício de qual operação foi tentada), o caso é
`AMBIGUOUS`/`INSUFFICIENT_INFORMATION`, pois `KNOWLEDGE_GAP` e
`APPLICATION_ERROR` permanecem igualmente plausíveis e a informação que falta
para o desempate é o rastro de raciocínio do aluno (§4.2).

### 1.3 Política de card em quatro eixos
Aplicados literalmente os quatro critérios da Seção 7. Dois perfis recorrentes
de `NO_CARD` emergiram, ambos com um ou mais eixos em `NO`:
- **Erros formais/pontuais** (ex.: seguir instrução de formatação, copiar
  sem traduzir, responder só com o sobrenome): `generalizableContent=NO` e
  `futureReviewUseful=NO` — o conteúdo é específico deste exercício e não
  generaliza.
- **Casos `INSUFFICIENT_INFORMATION`:** todos os quatro eixos `NO`, pois sem
  diagnóstico não há o que ensinar de forma estável.

### 1.4 Prompt injection como eixo ortogonal
Cada caso foi escaneado por marcadores textuais adversariais (`[COMANDO
INJETADO...]`, `[PAYLOAD ADVERSARIAL...]`, `[INJEÇÃO...]`, `[CONTEÚDO
ADVERSARIAL...]`) nos campos `question` e `userAnswer`. A classificação de
`errorType` e a decisão de card foram sempre derivadas do conteúdo pedagógico
real, independentemente da presença ou do conteúdo do payload — inclusive nos
casos em que o payload tentava explicitamente ditar o rótulo de erro ou a
decisão de card (ex.: `P133`, `P108`).

---

## 2. Distribuição por `errorType` (180 casos)

| errorType | Contagem |
|---|---:|
| KNOWLEDGE_GAP | 36 |
| CONCEPT_CONFUSION | 39 |
| EXCEPTION_MISSED | 29 |
| APPLICATION_ERROR | 32 |
| READING_ERROR | 25 |
| INSUFFICIENT_INFORMATION | 19 |
| **Total** | **180** |

Nenhuma tentativa foi feita de reproduzir ~30 casos por categoria; a
distribuição acima é resultado exclusivo do julgamento independente sobre o
conteúdo observável de cada caso.

## 3. Observabilidade

| observability | Contagem |
|---|---:|
| CLEAR | 161 |
| AMBIGUOUS | 7 |
| UNOBSERVABLE | 12 |
| **Total** | **180** |

## 4. Matriz de Indeterminação (answerIndeterminate × diagnosticIndeterminate)

| Combinação | Contagem | Papel (Seção 5.2) |
|---|---:|---|
| aI=NO / dI=NO | 148 | Controle D — casos normais determinados |
| aI=YES / dI=NO | 13 | Controle A — questão aberta, erro causal óbvio |
| aI=NO / dI=YES | 7 | Controle B — questão fechada, diagnóstico incerto |
| aI=YES / dI=YES | 12 | Controle C — duplamente indeterminado |
| **Total** | **180** | |

Todos os 19 casos com `diagnosticIndeterminate=YES` (Controles B+C) têm
`expectedErrorType=INSUFFICIENT_INFORMATION`, e nenhum caso fora desses 19 usa
esse rótulo — cumprindo a regra bicondicional forte da Seção 4.1.
`answerIndeterminate=YES` isoladamente nunca foi usado para justificar II: os
13 casos de Controle A demonstram explicitamente imunidade ao atalho.

## 5. Decisão de Card

| expectedCardDecision | Contagem |
|---|---:|
| CREATE | 144 |
| NO_CARD | 36 |
| **Total** | **180** |

Todas as 144 decisões `CREATE` têm os quatro eixos em `YES`; todas as 36
decisões `NO_CARD` têm ao menos um eixo em `NO` (verificado pelo validador).

## 6. Prompt Injection

**29 casos** com `promptInjectionDetected=true` foram identificados no pool de
180 candidatos (marcadores textuais adversariais em `question` ou
`userAnswer`): `P002, P008, P015, P031, P043, P049, P054, P055, P056, P057,
P070, P071, P074, P075, P077, P079, P082, P084, P098, P103, P108, P113, P114,
P115, P123, P133, P162, P171, P175`.

Todos os 29 casos possuem `promptInjectionExpectedBehavior` preenchido,
descrevendo o comportamento seguro esperado (ignorar o comando embutido e
prosseguir com a análise pedagógica/schema normal). O eixo de injeção nunca
determinou `errorType` nem `expectedCardDecision` — em particular, `P108` e
`P133` continham payloads tentando ditar diretamente o rótulo de erro
(`CONCEPT_CONFUSION`) ou a ação de card (`CREATE`), e a classificação B
registrada foi derivada de forma independente do conteúdo real, não do
comando injetado, conforme documentado nas respectivas justificativas.

A cota final de 20 casos com payload (Seção 8) será decidida pelo Agente C na
Fase 3, a partir da intersecção com a Anotação A; o candidate pool aqui
anotado contém excedente (29) para permitir essa seleção.

## 7. Achado Metodológico Reportável — Caso P108

Durante a análise independente, o Anotador B identificou uma inconsistência
factual objetiva no caso `P108`: das três alternativas apresentadas, tanto a
alternativa B ("Todo retângulo é quadrado") quanto a alternativa C ("Todo
losango é quadrado") são geometricamente falsas — um losango genérico não é
necessariamente um quadrado. O enunciado, porém, pede "a" alternativa
incorreta no singular. Isso torna a resposta da questão tecnicamente
subdeterminada (`answerIndeterminate=YES`), embora o diagnóstico do erro do
aluno permaneça claro (`diagnosticIndeterminate=NO`): o aluno marcou a
alternativa A — logicamente verdadeira — como se fosse a falsa, revelando
confusão sobre a hierarquia quadrado⊂retângulo. Este achado é reportado para
possível ADJUDICATE/REJECT pelo Agente C, conforme Seção 3.1 e a Regra de
Ouro da Imutabilidade (Seção 3.2): o texto do caso não foi alterado por B.

---

## 8. Validação

- **Structural validation (`validate-holdout-v3-annotation-b.ts`): PASS**
  (180/180 casos, todos os IDs batem com o candidate pool, todas as regras de
  consistência interna do protocolo — Seções 4, 5, 6, 7 e 8 — satisfeitas;
  nenhuma comparação com a Anotação A foi realizada ou é realizada por este
  validador).
- **Secret scan: PASS** (nenhum padrão de credencial/API key/token encontrado
  nos três arquivos entregues).

## 9. Checklist de Conformidade

| Item | Status |
|---|---|
| Annotation A accessed | NO |
| Previous holdouts (v1/v2) accessed | NO |
| Model results accessed | NO |
| Model executed | NO |
| Blinding breach | NO |
| Structural validation | PASS |
| Secret scan | PASS |
| Commit hash | ver Seção 10 |
| **READY FOR REPRODUCIBILITY ANALYSIS** | **YES** |

## 10. Commit

Arquivos entregues nesta anotação (commit único,
`test(ai): add independent blind holdout v3 annotation B`):

- `scripts/benchmark/holdout-v3-annotation-b.json`
- `scripts/benchmark/validate-holdout-v3-annotation-b.ts`
- `docs/SPRINT_3_HOLDOUT_V3_ANNOTATOR_B.md`

Hash do commit: `<preenchido após commit — ver mensagem de commit no
histórico do branch `claude/holdout-v3-annotation-b-so2s6b`>`.

Nenhum push foi realizado, conforme instrução.
