import { IsString } from 'class-validator';

export class GetUserSessionQueryDto {
  @IsString()
  userId!: string;
}
