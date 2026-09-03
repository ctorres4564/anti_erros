import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  isOnboardingComplete: vi.fn(),
  getUserProfileData: vi.fn(),
  cookies: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn(async () => ({ data: [], error: null })),
        })),
      })),
    })),
  })),
}));

vi.mock('@/services/onboarding', () => ({
  isOnboardingComplete: mocks.isOnboardingComplete,
  getUserProfileData: mocks.getUserProfileData,
}));

vi.mock('next/headers', () => ({ cookies: mocks.cookies }));

import AppPage from '@/app/app/page';

describe('/app e claim anônimo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'u@example.com' } }, error: null });
    mocks.isOnboardingComplete.mockResolvedValue(true);
    mocks.getUserProfileData.mockResolvedValue({ fullName: 'Usuário' });
    mocks.cookies.mockResolvedValue({ has: vi.fn(() => false) });
  });

  it('mantém o fluxo autenticado normal sem iniciar claim quando não há referência', async () => {
    const result = await AppPage({ searchParams: Promise.resolve({}) });

    expect(result.props.claimReference).toBeNull();
    expect(result.props.initialHistory).toEqual([]);
  });
});
