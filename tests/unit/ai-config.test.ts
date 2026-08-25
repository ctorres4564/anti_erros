import { describe, it, expect } from 'vitest';
import {
  AI_MODEL,
  CARD_ACTIONS,
  DAILY_ANALYSIS_LIMIT,
  IDEMPOTENCY_LOCK_TTL_SECONDS,
  LOW_CONFIDENCE_THRESHOLD,
  PEDAGOGICAL_MAP,
  PROBABLE_ERROR_TYPES,
} from '@/config/ai';

describe('config/ai', () => {
  it('DAILY_ANALYSIS_LIMIT é a fonte única da cota diária (5 no MVP)', () => {
    expect(DAILY_ANALYSIS_LIMIT).toBe(5);
    expect(Number.isInteger(DAILY_ANALYSIS_LIMIT)).toBe(true);
    expect(DAILY_ANALYSIS_LIMIT).toBeGreaterThan(0);
  });

  it('IDEMPOTENCY_LOCK_TTL_SECONDS usa o TTL já homologado de 120s', () => {
    expect(IDEMPOTENCY_LOCK_TTL_SECONDS).toBe(120);
  });

  it('LOW_CONFIDENCE_THRESHOLD está no intervalo válido de confiança', () => {
    expect(LOW_CONFIDENCE_THRESHOLD).toBeGreaterThan(0);
    expect(LOW_CONFIDENCE_THRESHOLD).toBeLessThan(1);
  });

  it('AI_MODEL nunca está vazio', () => {
    expect(AI_MODEL.length).toBeGreaterThan(0);
  });

  it('PROBABLE_ERROR_TYPES contém exatamente as 6 categorias da taxonomia, sem duplicatas', () => {
    expect(PROBABLE_ERROR_TYPES).toHaveLength(6);
    expect(new Set(PROBABLE_ERROR_TYPES).size).toBe(6);
    expect(PROBABLE_ERROR_TYPES).toEqual([
      'KNOWLEDGE_GAP',
      'CONCEPT_CONFUSION',
      'EXCEPTION_MISSED',
      'APPLICATION_ERROR',
      'READING_ERROR',
      'INSUFFICIENT_INFORMATION',
    ]);
  });

  it('CARD_ACTIONS contém exatamente as 5 ações possíveis, sem duplicatas', () => {
    expect(CARD_ACTIONS).toHaveLength(5);
    expect(new Set(CARD_ACTIONS).size).toBe(5);
    expect(CARD_ACTIONS).toEqual([
      'CREATE_BASIC_CARD',
      'CREATE_DISCRIMINATION_CARD',
      'CREATE_EXCEPTION_CARD',
      'CREATE_APPLICATION_CARD',
      'NO_CARD',
    ]);
  });

  it('PEDAGOGICAL_MAP cobre as 6 categorias com ações válidas do conjunto CARD_ACTIONS', () => {
    for (const errorType of PROBABLE_ERROR_TYPES) {
      expect(PEDAGOGICAL_MAP[errorType]).toBeDefined();
      expect(CARD_ACTIONS).toContain(PEDAGOGICAL_MAP[errorType]);
    }
  });

  it('mapa pedagógico inicial segue a correspondência típica descrita na especificação', () => {
    expect(PEDAGOGICAL_MAP.KNOWLEDGE_GAP).toBe('CREATE_BASIC_CARD');
    expect(PEDAGOGICAL_MAP.CONCEPT_CONFUSION).toBe('CREATE_DISCRIMINATION_CARD');
    expect(PEDAGOGICAL_MAP.EXCEPTION_MISSED).toBe('CREATE_EXCEPTION_CARD');
    expect(PEDAGOGICAL_MAP.APPLICATION_ERROR).toBe('CREATE_APPLICATION_CARD');
    expect(PEDAGOGICAL_MAP.READING_ERROR).toBe('NO_CARD');
    expect(PEDAGOGICAL_MAP.INSUFFICIENT_INFORMATION).toBe('NO_CARD');
  });
});
