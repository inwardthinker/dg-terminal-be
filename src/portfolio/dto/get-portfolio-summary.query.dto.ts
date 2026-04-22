import { Matches } from 'class-validator';

export class GetPortfolioSummaryQueryDto {
  @Matches(/^0x[a-fA-F0-9]{40}$/)
  walletAddress!: string;
}
