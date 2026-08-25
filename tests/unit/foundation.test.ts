import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { cn } from '@/lib/utils';

describe('Sprint 1: Testes de Fundação e Infraestrutura', () => {
  const rootDir = path.resolve(__dirname, '../../');

  it('deve ter o Next.js fixado rigidamente na versão 16.3.3 no package.json', () => {
    const pkgPath = path.join(rootDir, 'package.json');
    expect(fs.existsSync(pkgPath)).toBe(true);

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    expect(pkg.dependencies.next).toBe('16.3.3');
    expect(pkg.dependencies.next).not.toMatch(/^[\^~]/);
    expect(pkg.devDependencies['eslint-config-next']).toBe('16.3.3');
  });

  it('deve garantir que .env.example contém todas as variáveis necessárias sem valores sensíveis', () => {
    const envExamplePath = path.join(rootDir, '.env.example');
    expect(fs.existsSync(envExamplePath)).toBe(true);

    const content = fs.readFileSync(envExamplePath, 'utf-8');
    expect(content).toContain('NEXT_PUBLIC_SUPABASE_URL');
    expect(content).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    expect(content).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(content).toContain('GEMINI_API_KEY');
    expect(content).toContain('GEMINI_MODEL_NAME');
    expect(content).toContain('DAILY_ANALYSIS_QUOTA');
    expect(content).toContain('IDEMPOTENCY_LOCK_TTL_SECONDS');

    // Chaves secretas nunca devem possuir o prefixo NEXT_PUBLIC_
    expect(content).not.toContain('NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY');
    expect(content).not.toContain('NEXT_PUBLIC_GEMINI_API_KEY');
  });

  it('deve conter as migrações SQL com o schema relacional, schema private e RLS', () => {
    const migrationsDir = path.join(rootDir, 'supabase/migrations');
    expect(fs.existsSync(migrationsDir)).toBe(true);

    const m1 = fs.readFileSync(path.join(migrationsDir, '0001_initial_schema.sql'), 'utf-8');
    expect(m1).toContain('CREATE TABLE IF NOT EXISTS public.profiles');
    expect(m1).toContain('CREATE TABLE IF NOT EXISTS public.legal_acceptances');
    expect(m1).toContain('CREATE TABLE IF NOT EXISTS public.marketing_consent_events');
    expect(m1).toContain('CREATE TABLE IF NOT EXISTS public.daily_quotas');
    expect(m1).toContain('CREATE TABLE IF NOT EXISTS public.idempotency_locks');
    expect(m1).toContain('CREATE TABLE IF NOT EXISTS public.analyses');
    expect(m1).toContain('CREATE TABLE IF NOT EXISTS public.events');
    expect(m1).toContain('security_invoker = true');

    const m2 = fs.readFileSync(path.join(migrationsDir, '0002_private_cleanup_rpc.sql'), 'utf-8');
    expect(m2).toContain('CREATE SCHEMA IF NOT EXISTS private');
    expect(m2).toContain('FUNCTION private.cleanup_expired_reservations');
    expect(m2).toContain('REVOKE EXECUTE ON FUNCTION private.cleanup_expired_reservations(UUID) FROM PUBLIC, anon, authenticated');
    expect(m2).toContain('GRANT EXECUTE ON FUNCTION private.cleanup_expired_reservations(UUID) TO service_role');

    const m3 = fs.readFileSync(path.join(migrationsDir, '0003_rls_policies.sql'), 'utf-8');
    expect(m3).toContain('ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY');
    expect(m3).toContain('ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY');
    expect(m3).toContain('CREATE POLICY "analyses_select_own"');
  });

  it('deve formatar classes Tailwind corretamente com a função cn()', () => {
    const result = cn('px-2 py-1', false && 'hidden', 'px-4', { 'bg-primary': true });
    expect(result).toBe('py-1 px-4 bg-primary');
  });
});
