import type { ClockPort } from '@xiabao/core';

export function createWebClockAdapter(): ClockPort {
  return {
    now: () => Date.now(),
  };
}
