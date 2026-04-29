import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import {
  ONBOARDING_STEP_HASH_MAP,
  OnboardingStep,
} from './types/onboarding-step.type';
import {
  UsernameAvailabilityResponse,
  UserInterestSelection,
  UsersSessionResponse,
} from './types/users.type';
import { UsersRepository } from './users.repository';

const USERNAME_FORMAT_REGEX = /^[A-Za-z0-9_]{3,24}$/;
const RESERVED_USERNAMES = new Set([
  'admin',
  'support',
  'dgpredict',
  'api',
  'app',
  'login',
]);

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async onAuth(
    userId: string,
    email?: string,
    username?: string,
    walletAddress?: string,
  ): Promise<UsersSessionResponse> {
    const existingUser = await this.resolveExistingUserByEmail(email, userId);
    const user = await this.usersRepository.ensureOnAuth(
      userId,
      email,
      username,
      walletAddress,
    );

    return this.toSessionResponse(
      user?.onboarding_complete ?? false,
      user?.last_onboarding_step ?? 'auth',
      existingUser.exists,
      existingUser.legacyUsername,
      user,
    );
  }

  async updateOnboardingStep(
    userId: string,
    step: OnboardingStep,
    username?: string,
    streams?: UserInterestSelection[],
  ): Promise<UsersSessionResponse> {
    const user =
      step === 'calibrate'
        ? await this.completeCalibration(userId, username, streams)
        : await this.usersRepository.updateOnboardingStep(
            userId,
            step,
            username,
          );
    return this.toSessionResponse(
      user?.onboarding_complete ?? false,
      user?.last_onboarding_step ?? 'auth',
      false,
      null,
      user,
    );
  }

  private async completeCalibration(
    userId: string,
    username: string | undefined,
    streams: UserInterestSelection[] | undefined,
  ) {
    const normalizedStreams = this.normalizeAndValidateStreams(streams);
    await this.usersRepository.replaceUserInterests(userId, normalizedStreams);
    const user = await this.usersRepository.completeOnboarding(
      userId,
      username,
    );

    this.triggerFeedPersonalisationWorker(userId, normalizedStreams);
    return user;
  }

  private normalizeAndValidateStreams(
    streams: UserInterestSelection[] | undefined,
  ): UserInterestSelection[] {
    if (!Array.isArray(streams) || streams.length < 1 || streams.length > 5) {
      throw new UnprocessableEntityException(
        'streams must contain between 1 and 5 items',
      );
    }

    return streams.map((selection) => {
      const stream = selection?.stream?.trim();
      if (!stream) {
        throw new UnprocessableEntityException(
          'each stream selection must include a stream id',
        );
      }

      const markets = Array.isArray(selection.markets)
        ? selection.markets.filter((market) => typeof market === 'string')
        : [];
      return {
        stream,
        markets,
      };
    });
  }

  private triggerFeedPersonalisationWorker(
    userId: string,
    streams: UserInterestSelection[],
  ): void {
    const workerUrl = process.env.FEED_PERSONALISATION_WORKER_URL;
    if (!workerUrl) {
      return;
    }

    void fetch(workerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ user_id: userId, streams }),
    }).catch(() => {
      // Fire-and-forget worker trigger should not block onboarding completion.
    });
  }

  async getSession(userId: string): Promise<UsersSessionResponse> {
    const user = await this.usersRepository.findByUserId(userId);
    if (!user) {
      return this.toSessionResponse(false, 'auth', false, null, null);
    }

    return this.toSessionResponse(
      user.onboarding_complete,
      user.last_onboarding_step,
      false,
      null,
      user,
    );
  }

  async checkUsernameAvailability(
    usernameInput: unknown,
  ): Promise<UsernameAvailabilityResponse> {
    const username =
      typeof usernameInput === 'string' ? usernameInput.trim() : '';

    if (!USERNAME_FORMAT_REGEX.test(username)) {
      return { available: false, reason: 'invalid_format' };
    }

    if (RESERVED_USERNAMES.has(username.toLowerCase())) {
      return { available: false, reason: 'reserved' };
    }

    const taken = await this.usersRepository.isUsernameTaken(username);
    return taken ? { available: false, reason: 'taken' } : { available: true };
  }

  private toSessionResponse(
    onboardingComplete: boolean,
    step: OnboardingStep,
    existingUser: boolean,
    legacyUsername: string | null,
    user: UsersSessionResponse['user'],
  ): UsersSessionResponse {
    return {
      onboarding_complete: onboardingComplete,
      last_onboarding_step: step,
      onboarding_hash: onboardingComplete
        ? null
        : ONBOARDING_STEP_HASH_MAP[step],
      existing_user: existingUser,
      legacy_username: legacyUsername,
      user,
    };
  }

  private async resolveExistingUserByEmail(
    email?: string,
    userId?: string,
  ): Promise<{ exists: boolean; legacyUsername: string | null }> {
    if (!email) {
      return { exists: false, legacyUsername: null };
    }

    try {
      const legacyUser = await this.usersRepository.findLegacyUserByEmail(
        email,
        userId,
      );
      return {
        exists: !!legacyUser,
        legacyUsername: legacyUser?.username ?? null,
      };
    } catch {
      return { exists: false, legacyUsername: null };
    }
  }
}
