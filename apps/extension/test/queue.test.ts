import { describe, expect, it } from "vitest";
import { createQueue } from "../lib/x/queue";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("createQueue", () => {
  it("never runs more than `limit` tasks concurrently", async () => {
    const limit = 4;
    const queue = createQueue(limit);
    let active = 0;
    let maxActive = 0;

    const tasks = Array.from({ length: 20 }, (_, i) =>
      queue.run(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await delay(5 + (i % 3));
        active--;
        return i;
      }),
    );

    const results = await Promise.all(tasks);

    expect(maxActive).toBeLessThanOrEqual(limit);
    expect(maxActive).toBeGreaterThan(1); // sanity: tasks really did overlap
    expect(results).toEqual(Array.from({ length: 20 }, (_, i) => i));
  });

  it("propagates a rejected task's error to its caller without blocking later tasks", async () => {
    const queue = createQueue(2);
    const boom = queue.run(async () => {
      throw new Error("boom");
    });
    const ok = queue.run(async () => "ok");

    await expect(boom).rejects.toThrow("boom");
    await expect(ok).resolves.toBe("ok");
  });

  it("runs tasks serially when limit is 1", async () => {
    const queue = createQueue(1);
    const order: number[] = [];

    await Promise.all(
      [3, 1, 2].map((ms, i) =>
        queue.run(async () => {
          order.push(i);
          await delay(ms);
        }),
      ),
    );

    expect(order).toEqual([0, 1, 2]);
  });
});
