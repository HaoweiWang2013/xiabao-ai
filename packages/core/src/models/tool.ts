/**
 * Tool 领域模型
 *
 * ToolDescriptor = 可序列化的工具描述（给 Provider 用）
 * ToolImpl       = 带 execute 函数的工具实现（给 ToolService 用）
 */
import { z } from 'zod';

export const ToolDescriptorSchema = z.object({
  name: z.string().min(1).max(64),
  description: z.string().max(512).optional(),
  parameters: z.record(z.unknown()),
});
export type ToolDescriptor = z.infer<typeof ToolDescriptorSchema>;

export interface ToolImpl {
  readonly descriptor: ToolDescriptor;
  execute(args: Record<string, unknown>): Promise<unknown>;
}
