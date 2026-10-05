import { vi } from "vitest";

/** Queues Math.random() return values so each `rollDie(sides)` (1 + floor(r * sides)) lands on
 * the given face. Values past the queue fall through to `fallback`. */
export function queueDice(sides: number, faces: number[], fallback = 0): void {
  const spy = vi.spyOn(Math, "random").mockReturnValue(fallback);
  for (const face of faces) spy.mockReturnValueOnce((face - 0.5) / sides);
}
