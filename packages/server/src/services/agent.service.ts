import type {
  AgentEvent,
  AgentRunInput,
  AgentStep,
  AgentStepKind,
  ChatTurn,
  ClockPort,
  LoggerPort,
  ProviderToolSpec,
} from '@xiabao/core';

import type { AgentRepo, AuditRepo, ModelRepo } from '../repos';
import type { AgentStepRow } from '../db/schema/agentSteps';
import type { McpService } from './mcp.service';
import type { ProviderService } from './provider.service';
import type { ToolService } from './tool.service';

const MAX_STEPS = 20;

const DANGEROUS_BUILTIN_TOOLS = new Set(['run_shell', 'file_write']);

function rowToStep(row: AgentStepRow): AgentStep {
  return {
    id: row.id,
    runId: row.runId,
    seq: row.seq,
    kind: row.kind as AgentStepKind,
    content: row.content,
    toolName: row.toolName,
    toolArgs: row.toolArgs,
    toolResult: row.toolResult,
    durationMs: row.durationMs,
    tokensIn: row.tokensIn,
    tokensOut: row.tokensOut,
    createdAt: row.createdAt,
  };
}

export interface AgentServiceDeps {
  logger: LoggerPort;
  clock: ClockPort;
  providerService: ProviderService;
  toolService: ToolService;
  mcpService: McpService;
  repos: { agents: AgentRepo; models: ModelRepo; audit: AuditRepo };
}

interface ConfirmationWaiter {
  resolve: (approved: boolean) => void;
  reject: (err: Error) => void;
}

export function createAgentService(deps: AgentServiceDeps) {
  const { logger, clock, providerService, toolService, mcpService, repos } = deps;
  const models = repos.models;
  const log = logger.child({ mod: 'agent.service' });

  const activeRuns = new Map<string, AbortController>();
  const pendingConfirmations = new Map<string, ConfirmationWaiter>();
  const confirmedToolCache = new Map<string, Set<string>>();

  function buildToolSpecs(
    builtinTools: { name: string; description?: string; parameters: Record<string, unknown> }[],
    mcpTools: ProviderToolSpec[],
  ): ProviderToolSpec[] {
    return [...builtinTools, ...mcpTools];
  }

  async function executeToolCall(
    toolName: string,
    args: Record<string, unknown>,
    mcpServerIds: string[],
    runId: string,
  ): Promise<{ result: unknown; source: 'builtin' | 'mcp'; serverId?: string }> {
    const startTime = clock.now();
    const builtin = toolService.get(toolName);
    let result: unknown;
    let source: 'builtin' | 'mcp' = 'builtin';
    let serverId: string | undefined;

    try {
      if (builtin) {
        result = await toolService.execute(toolName, args);
        source = 'builtin';
      } else {
        for (const sid of mcpServerIds) {
          const tools = await mcpService.listTools(sid);
          const match = tools.find((t) => t.name === toolName);
          if (match) {
            result = await mcpService.executeTool(sid, toolName, args);
            source = 'mcp';
            serverId = sid;
            break;
          }
        }
        if (!source!) {
          throw new Error(`Tool not found: ${toolName}`);
        }
      }

      const durationMs = clock.now() - startTime;
      await repos.audit.create({
        runId,
        toolName,
        toolArgs: JSON.stringify(args),
        toolResult: JSON.stringify(result),
        source,
        serverId,
        durationMs,
        success: true,
      });

      return { result, source, serverId };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const durationMs = clock.now() - startTime;
      await repos.audit.create({
        runId,
        toolName,
        toolArgs: JSON.stringify(args),
        source: source ?? 'builtin',
        serverId,
        durationMs,
        success: false,
        error: errorMsg,
      });
      throw err;
    }
  }

  function isDangerousTool(toolName: string): boolean {
    return DANGEROUS_BUILTIN_TOOLS.has(toolName);
  }

  async function requestToolConfirmation(runId: string, toolName: string): Promise<boolean> {
    let cache = confirmedToolCache.get(runId);
    if (!cache) {
      cache = new Set();
      confirmedToolCache.set(runId, cache);
    }
    if (cache.has(toolName)) return true;

    return new Promise((resolve, reject) => {
      pendingConfirmations.set(runId, { resolve, reject });
    });
  }

  async function* runAgent(input: AgentRunInput, signal: AbortSignal): AsyncIterable<AgentEvent> {
    const run = await repos.agents.createRun({
      convId: input.convId,
      goal: input.goal,
      status: 'running',
    });

    const ac = new AbortController();
    activeRuns.set(run.id, ac);

    const combinedSignal = AbortSignal.any ? AbortSignal.any([signal, ac.signal]) : signal;

    yield { type: 'run-started', runId: run.id };

    try {
      const builtinTools = toolService.list();
      const allowedBuiltin = input.toolsAllowed
        ? builtinTools.filter((t) => input.toolsAllowed!.includes(t.name))
        : builtinTools;

      const enabledServers = await mcpService.listServers();
      const mcpServerIds = enabledServers.filter((s) => s.enabled).map((s) => s.id);
      const mcpToolSpecs = await mcpService.getAuthorizedToolSpecs(mcpServerIds);

      const allTools = buildToolSpecs(allowedBuiltin, mcpToolSpecs);

      let modelId = input.modelId;
      if (!modelId) {
        const providers = await providerService.list();
        for (const p of providers) {
          if (!p.enabled) continue;
          const pModels = await models.listByProvider(p.id);
          const toolModel = pModels.find((m) => m.enabled && m.capability?.tools);
          if (toolModel) {
            modelId = toolModel.id;
            break;
          }
          const anyModel = pModels.find((m) => m.enabled);
          if (anyModel && !modelId) modelId = anyModel.id;
        }
      }

      if (!modelId) {
        yield { type: 'error', runId: run.id, message: 'No model available for agent' };
        await repos.agents.updateRun(run.id, { status: 'error', endedAt: clock.now() });
        yield { type: 'run-ended', runId: run.id, status: 'error' };
        return;
      }

      const model = await models.findById(modelId);
      if (!model) {
        yield { type: 'error', runId: run.id, message: `Model not found: ${modelId}` };
        await repos.agents.updateRun(run.id, { status: 'error', endedAt: clock.now() });
        yield { type: 'run-ended', runId: run.id, status: 'error' };
        return;
      }

      const provider = await providerService.get(model.providerId);
      if (!provider) {
        yield { type: 'error', runId: run.id, message: `Provider not found: ${model.providerId}` };
        await repos.agents.updateRun(run.id, { status: 'error', endedAt: clock.now() });
        yield { type: 'run-ended', runId: run.id, status: 'error' };
        return;
      }

      const instance = await providerService.instantiate(provider);
      const modelName = modelId.includes(':') ? modelId.slice(modelId.indexOf(':') + 1) : modelId;

      const turns: ChatTurn[] = [
        {
          role: 'user',
          parts: [{ kind: 'text', text: input.goal }],
        },
      ];

      const systemPrompt = `You are an AI agent. Your goal is to help the user accomplish their task.
You have access to tools that you can use to gather information, perform actions, and more.
Think step by step, use tools when needed, and provide a clear final response.
When you have completed the task, provide your final answer without calling any more tools.`;

      let step = 0;
      let totalTokensIn = 0;
      let totalTokensOut = 0;

      while (step < MAX_STEPS) {
        if (combinedSignal.aborted) {
          await repos.agents.updateRun(run.id, {
            status: 'aborted',
            stepsCount: step,
            tokensTotal: totalTokensIn + totalTokensOut,
            endedAt: clock.now(),
          });
          yield { type: 'run-ended', runId: run.id, status: 'aborted' };
          return;
        }

        const thinkStep = await repos.agents.insertStep({
          runId: run.id,
          seq: step,
          kind: 'think',
        });
        step++;

        let buffer = '';
        let reasoningBuffer = '';
        const toolCalls = new Map<string, { toolName: string; argsJson: string; done: boolean }>();
        let finishReason: string | undefined;
        let tokensIn = 0;
        let tokensOut = 0;

        try {
          const stream = instance.chat({
            modelName,
            turns,
            systemPrompt,
            tools: allTools.length > 0 ? allTools : undefined,
            signal: combinedSignal,
          });

          for await (const chunk of stream) {
            if (combinedSignal.aborted) break;

            if (chunk.delta) {
              buffer += chunk.delta;
              yield { type: 'delta', runId: run.id, text: chunk.delta };
            }
            if (chunk.reasoningDelta) {
              reasoningBuffer += chunk.reasoningDelta;
            }
            if (chunk.toolCall) {
              toolCalls.set(chunk.toolCall.toolCallId, {
                toolName: chunk.toolCall.toolName,
                argsJson: chunk.toolCall.argsJson,
                done: chunk.toolCall.done,
              });
              if (chunk.toolCall.done) {
                yield {
                  type: 'tool-call',
                  runId: run.id,
                  toolCallId: chunk.toolCall.toolCallId,
                  toolName: chunk.toolCall.toolName,
                  argsJson: chunk.toolCall.argsJson,
                };
              }
            }
            if (chunk.finish) {
              finishReason = chunk.finish.reason;
              tokensIn = chunk.finish.tokensIn ?? 0;
              tokensOut = chunk.finish.tokensOut ?? 0;
              totalTokensIn += tokensIn;
              totalTokensOut += tokensOut;
            }
          }
        } catch (err) {
          if (combinedSignal.aborted) break;
          const errMsg = err instanceof Error ? err.message : String(err);
          await repos.agents.updateStep(thinkStep.id, {
            content: buffer || reasoningBuffer || null,
            durationMs: clock.now() - thinkStep.createdAt,
            tokensIn,
            tokensOut,
          });
          yield { type: 'error', runId: run.id, message: errMsg };
          await repos.agents.updateRun(run.id, {
            status: 'error',
            stepsCount: step,
            tokensTotal: totalTokensIn + totalTokensOut,
            endedAt: clock.now(),
          });
          yield { type: 'run-ended', runId: run.id, status: 'error' };
          return;
        }

        await repos.agents.updateStep(thinkStep.id, {
          content: buffer || reasoningBuffer || null,
          durationMs: clock.now() - thinkStep.createdAt,
          tokensIn,
          tokensOut,
        });

        yield {
          type: 'step',
          runId: run.id,
          step: rowToStep({
            ...thinkStep,
            content: buffer || reasoningBuffer || null,
            durationMs: clock.now() - thinkStep.createdAt,
            tokensIn,
            tokensOut,
          }),
        };

        if (finishReason !== 'tool_calls' || toolCalls.size === 0) {
          const respondStep = await repos.agents.insertStep({
            runId: run.id,
            seq: step,
            kind: 'respond',
            content: buffer,
            tokensIn,
            tokensOut,
          });
          step++;
          yield { type: 'step', runId: run.id, step: rowToStep(respondStep) };

          await repos.agents.updateRun(run.id, {
            status: 'done',
            stepsCount: step,
            tokensTotal: totalTokensIn + totalTokensOut,
            endedAt: clock.now(),
          });
          yield { type: 'run-ended', runId: run.id, status: 'done' };
          return;
        }

        const assistantParts: ChatTurn['parts'] = [];
        if (reasoningBuffer) assistantParts.push({ kind: 'reasoning', text: reasoningBuffer });
        if (buffer) assistantParts.push({ kind: 'text', text: buffer });
        for (const [tcId, tc] of toolCalls) {
          assistantParts.push({
            kind: 'tool-call',
            toolName: tc.toolName,
            toolCallId: tcId,
            argsJson: tc.argsJson,
          });
        }
        turns.push({ role: 'assistant', parts: assistantParts });

        const toolResultParts: ChatTurn['parts'] = [];
        for (const [tcId, tc] of toolCalls) {
          if (!tc.done) continue;
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.argsJson);
          } catch {
            /* keep {} */
          }

          if (input.workDir) {
            args = { ...args, _workDir: input.workDir };
          }

          if (isDangerousTool(tc.toolName)) {
            yield {
              type: 'confirm-tool',
              runId: run.id,
              toolCallId: tcId,
              toolName: tc.toolName,
              argsJson: tc.argsJson,
            };

            let approved = false;
            try {
              approved = await requestToolConfirmation(run.id, tc.toolName);
            } catch {
              approved = false;
            }

            if (!approved) {
              const denyMsg = `Tool "${tc.toolName}" was denied by user`;
              toolResultParts.push({
                kind: 'tool-result',
                toolName: tc.toolName,
                toolCallId: tcId,
                resultJson: JSON.stringify({ error: denyMsg }),
              });
              yield {
                type: 'tool-result',
                runId: run.id,
                toolCallId: tcId,
                toolName: tc.toolName,
                resultJson: JSON.stringify({ error: denyMsg }),
              };
              continue;
            }

            const cache = confirmedToolCache.get(run.id);
            if (cache) cache.add(tc.toolName);
          }

          const toolStep = await repos.agents.insertStep({
            runId: run.id,
            seq: step,
            kind: 'tool',
            toolName: tc.toolName,
            toolArgs: tc.argsJson,
          });
          step++;

          let resultJson: string;
          let toolSource: 'builtin' | 'mcp' = 'builtin';
          let toolServerId: string | undefined;
          try {
            const execResult = await executeToolCall(tc.toolName, args, mcpServerIds, run.id);
            resultJson = JSON.stringify(execResult.result);
            toolSource = execResult.source;
            toolServerId = execResult.serverId;
          } catch (err) {
            resultJson = JSON.stringify({
              error: err instanceof Error ? err.message : String(err),
            });
          }

          await repos.agents.updateStep(toolStep.id, {
            toolResult: resultJson,
            source: toolSource,
            serverId: toolServerId ?? null,
            durationMs: clock.now() - toolStep.createdAt,
          });

          yield {
            type: 'tool-result',
            runId: run.id,
            toolCallId: tcId,
            toolName: tc.toolName,
            resultJson,
          };

          yield {
            type: 'step',
            runId: run.id,
            step: rowToStep({ ...toolStep, toolResult: resultJson }),
          };

          toolResultParts.push({
            kind: 'tool-result',
            toolName: tc.toolName,
            toolCallId: tcId,
            resultJson,
          });
        }

        turns.push({ role: 'tool', parts: toolResultParts });
      }

      await repos.agents.updateRun(run.id, {
        status: 'done',
        stepsCount: step,
        tokensTotal: totalTokensIn + totalTokensOut,
        endedAt: clock.now(),
      });
      yield { type: 'run-ended', runId: run.id, status: 'done' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('agent run failed', { runId: run.id, error: msg });
      await repos.agents.updateRun(run.id, {
        status: 'error',
        endedAt: clock.now(),
      });
      yield { type: 'error', runId: run.id, message: msg };
      yield { type: 'run-ended', runId: run.id, status: 'error' };
    } finally {
      activeRuns.delete(run.id);
      pendingConfirmations.delete(run.id);
      confirmedToolCache.delete(run.id);
    }
  }

  return {
    async *run(input: AgentRunInput, signal: AbortSignal): AsyncIterable<AgentEvent> {
      yield* runAgent(input, signal);
    },

    abort(runId: string): void {
      const ac = activeRuns.get(runId);
      if (ac) {
        ac.abort();
        activeRuns.delete(runId);
      }
    },

    confirmTool(runId: string, approved: boolean): void {
      const waiter = pendingConfirmations.get(runId);
      if (waiter) {
        pendingConfirmations.delete(runId);
        waiter.resolve(approved);
      }
    },

    async list(limit = 50) {
      return repos.agents.listRuns({ limit });
    },

    async getRun(runId: string) {
      return repos.agents.getRun(runId);
    },

    async stepsByRun(runId: string) {
      return repos.agents.listSteps(runId);
    },
  };
}

export type AgentService = ReturnType<typeof createAgentService>;
