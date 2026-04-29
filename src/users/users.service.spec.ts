import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { UserRecord } from './types/users.type';

function buildMockUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: 'u1',
    user_id: 'did:privy:cmock',
    email: 'alice@example.com',
    username: 'alice',
    wallet_address: '0x' + 'a'.repeat(40),
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
      | 'replaceUserInterests'
      | 'completeOnboarding'
      | 'updateOnboardingIdentity'
      | 'isUsernameTaken'
      | 'isUsernameTakenByOtherUser'
      | 'findByUserId'
      | 'findLegacyUserByEmail'
    >
  >;

  beforeEach(() => {
    repo = {
      ensureOnAuth: jest.fn(),
      updateOnboardingStep: jest.fn(),
      replaceUserInterests: jest.fn(),
      completeOnboarding: jest.fn(),
      updateOnboardingIdentity: jest.fn(),
      isUsernameTaken: jest.fn(),
      isUsernameTakenByOtherUser: jest.fn(),
      findByUserId: jest.fn(),
      findLegacyUserByEmail: jest.fn(),
    };
    service = new UsersService(repo as unknown as UsersRepository);
  });

  it('returns hash from current step when onboarding is incomplete', async () => {
    const user = buildMockUser({ last_onboarding_step: 'identity' });
    repo.findByUserId.mockResolvedValue(user);

    await expect(service.getSession('u1')).resolves.toEqual({
      user: {
        ...user,
        existing_user: false,
      },
    });
  });

  it('clears hash when onboarding is complete', async () => {
    const user = buildMockUser({
      onboarding_complete: true,
      last_onboarding_step: 'done',
      wallet_address: '',
    });
    repo.updateOnboardingStep.mockResolvedValue(user);

    await expect(service.updateOnboardingStep('u1', 'done')).resolves.toEqual({
      user: {
        ...user,
        existing_user: false,
      },
    });
  });

  it('defaults to auth step for first session restore', async () => {
    repo.findByUserId.mockResolvedValue(null);

    await expect(service.getSession('new-user')).resolves.toEqual({
      user: null,
    });
  });

  it('returns existing user flag and legacy username on email match', async () => {
    const user = buildMockUser({ wallet_address: '' });
    repo.ensureOnAuth.mockResolvedValue(user);
    repo.findLegacyUserByEmail.mockResolvedValue({
      username: 'legacy-alice',
    });

    await expect(
      service.onAuth(
        'did:privy:cmock',
        'alice@example.com',
        'alice',
        '0x' + 'a'.repeat(40),
      ),
    ).resolves.toEqual({
      user: {
        ...user,
        existing_user: true,
      },
    });
  });

  it('defaults to new user when lookup fails', async () => {
    const user = buildMockUser({ wallet_address: '' });
    repo.ensureOnAuth.mockResolvedValue(user);
    repo.findLegacyUserByEmail.mockRejectedValue(new Error('db unavailable'));

    await expect(
      service.onAuth('did:privy:cmock', 'alice@example.com', 'alice'),
    ).resolves.toEqual({
      user: {
        ...user,
        existing_user: false,
      },
    });
  });

  it('treats missing email as new user', async () => {
    const user = buildMockUser({ wallet_address: '' });
    repo.ensureOnAuth.mockResolvedValue(user);

    await expect(
      service.onAuth('did:privy:cmock', undefined, 'alice'),
    ).resolves.toEqual({
      user: {
        ...user,
        existing_user: false,
      },
    });
    expect(repo.findLegacyUserByEmail).not.toHaveBeenCalled();
  });

  it('completes onboarding from calibrate step with stream selections', async () => {
    const user = buildMockUser({
      onboarding_complete: true,
      last_onboarding_step: 'done',
      completed_at: new Date().toISOString(),
    });
    repo.completeOnboarding.mockResolvedValue(user);
    repo.replaceUserInterests.mockResolvedValue();

    await expect(
      service.updateOnboardingStep('u1', 'calibrate', undefined, [
        { stream: 'crypto', markets: ['btc', 'eth'] },
      ]),
    ).resolves.toEqual({
      user: {
        ...user,
        existing_user: false,
      },
    });
    expect(repo.replaceUserInterests).toHaveBeenCalledWith('u1', [
      { stream: 'crypto', markets: ['btc', 'eth'] },
    ]);
    expect(repo.completeOnboarding).toHaveBeenCalledWith('u1', undefined);
    expect(repo.updateOnboardingStep).not.toHaveBeenCalled();
  });

  it('throws for empty calibration streams', async () => {
    await expect(
      service.updateOnboardingStep('u1', 'calibrate', undefined, []),
    ).rejects.toThrow('streams must contain between 1 and 5 items');
    expect(repo.replaceUserInterests).not.toHaveBeenCalled();
  });

  it('throws when calibration stream count exceeds max', async () => {
    await expect(
      service.updateOnboardingStep(
        'u1',
        'calibrate',
        undefined,
        Array.from({ length: 6 }, (_, index) => ({
          stream: `stream-${index + 1}`,
          markets: [],
        })),
      ),
    ).rejects.toThrow('streams must contain between 1 and 5 items');
  });

  it('returns unavailable for invalid username format', async () => {
    await expect(service.checkUsernameAvailability('ab')).resolves.toEqual({
      available: false,
      reason: 'invalid_format',
    });
    expect(repo.isUsernameTaken).not.toHaveBeenCalled();
  });

  it('returns unavailable for reserved username', async () => {
    await expect(service.checkUsernameAvailability('Admin')).resolves.toEqual({
      available: false,
      reason: 'reserved',
    });
    expect(repo.isUsernameTaken).not.toHaveBeenCalled();
  });

  it('returns unavailable when username is already taken', async () => {
    repo.isUsernameTaken.mockResolvedValue(true);

    await expect(service.checkUsernameAvailability('alice_1')).resolves.toEqual(
      {
        available: false,
        reason: 'taken',
      },
    );
    expect(repo.isUsernameTaken).toHaveBeenCalledWith('alice_1');
  });

  it('returns available when username is free', async () => {
    repo.isUsernameTaken.mockResolvedValue(false);

    await expect(
      service.checkUsernameAvailability('new_user'),
    ).resolves.toEqual({
      available: true,
    });
    expect(repo.isUsernameTaken).toHaveBeenCalledWith('new_user');
  });

  it('updates onboarding identity with username and avatar', async () => {
    const user = buildMockUser({
      username: 'new_user',
      avatar_url: 'https://cdn.example.com/avatar.png',
      last_onboarding_step: 'identity',
    });
    repo.updateOnboardingIdentity.mockResolvedValue(user);

    await expect(
      service.updateOnboardingIdentity(
        'u1',
        'new_user',
        'https://cdn.example.com/avatar.png',
      ),
    ).resolves.toEqual({
      onboarding_complete: false,
      last_onboarding_step: 'identity',
      onboarding_hash: '#step=identity',
      existing_user: false,
      legacy_username: null,
      user,
    });
  });

  it('returns conflict when username is taken at write time', async () => {
    repo.updateOnboardingIdentity.mockResolvedValue(null);
    repo.isUsernameTakenByOtherUser.mockResolvedValue(true);

    await expect(
      service.updateOnboardingIdentity('u1', 'alice_1'),
    ).rejects.toThrow('Already taken');
  });
});
