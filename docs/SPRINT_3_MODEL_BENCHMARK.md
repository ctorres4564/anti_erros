# Benchmark de Modelos Gemini — Sprint 3

**Status: PARCIAL / BLOQUEADO.** O benchmark completo de 90 casos × modelos
candidatos **não foi concluído** nesta execução. Este documento reporta
exclusivamente evidência real coletada (nenhum número foi fabricado ou
estimado sem uma chamada real por trás). Onde não há dado real, isso é
declarado explicitamente como "não medido".

---

## 1. Candidatos e disponibilidade real

A especificação cita `gemini-2.5-flash` e `gemini-3.7-flash` como candidatos
iniciais. Antes de rodar qualquer benchmark, os IDs foram checados
diretamente contra `GET /v1beta/models` e `generateContent` com a chave
fornecida nesta sprint:

| Model ID | Resultado real | Detalhe |
| --- | --- | --- |
| `gemini-2.5-flash` | **404 NOT_FOUND** | `"This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.6-flash..."` |
| `gemini-2.5-flash-lite` | **404 NOT_FOUND** | Mesma mensagem, sugerindo `gemini-3.5-flash-lite` |
| `gemini-3.7-flash` | 200 OK | Funcional, mas latência muito variável (ver §3) |
| `gemini-3.6-flash` | 200 OK | Funcional, latência baixa e estável nas amostras coletadas |

**Conclusão desta etapa:** `gemini-2.5-flash`, um dos dois candidatos citados
na especificação, **não está disponível para esta chave/conta** ("no longer
available to new users" — parece ser uma restrição de conta nova, não uma
descontinuação global do modelo). Não foi inventado silenciosamente um
substituto: a própria API do Google recomienda `gemini-3.6-flash` no corpo do
erro 404, e esse foi o modelo efetivamente usado como candidato alternativo,
somado ao `gemini-3.7-flash` já citado na especificação. Ambos os IDs usados
neste documento (`gemini-3.6-flash`, `gemini-3.7-flash`) foram confirmados
como aceitos e configurados/autorizados para esta chave antes de qualquer
teste.

## 2. Bloqueador: cota diária do tier gratuito

Ao iniciar o benchmark formal de 90 casos, ambos os modelos retornaram
**HTTP 429 RESOURCE_EXHAUSTED** com a seguinte mensagem (texto real,
truncado):

```
"You exceeded your current quota... Quota exceeded for metric:
generativelanguage.googleapis.com/generate_content_free_tier_requests,
limit: 20, model: gemini-3.6-flash"
quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier"
```

Ou seja: o limite não é por minuto, é **20 requisições por DIA, por modelo**,
no tier gratuito desta chave. O volume de chamadas já realizado nesta sessão
para validar disponibilidade dos modelos, calibrar timeout, rodar os smoke
tests e os testes E2E reais (seção 64 da Sprint 3) consumiu a cota diária de
ambos os modelos antes que o dataset completo de 90 casos pudesse ser
executado.

**BLOQUEADOR: BENCHMARK COMPLETO DE 90 CASOS PENDENTE — COTA DIÁRIA DO TIER
GRATUITO ESGOTADA (20 requisições/dia/modelo).** Resolve-se aguardando o
reset diário da cota (fuso do provedor) ou fornecendo uma chave com billing
habilitado (tier pago, sem esse teto). O dataset (`scripts/benchmark/dataset.ts`,
91 casos) e o runner (`scripts/benchmark/run-benchmark.ts`, com rate limiting,
backoff em 429/503 e métricas completas) estão prontos — basta reexecutar:

```bash
npx tsx scripts/benchmark/run-benchmark.ts --models=gemini-3.6-flash,gemini-3.7-flash
```

## 3. Evidência real coletada (amostras pequenas, não o benchmark completo)

Toda tabela abaixo reflete chamadas reais feitas durante o desenvolvimento
desta sprint (smoke tests + tentativa de benchmark formal), com o prompt de
produção completo (`ANALYSIS_SYSTEM_PROMPT` + `responseSchema` estruturado),
exceto onde indicado como "ping simples".

### gemini-3.6-flash

| # | Tipo de chamada | Resultado | Latência |
| --- | --- | --- | --- |
| 1 | Prompt completo (produção) | 200 OK, JSON estruturado válido (`KNOWLEDGE_GAP`, `confidence:0.95`, `CREATE_BASIC_CARD`, front/back coerentes) | 3.6s |
| 2 | Ping simples | 200 OK | 1.955s |
| 3 | Ping simples | 200 OK | 4.580s |
| 4 | Ping simples | 200 OK | 1.849s |
| 5 | Ping simples | 200 OK | 1.555s |
| 6 | Ping simples | 200 OK | 1.862s |
| 7 | `thinkingConfig.thinkingBudget=0` | 400 INVALID_ARGUMENT — não suportado neste modelo | 0.6s |
| 8+ | Dataset formal (2 casos tentados) | 429 RESOURCE_EXHAUSTED (cota diária) | — |

Amostra pequena, mas 100% de sucesso (6/6) antes do esgotamento de cota,
latência baixa e consistente (1.5s–4.6s), saída estruturada válida na única
chamada com o prompt completo de produção testada.

### gemini-3.7-flash

| # | Tipo de chamada | Resultado | Latência |
| --- | --- | --- | --- |
| 1 | Prompt completo (produção) | 503 UNAVAILABLE ("high demand") | 4.0s |
| 2 | Ping simples | 200 OK | 6.7s |
| 3 | Ping simples | 200 OK | 16.7s |
| 4 | Ping simples | 200 OK | 1.8s |
| 5 | Dataset formal (caso `kg-01`) | TIMEOUT (45s, abortado) | 45s |
| 6 | Dataset formal (caso `kg-02`) | 429 RESOURCE_EXHAUSTED (cota diária) | — |

Amostra real menor e mais instável: 1 sobrecarga transitória (503), latência
altamente variável (1.8s–16.7s) mesmo em prompts triviais, 1 timeout real de
45s no primeiro caso do dataset formal.

## 4. Métricas de qualidade da especificação — NÃO MEDIDAS

As metas da seção 38 (schema compliance, factual correctness, hallucination
rate, create/no-card decision, classificação, qualidade pedagógica,
uncertainty handling) **requerem o dataset completo de 90 casos por modelo**
para serem calculadas com significância estatística mínima. Com 1–2 chamadas
reais por modelo usando o prompt de produção, não há base suficiente para
reportar essas porcentagens sem fabricar dados. Elas ficam explicitamente
como **não medido** até a reexecução do benchmark completo.

## 5. Custo e economia — NÃO MEDIDOS EM ESCALA

`totalInputTokens`/`totalOutputTokens` agregados de 90 casos, taxa de
retries e custo real por 1000 análises válidas dependem do dataset completo.
O runner (`run-benchmark.ts`) já implementa o cálculo (`computeCostPer1000Valid`)
usando os tokens reais retornados pela API a cada chamada — não uma
estimativa — mas não há volume suficiente ainda para reportar um número
representativo.

Observação qualitativa real: ambos os modelos `gemini-3.x` retornam
`thoughtsTokenCount` (80–134 tokens de "thinking" mesmo em prompts triviais)
como parte do `usageMetadata`, o que se soma ao custo de tokens de saída e
não pode ser desabilitado nesses modelos (`thinkingConfig.thinkingBudget=0`
foi rejeitado com 400 INVALID_ARGUMENT).

## 6. Decisão de modelo — PROVISÓRIA, NÃO É A DECISÃO FINAL EXIGIDA PELA SEÇÃO 40

A especificação exige escolher "o modelo mais barato que atenda todos os
thresholds mínimos de qualidade", com base no benchmark completo. Isso **não
pôde ser feito** com os dados coletados hoje.

Com base exclusivamente na evidência real disponível (confiabilidade e
latência, não qualidade pedagógica em escala), `gemini-3.6-flash` foi
configurado como modelo padrão operacional (`GEMINI_MODEL_NAME` em
`.env.local`, fallback em `src/config/ai.ts`) por ter mostrado, nas amostras
reais coletadas, 100% de sucesso e latência mais baixa/estável que
`gemini-3.7-flash` (que mostrou sobrecarga transitória, timeout real e
latência até 9x maior em amostras comparáveis). Esta é uma escolha
operacional provisória para permitir que o restante da engine seja testado
de ponta a ponta — **não** substitui a decisão formal baseada em thresholds
de qualidade exigida pela especificação, que permanece pendente da
reexecução do benchmark completo.

## 7. Timeout calibrado empiricamente

`AI_REQUEST_TIMEOUT_MS = 45_000` (`src/config/ai.ts`) foi definido a partir
da latência real observada acima (até 16.7s em `gemini-3.7-flash` para um
prompt trivial; a chamada real de produção com prompt completo chegou a
levar mais que isso antes de finalmente resultar em timeout no dataset
formal). Não é um valor arbitrário.

## 8. Próximos passos para concluir o benchmark

1. Aguardar o reset diário da cota gratuita (ou obter uma chave com billing
   habilitado).
2. Rodar `npx tsx scripts/benchmark/run-benchmark.ts` (sem `--limit`/`--ids`)
   para os 91 casos completos em ambos os modelos.
3. Preencher a tabela de métricas da seção 38 com os números reais
   retornados pelo runner.
4. Aplicar o critério da seção 40 (mais barato entre os que atingem todos os
   thresholds) e atualizar `GEMINI_MODEL_NAME`/`AI_MODEL` se a escolha
   final divergir da provisória acima.
