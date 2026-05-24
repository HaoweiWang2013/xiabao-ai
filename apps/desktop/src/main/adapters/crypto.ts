import { randomBytes, randomUUID } from 'node:crypto';

import type { CryptoPort } from '@xiabao/core';

export function createCryptoAdapter(): CryptoPort {
  return {
    randomBytes(length) {
      return Uint8Array.from(randomBytes(length));
    },
    uuid() {
      return randomUUID();
    },
  };
}
