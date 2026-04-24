import { UserProfileService } from './user-profile.service';
import { UserProfileRepository } from './user-profile.repository';

describe('UserProfileService', () => {
  let service: UserProfileService;
  let repo: jest.Mocked<
    Pick<
      UserProfileRepository,
      'ensureOnAuth' | 'updateOnboardingStep' | 'findByUserId'
    >
  >;

  beforeEach(() => {
    repo = {
      ensureOnAuth: jest.fn(),
      updateOnboardingStep: jest.fn(),
      findByUserId: jest.fn(),
    };
    service = new UserProfileService(repo as unknown as UserProfileRepository);
  });

  it('returns hash from current step when onboarding is incomplete', async () => {
    repo.findByUserId.mockResolvedValue({
      user_id: 'u1',
      username: 'alice',
      wallet_address: '0x' + 'a'.repeat(40),
      onboarding_complete: false,
      last_onboarding_step: 'identity',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await expect(service.getSession('u1')).resolves.toEqual({
      onboarding_complete: false,
      last_onboarding_step: 'identity',
      onboarding_hash: '#step=identity',
    });
  });

  it('clears hash when onboarding is complete', async () => {
    repo.updateOnboardingStep.mockResolvedValue({
      user_id: 'u1',
      username: 'alice',
      wallet_address: null,
      onboarding_complete: true,
      last_onboarding_step: 'done',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await expect(service.updateOnboardingStep('u1', 'done')).resolves.toEqual({
      onboarding_complete: true,
      last_onboarding_step: 'done',
      onboarding_hash: null,
    });
  });

  it('defaults to auth step for first session restore', async () => {
    repo.findByUserId.mockResolvedValue(null);

    await expect(service.getSession('new-user')).resolves.toEqual({
      onboarding_complete: false,
      last_onboarding_step: 'auth',
      onboarding_hash: '#step=auth',
    });
  });
});
