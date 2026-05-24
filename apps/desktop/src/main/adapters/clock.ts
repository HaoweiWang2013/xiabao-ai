import type { ClockPort } from '@xiabao/core';

export function createClockAdapter(): ClockPort {
  return {
    now: () => Date.now(),
  };
}
