import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { UserRecord } from './types/users.type';

function buildMockUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: 'u1',
    email: 'alice@example.com',
    username: 'alice',
    safe_wallet_address: '0x' + 'a'.repeat(40),
    onboarding_complete: false,
    last_onboarding_step: 'auth',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('UsersService', () => {
  let service: UsersService;
  let repo: jest.Mocked<
    Pick<
      UsersRepository,
      | 'ensureOnAuth'
      | 'updateOnboardingStep'
      | 'findByUserId'
      | 'findLegacyUserByEmail'
    >
  >;

  beforeEach(() => {
    repo = {
      ensureOnAuth: jest.fn(),
      updateOnboardingStep: jest.fn(),
      findByUserId: jest.fn(),
      findLegacyUserByEmail: jest.fn(),
    };
    service = new UsersService(repo as unknown as UsersRepository);
  });

  it('returns hash from current step when onboarding is incomplete', async () => {
    const user = buildMockUser({ last_onboarding_step: 'identity' });
    repo.findByUserId.mockResolvedValue(user);

    await expect(service.getSession('u1')).resolves.toEqual({
      onboarding_complete: false,
      last_onboarding_step: 'identity',
      onboarding_hash: '#step=identity',
      existing_user: false,
      legacy_username: null,
      user,
    });
  });

  it('clears hash when onboarding is complete', async () => {
    const user = buildMockUser({
      onboarding_complete: true,
      last_onboarding_step: 'done',
      safe_wallet_address: null,
    });
    repo.updateOnboardingStep.mockResolvedValue(user);

    await expect(service.updateOnboardingStep('u1', 'done')).resolves.toEqual({
      onboarding_complete: true,
      last_onboarding_step: 'done',
      onboarding_hash: null,
      existing_user: false,
      legacy_username: null,
      user,
    });
  });

  it('defaults to auth step for first session restore', async () => {
    repo.findByUserId.mockResolvedValue(null);

    await expect(service.getSession('new-user')).resolves.toEqual({
      onboarding_complete: false,
      last_onboarding_step: 'auth',
      onboarding_hash: '#step=auth',
      existing_user: false,
      legacy_username: null,
      user: null,
    });
  });

  it('returns existing user flag and legacy username on email match', async () => {
    const user = buildMockUser({ safe_wallet_address: null });
    repo.ensureOnAuth.mockResolvedValue(user);
    repo.findLegacyUserByEmail.mockResolvedValue({
      username: 'legacy-alice',
    });

    await expect(
      service.onAuth('u1', 'alice', '0x' + 'a'.repeat(40), 'alice@example.com'),
    ).resolves.toEqual({
      onboarding_complete: false,
      last_onboarding_step: 'auth',
      onboarding_hash: '#step=auth',
      existing_user: true,
      legacy_username: 'legacy-alice',
      user,
    });
  });

  it('defaults to new user when lookup fails', async () => {
    const user = buildMockUser({ safe_wallet_address: null });
    repo.ensureOnAuth.mockResolvedValue(user);
    repo.findLegacyUserByEmail.mockRejectedValue(new Error('db unavailable'));

    await expect(
      service.onAuth('u1', 'alice', undefined, 'alice@example.com'),
    ).resolves.toEqual({
      onboarding_complete: false,
      last_onboarding_step: 'auth',
      onboarding_hash: '#step=auth',
      existing_user: false,
      legacy_username: null,
      user,
    });
  });

  it('treats missing email as new user', async () => {
    const user = buildMockUser({ safe_wallet_address: null });
    repo.ensureOnAuth.mockResolvedValue(user);

    await expect(service.onAuth('u1', 'alice')).resolves.toEqual({
      onboarding_complete: false,
      last_onboarding_step: 'auth',
      onboarding_hash: '#step=auth',
      existing_user: false,
      legacy_username: null,
      user,
    });
    expect(repo.findLegacyUserByEmail).not.toHaveBeenCalled();
  });
});
