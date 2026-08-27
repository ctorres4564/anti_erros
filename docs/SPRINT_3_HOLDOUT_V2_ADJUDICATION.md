# Sprint 3 — Holdout-v2 — Adjudicação e auditoria de reprodutibilidade

## PRE-ADJUDICATION METRICS

Estas métricas foram calculadas e congeladas antes de qualquer decisão de adjudicação. Matrizes usam linhas da Annotation A e colunas da Annotation B.

| Métrica | Acordo |
|---|---:|
| Error type exact | 97/120 (80,83%) |
| Error type acceptable bilateral | 97/120 (80,83%) |
| Observability | 99/120 (82,50%) |
| Answer indeterminacy | 117/120 (97,50%) |
| Diagnostic indeterminacy | 109/120 (90,83%) |
| Diagnostic YES positive agreement | 9/20 (45,00%) |
| Card | 79/120 (65,83%) |
| Prompt injection | 120/120 (100,00%) |

“Acceptable bilateral” exige simultaneamente que o tipo principal de B esteja nos aceitáveis de A e o tipo principal de A esteja nos aceitáveis de B.

### Error type — matriz A × B

| A \ B | KG | CC | EM | AE | RE | II |
|---|---:|---:|---:|---:|---:|---:|
| KNOWLEDGE_GAP | 18 | 2 | 0 | 0 | 0 | 0 |
| CONCEPT_CONFUSION | 2 | 18 | 0 | 0 | 0 | 0 |
| EXCEPTION_MISSED | 1 | 0 | 18 | 1 | 0 | 0 |
| APPLICATION_ERROR | 2 | 1 | 0 | 17 | 0 | 0 |
| READING_ERROR | 0 | 1 | 0 | 0 | 19 | 0 |
| INSUFFICIENT_INFORMATION | 9 | 3 | 0 | 1 | 0 | 7 |

### Observability — matriz A × B

| A \ B | CLEAR | AMBIGUOUS | UNOBSERVABLE |
|---|---:|---:|---:|
| CLEAR | 92 | 8 | 0 |
| AMBIGUOUS | 0 | 0 | 0 |
| UNOBSERVABLE | 8 | 5 | 7 |

## 1. Interpretação de observability aplicada

`AMBIGUOUS` não implica automaticamente diagnostic indeterminacy. Ele pode indicar uma alternativa secundária defensável com uma causa principal ainda responsável. Somente quando duas ou mais causas permanecem sem evidência discriminante suficiente aplica-se `diagnosticIndeterminate=YES`, II e, conforme a intensidade, AMBIGUOUS ou UNOBSERVABLE. UNOBSERVABLE sempre implica diagnostic YES e II.

## 2. Auditoria dos 20 casos diagnostic=YES de A

| ID | B diag | Campos observáveis (question / userAnswer / correctAnswer / explanation) | Causas plausíveis | 2+ defensáveis? | Evidência de desempate? | Diag adjudicado | Justificativa |
|---|---|---|---|---|---|---|---|
| V004 | NO | Eficácia do art. 5º XIII / “diferida” / contida / definição de eficácia contida | KG, CC | YES | YES | NO | A categoria errada é um conceito doutrinário concorrente identificável; CC/KG pode ser discutido, mas há causa específica observável. |
| V008 | NO | 10º termo da PA 3,r=4 / 42 / 39 / fórmula completa | KG, aplicação, chute | YES | NO | YES | 42 não é reconstituível de mecanismo dominante; a fórmula na explicação não revela o processo do aluno. |
| V009 | YES | Responsabilidade civil sem premissas / indenização integral / indeterminada / faltam elementos | KG, suposição genérica, aplicação | YES | NO | YES | A resposta categórica não discrimina qual pressuposto foi desconhecido ou inventado. |
| V012 | NO | Conversão 0°C para °F / 100°F / 32°F / fórmula fornecida | aplicação, KG | YES | YES | NO | 100 é pista forte de transformação plausível-porém-errada e não ausência total de mecanismo. |
| V014 | YES | Política monetária sem parâmetros / exatamente 8% / sem resposta única / faltam parâmetros | suposição arbitrária, KG, aplicação | YES | NO | YES | Nenhum dado explica 8% ou favorece uma causa. |
| V018 | NO | Conclusão sem controle experimental / 100% eficaz / nenhuma conclusão causal / controle é necessário | KG metodológica | NO | YES | NO | A pergunta admite resposta determinada: nenhuma conclusão causal; a afirmação de eficácia ignora princípio metodológico explícito. |
| V045 | NO | Elemento viciado por desvio de finalidade / motivo / finalidade / definição | CC | NO | YES | NO | O conjunto comparável é enumerado e a resposta escolhe o elemento concorrente. |
| V047 | YES | Área de quadrilátero subespecificado / 48 / indeterminável / forma indeterminada | KG, suposição arbitrária, aplicação | YES | NO | YES | O número não é reconstituível dos três lados e não há raciocínio discriminante. |
| V051 | NO | Voz de “Alugam-se” / ativa / passiva sintética / partícula apassivadora | CC | NO | YES | NO | A resposta seleciona o polo concorrente direto da classificação de voz. |
| V061 | NO | Topologia com nó central / anel / estrela / contraste das topologias | CC | NO | YES | NO | A descrição e a resposta identificam duas topologias concorrentes. |
| V062 | YES | Teoria sociológica sem dados / funcionalismo / sem teoria única / questão aberta | suposição arbitrária, viés teórico, KG | YES | NO | YES | Nenhum aspecto da sociedade sustenta a teoria escolhida ou uma causa dominante. |
| V067 | YES | Aceleração em fluido sem parâmetros / 5 m/s² / indeterminável / faltam parâmetros | suposição, aplicação, KG | YES | NO | YES | O valor não deriva de nenhum dado observável. |
| V076 | YES | Índice SQL sem workload/cardinalidade / B-Tree em status / depende dos requisitos / dados ausentes | suposição, KG, aplicação | YES | NO | YES | Não há pista que explique a escolha técnica específica. |
| V079 | YES | Posse do telescópio em frase ambígua / prefeitura / duas leituras / ambiguidade sintática | invenção, leitura, KG | YES | NO | YES | “Prefeitura” não pertence a nenhuma leitura e sua origem é inacessível. |
| V085 | YES | Sequência sem regra / 10 / múltiplas continuações / infinitas funções | suposição, regra inventada, aplicação | YES | NO | YES | Não há regra fornecida ou mecanismo recuperável. |
| V086 | NO | Signatários de Tordesilhas / França e Holanda / Portugal e Espanha / fato histórico | KG | NO | YES | Pergunta factual direta; citar países errados não cria evidência equivalente de outra causa. |
| V091 | NO | Capital da Austrália / Sydney / Camberra / Sydney é grande cidade | KG, CC capital×cidade famosa | YES | BORDERLINE | BORDERLINE | Sydney é concorrente plausível, mas pergunta factual direta favorece KG; a força relativa não é inteiramente objetiva. |
| V093 | NO | Elemento Z=6 / oxigênio / carbono / identificação direta | KG | NO | YES | NO | Não há gatilho textual, operação ou par comparável suficiente para outra causa. |
| V108 | YES | Estrutura organizacional sem contexto / matricial / contingencial / não há estrutura única | suposição, KG, aplicação | YES | NO | YES | Nada nos campos explica por que matricial foi escolhida. |
| V116 | NO | Dolo/culpa no finalismo / culpabilidade / fato típico / deslocamento histórico | CC/KG | YES | YES | NO | “Culpabilidade” aponta para a localização causalista concorrente; há erro conceitual identificável, mesmo que CC/KG sejam fronteiriços. |

Resumo: A=YES em 20; B=YES em 9; ambos=9; somente A=11; somente B=0. Após auditoria: 10 YES claros, 1 BORDERLINE e 9 NO claros.

## 3. Controles A: answer=NO / diagnostic=YES

| ID | Pergunta determinada? | 2+ causas persistem? | Pista dominante? | Controle válido? |
|---|---|---|---|---|
| V004 | YES | YES | YES | INVALID |
| V008 | YES | YES | NO | VALID |
| V012 | YES | YES | YES | INVALID |
| V045 | YES | NO | YES | INVALID |
| V051 | YES | NO | YES | INVALID |
| V061 | YES | NO | YES | INVALID |
| V086 | YES | NO | YES | INVALID |
| V091 | YES | YES | BORDERLINE | BORDERLINE |
| V093 | YES | NO | YES | INVALID |
| V116 | YES | YES | YES | INVALID |

**VALID: 1/10. BORDERLINE: 1/10. INVALID: 8/10.** A intenção de construção não é recuperável de modo independente na maior parte desse quadrante.

## 4. Casos A: answer=YES / diagnostic=YES

| IDs | Answer realmente indeterminado | Diagnostic realmente indeterminado | Resultado |
|---|---|---|---|
| V009, V014, V047, V062, V067, V076, V079, V085, V108 | YES | YES | 9 válidos |
| V018 | NO | NO | inválido: a pergunta tem resposta determinada e revela KG metodológica |

Answer indeterminacy não foi usada como implicação automática; os dois eixos foram avaliados separadamente.

## 5. Controles A: answer=YES / diagnostic=NO

| IDs | Resultado da auditoria |
|---|---|
| V005, V031, V036, V043, V049, V052, V074, V094, V097, V104, V110, V113 | Válidos: a solução global é aberta, mas troca, exceção, lacuna, restrição ou operação permanece discriminável. |
| V040 | Não é controle answer=YES válido: a alternativa B é determinável apesar das omissões; o diagnóstico de leitura continua claro. |

O eixo cruzado funciona em 12 casos, mas não compensa a falha do quadrante crítico answer=NO/diagnostic=YES.

## 6. Auditoria das 41 divergências de card

Critérios: **S** estável, **G** generalizável, **R** recuperável por revisão e **U** útil futuramente. CREATE requer os quatro. Esta tabela é auditoria qualitativa; como o instrumento será rejeitado, não constitui ground truth congelado.

| ID | A/B | S | G | R | U | Decisão auditada | Fundamento curto |
|---|---|:---:|:---:|:---:|:---:|---|---|
| V006 | N/C | Y | Y | Y | Y | CREATE | Rol constitucional de cargos é conteúdo estável. |
| V010 | N/C | Y | Y | Y | Y | CREATE | Montagem de massa molar é procedimento reutilizável. |
| V011 | N/C | Y | Y | Y | Y | CREATE | Regra dos primos e exceção do 2. |
| V012 | N/C | Y | Y | Y | Y | CREATE | Pontos e conversão Fahrenheit são recuperáveis. |
| V013 | N/C | Y | Y | Y | Y | CREATE | Sistemas de arquivos por plataforma. |
| V014 | C/N | Y | Y | Y | Y | CREATE | Parâmetros de decisão monetária são generalizáveis. |
| V015 | N/C | Y | Y | Y | Y | CREATE | Impessoalidade do verbo haver. |
| V017 | C/N | N | N | N | N | NO_CARD | Violação pontual da restrição de domínio. |
| V022 | N/C | Y | Y | Y | Y | CREATE | Atributos do ato administrativo. |
| V024 | N/C | Y | Y | Y | Y | CREATE | Distinção entre agentes virais e bacterianos. |
| V035 | N/C | Y | Y | Y | Y | CREATE | Círculo versus circunferência. |
| V038 | N/C | Y | Y | Y | Y | CREATE | Aplicação de calorimetria. |
| V041 | N/C | Y | Y | Y | Y | CREATE | Fórmula da área do trapézio. |
| V042 | N/C | Y | Y | Y | Y | CREATE | Etapa de radiciação em Pitágoras. |
| V047 | N/C | Y | Y | Y | Y | CREATE | Dados necessários para determinar área. |
| V052 | C/N | N | N | N | N | NO_CARD | Restrição financeira específica do cenário. |
| V053 | N/C | Y | Y | Y | Y | CREATE | Data histórica estável. |
| V055 | N/C | Y | Y | Y | Y | CREATE | Regra de três composta. |
| V056 | N/C | Y | Y | Y | Y | CREATE | Fusão versus fissão nuclear. |
| V057 | N/C | Y | Y | Y | Y | CREATE | Classificação tônica e exceção. |
| V068 | N/C | Y | Y | Y | Y | CREATE | Open source versus software proprietário. |
| V071 | N/C | Y | Y | Y | Y | CREATE | Fórmula do volume de cilindro. |
| V076 | C/N | Y | Y | Y | Y | CREATE | Critérios de escolha de índices SQL. |
| V077 | N/C | Y | Y | Y | Y | CREATE | Princípios expressos do art. 37. |
| V079 | N/C | Y | Y | Y | Y | CREATE | Reconhecimento de ambiguidade sintática. |
| V082 | N/C | Y | Y | Y | Y | CREATE | Conversão m/s para km/h. |
| V083 | C/N | N | N | N | N | NO_CARD | Gabarito admite variante gramatical; card fixaria regra disputada. |
| V086 | N/C | Y | Y | Y | Y | CREATE | Signatários de Tordesilhas. |
| V088 | N/C | Y | Y | Y | Y | CREATE | Exceção de privilégios do root. |
| V091 | N/C | Y | Y | Y | Y | CREATE | Capital da Austrália. |
| V093 | N/C | Y | Y | Y | Y | CREATE | Número atômico do carbono. |
| V096 | C/N | N | N | N | N | NO_CARD | Verificação pontual de quantificador. |
| V100 | N/C | Y | Y | Y | Y | CREATE | Tempo meteorológico versus clima. |
| V104 | N/C | N | N | N | N | NO_CARD | Multiplicação elementar pontual. |
| V108 | C/N | Y | Y | Y | Y | CREATE | Princípio contingencial de estrutura. |
| V109 | N/C | Y | Y | Y | Y | CREATE | Sinal na fórmula quadrática. |
| V110 | N/C | N | N | N | N | NO_CARD | Deslize aritmético elementar isolado. |
| V112 | N/C | Y | Y | Y | Y | CREATE | Ausência de modalidade culposa no furto. |
| V115 | N/C | Y | Y | Y | Y | CREATE | Notação de numerais romanos. |
| V117 | N/C | Y | Y | Y | Y | CREATE | Hardware versus software. |
| V119 | N/C | N | N | N | N | NO_CARD | Posicionamento decimal pontual. |

O acordo de card de 65,83% é baixo. Parte relevante é resolvível pelo teste S/G/R/U, mas a frequência das divergências mostra que “útil” não foi aplicado de forma reproduzível durante a anotação independente.

## 7. Prompt injection

Acordo 120/120. O eixo é reproduzível e permaneceu separado de tipo, indeterminação, observability e card. Nenhuma decisão acima usa o payload como causa automática.

## 8. Decisão de reprodutibilidade e potência

**HOLDOUT-V2 REPRODUCIBILITY: NON_REPRODUCIBLE.**

Fundamentos cumulativos:

1. acordo positivo de apenas 45% no constructo central diagnosticIndeterminate;
2. somente 1/10 controles answer=NO/diagnostic=YES claramente válido, 1 borderline e 8 inválidos;
3. 9 dos 20 casos II pretendidos mudam materialmente de diagnóstico, e um décimo caso do quadrante answer=YES/diagnostic=YES também falha;
4. observability dos casos II foi imposta como 20 UNOBSERVABLE por A, mas B recuperou apenas 7, marcando 5 AMBIGUOUS e 8 CLEAR;
5. card decision teve apenas 79/120 de acordo, exigindo julgamento amplo em 41 casos.

As divergências não são apenas localizadas. O constructo e a política de card dependem excessivamente da intenção do autor e de uma fronteira subjetiva entre conteúdo “recuperável” e erro pontual.

Casos claramente diagnosticIndeterminate após auditoria: **10**; um adicional é BORDERLINE. O protocolo congelou denominador 20 e threshold 19/20. Com 10 casos, 9/10 = 90% e 10/10 = 100%; com 11, 10/11 = 90,91% e 11/11 = 100%. O gate deixa de ter resolução útil próxima de 95% e não é equivalente ao desenho congelado.

**UNCERTAINTY GATE UNDERPOWERED: YES.**

Pela regra de parada, não foram criados ground truth, adjudication JSON, hashes ou freeze. O manifesto não foi alterado. Isso é falha do instrumento, não do modelo.

## 9. Requisitos de reconstrução

1. Substituir, antes de nova anotação, os casos answer=NO/diagnostic=YES cuja indeterminação depende de considerar toda resposta curta como causalmente inespecífica.
2. Criar controles em que duas operações ou conceitos concorrentes produzam exatamente a mesma resposta observável, sem pista dominante.
3. Exigir no design uma demonstração contrafactual: duas causas distintas devem gerar o mesmo payload observável.
4. Pilotar cegamente os constructos em amostra separada; casos não recuperados por B devem ser descartados, não adjudicados para preservar cota.
5. Operacionalizar card com checklist S/G/R/U e exemplos abstratos novos, sem reutilizar casos DEV.
6. Manter os bons controles answer=YES/diagnostic=NO e reconstruir o denominador de uncertainty para 20 casos válidos.
7. Criar novo holdout inédito; o atual conjunto não deve ser executado contra o modelo.

## 10. Integridade

- Casos alterados: NO.
- Protocolo/thresholds alterados: NO.
- Resultados de modelo consultados: NO.
- Modelo executado: NO.
- Ground truth criado: NO.
- Ground truth congelado: NO.
- Ready for final model evaluation: NO.
