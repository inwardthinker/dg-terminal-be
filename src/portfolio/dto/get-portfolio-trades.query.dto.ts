import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

const TRADES_PERIODS = ['1d', '7d', '30d', 'all'] as const;

export class GetPortfolioTradesQueryDto {
  @Matches(/^0x[a-fA-F0-9]{40}$/)
  walletAddress!: string;

  @IsOptional()
  @IsIn(TRADES_PERIODS)
  period?: (typeof TRADES_PERIODS)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  per_page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(500)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  start?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  end?: number;

  @IsOptional()
  @IsIn([true, false, 'true', 'false'])
  excludeDepositsWithdrawals?: boolean | 'true' | 'false';

  @IsOptional()
  @IsString()
  sort_by?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sort_dir?: 'asc' | 'desc';

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsIn(['ASC', 'DESC', 'asc', 'desc'])
  sortDirection?: 'ASC' | 'DESC' | 'asc' | 'desc';

  @IsOptional()
  @IsString()
  outcome?: string;

  @IsOptional()
  @IsString()
  market?: string;

  @IsOptional()
  @IsString()
  eventId?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsIn(['BUY', 'SELL'])
  side?: 'BUY' | 'SELL';
}
