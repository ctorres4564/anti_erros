export interface DemoAnalysis {
  question: string;
  userAnswer: string;
  correctAnswer: string;
  probableErrorType: string;
  probableCause: string;
  nextAction: string;
}

export const DEMO_ANALYSIS: Readonly<DemoAnalysis> = Object.freeze({
  question:
    'Um ato administrativo ilegal deve ser anulado ou revogado pela Administração Pública?',
  userAnswer:
    'Deve ser revogado, porque a Administração pode retirar seus próprios atos quando identifica um problema.',
  correctAnswer:
    'Deve ser anulado. A anulação decorre de ilegalidade; a revogação decorre de conveniência e oportunidade.',
  probableErrorType: 'Confusão entre conceitos',
  probableCause:
    'Você reconheceu que a Administração pode retirar o ato, mas trocou os critérios de anulação e revogação.',
  nextAction:
    'Revise a distinção “legalidade × conveniência e oportunidade” e aplique-a em dois microcasos: um ato ilegal e um ato válido que deixou de ser conveniente.',
});
