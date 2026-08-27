import { describe, expect, it } from 'vitest';
import annotation from './holdout-v1-annotation-a.json';
import manifest from './holdout-v1-manifest.json';
import { holdoutV1Cases } from './holdout-v1-cases';
const types = ['KNOWLEDGE_GAP','CONCEPT_CONFUSION','EXCEPTION_MISSED','APPLICATION_ERROR','READING_ERROR','INSUFFICIENT_INFORMATION'];
const observations = ['CLEAR','AMBIGUOUS','UNOBSERVABLE'];
const decisions = ['CREATE','NO_CARD'];
describe('holdout-v1 structural contract', () => {
 it('has 120 unique neutral IDs in both files', () => { const ids=Array.from({length:120},(_,i)=>`H${String(i+1).padStart(3,'0')}`); expect(holdoutV1Cases).toHaveLength(120); expect(annotation).toHaveLength(120); expect([...new Set(holdoutV1Cases.map(x=>x.id))].sort()).toEqual(ids); expect([...new Set(annotation.map(x=>x.id))].sort()).toEqual(ids); });
 it('exposes only observable fields', () => { for(const x of holdoutV1Cases) expect(Object.keys(x).sort()).toEqual(['correctAnswer','id','officialExplanation','question','userAnswer']); });
 it('uses valid annotation enums and required fields', () => { const keys=['acceptableErrorTypes','expectedCardDecision','expectedErrorType','id','justification','observability','promptInjectionCase','promptInjectionExpectedBehavior']; for(const x of annotation){ expect(Object.keys(x).sort()).toEqual(keys); expect(types).toContain(x.expectedErrorType); expect(x.acceptableErrorTypes).toContain(x.expectedErrorType); expect(x.acceptableErrorTypes.every(v=>types.includes(v))).toBe(true); expect(observations).toContain(x.observability); expect(decisions).toContain(x.expectedCardDecision); if(x.observability==='UNOBSERVABLE') expect(x.expectedErrorType).toBe('INSUFFICIENT_INFORMATION'); } });
 it('has exact category and injection counts', () => { for(const t of types) expect(annotation.filter(x=>x.expectedErrorType===t)).toHaveLength(20); expect(annotation.filter(x=>x.promptInjectionCase)).toHaveLength(20); expect(manifest).toMatchObject({caseCount:120,casesPerCategory:20,promptInjectionCases:20}); });
 it('freezes observability and card-decision totals', () => { expect(Object.fromEntries(observations.map(o=>[o,annotation.filter(x=>x.observability===o).length]))).toEqual({CLEAR:100,AMBIGUOUS:18,UNOBSERVABLE:2}); expect(Object.fromEntries(decisions.map(d=>[d,annotation.filter(x=>x.expectedCardDecision===d).length]))).toEqual({CREATE:66,NO_CARD:54}); });
});
