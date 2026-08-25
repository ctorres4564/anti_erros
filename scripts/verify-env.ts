import fs from 'fs';
import path from 'path';

export function verifyEnvExample() {
  const envExamplePath = path.resolve(__dirname, '../.env.example');
  if (!fs.existsSync(envExamplePath)) {
    throw new Error('.env.example não encontrado na raiz do projeto.');
  }

  const content = fs.readFileSync(envExamplePath, 'utf-8');
  const requiredKeys = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'GEMINI_API_KEY',
    'GEMINI_MODEL_NAME',
    'DAILY_ANALYSIS_QUOTA',
    'IDEMPOTENCY_LOCK_TTL_SECONDS',
  ];

  const missingKeys = requiredKeys.filter((key) => !content.includes(key));
  if (missingKeys.length > 0) {
    throw new Error(`Chaves obrigatórias ausentes no .env.example: ${missingKeys.join(', ')}`);
  }

  return true;
}

if (require.main === module) {
  try {
    verifyEnvExample();
    console.log('✅ .env.example validado com sucesso!');
  } catch (err: any) {
    console.error('❌ Falha na validação do .env.example:', err.message);
    process.exit(1);
  }
}
