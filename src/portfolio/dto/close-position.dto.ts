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

  @ValidateIf((dto: ClosePositionDto) => dto.type === 'partial')
  @IsNumber()
  @Min(0.000001)
  @Max(100)
  percentage?: number;

  @ValidateIf((dto: ClosePositionDto) => dto.type === 'full')
  @IsOptional()
  @IsNumber()
  percentage?: number;
}
