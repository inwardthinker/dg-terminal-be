import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ONBOARDING_STEPS } from '../types/onboarding-step.type';

const normalizeOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export class UpdateOnboardingStepBodyDto {
  @Matches(/^0x[a-fA-F0-9]{40}$/)
  walletAddress!: string;

  @IsIn(ONBOARDING_STEPS)
  step!: (typeof ONBOARDING_STEPS)[number];

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  @IsString()
  @MaxLength(64)
  username?: string;
}
