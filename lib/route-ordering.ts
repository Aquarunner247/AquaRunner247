/**
 * Pure route-sequencing logic, decoupled from where the pairwise costs come from (real
 * driving duration via OSRM's /table service, or a straight-line haversine fallback — see
 * lib/routing.ts) so it's unit-testable without a network call. No Prisma import, same
 * reason lib/dosing-units.ts and lib/inspection-report-detection.ts are kept dependency-free.
 */

/**
 * Nearest-neighbor construction followed by a 2-opt local-search improvement pass, over an
 * arbitrary NxN pairwise cost matrix. The algorithm doesn't care whether costMatrix[i][j] is
 * drive-time seconds or straight-line miles — same ordering logic either way.
 *
 * Index 0 is always kept as the tour's starting point (matches the existing behavior this
 * replaces: whichever stop is first in the caller's array stays first, only the *rest* get
 * reordered) — 2-opt never considers a reversal that would move it out of that slot.
 *
 * Returns the visiting order as indices into the original costMatrix/points array.
 */
export function orderByNearestNeighborWithTwoOpt(costMatrix: number[][]): number[] {
  const n = costMatrix.length;
  if (n < 2) return costMatrix.map((_, i) => i);

  const visited = new Array(n).fill(false);
  const order = [0];
  visited[0] = true;
  for (let step = 1; step < n; step++) {
    const last = order[order.length - 1];
    let best = -1;
    let bestCost = Infinity;
    for (let j = 0; j < n; j++) {
      if (visited[j] || j === last) continue;
      if (costMatrix[last][j] < bestCost) {
        bestCost = costMatrix[last][j];
        best = j;
      }
    }
    order.push(best);
    visited[best] = true;
  }

  const totalCost = (seq: number[]) => {
    let sum = 0;
    for (let i = 0; i < seq.length - 1; i++) sum += costMatrix[seq[i]][seq[i + 1]];
    return sum;
  };

  // Bounded to a handful of full passes -- a day's route is small (rarely more than ~30-40
  // stops), so this converges almost immediately and never risks a long-running loop. `i`
  // starts at 1, never 0, so the fixed starting stop can never be reversed out of place.
  let improved = true;
  let passes = 0;
  while (improved && passes < 25) {
    improved = false;
    passes++;
    for (let i = 1; i < order.length - 1; i++) {
      for (let k = i + 1; k < order.length; k++) {
        const reversed = [...order.slice(0, i), ...order.slice(i, k + 1).reverse(), ...order.slice(k + 1)];
        if (totalCost(reversed) < totalCost(order) - 1e-9) {
          order.splice(0, order.length, ...reversed);
          improved = true;
        }
      }
    }
  }

  return order;
}
