import { UserProfileService } from './user-profile.service';
import { UserProfileRepository } from './user-profile.repository';

const WALLET = '0x' + 'a'.repeat(40);

describe('UserProfileService', () => {
  let service: UserProfileService;
  let repo: jest.Mocked<
    Pick<
      UserProfileRepository,
      'ensureOnAuth' | 'updateOnboardingStep' | 'findByWalletAddress'
    >
  >;

  beforeEach(() => {
    repo = {
      ensureOnAuth: jest.fn(),
      updateOnboardingStep: jest.fn(),
      findByWalletAddress: jest.fn(),
    };
    service = new UserProfileService(repo as unknown as UserProfileRepository);
  });

  it('returns hash from current step when onboarding is incomplete', async () => {
    repo.findByWalletAddress.mockResolvedValue({
      wallet_address: WALLET,
      username: 'alice',
      onboarding_complete: false,
      last_onboarding_step: 'identity',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await expect(service.getSession(WALLET)).resolves.toEqual({
      onboarding_complete: false,
      last_onboarding_step: 'identity',
      onboarding_hash: '#step=identity',
    });
  });

  it('clears hash when onboarding is complete', async () => {
    repo.updateOnboardingStep.mockResolvedValue({
      wallet_address: WALLET,
      username: 'alice',
      onboarding_complete: true,
      last_onboarding_step: 'done',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await expect(service.updateOnboardingStep(WALLET, 'done')).resolves.toEqual(
      {
        onboarding_complete: true,
        last_onboarding_step: 'done',
        onboarding_hash: null,
      },
    );
  });

  it('defaults to auth step for first session restore', async () => {
    repo.findByWalletAddress.mockResolvedValue(null);

    await expect(service.getSession(WALLET)).resolves.toEqual({
      onboarding_complete: false,
      last_onboarding_step: 'auth',
      onboarding_hash: '#step=auth',
    });
  });
});
