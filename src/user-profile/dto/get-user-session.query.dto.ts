import { Matches } from 'class-validator';

export class GetUserSessionQueryDto {
  @Matches(/^0x[a-fA-F0-9]{40}$/)
  walletAddress!: string;
}
