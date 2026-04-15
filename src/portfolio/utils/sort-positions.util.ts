import { GetPortfolioPositionsQueryDto } from '../dto/get-portfolio-positions.query.dto';
import { PortfolioPosition } from '../types/portfolio-position.type';

export function sortPortfolioPositions(
  positions: PortfolioPosition[],
  query: GetPortfolioPositionsQueryDto,
): PortfolioPosition[] {
  if (query.sort_by) {
    const key = query.sort_by;
    const direction = (query.sort_dir ?? 'desc') === 'asc' ? 1 : -1;

    return [...positions].sort((a, b) => {
      const aValue = a[key] as string | number;
      const bValue = b[key] as string | number;

      if (aValue < bValue) {
        return -1 * direction;
      }

      if (aValue > bValue) {
        return 1 * direction;
      }

      return 0;
    });
  }

  const categoryExposure = new Map<string, number>();

  for (const position of positions) {
    const runningTotal = categoryExposure.get(position.category) ?? 0;
    categoryExposure.set(position.category, runningTotal + position.exposure);
  }

  return [...positions].sort((a, b) => {
    const categoryDiff =
      (categoryExposure.get(b.category) ?? 0) -
      (categoryExposure.get(a.category) ?? 0);

    if (categoryDiff !== 0) {
      return categoryDiff;
    }

    return b.exposure - a.exposure;
  });
}
