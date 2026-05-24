/**
 * tRPC Context：把 DesktopContainer.services 注入每次请求
 */
import type { Services } from '../services';

export interface TrpcContext {
  services: Services;
}

export interface ContextFactoryDeps {
  services: Services;
}

export function createContextFactory({ services }: ContextFactoryDeps) {
  return function createContext(): Promise<TrpcContext> {
    return Promise.resolve({ services });
  };
}
