import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import type { SortableClosedField } from '../types/sortable-closed-field.type';
import { CLOSED_SORTABLE_FIELDS } from '../types/sortable-closed-field.type';

export class GetPortfolioClosedPositionsQueryDto {
  @IsOptional()
  @IsIn(CLOSED_SORTABLE_FIELDS)
  sort_by?: SortableClosedField;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sort_dir?: 'asc' | 'desc';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @Matches(/^0x[a-fA-F0-9]{40}$/)
  walletAddress!: string;
}
