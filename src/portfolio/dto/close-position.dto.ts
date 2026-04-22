import {
  IsIn,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class ClosePositionDto {
  @IsIn(['full', 'partial'])
  type!: 'full' | 'partial';

  @ValidateIf((value: ClosePositionDto) => value.type === 'partial')
  @IsOptional()
  @IsNumber()
  @Min(0.000001)
  @Max(100)
  percentage?: number;
}
