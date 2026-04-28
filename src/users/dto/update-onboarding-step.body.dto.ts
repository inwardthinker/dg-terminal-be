import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ONBOARDING_STEPS } from '../types/onboarding-step.type';

export class UpdateOnboardingStepBodyDto {
  @IsIn(ONBOARDING_STEPS)
  step!: (typeof ONBOARDING_STEPS)[number];

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsString()
  @MaxLength(64)
  username?: string;
}
