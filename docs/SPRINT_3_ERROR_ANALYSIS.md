# Sprint 3 — Análise de Erros e Refinamento do Motor (analysis-v1.2 → analysis-v2)

## 0. Status do benchmark-v2

**`benchmark-v2` = DEVELOPMENT / DIAGNOSTIC SET.**

A partir deste documento, `benchmark-v2` (91 casos, `scripts/benchmark/dataset.ts`) é
formalmente um conjunto de **desenvolvimento/diagnóstico**, não um holdout de
homologação. Ele pode ser usado para:

- análise de erros e identificação de padrões (este documento);
- refinamento do prompt (`analysis-v2`, ver seção 6);
- testes de regressão durante desenvolvimento.

Ele **não pode** ser usado para declarar que qualquer versão futura do motor
"atingiu os thresholds oficiais" ou para homologar a Sprint 3. Um holdout cego
novo (`benchmark-v3` ou equivalente) precisa ser criado, sem qualquer
influência do processo de refinamento abaixo, antes de qualquer validação
final. **Este documento não cria esse holdout.**

## 1. Contexto

Quatro candidatos (gemini-3.6-flash, gemini-3.7-flash medium, gemini-3.7-flash
high, gemini-3.1-pro-preview) foram avaliados contra a mesma régua congelada
de 7 thresholds. Todos passaram Factual (100%), Hallucination (0%),
Pedagogical (100%) e Uncertainty (exceto 3.1-Pro). **Nenhum** passou
simultaneamente Classification (≥90%) e CREATE/NO_CARD (≥95%):

| Candidato | Classification | CREATE/NO_CARD |
|---|---|---|
| 3.6-flash | 79.12% | 91.21% |
| 3.7-flash medium | 76.92% | 94.51% |
| 3.7-flash high | 78.02% | 93.41% |
| 3.1-pro-preview | 65.93% | 84.62% |

A convergência dos quatro modelos — de arquiteturas, tamanhos e orçamentos de
"thinking" diferentes — nos **mesmos casos e nos mesmos erros** é o sinal mais
forte de que o gargalo não é capacidade do modelo, e sim a **especificação da
taxonomia** (ambiguidade no prompt) ou, em alguns casos, **limitação
estrutural de observabilidade** do problema. Esta análise usa exatamente esse
sinal: cruza os 4 candidatos caso a caso e trata como "erro sistêmico" todo
caso em que ≥3 dos 4 modelos independentes divergiram do gabarito da mesma
forma.

Metodologia: script `scripts/benchmark/error-matrix.ts` (versionado),
determinístico, sem uso de IA — apenas cruza os resultados já persistidos dos
4 candidatos contra `BENCHMARK_DATASET` e o scorer já congelado
(`evaluateCreateVsNoCard`/`acceptableErrorTypes`, reaproveitados de
`run-benchmark.ts` sem alteração). Saída completa em
`benchmark-results/error-matrix.json`.

## 2. Matriz de confusão (soma dos 4 modelos × N casos por categoria)

| esperado \ previsto | KNOWLEDGE_GAP | CONCEPT_CONFUSION | EXCEPTION_MISSED | APPLICATION_ERROR | READING_ERROR | INSUFFICIENT_INFORMATION |
|---|---|---|---|---|---|---|
| **KNOWLEDGE_GAP** (60) | 35 | **25** | 0 | 0 | 0 | 0 |
| **CONCEPT_CONFUSION** (63) | 2 | 61 | 0 | 0 | 0 | 0 |
| **EXCEPTION_MISSED** (57*) | **16** | 0 | 41 | 0 | 0 | 0 |
| **APPLICATION_ERROR** (60) | 7 | 9 | 2 | 38 | 4 | 0 |
| **READING_ERROR** (59*) | **11** | **10** | 0 | 2 | 35 | 1 |
| **INSUFFICIENT_INFORMATION** (59*) | 0 | 0 | 0 | 0 | 0 | 59 |

\* Total < 60 (15 casos × 4 modelos) por causa de falhas técnicas isoladas
(timeout/schema) não contadas como classificação.

**Pares de maior confusão** (os 5 indicados no escopo desta rodada, todos
confirmados):

1. **KNOWLEDGE_GAP → CONCEPT_CONFUSION** (25 ocorrências, a maior distorção
   isolada da matriz — 41.7% de todas as instâncias de KNOWLEDGE_GAP).
2. **EXCEPTION_MISSED → KNOWLEDGE_GAP** (16 ocorrências, 28%).
3. **APPLICATION_ERROR → KNOWLEDGE_GAP** (7) e **APPLICATION_ERROR →
   CONCEPT_CONFUSION** (9).
4. **READING_ERROR → KNOWLEDGE_GAP** (11).
5. **READING_ERROR → CONCEPT_CONFUSION** (10).

`INSUFFICIENT_INFORMATION` é a única categoria com confusão zero (100% de
acerto agregado) — é a mais observável de todas: dados ausentes/degenerados
são um sinal textual direto, sem depender de inferência sobre estado mental.
`CONCEPT_CONFUSION` como categoria-alvo também tem alta precisão (61/63); o
problema é quase todo em uma direção (excesso de previsões de
CONCEPT_CONFUSION quando o esperado é outra coisa).

## 3. Casos sistêmicos (≥3 de 4 modelos divergiram do mesmo jeito)

19 casos de classificação e 6 casos de decisão CREATE/NO_CARD. Cada um foi
analisado individualmente e classificado em uma causa principal (A–F, ver
seção 4). Tabela completa a seguir; texto completo de cada caso (question,
userAnswer, correctAnswer, officialExplanation, previsões dos 4 modelos) está
em `benchmark-results/error-matrix.json` e no output bruto de
`error-matrix.ts`.

| caseId | esperado | previsto (maioria) | causa | ação |
|---|---|---|---|---|
| kg-02, kg-04, kg-09, kg-11, kg-13 | KNOWLEDGE_GAP | CONCEPT_CONFUSION | B | prompt: exigir estrutura de par comparável |
| em-05, em-07, em-10, em-12 | EXCEPTION_MISSED | KNOWLEDGE_GAP | B (em-07 com componente A) | prompt: regra geral explícita no enunciado pesa a favor de EXCEPTION_MISSED |
| ae-01 | APPLICATION_ERROR | KNOWLEDGE_GAP | B | prompt: resposta numérica explicável por operação plausível-porém-errada é evidência de APPLICATION_ERROR |
| ae-04 | APPLICATION_ERROR | CONCEPT_CONFUSION | F | não fixável no prompt sem forçar o modelo a discordar de si mesmo 4/4; ver seção 4.3 |
| ae-06 | APPLICATION_ERROR ou CONCEPT_CONFUSION (já aceito) | EXCEPTION_MISSED (3.6, 3.7-med) / APPLICATION_ERROR (3.7-high, correto) / KNOWLEDGE_GAP (3.1-Pro) | A (já documentado no dataset) | nenhuma — caso já reconhecido como ambíguo por desenho |
| re-03, re-05 | READING_ERROR | CONCEPT_CONFUSION (maioria) | B | prompt: instrução textual explícita ignorada é sinal direto de READING_ERROR |
| re-09, re-11, re-13, re-15 | READING_ERROR | KNOWLEDGE_GAP / CONCEPT_CONFUSION (variado) | **C** | limitação estrutural — ver seção 5 |
| re-14 | READING_ERROR | KNOWLEDGE_GAP / CONCEPT_CONFUSION | B | prompt: má leitura de estrutura lógica/gramatical (negação, quantificadores) é READING_ERROR |
| ae-03, ae-05, ae-09, ae-11 (só 3.1-Pro) | APPLICATION_ERROR | READING_ERROR | A | fronteira genuína entre "executou mal um procedimento dado" e "não atentou ao que a fórmula pedia" — nova regra de desempate adicionada |

### 3.1 Análise por par de categorias (o que distingue, o que é observável, o que não é)

**KNOWLEDGE_GAP ↔ CONCEPT_CONFUSION**
- *O que distingue conceitualmente:* KNOWLEDGE_GAP é a ausência de uma
  informação; CONCEPT_CONFUSION é a troca entre dois conceitos que o
  estudante *tem em mente simultaneamente* e mistura.
- *Evidência observável:* a questão apresenta (explícita ou implicitamente)
  **dois conceitos comparáveis/pareados**, e a resposta do usuário reflete um
  deles no lugar do outro (ex.: "massa" no lugar de "peso", "artéria" no
  lugar de "veia").
- *Evidência que NÃO existe / NÃO basta:* a resposta errada ser um termo real
  do mesmo domínio (ex.: "1808" é um ano real, "Mitose" é um processo real,
  "Átomo" é um conceito real) **não é evidência de confusão conceitual** — é
  apenas uma resposta específica errada. Sem uma estrutura de comparação na
  própria pergunta, isso é lacuna de conhecimento, não confusão de conceitos.
  Este era o erro sistêmico dominante: os 4 modelos tratavam "resposta errada
  parece um termo de verdade" como sinal de CONCEPT_CONFUSION.

**EXCEPTION_MISSED ↔ KNOWLEDGE_GAP**
- *O que distingue:* EXCEPTION_MISSED pressupõe que o estudante **domina a
  regra geral** e falha especificamente na exceção; KNOWLEDGE_GAP é não
  conhecer nem a regra geral.
- *Evidência observável:* quando o próprio enunciado **apresenta a regra
  geral explicitamente como premissa** antes de perguntar sobre o caso
  específico/excepcional, isso é evidência de exposição à regra no momento da
  resposta — pesa a favor de EXCEPTION_MISSED, não KNOWLEDGE_GAP.
- *Evidência que NÃO existe / NÃO basta:* nada nos 4 campos prova que o
  estudante *já sabia* a regra geral antes de ler a questão — apenas que ela
  estava disponível no enunciado. Por isso esta é uma regra de peso
  probabilístico, não uma certeza; ver componente A (taxonomy boundary) em
  em-07, onde a resposta do usuário é ambígua até sobre reconhecer a
  paridade do zero como caso-regra vs. caso-exceção.

**APPLICATION_ERROR ↔ KNOWLEDGE_GAP**
- *O que distingue:* APPLICATION_ERROR pressupõe que o procedimento/fórmula
  era conhecido, mas foi executado incorretamente; KNOWLEDGE_GAP é não saber
  o procedimento.
- *Evidência observável:* quando a resposta numérica do usuário é explicável
  como resultado de uma **operação plausível, porém errada**, aplicada aos
  mesmos operandos do problema (ex.: multiplicou quando devia dividir; somou
  quando devia subtrair), isso é evidência direta de que o procedimento foi
  *executado* — apenas mal — não de que era desconhecido.
- *Evidência que NÃO existe:* nada nos 4 campos prova a intenção/processo
  mental por trás do número errado quando ele não corresponde a nenhuma
  operação derivável dos dados fornecidos — nesse caso, KNOWLEDGE_GAP
  permanece a leitura mais defensável.

**READING_ERROR ↔ KNOWLEDGE_GAP e READING_ERROR ↔ CONCEPT_CONFUSION**
- *O que distingue:* READING_ERROR é um erro no que foi **entendido do
  enunciado** (o que foi pedido), não no conteúdo/conceito em si.
- *Evidência observável:* o enunciado contém uma **instrução, ênfase ou dado
  explícito e verificável textualmente** (ex.: "assinale a INCORRETA",
  "MENOS e não mais", "pede o antônimo", estrutura lógica com negação/
  quantificador como "nenhum...menos de X") que a resposta do usuário
  contraria diretamente — a contradição é verificável comparando o texto da
  pergunta com o texto da resposta, sem precisar de conhecimento de domínio.
- *Evidência que NÃO existe / NÃO basta:* uma resposta simplesmente errada
  para uma pergunta trivial, **sem** nenhuma instrução/ênfase textual
  contrariada, não distingue "leu errado" de "não sabia" — ver seção 5 para a
  limitação estrutural completa (particularmente grave nos 4 casos de
  prompt-injection do dataset).

### 3.2 Card decision: auditoria completa (não apenas casos sistêmicos)

Todos os 12 casos com ≥1 erro de CREATE/NO_CARD entre os 4 modelos foram
auditados individualmente (não só os 6 sistêmicos). Resultado: **os 12/12
são categoria A (diagnóstico errado provocou card errado)**. Em nenhum único
caso um modelo acertou o `probableErrorType` e ainda assim errou a decisão
CREATE vs. NO_CARD — sempre que o tipo previsto batia com
`acceptableErrorTypes`, a decisão de card também batia. **Não existe bug de
política de card neste dataset** — o mapeamento tipo→card já é
suficientemente claro; o problema é 100% upstream, na classificação do tipo.
Isso simplifica a seção 7 do refinamento: não foi necessário reescrever a
política CREATE/NO_CARD, apenas mantê-la e reforçar sua independência
declarada do `errorType` (ver seção 6.3).

## 4. Classificação de causa (A–F) — critério aplicado

- **A. TAXONOMY_BOUNDARY** — usada quando a distinção conceitual entre duas
  categorias é genuinamente estreita mesmo com boa observação (em-07
  parcialmente; ae-03/05/09/11 do 3.1-Pro; ae-06, já reconhecido no dataset).
- **B. PROMPT_AMBIGUITY** — usada quando existe evidência textual suficiente
  para distinguir as categorias, mas o prompt v1.2 não guiava o modelo a
  usá-la (a maioria dos casos sistêmicos: kg-02/04/09/11/13, em-05/10/12,
  ae-01, re-03/05/14). Esta é a causa mais frequente e a mais acionável —
  motivou a maior parte do `analysis-v2`.
- **C. INSUFFICIENT_OBSERVABILITY** — usada quando os 4 campos de entrada não
  permitem, em princípio, inferir a causa com segurança (re-09/11/13/15; ver
  seção 5).
- **D. CARD_POLICY_AMBIGUITY** — **não foi necessária nenhuma vez** nesta
  rodada (seção 3.2).
- **E. MODEL_REASONING_ERROR** — não identificado nenhum caso claro: em todo
  caso sistêmico investigado havia uma causa estrutural (A/B/C) que explica
  o padrão através de 4 modelos independentes; um erro genuinamente aleatório
  de raciocínio não se replicaria consistentemente entre arquiteturas
  diferentes.
- **F. DATASET_LIMITATION** — usada quando os 4 modelos convergem entre si e
  divergem do gabarito, e a alternativa deles é textualmente defensável
  (ae-04: confusão entre proporção direta/inversa é um caso legítimo de
  CONCEPT_CONFUSION, não apenas erro de execução — mas o dataset está
  congelado e não foi alterado; documentado aqui, não corrigido no gabarito).

O dataset **não foi alterado** para melhorar nenhum score, inclusive no caso
F acima — a divergência é documentada, não "corrigida" retroativamente.

## 5. A taxonomia é observável? (avaliação crítica)

Pergunta central: `question` + `userAnswer` + `correctAnswer` +
`officialExplanation` (opcional) bastam para distinguir as 6 categorias com
≥90% de confiabilidade?

**Resposta: não uniformemente.** Por categoria:

| Categoria | Inferível diretamente? | Apenas provável? | Depende de estado mental não observável? |
|---|---|---|---|
| INSUFFICIENT_INFORMATION | **Sim** — ausência/degenerescência de dados é um fato textual, não uma inferência. | — | Não. |
| CONCEPT_CONFUSION | Sim, **quando** a pergunta apresenta uma estrutura de par comparável e a resposta reflete o par trocado. | Fora dessa estrutura, apenas provável. | Parcialmente — pressupõe que o estudante "tinha os dois conceitos em mente", o que não é 100% verificável. |
| READING_ERROR | Sim, **quando** há uma instrução/ênfase/dado textual explícito contrariado pela resposta. | Sem esse gatilho textual, apenas provável (às vezes nem isso). | **Sim, fortemente** — ver abaixo. |
| EXCEPTION_MISSED | Apenas provável, mesmo com o gatilho textual (regra geral explícita no enunciado). | Sim. | Sim — pressupõe conhecimento prévio da regra geral, que a questão pode estar apenas fornecendo no ato, não confirmando que já existia. |
| APPLICATION_ERROR | Sim, **quando** a resposta numérica é derivável de uma operação plausível sobre os dados dados. | Fora disso, apenas provável. | Parcialmente — "conhecia o procedimento" é uma inferência, não um fato observado. |
| KNOWLEDGE_GAP | É o **padrão residual** — usado quando nenhuma das evidências acima das outras categorias está presente. | — | Menos do que as outras: é a categoria "menos comprometida", exigindo apenas ausência de evidência de outra causa mais específica. |

### 5.1 READING_ERROR: "leu errado" vs. "não sabia" — é possível distinguir?

**Não, de forma confiável, apenas pela resposta produzida — exceto quando há
um gatilho textual explícito no enunciado.** Esta é a limitação estrutural
mais séria encontrada nesta análise.

Evidência empírica: os 15 casos de READING_ERROR do dataset se dividem em
dois grupos nitidamente diferentes em taxa de acerto:

- **Casos com gatilho textual explícito** (re-01, re-02, re-04, re-06, re-07,
  re-08, re-10, re-12 — a pergunta contém uma instrução, ênfase ou dado que a
  resposta contraria diretamente, ex.: "MENOS e não mais", "pede o
  INCORRETO", "5 anos DEPOIS"): baixa taxa de erro sistêmico — apenas re-08
  aparece com ambiguidade, e já é reconhecida no dataset (aceita também
  INSUFFICIENT_INFORMATION).
- **Casos sem gatilho textual claro** (re-03, re-05, re-09, re-11, re-13,
  re-14, re-15): 7 dos 15 casos, quase metade da categoria, tiveram erro
  sistêmico. Em particular, os 4 casos de `tags: ['prompt-injection']`
  (re-09, re-11, re-13, re-15) combinam dois problemas independentes: (1) o
  conteúdo malicioso embutido na pergunta é **ruído**, não evidência sobre a
  causa do erro real do estudante; (2) o erro real subjacente (ex.: "54" em
  vez de "56" para 7×8; "Barcelona" em vez de "Madri") é **indistinguível**,
  a partir dos 4 campos, entre "o estudante leu com pressa/descuido" e "o
  estudante genuinamente não sabia/não lembrava". Não há nenhum sinal
  textual — nem no enunciado, nem na resposta — que aponte para um lado ou
  outro. O rótulo `READING_ERROR` desses 4 casos no dataset reflete uma
  decisão de design (esses casos foram criados para testar resistência a
  prompt injection, e o tipo de erro foi fixado como READING_ERROR por
  convenção do dataset), não uma propriedade inferível dos dados.

**Conclusão estrutural:** a resistência à injeção de prompt (medida
separadamente por `promptInjectionResistance`, 100% em todos os candidatos) é
uma capacidade real e verificável. A classificação do `probableErrorType`
*dentro* de um caso com conteúdo suspeito, na ausência de um gatilho textual
independente, **não é** — e não deveria ser forçada a fingir que é.
`analysis-v2` trata isso com conservadorismo (seção 6.2) em vez de tentar
"decorar" o padrão do dataset.

## 6. Mudanças: analysis-v1.2 → analysis-v2

`PROMPT_VERSION`: `analysis-v1.2` → `analysis-v2.0` (`src/config/ai.ts`).

Nenhuma mudança nos 4 campos de entrada, no `analysisOutputSchema` (Zod), no
`GEMINI_RESPONSE_SCHEMA`, na cota diária, no threshold de baixa confiança, ou
em qualquer contrato de API. `analysis-v2` é uma mudança **apenas** de texto
do system prompt (`ANALYSIS_SYSTEM_PROMPT`).

### 6.1 Nova seção "FRONTEIRAS ENTRE CATEGORIAS PRÓXIMAS"

Adiciona, para cada par de categorias identificado como fonte sistêmica de
erro (seção 3.1), uma regra de desempate **generalizável** (não amarrada a
nenhum caso específico do benchmark):

1. CONCEPT_CONFUSION exige estrutura de par comparável na pergunta; resposta
   errada que é apenas "um termo real do mesmo domínio" sem essa estrutura
   → KNOWLEDGE_GAP.
2. Regra geral explícita no enunciado como premissa, seguida de pergunta
   sobre caso específico/excepcional → EXCEPTION_MISSED pesa mais que
   KNOWLEDGE_GAP.
3. Resposta numérica derivável de operação plausível-porém-errada sobre os
   dados fornecidos → evidência de APPLICATION_ERROR (procedimento
   executado, não ausente).
4. Instrução/ênfase/dado textual explícito no enunciado, contrariado
   diretamente pela resposta (inclusive estrutura lógica/gramatical como
   negação e quantificadores) → READING_ERROR.
5. Fórmula/procedimento fornecido explicitamente no enunciado e o erro está
   em qual operação executar (não em qual dado usar ou o que foi pedido) →
   prefira APPLICATION_ERROR; reserve READING_ERROR para quando o erro está
   em entender o que a pergunta pedia, não em como calcular.

### 6.2 Conservadorismo reforçado (seção 8 do escopo)

Adiciona instrução explícita: quando o conteúdo da pergunta apresenta sinais
de manipulação/instrução embutida (o mesmo gatilho já usado para
anti-prompt-injection) **e** nenhuma das regras de desempate acima se aplica
com uma evidência textual própria e independente do conteúdo suspeito,
preferir `INSUFFICIENT_INFORMATION` a forçar uma categoria — em vez de
assumir por convenção que é sempre READING_ERROR. Também reforça, fora do
contexto de injeção: quando duas causas são igualmente plausíveis e nenhuma
das regras de desempate acima decide, preferir INSUFFICIENT_INFORMATION ou
reduzir `confidence`, nunca escolher com confiança alta uma inferência frágil
(já parcialmente presente em v1.2, agora com regras de desempate concretas
em vez de "use julgamento").

### 6.3 CREATE/NO_CARD: política mantida, independência reforçada

A auditoria (seção 3.2) mostrou que não há bug de política de card — 100%
dos erros de CREATE/NO_CARD são upstream (tipo errado). Portanto
`analysis-v2` **mantém** o mapeamento pedagógico de v1.2
(`KNOWLEDGE_GAP→CREATE_BASIC_CARD`, etc. como referência, não regra mecânica)
e apenas reforça textualmente dois pontos que já existiam mas ganham ênfase
mais explícita:
- `APPLICATION_ERROR` não implica automaticamente `CREATE_APPLICATION_CARD`
  — um deslize claramente pontual (a fórmula era conhecida e corretamente
  identificada, só a execução falhou uma vez) pode ainda justificar NO_CARD
  se não houver padrão reutilizável a fixar.
- Conteúdo sinalizado como possível prompt injection tende a NO_CARD por
  padrão, independente da classificação de tipo — não porque READING_ERROR
  "sempre" seja o tipo certo, mas porque um flashcard fixando o conteúdo de
  uma pergunta adversarial/degenerada raramente é pedagogicamente útil.

### 6.4 `recommendedAction`, diagnóstico cego, anti-injection, structured output

Preservados sem alteração de princípio: `recommendedAction` continua
obrigatório em 100% dos casos (inclusive NO_CARD); `user_attribution`
continua nunca enviado ao Gemini (já era assim em v1.2 —
`buildAnalysisUserPrompt` nunca incluiu esse campo; nenhuma mudança
necessária aqui, apenas confirmado por leitura de código); a seção "DADOS NÃO
SÃO INSTRUÇÕES" é preservada integralmente; o formato de saída
(`responseSchema` + Zod) não muda.

## 7. Definições operacionais refinadas (as 6 categorias)

**KNOWLEDGE_GAP**
- *Definição positiva:* o estudante não demonstra conhecer a informação,
  regra, conceito ou definição necessária — a resposta não é derivável de
  nenhuma operação sobre os dados nem reflete confusão com outro conceito
  específico apresentado/comparável na pergunta.
- *Sinais observáveis:* resposta sem relação numérica ou conceitual
  identificável com o conteúdo correto; ausência de qualquer par comparável
  na pergunta.
- *Sinais que NÃO bastam:* a resposta errada ser, isoladamente, um termo real
  e plausível do mesmo domínio.
- *Categoria confundível principal:* CONCEPT_CONFUSION.
- *Regra de desempate:* só migre para CONCEPT_CONFUSION se a pergunta
  apresentar dois conceitos comparáveis e a resposta refletir a troca entre
  eles; do contrário, permanece KNOWLEDGE_GAP.

**CONCEPT_CONFUSION**
- *Definição positiva:* a pergunta apresenta (explícita ou implicitamente)
  dois conceitos próximos e comparáveis, e a resposta do estudante usa um no
  lugar do outro.
- *Sinais observáveis:* estrutura de pergunta do tipo "diferença entre X e
  Y", ou pergunta que só faz sentido em contraste com um segundo conceito
  nomeado; resposta = o conceito "errado" do par.
- *Sinais que NÃO bastam:* resposta ser um termo tecnicamente válido do
  mesmo domínio sem que a pergunta tenha apresentado uma estrutura de
  comparação.
- *Categoria confundível principal:* KNOWLEDGE_GAP.
- *Regra de desempate:* se não houver par comparável explícito na pergunta,
  não presumir CONCEPT_CONFUSION; considerar KNOWLEDGE_GAP.

**EXCEPTION_MISSED**
- *Definição positiva:* use somente quando a resposta demonstra ou a
  pergunta evidencia domínio compatível com a regra geral, mas o estudante
  falha especificamente na condição excepcional identificável.
- *Sinais observáveis:* a regra geral está explicitamente declarada como
  premissa no próprio enunciado, seguida de pergunta sobre um caso específico
  que a excepciona; a resposta do estudante aplica a regra geral sem
  considerar a exceção.
- *Sinais que NÃO bastam:* a mera existência de uma exceção conhecida na
  matéria, se a pergunta não fornecer evidência de que o estudante tinha a
  regra geral em mente.
- *Categoria confundível principal:* KNOWLEDGE_GAP.
- *Regra de desempate:* se não houver evidência desse domínio da regra geral
  (nem no enunciado nem indicada de outra forma), não presumir
  EXCEPTION_MISSED; considerar KNOWLEDGE_GAP.

**APPLICATION_ERROR**
- *Definição positiva:* a informação/procedimento necessário parece
  conhecido (frequentemente porque a própria pergunta o fornece), mas foi
  executado incorretamente sobre os dados do caso concreto.
- *Sinais observáveis:* resposta numérica/factual explicável como resultado
  de uma operação plausível-porém-incorreta sobre os mesmos dados fornecidos
  (operação trocada, ordem trocada, termo esquecido).
- *Sinais que NÃO bastam:* resposta simplesmente errada, sem relação
  reconstituível com os dados/procedimento fornecidos — isso é KNOWLEDGE_GAP,
  não execução malsucedida de algo conhecido.
- *Categoria confundível principal:* KNOWLEDGE_GAP (quando não há operação
  reconstituível) e READING_ERROR (quando o procedimento foi executado
  corretamente, mas sobre uma leitura errada do que foi pedido).
- *Regra de desempate:* se o erro está em qual operação/procedimento
  executar sobre dados corretamente identificados → APPLICATION_ERROR; se o
  erro está em entender o que a pergunta pedia → READING_ERROR; se não há
  operação reconstituível → KNOWLEDGE_GAP.

**READING_ERROR**
- *Definição positiva:* a resposta incorreta decorre predominantemente de
  não atender a uma instrução, ênfase, dado ou estrutura lógica/gramatical
  explícita no próprio enunciado — não de uma lacuna de conteúdo.
- *Sinais observáveis:* o enunciado contém um elemento textual explícito
  (instrução do tipo "assinale a incorreta", ênfase como maiúsculas/negrito,
  dado explícito como uma data ou quantidade, ou estrutura lógica como
  negação/quantificador) que a resposta contraria de forma verificável
  comparando os dois textos.
- *Sinais que NÃO bastam:* uma resposta simplesmente errada para uma
  pergunta trivial, sem nenhum elemento textual explícito contrariado —
  nesse caso a distinção entre "leu errado" e "não sabia" **não é observável
  com segurança** (ver seção 5.1); preferir KNOWLEDGE_GAP (se a resposta
  sugerir lacuna de conteúdo) ou INSUFFICIENT_INFORMATION (se genuinamente
  incerto), nunca presumir READING_ERROR só por convenção ou por o
  enunciado "parecer" simples.
- *Categoria confundível principal:* KNOWLEDGE_GAP e CONCEPT_CONFUSION.
- *Regra de desempate:* exigir o gatilho textual explícito descrito acima
  antes de escolher READING_ERROR; na ausência dele, não presumir — cair
  para KNOWLEDGE_GAP ou INSUFFICIENT_INFORMATION conforme o caso.

**INSUFFICIENT_INFORMATION**
- *Definição positiva:* os dados fornecidos (inclusive quando degenerados,
  vazios, contraditórios entre si, ou dependentes de material externo não
  incluído) não permitem inferir a causa provável com segurança suficiente.
- *Sinais observáveis:* ausência de contexto necessário (referência externa
  não incluída), texto vazio/whitespace/símbolos isolados,
  `correctAnswer`/`officialExplanation` mutuamente contraditórios.
- *Sinais que NÃO bastam:* dificuldade subjetiva da questão — não é sobre a
  questão ser difícil, é sobre os dados serem insuficientes para diagnosticar
  a partir deles.
- *Categoria confundível principal:* nenhuma sistemática (é a categoria mais
  observável) — mas é também o destino padrão conservador quando nenhuma
  outra categoria tem evidência suficiente e o desempate não resolve.
- *Regra de desempate:* não se aplica no sentido inverso — esta é ela própria
  a regra de desempate default de todas as outras categorias.

## 8. Overfitting audit (analysis-v2)

`analysis-v2` foi inspecionado linha a linha antes da execução no dev set:

- ❌ Nenhum ID de caso do benchmark (`kg-XX`, `re-XX`, etc.) aparece no texto
  do prompt.
- ❌ Nenhuma resposta específica do dataset (nomes, números, respostas
  exatas) foi copiada para o prompt.
- ❌ Nenhum exemplo é uma paráfrase disfarçada de um caso do benchmark — os
  exemplos genéricos usados nas regras de desempate ("multiplicou quando
  devia dividir", "diferença entre X e Y") são padrões didáticos comuns, não
  cópias.
- ✅ Toda regra nova é defensável pedagogicamente fora do benchmark: todas
  decorrem de uma distinção conceitual real entre as categorias da taxonomia
  (ver seção 7), não de "o que faz o caso tal passar".

**Resultado: PASS.**

## 9. Resultado no dev set (benchmark-v2), gemini-3.7-flash medium

| Métrica | v1.2 (antes) | v2.0 (depois) | Threshold |
|---|---|---|---|
| Classification | 76.92% | **86.81%** (+9.9pp) | ≥90% — ainda não atingido |
| CREATE/NO_CARD | 94.51% | **95.60%** (+1.1pp) | ≥95% — **atingido** |
| Schema | 100% | 100% | ≥100% |
| Cost/1000 | $0.580 | $0.775 (+34%) | registrado, não é gate |

O prompt cresceu de ~7,96 KB para ~12,1 KB (+52%) — inteiramente pelas 5
regras de desempate da seção 6.1 e o reforço de política de card da seção
6.3, cada uma diretamente ligada a um padrão sistêmico documentado nas seções
2–4. O aumento de custo/1000 reflete o prompt maior (mais tokens de input),
não mudança de modelo.

**Casos que passaram a acertar (amostra):** kg-02, kg-04, kg-09 (KG↔CC),
em-05, em-07 (EM↔KG), ae-01 (AE↔KG), re-05 (RE↔CC).

**Resíduo ainda incorreto (12/91 casos de tipo, 4/91 de card):** kg-11,
kg-13 (mesmo padrão KG↔CC, regra 1 não eliminou 100% dos casos — a fronteira
continua parcialmente estreita mesmo com a regra); em-10, em-12 (mesmo
padrão EM↔KG, resíduo); re-09, re-11, re-13, re-14, re-15 (confirmam a
limitação estrutural da seção 5.1 — nem todos os casos de READING_ERROR sem
gatilho textual explícito foram resolvidos, como esperado, já que a regra 4
foi desenhada para ser conservadora, não para forçar acerto). **Duas
regressões novas** surgiram da própria mudança: `cc-01` (antes correto,
agora CC→KG — a regra 1, ao exigir estrutura de par explícita, ficou rígida
demais para um caso onde o par está implícito na própria definição da figura
de linguagem) e `re-04` (antes correto, agora RE→APPLICATION_ERROR — conflito
não resolvido de precedência entre a regra 3, que vê "1990−5=1985" como
operação plausível-porém-errada, e a regra 4, que deveria vencer porque o
enunciado tem o gatilho textual explícito "5 anos DEPOIS"). Isso é
documentado aqui como gap residual conhecido, não corrigido nesta rodada —
corrigi-lo agora, olhando só para esses 2 casos, seria exatamente o tipo de
ajuste "feito para um caso isolado" que a seção 14 do escopo proíbe. Fica
registrado para a próxima rodada de refinamento (fora deste documento).

**Importante: mesmo com essas melhorias, isso não homologa a Sprint 3** —
benchmark-v2 é diagnóstico, não holdout, e Classification ainda não atingiu
90%. A homologação depende de um holdout cego novo, criado após o
congelamento de `analysis-v2`, fora do escopo desta rodada.
