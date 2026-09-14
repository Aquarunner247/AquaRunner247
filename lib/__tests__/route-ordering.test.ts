import { describe, it, expect } from "vitest";
import { orderByNearestNeighborWithTwoOpt } from "@/lib/route-ordering";

describe("orderByNearestNeighborWithTwoOpt", () => {
  it("returns trivial orders for 0 or 1 points", () => {
    expect(orderByNearestNeighborWithTwoOpt([])).toEqual([]);
    expect(orderByNearestNeighborWithTwoOpt([[0]])).toEqual([0]);
  });

  it("keeps point 0 as the fixed starting stop", () => {
    // A layout where nearest-neighbor from 0 would visit 1, 2 in some order -- point 0
    // must always lead regardless.
    const matrix = [
      [0, 5, 1],
      [5, 0, 4],
      [1, 4, 0],
    ];
    const order = orderByNearestNeighborWithTwoOpt(matrix);
    expect(order[0]).toBe(0);
    expect(order).toHaveLength(3);
    expect(new Set(order)).toEqual(new Set([0, 1, 2]));
  });

  it("picks the nearest-neighbor order on a simple asymmetric case", () => {
    // 0 -> 2 is much cheaper than 0 -> 1, so 2 should be visited immediately after 0.
    const matrix = [
      [0, 100, 1],
      [100, 0, 100],
      [1, 100, 0],
    ];
    expect(orderByNearestNeighborWithTwoOpt(matrix)).toEqual([0, 2, 1]);
  });

  it("2-opt fixes a case where nearest-neighbor's greedy first pick is wrong", () => {
    // Four points on a line: start at 0, plus 1, -1, and 3 (indices 0..3). Nearest-neighbor
    // from 0 greedily picks 1 over -1 (tied distance, first found wins), then gets stuck
    // needing a long final hop to -1 -- total 1+2+4=7. The actual optimal fixed-start tour
    // is 0 -> -1 -> 1 -> 3 (cost 1+2+2=5), which only a 2-opt pass finds.
    const pos = [0, 1, -1, 3];
    const matrix = pos.map((a) => pos.map((b) => Math.abs(a - b)));
    const order = orderByNearestNeighborWithTwoOpt(matrix);
    const totalCost = order.slice(0, -1).reduce((sum, node, i) => sum + matrix[node][order[i + 1]], 0);
    expect(order).toEqual([0, 2, 1, 3]);
    expect(totalCost).toBe(5);
  });

  it("matches the brute-force optimal fixed-start tour on a small case", () => {
    const matrix = [
      [0, 2, 9, 10],
      [2, 0, 4, 8],
      [9, 4, 0, 3],
      [10, 8, 3, 0],
    ];
    const order = orderByNearestNeighborWithTwoOpt(matrix);
    const cost = order.slice(0, -1).reduce((sum, node, i) => sum + matrix[node][order[i + 1]], 0);
    // Brute-forced by hand across all 6 fixed-start permutations of {1,2,3}: 9 is the
    // minimum (the plain nearest-neighbor construction already happens to find it here).
    expect(cost).toBe(9);
  });
});
