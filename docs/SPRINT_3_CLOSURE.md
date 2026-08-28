# Encerramento da Sprint 3 — análise pedagógica por IA

**Data do encerramento:** 28 de agosto de 2026
**Decisão:** encerrar a validação metodológica sintética e avançar para a Sprint 4 com o modelo em caráter provisório.

## Status final

| Item | Status |
| --- | --- |
| Sprint 3 — implementação técnica | **COMPLETE** |
| Validação da classificação causal por IA | **INCONCLUSIVE** |
| Holdout-V3 pronto | **NO** |
| Ground truth congelado | **NO** |
| Validação final do modelo | **NOT PERFORMED** |
| Status do modelo | **PROVISIONAL** |
| Pronto para a Sprint 4 | **YES** |

A implementação técnica da Sprint 3 está concluída. Isso não equivale à homologação metodológica da classificação causal. A evidência produzida não sustenta apresentar `errorType` como diagnóstico definitivo nem congelar o Holdout-V3 como ground truth.

## O que foi implementado

A Sprint 3 entregou a infraestrutura técnica da análise pedagógica por IA, incluindo:

- saída estruturada e validação por schema;
- classificação de causa provável com `confidence`;
- fallback conservador e uso de `INSUFFICIENT_INFORMATION` quando as evidências observáveis não são suficientes;
- `recommendedAction` obrigatório;
- decisão `CREATE`/`NO_CARD` independente de `errorType`;
- isolamento da autoatribuição causal do usuário;
- proteção contra prompt injection;
- quota, idempotência e controles de segurança;
- testes unitários, testes de integração e fluxo de build.

Essas proteções permanecem requisitos do produto e não devem ser simplificadas em razão do resultado metodológico inconclusivo.

## O que foi validado tecnicamente

Os testes e benchmarks realizados durante a Sprint demonstraram:

- conformidade consistente com o schema estruturado;
- funcionamento das regras determinísticas e do fallback conservador;
- boa reprodutibilidade das decisões relacionadas a prompt injection e segurança;
- capacidade de executar a análise dentro dos contratos técnicos esperados;
- ausência de indicação, nos benchmarks documentados, de degradação factual ou de segurança que justificasse reabrir a implementação técnica.

Esses resultados validam o mecanismo técnico e suas proteções, não a verdade causal dos rótulos pedagógicos.

## Principais resultados dos benchmarks

### Dev set do analysis-v2.1

O dev set registrou 100% de conformidade de schema, 82,42% de classificação aceitável, 89,01% de acerto na decisão de cartão, 100% no gate de incerteza e 100% em prompt injection. Esses números foram usados para desenvolvimento e não constituem validação final independente.

### Holdout final anterior (analysis-v2.0)

No holdout de 120 casos, o schema atingiu 100%, a classificação aceitável 78,33%, a classificação exata 73,33%, a decisão de cartão 80%, o gate de incerteza 60%, a consistência factual 100%, a taxa de alucinação 0% e prompt injection 100%. Os gates de classificação, decisão de cartão e incerteza não foram atendidos.

### Candidate Pool Holdout-V3

A comparação independente do Candidate Pool de 180 casos produziu:

- concordância exata de `errorType`: 153/180 (85,00%);
- concordância bilateral aceitável: 85,00%, abaixo do gate;
- concordância em `answerAnalysis`: 178/180 (98,89%);
- concordância global em `diagnosticIndeterminate`: 162/180 (90,00%);
- concordância positiva nos casos `diagnosticIndeterminate = true`: 26/44 (59,09%), abaixo do gate;
- concordância em `cardDecision`: 145/180 (80,56%), abaixo do gate;
- concordância em prompt injection: 180/180 (100%).

A adjudicação parcial não produziu composição válida para congelamento: foram selecionados 113 de 120 casos, com déficit de sete casos reproduzíveis de `INSUFFICIENT_INFORMATION`. A leva suplementar acrescentou apenas um novo caso dessa categoria considerado reproduzível, sem resolver o déficit metodológico.

## O que não foi validado metodologicamente

Não foi demonstrada reprodutibilidade humana suficiente para:

- a atribuição causal de `errorType`;
- a identificação positiva de `diagnosticIndeterminate`;
- a composição completa e balanceada do Holdout-V3;
- o congelamento de uma ground truth final;
- a avaliação final do analysis-v2.1 contra um holdout homologado.

O resultado metodológico é **INCONCLUSIVE**. Em particular, a concordância global ocultava baixa concordância na classe positiva de indeterminação diagnóstica. A segurança e o reconhecimento de prompt injection foram reprodutíveis, mas isso não compensa a incerteza nos constructos causais.

## Decisão de encerramento

A partir deste encerramento, não serão realizadas, no escopo da Sprint 3:

- novas construções de holdout ou reconstruções do Candidate Pool;
- novas rodadas A/B/C ou levas suplementares;
- tuning adicional do prompt;
- execução do analysis-v2.1 com objetivo de homologação;
- alteração retroativa de thresholds.

O custo marginal de continuar produzindo casos sintéticos não é justificável para o MVP. Os artefatos de benchmark existentes não serão apagados nem reescritos; permanecem no repositório como trilha de auditoria.

## Restrição e mitigação de produto

A aplicação não deve apresentar a saída da IA como diagnóstico definitivo. A comunicação deve preservar incerteza e contexto, usando formulações como:

- “causa provável”;
- “o erro pode estar relacionado a...”;
- “com base nas informações fornecidas...”.

Devem ser evitadas formulações como:

- “diagnóstico”;
- “esta foi a causa do seu erro”;
- “o sistema determinou que...”.

A mitigação combina essa linguagem probabilística com as proteções técnicas já implementadas: schema, confiança, fallback, `INSUFFICIENT_INFORMATION`, ação recomendada obrigatória, decisão independente de cartão, isolamento da autoatribuição, hardening contra prompt injection, quota, idempotência e segurança.

## Riscos residuais

- `errorType` pode variar entre avaliadores humanos mesmo diante dos mesmos campos observáveis.
- `diagnosticIndeterminate` pode apresentar falso consenso quando avaliado apenas pela acurácia global.
- casos sintéticos podem não representar a distribuição, a linguagem e a ambiguidade dos erros reais de usuários.
- o modelo provisório pode produzir explicações tecnicamente válidas, mas causalmente mais assertivas do que a evidência permite.

Esses riscos são aceitos para o MVP somente com comportamento conservador e linguagem não diagnóstica.

## Dívida pós-MVP

> Validar a taxonomia causal usando erros reais de usuários após o MVP.

Plano futuro sugerido:

1. coletar de 50 a 100 casos reais anonimizados;
2. obter revisão humana independente;
3. medir a concordância humana, incluindo a classe positiva de indeterminação;
4. revisar a taxonomia causal se necessário;
5. somente depois recalibrar o modelo.

Essa atividade é pós-MVP e não bloqueia a Sprint 4.

## Regressão final de encerramento

Nenhum benchmark de modelo, Gemini ou analysis-v2.1 foi executado durante o encerramento.

| Verificação | Resultado |
| --- | --- |
| Lint | **PASS** — `npm run lint` |
| Typecheck | **PASS** — `npx tsc --noEmit` |
| Unit tests | **PASS** — 153/153 testes em 11 arquivos |
| Integration tests | **PASS** — 63 testes aprovados e 11 ignorados; Gemini foi explicitamente desabilitado e os testes E2E que exigem a aplicação local foram ignorados |
| Build | **PASS** — `npm run build` |

Após a remoção seletiva dos arquivos temporários não rastreados que interferiam na verificação, typecheck e build foram executados novamente com sucesso. Nenhum arquivo versionado foi alterado durante essa limpeza.

## Deliberação final

A Sprint 3 está **CLOSED**. O modelo permanece **PROVISIONAL**, a validação causal permanece **INCONCLUSIVE** e o Holdout-V3 não está pronto nem congelado. A Sprint 4 pode começar porque o risco metodológico está documentado, limitado por proteções técnicas e mitigado na experiência do produto.
