import { GetPortfolioClosedPositionsQueryDto } from '../dto/get-portfolio-closed-positions.query.dto';
import { PortfolioClosedPosition } from '../types/portfolio-closed-position.type';

export function sortClosedPortfolioPositions(
  positions: PortfolioClosedPosition[],
  query: GetPortfolioClosedPositionsQueryDto,
): PortfolioClosedPosition[] {
  if (query.sort_by) {
    const key = query.sort_by;
    const direction = (query.sort_dir ?? 'desc') === 'asc' ? 1 : -1;

    return [...positions].sort((a, b) => {
      const aValue = a[key];
      const bValue = b[key];

      if (aValue < bValue) {
        return -1 * direction;
      }

      if (aValue > bValue) {
        return 1 * direction;
      }

      return 0;
    });
  }

  const categoryRealizedPnl = new Map<string, number>();

  for (const position of positions) {
    const runningTotal = categoryRealizedPnl.get(position.category) ?? 0;
    categoryRealizedPnl.set(
      position.category,
      runningTotal + position.realized_pnl,
    );
  }

  return [...positions].sort((a, b) => {
    const categoryDiff =
      (categoryRealizedPnl.get(b.category) ?? 0) -
      (categoryRealizedPnl.get(a.category) ?? 0);

    if (categoryDiff !== 0) {
      return categoryDiff;
    }

    return b.realized_pnl - a.realized_pnl;
  });
}
