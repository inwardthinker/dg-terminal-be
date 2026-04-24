import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class OnboardingAuthBodyDto {
  @IsString()
  userId!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsString()
  @MaxLength(64)
  username?: string;

  @IsOptional()
  @Matches(/^0x[a-fA-F0-9]{40}$/)
  walletAddress?: string;
}
