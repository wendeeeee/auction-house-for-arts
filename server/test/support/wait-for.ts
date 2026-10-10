import { setTimeout as sleep } from 'node:timers/promises';

export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: { timeoutMilliseconds?: number; description?: string } = {},
): Promise<void> {
  const deadline = Date.now() + (options.timeoutMilliseconds ?? 10_000);
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${options.description ?? 'a condition'}`);
    await sleep(25);
  }
}
