/**
 * @xiabao/core · 平台无关的业务层
 *
 * 这是一个纯 TypeScript 包，禁止 import 任何平台 API
 * (electron / react-native / window.* / fs / path ...)。
 *
 * 所有 I/O 通过 Port 接口注入，平台侧（apps/*）负责提供 Adapter。
 */

export * from './version';
export * from './ports';
export * from './models';
export * from './errors';
export * from './providers';
export * from './text';
export * from './embedding';
export * from './vec';
export * from './chat';

// Service 层（chat/provider/conversation orchestration）在后续 M1 子阶段接入。
