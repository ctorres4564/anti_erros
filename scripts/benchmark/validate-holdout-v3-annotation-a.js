// Validator for Holdout V3 candidate pool and Annotation A
const fs = require('fs');
const path = require('path');

// Load candidates (observables) from generated TypeScript file
const candidateTsPath = path.join(__dirname, 'holdout-v3-candidate-pool.ts');
const candidateTsContent = fs.readFileSync(candidateTsPath, 'utf8');
// Extract the JSON array after "export const candidates = "
const matches = candidateTsContent.match(/const candidates(?::\s*Candidate\[\])?\s*=\s*(\[.*\]);/s);
if (!matches) {
  console.error('VALIDATION ERROR: Could not parse candidates array from TS file');
  process.exit(1);
}
const candidates = JSON.parse(matches[1]);

// Load annotations JSON
const annotationPath = path.join(__dirname, 'holdout-v3-annotation-a.json');
const annotations = JSON.parse(fs.readFileSync(annotationPath, 'utf8'));

function exitWithError(msg) {
  console.error('VALIDATION ERROR:', msg);
  process.exit(1);
}

// 1. Verify candidate count and unique IDs
if (candidates.length !== 180) exitWithError(`Expected 180 candidates, found ${candidates.length}`);
const ids = candidates.map(c => c.id);
const uniqueIds = new Set(ids);
if (uniqueIds.size !== 180) exitWithError('Candidate IDs are not unique');

// 2. Verify each candidate has required observable fields only
candidates.forEach(c => {
  const keys = Object.keys(c);
  const allowed = ['id', 'question', 'userAnswer', 'correctAnswer', 'officialExplanation'];
  if (keys.length !== allowed.length || !allowed.every(k => keys.includes(k))) {
    exitWithError(`Candidate ${c.id} does not contain exactly the observable fields`);
  }
});

// 3. Verify annotation count and IDs match
if (!Array.isArray(annotations) || annotations.length !== 180) exitWithError('Annotation A must contain 180 entries');
annotations.forEach(a => {
  if (!uniqueIds.has(a.id)) exitWithError(`Annotation entry ${a.id} does not correspond to any candidate`);
  // acceptableErrorTypes must include proposedErrorType
  if (!a.acceptableErrorTypes.includes(a.proposedErrorType))
    exitWithError(`Annotation ${a.id}: acceptableErrorTypes must contain proposedErrorType`);
  // For II cases (diagnosticIndeterminate === 'YES') ensure justification contains required fields
  if (a.diagnosticIndeterminate === 'YES') {
    const requiredParts = ['plausibleCause1', 'plausibleCause2', 'missingDiscriminatingInformation'];
    const missing = requiredParts.filter(p => !a.justification.includes(p));
    if (missing.length) exitWithError(`Annotation ${a.id} missing II fields: ${missing.join(', ')}`);
  }
  // Prompt injection consistency
  if (a.promptInjectionCase && a.promptInjectionExpectedBehavior == null) {
    exitWithError(`Annotation ${a.id}: promptInjectionCase true but expected behavior is null`);
  }
  if (!a.promptInjectionCase && a.promptInjectionExpectedBehavior !== null) {
    exitWithError(`Annotation ${a.id}: promptInjectionCase false but expected behavior is not null`);
  }
});

console.log('VALIDATION PASS: All checks passed.');
process.exit(0);
