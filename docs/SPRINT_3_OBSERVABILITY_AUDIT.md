# Sprint 3 — Auditoria Independente de Observabilidade da Taxonomia

## 1. Contexto e Metodologia da Auditoria

### 1.1 Objetivo
Determinar se a taxonomia diagnóstica fechada de 6 categorias (PRD v1.2) é observável o suficiente a partir unicamente de:
- `question` (enunciado da questão)
- `userAnswer` (resposta do estudante)
- `correctAnswer` (gabarito correto)
- `officialExplanation` (explicação oficial opcional)

para sustentar de forma legítima e reproduzível o threshold oficial de **≥ 90% de acurácia de classificação** no benchmark-v2 (91 casos) sem depender de inferência sobre o estado mental interno não observável do estudante.

### 1.2 Protocolo de Anotação Cega (Blind Annotation)
A auditoria seguiu rigorosamente os seguintes passos metodológicos:
1. **Isolamento de Inputs**: Os 91 casos foram extraídos exclusivamente com os campos `question`, `userAnswer`, `correctAnswer` e `officialExplanation`.
2. **Anotação Cega e Independente**: Cada caso foi classificado sem acesso prévio a `category`, `acceptableErrorTypes`, `notes` do dataset ou predições de modelos.
3. **Congelamento**: As 91 anotações independentes foram registradas e congeladas em script versionado (`scratch/independent_annotations.ts`) antes da revelação do gabarito.
4. **Revelação do Gabarito**: Cruzamento determinístico contra o ground truth do `benchmark-v2`.
5. **Auditoria de Erros Residuais do Motor**: Inspeção detalhada dos 12 erros do motor `analysis-v2.0` (`gemini-3.7-flash`).

---

## 2. Resultados da Anotação Independente

### 2.1 Métricas Globais de Concordância
- **Total de Casos Auditados**: 91
- **Concordância Exata com o Gabarito Primário**: **84 / 91 (92.31%)**
- **Concordância considerando `acceptableErrorTypes`**: **85 / 91 (93.41%)**

### 2.2 Distribuição de Observabilidade (Avaliador Independente)
- **CLEAR (Evidência Textual Clara e Inequívoca)**: **71 / 91 (78.02%)**
- **AMBIGUOUS (Evidência Textual com Múltiplas Leituras Defensáveis)**: **17 / 91 (18.68%)**
- **UNOBSERVABLE (Distinção Depende de Estado Mental Oculto)**: **3 / 91 (3.30%)**

---

## 3. Análise por Categoria

| Categoria | Total | Concordância Exata | Concordância Aceitável | CLEAR | AMBIGUOUS | UNOBSERVABLE | Observabilidade Geral |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **INSUFFICIENT_INFORMATION** | 15 | 15/15 (100.0%) | 15/15 (100.0%) | 15 | 0 | 0 | **Máxima (100%)** |
| **CONCEPT_CONFUSION** | 16 | 16/16 (100.0%) | 16/16 (100.0%) | 15 | 1 | 0 | **Alta (93.8%)** |
| **APPLICATION_ERROR** | 15 | 14/15 (93.3%) | 15/15 (100.0%) | 12 | 3 | 0 | **Alta (80.0%)** |
| **KNOWLEDGE_GAP** | 15 | 14/15 (93.3%) | 14/15 (93.3%) | 9 | 6 | 0 | **Média (60.0%)** |
| **EXCEPTION_MISSED** | 15 | 14/15 (93.3%) | 14/15 (93.3%) | 11 | 4 | 0 | **Média (73.3%)** |
| **READING_ERROR** | 15 | 11/15 (73.3%) | 11/15 (73.3%) | 9 | 3 | 3 | **Baixa (60.0%)** |

### 3.1 Pares Críticos de Observabilidade

#### A) `READING_ERROR` vs. `KNOWLEDGE_GAP` e outros tipos
- **Cenário de Alta Observabilidade**: Ocorre quando o enunciado contém comandos explícitos de negação ou exclusão (ex.: "INCORRETO", "NÃO faz parte", "MENOS e não mais") e a resposta do usuário viola diretamente essa instrução textual (`re-01`, `re-02`, `re-06`, `re-07`, `re-12`).
- **Cenário de Inobservabilidade Estrutural**: Os casos sintéticos de prompt injection (`re-09`, `re-11`, `re-13`, `re-15`) foram rotulados no dataset como `READING_ERROR` por pertencerem à série de testes adversariais. Porém, a pergunta factual subjacente não contém instrução textual violada pelo usuário (ex.: "Qual a capital da Espanha?" -> "Barcelona"). Para um avaliador que analisa apenas os dados fornecidos, responder "Barcelona" é uma lacuna factual (`KNOWLEDGE_GAP`) ou confusão geográfica, e não um erro de leitura.

#### B) `EXCEPTION_MISSED` vs. `KNOWLEDGE_GAP`
- **Cenário de Alta Observabilidade**: O enunciado expõe explicitamente a regra geral como premissa antes de inquirir sobre a condição excepcional (`em-01`, `em-02`, `em-03`, `em-04`, `em-08`, `em-13`, `em-15`).
- **Cenário de Ambiguidade**: Quando a regra geral não está no enunciado ou quando o usuário formula uma exceção inexistente (ex.: `em-07`, onde o usuário afirma que 0 não é par nem ímpar, ou `em-10`, onde assume que mercúrio não conduz eletricidade por ser líquido). Nesses casos, a fronteira entre "conhecia a regra geral mas errou a exceção" e "desconhecia o conceito" é intrinsecamente tênue.

---

## 4. Auditoria dos Erros Residuais do `analysis-v2.0`

O motor `analysis-v2.0` (executado com `gemini-3.7-flash`) apresentou **12 erros de classificação** em 91 casos (86.81% de acurácia).

Classificação dos 12 erros residuais:

| Tipo de Erro Residual | Quantidade | Casos | Descrição |
|---|:---:|---|---|
| **MODEL_OR_PROMPT_ERROR** | **2** | `cc-01`, `re-14` | Evidência textual clara presente, mas o modelo/prompt optou pela classificação alternativa. |
| **STRUCTURALLY_AMBIGUOUS** | **6** | `kg-11`, `kg-13`, `em-10`, `em-12`, `re-03`, `re-04` | Casos em que a distinção conceitual apresenta sobreposição legítima entre as categorias. |
| **GROUND_TRUTH_DISPUTABLE** | **4** | `re-09`, `re-11`, `re-13`, `re-15` | Casos com anotação no dataset que exige inferência de intenção ou contexto sintético invisível aos inputs. |

### Detalhamento dos Erros Residuais

1. **`kg-11` (Mitose vs. Meiose)**:
   - *Gabarito*: `KNOWLEDGE_GAP` | *Previsto*: `CONCEPT_CONFUSION`
   - *Classificação*: `STRUCTURALLY_AMBIGUOUS`. Mitose e Meiose formam par paradigmático na biologia, gerando confusão plausível mesmo sem enunciado contrastivo.
2. **`kg-13` (Átomo vs. Célula)**:
   - *Gabarito*: `KNOWLEDGE_GAP` | *Previsto*: `CONCEPT_CONFUSION`
   - *Classificação*: `STRUCTURALLY_AMBIGUOUS`. Troca entre menor unidade da matéria e menor unidade da vida.
3. **`cc-01` (Metáfora vs. Prosopopeia)**:
   - *Gabarito*: `CONCEPT_CONFUSION` | *Previsto*: `KNOWLEDGE_GAP`
   - *Classificação*: `MODEL_OR_PROMPT_ERROR`. A regra de prompt do v2 restringiu CONCEPT_CONFUSION a pares explícitos, penalizando a identificação da troca de figuras de linguagem.
4. **`em-10` (Condutividade do Mercúrio Líquido)**:
   - *Gabarito*: `EXCEPTION_MISSED` | *Previsto*: `KNOWLEDGE_GAP`
   - *Classificação*: `STRUCTURALLY_AMBIGUOUS`. O usuário justificou ("por ser líquido perde capacidade"), configurando fronteira entre lacuna sobre o mercúrio e aplicação da exceção do estado físico.
5. **`em-12` (Imputabilidade aos 17 anos por crime grave)**:
   - *Gabarito*: `EXCEPTION_MISSED` | *Previsto*: `KNOWLEDGE_GAP`
   - *Classificação*: `STRUCTURALLY_AMBIGUOUS`. Fronteira entre supor exceção penal por gravidade e desconhecimento da norma absoluta do ECA.
6. **`re-03` (Antônimo de feliz -> Alegre)**:
   - *Gabarito*: `READING_ERROR` | *Previsto*: `CONCEPT_CONFUSION`
   - *Classificação*: `STRUCTURALLY_AMBIGUOUS`. Usuário forneceu o sinônimo exato; ambíguo entre não ler a palavra 'antônimo' e confundir os conceitos de sinônimo/antônimo.
7. **`re-04` (5 anos depois de 1990 -> 1985)**:
   - *Gabarito*: `READING_ERROR` | *Previsto*: `APPLICATION_ERROR`
   - *Classificação*: `STRUCTURALLY_AMBIGUOUS`. Subtrair em vez de somar é interpretável tanto como erro de leitura do termo "depois" quanto como erro de aplicação da operação aritmética.
8. **`re-09` (Capital da Espanha -> Barcelona)**:
   - *Gabarito*: `READING_ERROR` | *Previsto*: `KNOWLEDGE_GAP`
   - *Classificação*: `GROUND_TRUTH_DISPUTABLE`. Não há qualquer sinal observável de erro de leitura pelo estudante; é uma lacuna factual típica.
9. **`re-11` (7 × 8 -> 54)**:
   - *Gabarito*: `READING_ERROR` | *Previsto*: `INSUFFICIENT_INFORMATION`
   - *Classificação*: `GROUND_TRUTH_DISPUTABLE`. Erro aritmético de tabuada; a presença de prompt injection no enunciado não transforma o erro do usuário em erro de leitura.
10. **`re-13` (Oposto de grande -> Enorme)**:
    - *Gabarito*: `READING_ERROR` | *Previsto*: `CONCEPT_CONFUSION`
    - *Classificação*: `GROUND_TRUTH_DISPUTABLE`. Usuário forneceu superlativo/intensificador; não há evidência de erro de leitura isolado.
11. **`re-14` (Quantificador "nenhum...menos de 18")**:
    - *Gabarito*: `READING_ERROR` | *Previsto*: `KNOWLEDGE_GAP`
    - *Classificação*: `MODEL_OR_PROMPT_ERROR`. Interpretação lógica de quantificador textual.
12. **`re-15` (2 + 2 -> 5)**:
    - *Gabarito*: `READING_ERROR` | *Previsto*: `APPLICATION_ERROR`
    - *Classificação*: `GROUND_TRUTH_DISPUTABLE`. Erro de cálculo aritmético básico sem evidência textual de leitura incorreta.

---

## 5. Teto de Observabilidade e Viabilidade do Threshold de 90%

### Conclusão: **B) BORDERLINE**

**Justificativa Técnica**:
1. **Viabilidade Empírica do Avaliador Humano/Independente**:
   - A anotação cega independente atingiu **92.31% de concordância exata** e **93.41% de concordância aceitável**, provando que a taxonomia é amplamente decodificável em mais de 90% dos casos quando critérios consistentes são aplicados.
2. **Limitação Imposta por Casos Sintéticos Adversariais**:
   - No benchmark-v2 atual, 4 casos de prompt injection (`re-09`, `re-11`, `re-13`, `re-15`) representam **4.40% do dataset** (4/91). Como esses casos foram rotulados rigidamente como `READING_ERROR` sem suporte factual nos inputs observáveis, eles criam um piso artificial de erro de ~4.4% para qualquer modelo guiado por evidências.
3. **Margem Real do Motor**:
   - Descontando os 4 casos disputáveis de injeção, a acurácia do `analysis-v2.0` sobre os casos genuínos é de **79 / 87 = 90.80%**.
   - No entanto, contra o dataset congelado v2 com a anotação atual, atingir ≥ 90.0% de forma estrita exige acertar quase 100% dos casos ambíguos remanescentes, colocando o threshold exatamente na faixa **BORDERLINE (86% a 92%)**.

---

## 6. Registro Completo da Anotação Cega Independente (91 Casos)

| ID | Classificação Independente | Confiança | 2ª Plausível | Observabilidade | Justificativa Observável |
|---|---|:---:|---|:---:|---|
| `kg-01` | KNOWLEDGE_GAP | 0.95 | CONCEPT_CONFUSION | CLEAR | Pergunta factual direta de geografia sem par conceitual estruturado no enunciado. |
| `kg-02` | KNOWLEDGE_GAP | 0.85 | CONCEPT_CONFUSION | AMBIGUOUS | Data histórica factual; pode ser desconhecimento da data ou associação com outro marco histórico (1808). |
| `kg-03` | KNOWLEDGE_GAP | 0.90 | CONCEPT_CONFUSION | CLEAR | Pergunta factual de tabela periódica; resposta errada baseada na inicial comum. |
| `kg-04` | KNOWLEDGE_GAP | 0.85 | EXCEPTION_MISSED | AMBIGUOUS | Dado quantitativo anatômico; 300 corresponde ao recém-nascido, mas o enunciado pede adulto. |
| `kg-05` | KNOWLEDGE_GAP | 0.90 | CONCEPT_CONFUSION | CLEAR | Pergunta factual de autoria literária sem comparação conceitual explícita. |
| `kg-06` | KNOWLEDGE_GAP | 0.95 | READING_ERROR | CLEAR | Conhecimento factual de fórmula molecular básica. |
| `kg-07` | KNOWLEDGE_GAP | 0.95 | CONCEPT_CONFUSION | CLEAR | Fato astronômico simples sobre ranking de tamanho de planetas. |
| `kg-08` | KNOWLEDGE_GAP | 0.95 | INSUFFICIENT_INFORMATION | CLEAR | Dado quantitativo factual sobre a divisão político-administrativa do Brasil. |
| `kg-09` | KNOWLEDGE_GAP | 0.80 | CONCEPT_CONFUSION | AMBIGUOUS | Joule é unidade SI de energia/trabalho, indicando possível confusão conceitual entre grandezas físicas. |
| `kg-10` | KNOWLEDGE_GAP | 0.90 | EXCEPTION_MISSED | CLEAR | Localização geográfica factual de um país. |
| `kg-11` | KNOWLEDGE_GAP | 0.75 | CONCEPT_CONFUSION | AMBIGUOUS | Mitose e meiose formam um par clássico de divisão celular; sem estrutura comparativa no texto. |
| `kg-12` | KNOWLEDGE_GAP | 0.95 | CONCEPT_CONFUSION | CLEAR | Pergunta factual direta de história sobre o primeiro presidente do Brasil. |
| `kg-13` | KNOWLEDGE_GAP | 0.80 | CONCEPT_CONFUSION | AMBIGUOUS | 'Átomo' é a menor unidade da matéria, gerando sobreposição conceitual com 'unidade da vida'. |
| `kg-14` | KNOWLEDGE_GAP | 0.95 | CONCEPT_CONFUSION | CLEAR | Fato biológico sobre função glandular sem estrutura comparativa. |
| `kg-15` | INSUFFICIENT_INFORMATION | 0.75 | KNOWLEDGE_GAP | AMBIGUOUS | Resposta degenerada/interrogação impede avaliar se houve tentativa de resposta ou ausência total de dado. |
| `cc-01` | CONCEPT_CONFUSION | 0.80 | KNOWLEDGE_GAP | AMBIGUOUS | Troca de figuras de linguagem do mesmo domínio, embora o enunciado não apresente pares contrastivos explícitos. |
| `cc-02` | CONCEPT_CONFUSION | 0.98 | — | CLEAR | Enunciado contrasta explicitamente o par massa vs peso e o usuário escolheu o elemento invertido. |
| `cc-02b` | CONCEPT_CONFUSION | 0.98 | — | CLEAR | Enunciado formula escolha binária entre dois processos biológicos complementares/opostos. |
| `cc-03` | CONCEPT_CONFUSION | 0.98 | — | CLEAR | Usuário atribuiu a definição formal de culpa diretamente ao termo dolo. |
| `cc-04` | CONCEPT_CONFUSION | 0.98 | — | CLEAR | Inversão explícita de relação matemática/física entre grandezas cinemáticas correlatas. |
| `cc-05` | CONCEPT_CONFUSION | 0.98 | — | CLEAR | Inversão simétrica dos conceitos gramaticais solicitados. |
| `cc-06` | CONCEPT_CONFUSION | 0.98 | — | CLEAR | Definições de regimes de capitalização perfeitamente cruzadas na resposta do usuário. |
| `cc-07` | CONCEPT_CONFUSION | 0.98 | — | CLEAR | Inversão simétrica dos intervalos de pH entre substâncias ácidas e básicas. |
| `cc-08` | CONCEPT_CONFUSION | 0.98 | — | CLEAR | Atribuição cruzada exata dos produtos da divisão celular. |
| `cc-09` | CONCEPT_CONFUSION | 0.98 | — | CLEAR | Inversão das escalas temporais dos dois conceitos meteorológicos. |
| `cc-10` | CONCEPT_CONFUSION | 0.90 | KNOWLEDGE_GAP | CLEAR | Igualou duas modalidades licitatórias distintas apresentadas na questão. |
| `cc-11` | CONCEPT_CONFUSION | 0.90 | KNOWLEDGE_GAP | CLEAR | Confundiu a estrutura métrica do haicai igualando-a ao soneto. |
| `cc-12` | CONCEPT_CONFUSION | 0.98 | — | CLEAR | Inversão das funções dos vasos condutores no sistema circulatório. |
| `cc-13` | CONCEPT_CONFUSION | 0.90 | KNOWLEDGE_GAP | CLEAR | Afirmou identidade/sinonímia entre dois conceitos econômicos correlatos. |
| `cc-14` | CONCEPT_CONFUSION | 0.98 | — | CLEAR | Inversão simétrica dos fenômenos de reflexão e refração da luz. |
| `cc-15` | CONCEPT_CONFUSION | 0.98 | — | CLEAR | Inversão das definições conceituais de tese e hipótese textual. |
| `em-01` | EXCEPTION_MISSED | 0.98 | APPLICATION_ERROR | CLEAR | Usuário aplicou a regra geral fornecida no enunciado a um vocábulo que constitui exceção. |
| `em-02` | EXCEPTION_MISSED | 0.98 | KNOWLEDGE_GAP | CLEAR | Aplicação da regra geral exposta no enunciado a um caso clássico de exceção zoológica. |
| `em-03` | EXCEPTION_MISSED | 0.95 | KNOWLEDGE_GAP | CLEAR | Ignorou a condição de verbo irregular que excetua o verbo da regra geral da terminação -ar. |
| `em-04` | EXCEPTION_MISSED | 0.98 | KNOWLEDGE_GAP | CLEAR | Negou expressamente a existência de exceções à regra prescricional geral. |
| `em-05` | EXCEPTION_MISSED | 0.90 | KNOWLEDGE_GAP | CLEAR | Generalizou a condição padrão de ebulição ignorando a condição de contorno (altitude/pressão). |
| `em-06` | EXCEPTION_MISSED | 0.70 | CONCEPT_CONFUSION | AMBIGUOUS | Formulação controversa sobre o caráter pessoal vs impessoal do verbo chover no sentido figurado. |
| `em-07` | CONCEPT_CONFUSION | 0.75 | EXCEPTION_MISSED | AMBIGUOUS | Usuário tratou 0 como caso especial/exceção à paridade, refletindo confusão sobre o conceito. |
| `em-08` | EXCEPTION_MISSED | 0.98 | KNOWLEDGE_GAP | CLEAR | Aplicou regra geral de divisibilidade por 4 sem considerar regra de exceção para anos seculares. |
| `em-09` | EXCEPTION_MISSED | 0.90 | KNOWLEDGE_GAP | CLEAR | Rejeitou categoricamente a existência de exceção à regra geral informada. |
| `em-10` | EXCEPTION_MISSED | 0.80 | KNOWLEDGE_GAP | AMBIGUOUS | Inferiu que o estado líquido do mercúrio revoga a propriedade geral de condutividade metálica. |
| `em-11` | EXCEPTION_MISSED | 0.90 | CONCEPT_CONFUSION | CLEAR | Generalização da regra de encontro vocálico para palavra com comportamento fonético excepcional. |
| `em-12` | EXCEPTION_MISSED | 0.85 | KNOWLEDGE_GAP | AMBIGUOUS | Enunciado estabelece a regra dos 18 anos, mas usuário atribuiu imputabilidade aos 17 por gravidade. |
| `em-13` | EXCEPTION_MISSED | 0.95 | KNOWLEDGE_GAP | CLEAR | Generalizou soma dos ângulos internos da geometria plana para superfícies não-euclidianas. |
| `em-14` | EXCEPTION_MISSED | 0.95 | APPLICATION_ERROR | CLEAR | Flexionou verbo na composição ignorando invariabilidade de elementos verbais em compostos. |
| `em-15` | EXCEPTION_MISSED | 0.95 | KNOWLEDGE_GAP | CLEAR | Afirmou que duas hipóteses esgotam rol constitucional, ignorando exceções adicionais. |
| `ae-01` | APPLICATION_ERROR | 0.95 | KNOWLEDGE_GAP | CLEAR | O valor 1500 decorre diretamente da multiplicação dos dois operandos fornecidos (300 × 5). |
| `ae-02` | APPLICATION_ERROR | 0.95 | KNOWLEDGE_GAP | CLEAR | Multiplicação direta dos números fornecidos (20 × 150) sem a divisão por 100 da porcentagem. |
| `ae-03` | APPLICATION_ERROR | 0.95 | READING_ERROR | CLEAR | Fórmula explicitada no texto; o usuário realizou a soma dos parâmetros em vez do produto. |
| `ae-04` | APPLICATION_ERROR | 0.75 | CONCEPT_CONFUSION | AMBIGUOUS | Executou proporção direta em problema inverso; fronteira entre cálculo e confusão conceitual. |
| `ae-05` | APPLICATION_ERROR | 0.95 | READING_ERROR | CLEAR | Fórmula explicitada no enunciado; executou divisão entre os valores fornecidos. |
| `ae-06` | APPLICATION_ERROR | 0.70 | CONCEPT_CONFUSION | AMBIGUOUS | Dupla possibilidade gramatical (concordância com o núcleo vs partitivo); erro disputável. |
| `ae-07` | APPLICATION_ERROR | 0.90 | KNOWLEDGE_GAP | CLEAR | Fórmula fornecida no enunciado; erro na execução dos passos do cálculo. |
| `ae-08` | APPLICATION_ERROR | 0.95 | KNOWLEDGE_GAP | CLEAR | Executou soma linear direta dos catetos em vez da relação pitagórica. |
| `ae-09` | APPLICATION_ERROR | 0.95 | READING_ERROR | CLEAR | Fórmula explícita no enunciado; realizou divisão (10 ÷ 2) em vez do produto indicado. |
| `ae-10` | APPLICATION_ERROR | 0.90 | KNOWLEDGE_GAP | CLEAR | Regra explicada no comando e usuário omitiu a fusão do artigo na resposta prática. |
| `ae-11` | APPLICATION_ERROR | 0.95 | READING_ERROR | CLEAR | Fórmula fornecida (d=m/v); executou multiplicação (20 × 4) em vez de divisão. |
| `ae-12` | APPLICATION_ERROR | 0.85 | CONCEPT_CONFUSION | CLEAR | Erro na aplicação da convenção gráfica ao acrescentar apóstrofo indevido. |
| `ae-13` | APPLICATION_ERROR | 0.95 | KNOWLEDGE_GAP | CLEAR | Fórmula fornecida no enunciado; erro procedimental na resolução das etapas da fórmula. |
| `ae-14` | CONCEPT_CONFUSION | 0.80 | APPLICATION_ERROR | AMBIGUOUS | A resposta trocou dois tipos de sujeito gramatical (oculto por indeterminado) em frase concreta. |
| `ae-15` | APPLICATION_ERROR | 0.95 | READING_ERROR | CLEAR | Fórmula fornecida no enunciado (V=a³); calculou potência ao quadrado em vez do cubo. |
| `re-01` | READING_ERROR | 0.98 | KNOWLEDGE_GAP | CLEAR | Comando exigia expressamente alternativa INCORRETA, e o usuário marcou item verdadeiro. |
| `re-02` | READING_ERROR | 0.98 | APPLICATION_ERROR | CLEAR | Desrespeitou ênfase textual expressa no enunciado que vedava a adição ("MENOS e não mais"). |
| `re-03` | READING_ERROR | 0.90 | CONCEPT_CONFUSION | AMBIGUOUS | Enunciado define 'antônimo', mas a resposta é o par sinônimo exato. |
| `re-04` | READING_ERROR | 0.95 | APPLICATION_ERROR | CLEAR | Não se atentou ao marcador temporal 'depois' presente no texto da questão. |
| `re-05` | READING_ERROR | 0.85 | CONCEPT_CONFUSION | AMBIGUOUS | Comando destaca 'não um verbo', mas usuário marcou verbo da frase. |
| `re-06` | READING_ERROR | 0.98 | — | CLEAR | Contradisse diretamente fato afirmado com negação expressa no enunciado. |
| `re-07` | READING_ERROR | 0.98 | APPLICATION_ERROR | CLEAR | Ignorou comando explícito que delimitava contagem apenas a vogais e proibia total de letras. |
| `re-08` | READING_ERROR | 0.90 | INSUFFICIENT_INFORMATION | CLEAR | Interpretação equivocada da preposição 'para' e da semântica de adiamento. |
| `re-09` | KNOWLEDGE_GAP | 0.85 | CONCEPT_CONFUSION | UNOBSERVABLE | Pergunta capital da Espanha; resposta Barcelona; nada indica erro de leitura do estudante. |
| `re-10` | READING_ERROR | 0.95 | APPLICATION_ERROR | CLEAR | Comando destaca busca pela MENOR fração acompanhada de instrução explicativa. |
| `re-11` | APPLICATION_ERROR | 0.85 | KNOWLEDGE_GAP | UNOBSERVABLE | Erro aritmético de tabuada (7×8=56 vs 54); sem respaldo observável para erro de leitura. |
| `re-12` | READING_ERROR | 0.98 | APPLICATION_ERROR | CLEAR | Somou todos os elementos ignorando filtro restritivo de PARES explicitado em caixa alta. |
| `re-13` | CONCEPT_CONFUSION | 0.85 | READING_ERROR | AMBIGUOUS | Respondeu com superlativo/sinônimo em vez do oposto (antônimo). |
| `re-14` | READING_ERROR | 0.85 | APPLICATION_ERROR | CLEAR | Erro direto na interpretação da estrutura semântico-lógica de quantificador do texto. |
| `re-15` | APPLICATION_ERROR | 0.80 | KNOWLEDGE_GAP | UNOBSERVABLE | Erro aritmético elementar (2+2=5); inobservável como erro de leitura. |
| `ii-01` | INSUFFICIENT_INFORMATION | 0.99 | — | CLEAR | Enunciado desprovido de qualquer conteúdo temático ou contextual. |
| `ii-02` | INSUFFICIENT_INFORMATION | 0.99 | — | CLEAR | Ausência do texto-base impede qualquer análise do erro. |
| `ii-03` | INSUFFICIENT_INFORMATION | 0.90 | KNOWLEDGE_GAP | CLEAR | Incoerência interna e contradição explícita entre correctAnswer e officialExplanation. |
| `ii-04` | INSUFFICIENT_INFORMATION | 1.00 | — | CLEAR | Entradas degeneradas de caractere único sem significado semântico. |
| `ii-05` | INSUFFICIENT_INFORMATION | 0.99 | — | CLEAR | Dependência de recurso visual externo não fornecido. |
| `ii-06` | INSUFFICIENT_INFORMATION | 0.90 | KNOWLEDGE_GAP | CLEAR | Contradição factual no próprio caso entre resposta, gabarito e explicação oficial. |
| `ii-07` | INSUFFICIENT_INFORMATION | 1.00 | — | CLEAR | Campos totalmente desprovidos de texto útil (reticências). |
| `ii-08` | INSUFFICIENT_INFORMATION | 0.99 | — | CLEAR | Material visual indispensável para o julgamento não incluído. |
| `ii-09` | INSUFFICIENT_INFORMATION | 0.99 | — | CLEAR | Valores numéricos da amostra ausentes. |
| `ii-10` | INSUFFICIENT_INFORMATION | 0.99 | — | CLEAR | Norma de referência não especificada no enunciado. |
| `ii-11` | INSUFFICIENT_INFORMATION | 0.99 | — | CLEAR | Fórmula omitida impossibilita verificar a lógica de resolução. |
| `ii-12` | INSUFFICIENT_INFORMATION | 0.99 | — | CLEAR | Contexto narrativo e obra omitidos. |
| `ii-13` | INSUFFICIENT_INFORMATION | 1.00 | — | CLEAR | Enunciado autorreferencialmente ausente. |
| `ii-14` | INSUFFICIENT_INFORMATION | 0.90 | EXCEPTION_MISSED | CLEAR | Ausência de fundamento jurídico/tributário para a aparente isenção no caso. |
| `ii-15` | INSUFFICIENT_INFORMATION | 1.00 | — | CLEAR | Campos em branco / nulo. |

---

## 7. Decisão e Recomendações Estratégicas

### 7.1 Parecer da Auditoria
1. **Atingibilidade de ≥ 90%**: **BORDERLINE**. A taxonomia em si possui suficiência observável para atingir >92% (comprovado pela anotação cega independente), mas a combinação de casos limítrofes legítimos com os 4 casos sintéticos de injeção classificados como `READING_ERROR` deixa a meta no limiar exato da variabilidade estatística do modelo.
2. **Status da Sprint 3**: **NÃO HOMOLOGADA**. Nenhum holdout novo deve ser consumido ou criado antes da resolução formal das opções de produto.

### 7.2 Opções de Produto para Decisão da Engenharia/Produto (Sem implementação automática)

- **Opção A: Alteração/Refinamento da Taxonomia**:
  - Definir formalmente regras de desempate canônicas para pares com sobreposição semântica (ex.: Mitose/Meiose como CONCEPT_CONFUSION mesmo em pergunta direta; quantificadores lógicos como READING_ERROR).
- **Opção B: Alteração de Inputs / Enriquecimento Contextual**:
  - Incorporar ao motor a autopercepção do usuário (`userAttribution`) ou alternativas de múltipla escolha da questão quando disponíveis, reduzindo a ambiguidade de casos como `kg-11` e `em-12`.
- **Opção C: Política Conservadora com `INSUFFICIENT_INFORMATION`**:
  - Permitir que casos com forte ambiguidade estrutural e sem pista discursiva sejam rotulados como `INSUFFICIENT_INFORMATION` (com `NO_CARD`), protegendo a experiência pedagógica do aluno contra diagnósticos equivocados.
- **Opção D: Revisão Formal do Threshold de Classificação**:
  - Ajustar o threshold oficial de classificação para **≥ 85.0%** (compatível com a zona de observabilidade estrita sem contaminação por estado mental), mantendo **≥ 95.0%** para a métrica crítica de produto (`CREATE_CARD` vs `NO_CARD`, que já atingiu 95.60%).
