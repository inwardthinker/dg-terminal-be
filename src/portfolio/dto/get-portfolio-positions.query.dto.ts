import { IsIn, IsOptional, Matches } from 'class-validator';
import { SORTABLE_FIELDS } from '../types/sortable-field.type';
import type { SortableField } from '../types/sortable-field.type';

export class GetPortfolioPositionsQueryDto {
  @IsOptional()
  @IsIn(SORTABLE_FIELDS)
  sort_by?: SortableField;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sort_dir?: 'asc' | 'desc';

  @Matches(/^0x[a-fA-F0-9]{40}$/)
  wallet!: string;
}
