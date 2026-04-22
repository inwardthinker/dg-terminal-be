export type PortfolioTradeActivity = Record<string, unknown>;
export type PortfolioTradeOutcome = 'WON' | 'LOST' | 'PUSHED';

export type PortfolioTradeNormalizedColumns = {
  date: string;
  market: string;
  side: string;
  entry_price: number | null;
  exit_price: number | null;
  size: number;
  outcome: PortfolioTradeOutcome | null;
  pnl: number | null;
  venue: string;
};

export type PortfolioTrade = PortfolioTradeActivity &
  PortfolioTradeNormalizedColumns;

export type PortfolioTrades = PortfolioTrade[];
