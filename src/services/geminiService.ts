/// <reference types="vite/client" />

import {
  GoogleGenAI,
  Modality,
  type LiveServerMessage,
} from '@google/genai';

import { type ChatMessage, Plan } from '../types';
import { createBlob, decode, decodeAudioData } from '../../utils/audio';
import { authenticatedFetch } from './apiClient';

const TEXT_MODEL = 'gemini-2.5-flash';
const VOICE_MODEL = 'gemini-live-2.5-flash-preview';
const API_BASE = String(import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '');

const apiUrl = (path: string): string => `${API_BASE}${path}`;

const getBaseSystemInstruction = (plan: Plan) => `
Eres ChatMig, un asistente migratorio conversacional.
Habla principalmente en el idioma del usuario, por defecto español neutro.
Sé profesional, claro y directo. No garantices aprobaciones.
No sustituyes asesoría legal profesional.
Plan actual: "${plan}".
`;

const getVoiceSystemInstruction = (plan: Plan) => `
${getBaseSystemInstruction(plan)}
Eres un agente de voz. Responde de forma concisa, natural y conversacional.
No uses Markdown ni bloques JSON en voz.
`;

interface ChatApiUsage {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
}

interface ChatApiResponse {
  text?: string;
  model?: string;
  usageMetadata?: ChatApiUsage | null;
  error?: string;
  tokensRemaining?: number | null;
}

export interface ChatStreamChunk {
  text: string;
  usageMetadata?: ChatApiUsage | null;
  tokensRemaining?: number | null;
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();

  if (!text) {
    return {} as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Respuesta inválida del servidor (HTTP ${response.status}).`);
  }
}

export const runChatStream = async (
  chatHistory: ChatMessage[],
  plan: Plan,
): Promise<AsyncGenerator<ChatStreamChunk>> => {
  const response = await authenticatedFetch(apiUrl('/api/gemini'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: chatHistory,
      plan,
      model: TEXT_MODEL,
    }),
  });

  const data = await readJsonResponse<ChatApiResponse>(response);

  if (!response.ok) {
    throw new Error(data.error || `Gemini backend HTTP ${response.status}.`);
  }

  const text = data.text?.trim();
  if (!text) {
    throw new Error('Gemini no devolvió contenido.');
  }

  async function* singleResponse(): AsyncGenerator<ChatStreamChunk> {
    yield {
      text,
      usageMetadata: data.usageMetadata ?? null,
      tokensRemaining: data.tokensRemaining ?? null,
    };
  }

  return singleResponse();
};

interface VoiceAgentCallbacks {
  onOpen: () => void;
  onUserTranscription: (text: string) => void;
  onModelTranscription: (text: string) => void;
  onModelSpeaking: (isSpeaking: boolean) => void;
  onTurnComplete: () => void;
  onError: (error: unknown) => void;
  onClose: () => void;
}

interface EphemeralTokenResponse {
  token?: string;
  error?: string;
}

async function getLiveClient(): Promise<GoogleGenAI> {
  const response = await authenticatedFetch(apiUrl('/api/gemini-ephemeral-token'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: '{}',
  });

  const data = await readJsonResponse<EphemeralTokenResponse>(response);

  if (!response.ok || !data.token) {
    throw new Error(data.error || `Gemini Live token HTTP ${response.status}.`);
  }

  return new GoogleGenAI({
    apiKey: data.token,
    httpOptions: { apiVersion: 'v1alpha' },
  });
}

export const connectToVoiceAgent = async (
  callbacks: VoiceAgentCallbacks,
  plan: Plan,
): Promise<unknown> => {
  const client = await getLiveClient();

  const AudioContextConstructor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!AudioContextConstructor) {
    throw new Error('AudioContext no está disponible en este navegador.');
  }

  const outputAudioContext = new AudioContextConstructor({ sampleRate: 24000 });
  let nextStartTime = 0;
  const sources = new Set<AudioBufferSourceNode>();

  const sessionPromise = client.live.connect({
    model: VOICE_MODEL,
    config: {
      responseModalities: [Modality.AUDIO],
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      systemInstruction: getVoiceSystemInstruction(plan),
    },
    callbacks: {
      onopen: async () => {
        callbacks.onOpen();

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const inputAudioContext = new AudioContextConstructor({ sampleRate: 16000 });
        const source = inputAudioContext.createMediaStreamSource(stream);
        const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);

        scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
          const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
          const pcmBlob = createBlob(inputData);

          sessionPromise.then((session) => {
            session.sendRealtimeInput({ media: pcmBlob });
          }).catch((error: unknown) => callbacks.onError(error));
        };

        source.connect(scriptProcessor);
        scriptProcessor.connect(inputAudioContext.destination);
      },

      onmessage: async (message: LiveServerMessage) => {
        const parts = message.serverContent?.modelTurn?.parts;
        const base64Audio = parts?.[0]?.inlineData?.data;

        if (base64Audio) {
          callbacks.onModelSpeaking(true);
          nextStartTime = Math.max(nextStartTime, outputAudioContext.currentTime);

          const audioBuffer = await decodeAudioData(
            decode(base64Audio),
            outputAudioContext,
            24000,
            1,
          );

          const source = outputAudioContext.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(outputAudioContext.destination);

          source.addEventListener('ended', () => {
            sources.delete(source);
            if (sources.size === 0) callbacks.onModelSpeaking(false);
          });

          source.start(nextStartTime);
          nextStartTime += audioBuffer.duration;
          sources.add(source);
        }

        const inputText = message.serverContent?.inputTranscription?.text;
        if (inputText) callbacks.onUserTranscription(inputText);

        const outputText = message.serverContent?.outputTranscription?.text;
        if (outputText) callbacks.onModelTranscription(outputText);

        if (message.serverContent?.turnComplete) {
          callbacks.onTurnComplete();
        }
      },

      onerror: (event: ErrorEvent) => callbacks.onError(event.error ?? event),
      onclose: () => callbacks.onClose(),
    },
  });

  return sessionPromise;
};
