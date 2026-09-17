export type Queue = {
  /** Runs `task` once fewer than `limit` tasks are active; resolves/rejects with the task's
   * own outcome. Never lets more than `limit` tasks run concurrently. */
  run<T>(task: () => Promise<T>): Promise<T>;
};

/** A simple FIFO concurrency-limiting queue. Used to cap concurrent `postIntel` chip calls
 * from the X content script at 4. */
export function createQueue(limit: number): Queue {
  let activeCount = 0;
  const pending: (() => void)[] = [];

  function pump(): void {
    if (activeCount >= limit) return;
    const start = pending.shift();
    if (!start) return;
    activeCount++;
    start();
  }

  function run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      pending.push(() => {
        task().then(
          (value) => {
            activeCount--;
            resolve(value);
            pump();
          },
          (error) => {
            activeCount--;
            reject(error);
            pump();
          },
        );
      });
      pump();
    });
  }

  return { run };
}
