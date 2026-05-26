import path from 'node:path';

import type { ClockPort, FilePort, LoggerPort } from '@xiabao/core';

import type { ProviderService } from './provider.service';
import type { VoiceRepo } from '../repos';

export interface VoiceTranscribeInput {
  audioBase64: string;
  modelId: string;
  convId?: string;
  language?: string;
}

export interface VoiceSynthesizeInput {
  text: string;
  modelId: string;
  convId?: string;
  voice?: string;
  speed?: number;
  format?: string;
}

export interface VoiceServiceDeps {
  logger: LoggerPort;
  clock: ClockPort;
  file: FilePort;
  providerService: ProviderService;
  repos: { voice: VoiceRepo };
}

export function createVoiceService(deps: VoiceServiceDeps) {
  const { logger, clock, file, providerService, repos } = deps;
  const log = logger.child({ mod: 'voice.service' });

  async function saveAudioToDisk(id: string, bytes: Uint8Array, ext: string): Promise<string> {
    const userDataDir = await file.getUserDataPath();
    const audioDir = path.join(userDataDir, 'audio');
    const filePath = path.join(audioDir, `${id}.${ext}`);
    await file.writeFile(filePath, bytes);
    return filePath;
  }

  function base64ToBytes(b64: string): Uint8Array {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  return {
    async transcribe(input: VoiceTranscribeInput) {
      const provider = await providerService.get(input.modelId);
      if (!provider) throw new Error(`Provider not found for model: ${input.modelId}`);

      const instance = await providerService.instantiate(provider);
      if (typeof instance.stt !== 'function') {
        throw new Error(`Provider ${provider.kind} does not support STT`);
      }

      const created = await repos.voice.createTranscription({
        convId: input.convId,
        modelId: input.modelId,
        status: 'running',
        audioFormat: 'webm',
      });

      let audioBytes: Uint8Array;
      try {
        audioBytes = base64ToBytes(input.audioBase64);
      } catch {
        await repos.voice.updateTranscription(created.id, {
          status: 'error',
          error: 'Invalid base64 audio data',
        });
        throw new Error('Invalid base64 audio data');
      }

      await saveAudioToDisk(created.id, audioBytes, 'webm');

      const modelName = input.modelId.includes(':')
        ? input.modelId.slice(input.modelId.indexOf(':') + 1)
        : input.modelId;

      const startedAt = clock.now();
      try {
        const result = await instance.stt(audioBytes, {
          model: modelName,
          language: input.language,
        });

        const durationMs = clock.now() - startedAt;
        await repos.voice.updateTranscription(created.id, {
          status: 'done',
          text: result.text,
          language: result.language,
          durationMs,
        });

        log.info('transcription completed', { id: created.id, durationMs });
        return { id: created.id, text: result.text, language: result.language };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        await repos.voice.updateTranscription(created.id, {
          status: 'error',
          error: errorMsg,
          durationMs: clock.now() - startedAt,
        });
        log.error('transcription failed', { id: created.id, error: errorMsg });
        throw err;
      }
    },

    async synthesize(input: VoiceSynthesizeInput) {
      const provider = await providerService.get(input.modelId);
      if (!provider) throw new Error(`Provider not found for model: ${input.modelId}`);

      const instance = await providerService.instantiate(provider);
      if (typeof instance.tts !== 'function') {
        throw new Error(`Provider ${provider.kind} does not support TTS`);
      }

      const format = input.format ?? 'mp3';
      const created = await repos.voice.createSynthesis({
        convId: input.convId,
        modelId: input.modelId,
        inputText: input.text,
        status: 'running',
        voice: input.voice,
        speed: input.speed,
        audioFormat: format,
      });

      const modelName = input.modelId.includes(':')
        ? input.modelId.slice(input.modelId.indexOf(':') + 1)
        : input.modelId;

      const startedAt = clock.now();
      try {
        const result = await instance.tts({
          model: modelName,
          text: input.text,
          voice: input.voice,
          speed: input.speed,
          format,
        });

        let audioPath: string | undefined;
        try {
          audioPath = await saveAudioToDisk(created.id, result.audioBytes, format);
        } catch (err) {
          log.warn('tts audio save failed', { id: created.id, err: (err as Error).message });
        }

        const durationMs = clock.now() - startedAt;
        await repos.voice.updateSynthesis(created.id, {
          status: 'done',
          audioPath: audioPath ?? undefined,
          durationMs,
        });

        log.info('synthesis completed', { id: created.id, durationMs });
        return { id: created.id, audioPath };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        await repos.voice.updateSynthesis(created.id, {
          status: 'error',
          error: errorMsg,
          durationMs: clock.now() - startedAt,
        });
        log.error('synthesis failed', { id: created.id, error: errorMsg });
        throw err;
      }
    },

    async listTranscriptions(limit = 50, offset = 0) {
      return repos.voice.listTranscriptions({ limit, offset });
    },

    async listSyntheses(limit = 50, offset = 0) {
      return repos.voice.listSyntheses({ limit, offset });
    },
  };
}

export type VoiceService = ReturnType<typeof createVoiceService>;
