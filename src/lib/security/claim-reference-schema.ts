import { z } from 'zod';

export const claimReferenceInputSchema = z
  .object({
    claimReference: z.string().min(1, 'Referência de resgate inválida.').max(128),
  })
  .strict();
