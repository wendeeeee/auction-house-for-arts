/** 500 → "5%", 750 → "7.5%". Display only; money math stays on the server, in integers. */
export function formatBasisPointsAsPercent(basisPoints: number): string {
  return `${basisPoints / 100}%`;
}
