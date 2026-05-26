/**
 * tRPC Context：把 DesktopContainer.services + repos 注入每次请求
 */
import type { Services } from '../services';
import type { Repos } from '../repos';

export interface TrpcContext {
  services: Services;
  repos: Repos;
}

export interface ContextFactoryDeps {
  services: Services;
  repos: Repos;
}

export function createContextFactory({ services, repos }: ContextFactoryDeps) {
  return function createContext(): Promise<TrpcContext> {
    return Promise.resolve({ services, repos });
  };
}
