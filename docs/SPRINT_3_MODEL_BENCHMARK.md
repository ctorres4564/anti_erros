# Benchmark de Modelos Gemini — Sprint 3

**Status: BLOQUEADO POR COTA EXTERNA (Tier Gratuito do Google Gemini).**
O benchmark completo de 91 casos × modelos candidatos **não pôde ser concluído** devido ao esgotamento do limite diário do tier gratuito da Google AI Studio (`limit: 20` requisições/dia por modelo).

Em estrito cumprimento das diretrizes de integridade empírica:
- **Nenhum resultado ou métrica foi fabricado ou simulado.**
- **Amostras parciais NÃO foram extrapoladas como representativas dos 91 casos.**
- **Nenhum modelo foi declarado vencedor sem a execução integral e auditável do dataset.**

---

## 1. Candidatos Avaliados e Disponibilidade Real

| Model ID | Status da API | Observação |
| :--- | :---: | :--- |
| `gemini-2.5-flash` | **404 NOT_FOUND** | *"This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.6-flash..."* |
| `gemini-3.6-flash` | **Disponível (429 Cota)** | Suportado pela conta; bloqueado pelo teto diário de 20 req/dia. |
| `gemini-3.7-flash` | **Disponível (429 Cota)** | Suportado pela conta; bloqueado pelo teto diário de 20 req/dia. |

---

## 2. Estrutura do Dataset de Benchmark

O dataset foi versionado em `scripts/benchmark/dataset.ts` (`BENCHMARK_DATASET_VERSION = 'benchmark-v1'`) com **91 casos sintéticos**:

| Categoria | Quantidade | Cobertura Específica |
| :--- | :---: | :--- |
| `KNOWLEDGE_GAP` | 15 | Regras gerais, prazos, fatos históricos, fórmulas, definições conceituais |
| `CONCEPT_CONFUSION` | 15 | Institutos afins, distinções teóricas (ex: anulação vs revogação, furto vs apropriação) |
| `EXCEPTION_MISSED` | 15 | Regra geral conhecida com ressalva/condição especial ignorada |
| `APPLICATION_ERROR` | 15 | Teoria correta aplicada incorretamente a microcaso concreto |
| `READING_ERROR` | 16 | Erros de enunciado (exceto, incorreta), pegadinhas de leitura, interpretação superficial |
| `INSUFFICIENT_INFORMATION` | 15 | Enunciados truncados, gabaritos inconsistentes com a explicação, dados degenerados |
| **Total** | **91** | **Casos ambíguos, NO_CARD, todos CREATE_*, prompt injection, baixa confiança** |

---

## 3. Relato Objetivo do Bloqueio de Cota Externa

Ao disparar a execução do dataset através do runner `scripts/benchmark/run-benchmark.ts`, ambas as APIs retornaram a violação de cota diária:

```json
{
  "error": {
    "code": 429,
    "message": "You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. \n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: gemini-3.6-flash",
    "status": "RESOURCE_EXHAUSTED",
    "details": [
      {
        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
        "violations": [
          {
            "quotaMetric": "generativelanguage.googleapis.com/generate_content_free_tier_requests",
            "quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier",
            "quotaValue": "20"
          }
        ]
      }
    ]
  }
}
```

### Números Exatos da Execução:
- **Casos completados no benchmark formal**: `0 / 91`
- **Casos restantes**: `91 / 91`
- **Limite diário imposto pelo provedor**: `20 requisições / dia / modelo`

---

## 4. Pré-Requisitos para Execução e Homologação Final

O runner e o dataset estão 100% prontos, testados e alinhados com o PRD v1.2. Para executar o benchmark completo e homologar a seleção do modelo:

1. **Fornecer uma chave `GEMINI_API_KEY` com faturamento habilitado (Tier Pago / Pay-as-you-go)** OU aguardar o reset diário de cota da API.
2. Executar o comando:
   ```bash
   npx tsx scripts/benchmark/run-benchmark.ts "--models=gemini-3.6-flash,gemini-3.7-flash"
   ```
3. O runner calculará automaticamente todas as métricas contra os thresholds estabelecidos:
   - Schema compliance: 100%
   - Factual correctness: >= 98%
   - Hallucination rate: <= 1%
   - Create vs NO_CARD: >= 95%
   - Error classification: >= 90%
   - Pedagogical quality: >= 92%
   - Uncertainty handling: >= 95%
   - Custo por 1.000 análises válidas (incluindo retries e falhas)
