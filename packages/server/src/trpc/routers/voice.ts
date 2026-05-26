import { z } from 'zod';

import { procedure, router } from '../trpc';

export const voiceRouter = router({
  stt: procedure
    .input(
      z.object({
        audioBase64: z.string().min(1),
        modelId: z.string().min(1),
        convId: z.string().optional(),
        language: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.services.voice.transcribe(input);
      return result;
    }),

  tts: procedure
    .input(
      z.object({
        text: z.string().min(1),
        modelId: z.string().min(1),
        convId: z.string().optional(),
        voice: z.string().optional(),
        speed: z.number().min(0.25).max(4).optional(),
        format: z.enum(['mp3', 'opus', 'aac', 'flac']).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.services.voice.synthesize(input);
      return result;
    }),

  listTranscriptions: procedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
      }),
    )
    .query(({ ctx, input }) => ctx.services.voice.listTranscriptions(input.limit, input.offset)),

  listSyntheses: procedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
      }),
    )
    .query(({ ctx, input }) => ctx.services.voice.listSyntheses(input.limit, input.offset)),
});
