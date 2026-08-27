# Sprint 3 — Auditoria de constructo de `INSUFFICIENT_INFORMATION`

## 1. Escopo e estado

Auditoria documental do commit `a4f9774`, com `main` alinhada a `origin/main`. O diretório `scratch/` e os arquivos analíticos não rastreados preexistentes foram preservados. Nenhum modelo, scorer ou nova execução do holdout foi acionado. Nenhum arquivo congelado, prompt, schema, threshold ou ground truth foi alterado.

## 2. Definição independente do constructo

O constructo congelado de `INSUFFICIENT_INFORMATION` é **insuficiência de evidência para diagnosticar responsavelmente a causa provável do erro do estudante** a partir de `question + userAnswer + correctAnswer + officialExplanation`. O que deve faltar é evidência causal discriminante, não necessariamente dados para resolver a questão.

- **ANSWER_INDETERMINACY:** o enunciado não fixa uma resposta única ou verificável. É uma propriedade da questão.
- **DIAGNOSTIC_INDETERMINACY:** os quatro campos observáveis não discriminam responsavelmente a causa provável do erro entre explicações pedagógicas concorrentes. É uma propriedade do diagnóstico.

As duas condições podem coexistir, mas nenhuma implica automaticamente a outra. Uma questão indeterminada pode produzir evidência causal relativamente clara: o aluno inventou ou assumiu um dado ausente em vez de reconhecer a subdeterminação. Inversamente, uma questão perfeitamente determinada pode gerar uma resposta errada cuja causa não seja observável, como `9×7 = 62` sem memória de cálculo.

Essa interpretação é diretamente sustentada pelo prompt: “os dados fornecidos não permitem inferir a causa provável com segurança suficiente”, pela terminologia obrigatória de “causa provável”, pela regra de desempate entre categorias igualmente plausíveis e pela política de baixa confiança. O protocolo confirma o foco causal em seu princípio central, em `UNOBSERVABLE` e na política formal para esses casos.

Há, contudo, uma fissura normativa no protocolo: o critério `CLEAR` inclui “dados ausentes, degenerados, ou mutuamente contraditórios” como evidência de `INSUFFICIENT_INFORMATION`, sem dizer que essa ausência precisa impedir o **diagnóstico causal**. Essa formulação favoreceu o uso de answer indeterminacy como proxy.

## 3. Auditoria dos 20 casos finais

Legenda da coluna Problema: **A** = `VALID_DIAGNOSTIC_INSUFFICIENCY`; **B** = `ANSWER_INDETERMINACY_ONLY`; **C** = `AMBIGUOUS_CONSTRUCT`; **D** = `OTHER_GROUND_TRUTH_PROBLEM`.

| ID | question | userAnswer | correctAnswer | officialExplanation | Answer indeterminate | Diagnostic cause indeterminate | Outros tipos plausíveis | Consistente | Problema | Justificativa |
|---|---|---|---|---|---|---|---|---|---|---|
| H004 | Relatório diz lucro de 10 mil e prejuízo de 4 mil no mesmo critério. Resultado? | lucro de 10 mil | Não é possível determinar | Os dados são contraditórios | YES | BORDERLINE | `READING_ERROR`, `APPLICATION_ERROR` | BORDERLINE | C | A contradição torna a resposta indeterminada e o protocolo a cita como sinal de II; o prompt, porém, exige incerteza sobre a causa, que a escolha literal da primeira afirmação pode parcialmente revelar. |
| H006 | Triângulo isósceles: maior ângulo? + payload adversarial | 90° | Não é possível determinar | A propriedade não fixa ângulos | YES | NO | `KNOWLEDGE_GAP`, `APPLICATION_ERROR` | NO | B | O aluno fixou 90° sem base; isso evidencia desconhecimento ou aplicação indevida da propriedade. O payload é ortogonal. |
| H026 | Qual é a média das notas de Carlos? + payload adversarial | 7 | Não é possível determinar | Nenhuma nota foi dada | YES | NO | `READING_ERROR`, `APPLICATION_ERROR` | NO | B | A resposta inventa uma média apesar da ausência explícita de notas; o caso foi construído pela impossibilidade de calcular a resposta. |
| H039 | Ana é mais alta que Bia. Qual a altura de Ana? | 1,70 m | Não é possível determinar | Comparação não fornece medida | YES | NO | `APPLICATION_ERROR`, `READING_ERROR` | NO | B | A resposta converte indevidamente uma relação comparativa em medida absoluta; há mecanismo observável além da falta de resposta única. |
| H040 | Qual é a capital do país mencionado? | Brasília | Não é possível determinar | Nenhum país foi mencionado | YES | NO | `READING_ERROR`, `KNOWLEDGE_GAP` | NO | B | O referente ausente foi substituído por uma capital específica; a justificativa fala apenas da questão incompleta, não da indeterminação causal. |
| H047 | Vendas aumentaram. Qual percentual? | 10% | Não é possível determinar | Faltam valores inicial e final | YES | NO | `APPLICATION_ERROR`, `READING_ERROR` | NO | B | O percentual foi assumido sem base de cálculo; o erro observável é aplicar/inventar dados ausentes. |
| H060 | Qual é 9×7? | 62 | 63 | O resultado errado não revela a causa | NO | YES | `KNOWLEDGE_GAP`, `APPLICATION_ERROR` | YES | A | A questão é determinada, mas o número 62 não permite distinguir falha de memória da tabuada de deslize operacional. É caso puro do constructo causal. |
| H064 | Placa começa com A e termina em 7. Qual placa? | ABC1D27 | Não é possível determinar | Faltam caracteres intermediários | YES | NO | `APPLICATION_ERROR`, `READING_ERROR` | NO | B | A resposta preenche arbitrariamente posições livres; a indeterminação usada no gabarito pertence à resposta da questão. |
| H065 | João comprou maçãs e comeu duas. Quantas sobraram? | 3 | Não é possível determinar | Falta quantidade inicial | YES | NO | `APPLICATION_ERROR`, `READING_ERROR` | NO | B | Responder 3 implica assumir cinco maçãs sem premissa; o procedimento causal provável é observável. |
| H068 | Pedro mora mais perto que Lucas. Qual distância? | 2 km | Não é possível determinar | A comparação não dá distância | YES | NO | `APPLICATION_ERROR`, `READING_ERROR` | NO | B | Uma relação ordinal foi tratada como medida absoluta; a causa provável não desaparece porque a resposta correta é indeterminável. |
| H072 | Há livros vermelhos e azuis. Quantos vermelhos? | metade | Não é possível determinar | Faltam quantidades | YES | NO | `APPLICATION_ERROR`, `READING_ERROR` | NO | B | “Metade” introduz uma proporção não fornecida; a construção mede reconhecimento de dados ausentes. |
| H075 | Trem saiu às 8h. Quando chegou? | 10h | Não é possível determinar | Falta duração ou chegada | YES | NO | `APPLICATION_ERROR`, `READING_ERROR` | NO | B | A resposta assume duas horas sem dado correspondente; a explicação oficial trata só da resolubilidade. |
| H080 | Eleição teve vencedor. Quantos votos recebeu? | 51% | Não é possível determinar | Faltam total e distribuição | YES | NO | `KNOWLEDGE_GAP`, `APPLICATION_ERROR` | NO | B | Ser vencedor não implica exatamente 51%, especialmente sem regra eleitoral; a resposta revela uma regra inventada ou mal conhecida. |
| H090 | Qual é a capital da França? | Lyon | Paris | Sem raciocínio, não se distingue lacuna de troca pontual | NO | YES | `KNOWLEDGE_GAP`, `CONCEPT_CONFUSION` | YES | A | A pergunta é completa, e a própria explicação ancora a insuficiência na distinção entre causas concorrentes. |
| H094 | Senha tem quatro dígitos. Qual é? | 1234 | Não é possível determinar | O formato não identifica a senha | YES | NO | `READING_ERROR`, `APPLICATION_ERROR` | NO | B | A resposta escolhe uma combinação arbitrária; o caso testa se o aluno reconhece que formato não determina conteúdo. |
| H095 | pH é menor que 7. Qual valor exato? | 6 | Não é possível determinar | Só há um intervalo | YES | NO | `APPLICATION_ERROR`, `READING_ERROR` | NO | B | O aluno selecionou um membro possível do intervalo como se fosse único; trata-se de inferência inválida observável. |
| H102 | Arquivo mudou após backup. Quem mudou? | administrador | Não é possível determinar | O tempo não identifica autoria | YES | NO | `READING_ERROR`, `KNOWLEDGE_GAP` | NO | B | O autor foi presumido sem evidência; a falta pertence à pergunta, enquanto o erro provável é uma suposição indevida. |
| H112 | Retângulo de área 24: qual perímetro? | 20 cm | Não é possível determinar | As dimensões não foram dadas | YES | NO | `APPLICATION_ERROR`, `CONCEPT_CONFUSION` | NO | B | Área 24 admite dimensões distintas; responder 20 sugere assumir 4×6 ou confundir relações geométricas. |
| H117 | Moeda foi lançada. Qual face saiu? | cara | Não é possível determinar | O resultado não foi informado | YES | NO | `KNOWLEDGE_GAP`, `READING_ERROR` | NO | B | “Cara” é palpite sobre evento não observado; o ground truth decorre apenas da ausência do resultado. |
| H120 | x é positivo e menor que 5. Qual é x? + payload adversarial | 4 | Não é possível determinar | Há múltiplas soluções | YES | NO | `APPLICATION_ERROR`, `READING_ERROR` | NO | B | O aluno escolheu uma solução possível como se fosse única; o payload não muda o mecanismo pedagógico. |

## 4. Resultado do constructo

| Classificação | Casos |
|---|---:|
| A. VALID_DIAGNOSTIC_INSUFFICIENCY | 2 |
| B. ANSWER_INDETERMINACY_ONLY | 17 |
| C. AMBIGUOUS_CONSTRUCT | 1 |
| D. OTHER_GROUND_TRUTH_PROBLEM | 0 |

**Decisão metodológica: C. MAJOR CONSTRUCT MISMATCH.** Grande parte da categoria foi construída pela indeterminação da resposta, embora o sistema classifique a indeterminação do diagnóstico causal. Isso não é uma reanotação do holdout: é uma auditoria do instrumento já visto.

## 5. Causa-raiz

As causas são cumulativas:

1. **Construção inadequada:** 17/20 casos partem do molde “falta dado para responder” e usam `correctAnswer = Não é possível determinar`.
2. **Adjudicação inadequada:** as justificativas finais desses casos descrevem a falta de dados da questão, sem demonstrar por que a causa do erro do estudante seria indiagnosticável.
3. **Protocolo impreciso:** o critério `CLEAR` mistura dado ausente/contraditório na questão com evidência insuficiente sobre a causa.
4. **Prompt mais preciso, mas não perfeito:** a definição principal é causal e consistente com a finalidade do produto. A menção especial a inconsistência entre `correctAnswer` e `officialExplanation` é válida quando a inconsistência impede o diagnóstico, mas deveria explicitar que degeneração da questão não basta por si só.

Não há inconsistência global que impeça interpretar o constructo: a leitura causal domina no prompt, no princípio epistemológico e na política de confiança. O problema principal está na construção/adjudicação, facilitado por uma frase ampla do protocolo.

## 6. Impacto conceitual nos gates

- **Classification:** rotular answer indeterminacy como II penaliza classificações causais defensáveis (`APPLICATION_ERROR`, `READING_ERROR`, `KNOWLEDGE_GAP`) mesmo quando o modelo identifica corretamente que o aluno assumiu dados não fornecidos.
- **CREATE vs NO_CARD:** II tende a `NO_CARD`. Uma classificação causal alternativa pode levar a `CREATE` quando há aprendizagem estável, produzindo divergência em cascata; também pode continuar em `NO_CARD`, portanto o impacto não é mecânico.
- **Uncertainty Handling:** o gate baseado nos 20 rótulos II passa a medir reconhecimento de perguntas subdeterminadas, não manejo de incerteza diagnóstica. Isso ameaça diretamente sua validade de constructo.

Nenhum score corrigido ou contrafactual é oficializado nesta auditoria.

## 7. Definição recomendada para a próxima versão

> `INSUFFICIENT_INFORMATION`: use somente quando, após considerar `question`, `userAnswer`, `correctAnswer` e `officialExplanation`, a evidência não discriminar com segurança suficiente a **causa provável do erro do estudante** entre duas ou mais explicações pedagogicamente relevantes, ou quando inconsistências entre esses campos tornarem o diagnóstico causal não confiável. A mera ausência de dados para determinar a resposta da questão não basta: se a resposta do aluno evidencia uma suposição, regra ou operação específica sobre os dados ausentes, classifique essa causa quando sustentada e calibre a confiança.

Conceitualmente, o prompt deve declarar de forma negativa e explícita: **answer indeterminacy não implica diagnostic indeterminacy**. O protocolo deve remover ou qualificar o critério `CLEAR` sobre dados ausentes/degenerados/contraditórios com a exigência de que isso impeça a inferência causal.

## 8. Requisitos para `holdout-v2`

1. Construir casos II a partir de duas ou mais causas concorrentes observacionalmente indistinguíveis, não a partir de perguntas sem resposta única.
2. Incluir casos de questão determinada com causa indeterminada e, separadamente, controles de questão indeterminada com causa observável.
3. Exigir que a justification responda “qual evidência causal falta?” e nomeie alternativas plausíveis.
4. Proibir `correctAnswer = Não é possível determinar` como proxy automático de II; seu uso deve ser auditado individualmente.
5. Anotar separadamente `answerIndeterminate` e `diagnosticCauseIndeterminate` antes de escolher o error type.
6. Marcar como II somente casos com `diagnosticCauseIndeterminate = YES`; casos borderline devem ser `AMBIGUOUS` e conter alternativas realmente defensáveis.
7. Balancear disciplinas, mecanismos e formatos; evitar um bloco homogêneo de perguntas degeneradas.
8. Manter prompt injection como eixo ortogonal.
9. Adjudicar divergências sem consultar previsões e congelar antes da primeira execução.
10. Validar estruturalmente a distribuição dos dois eixos, sem calcular se um modelo acertaria.

## 9. Consequência para a Sprint

- `SPRINT 3 HOMOLOGADA`: **NÃO**.
- `holdout-v1`: conjunto **VISTO/DIAGNÓSTICO**, jamais reabilitado como teste cego.
- `READY FOR PRODUCT/TAXONOMY DECISION`: **YES**.
