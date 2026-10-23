/// <reference types="vite/client" />

import {
  GoogleGenAI,
  Modality,
  LiveServerMessage,
} from '@google/genai';

import { ChatMessage, Plan } from '../types';
import { createBlob, decode, decodeAudioData } from '../../utils/audio';

interface ChatApiResponse {
  text?: string;
  model?: string;
  usageMetadata?: unknown;
  error?: string;
  code?: string;
}

interface ChatChunk {
  text: string;
  usageMetadata?: unknown;
}

interface VoiceTokenResponse {
  token?: string;
  model?: string;
  apiVersion?: string;
  error?: string;
}

const getVoiceSystemInstruction = (plan: Plan) => `
Eres ChatMig, un asistente migratorio conversacional.
Habla principalmente en el idioma del usuario, por defecto español neutro.
Sé profesional, cercano, claro y conciso.
No garantices aprobaciones ni sustituyas asesoría legal profesional.
Adapta la profundidad al plan "${plan}".
`;

export async function* runChatStream(
  chatHistory: ChatMessage[],
  plan: Plan,
): AsyncGenerator<ChatChunk> {
  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: chatHistory,
      plan,
    }),
  });

  const data = (await response.json().catch(() => ({}))) as ChatApiResponse;

  if (!response.ok) {
    throw new Error(
      data.error ||
        `Gemini backend respondió HTTP ${response.status}`,
    );
  }

  const text = typeof data.text === 'string' ? data.text.trim() : '';

  if (!text) {
    throw new Error('Gemini devolvió una respuesta vacía.');
  }

  yield {
    text,
    usageMetadata: data.usageMetadata,
  };
}

interface VoiceAgentCallbacks {
  onOpen: () => void;
  onUserTranscription: (text: string) => void;
  onModelTranscription: (text: string) => void;
  onModelSpeaking: (isSpeaking: boolean) => void;
  onTurnComplete: () => void;
  onError: (error: unknown) => void;
  onClose: () => void;
}

async function getLiveClient(): Promise<{
  client: GoogleGenAI;
  model: string;
}> {
  const response = await fetch('/api/gemini-ephemeral-token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  const data = (await response.json().catch(() => ({}))) as VoiceTokenResponse;

  if (!response.ok || !data.token) {
    throw new Error(
      data.error ||
        `No se pudo obtener el token efímero de Gemini (HTTP ${response.status}).`,
    );
  }

  const client = new GoogleGenAI({
    apiKey: data.token,
    httpOptions: {
      apiVersion: 'v1alpha',
    },
  });

  return {
    client,
    model: data.model || 'gemini-3.8-live',
  };
}

export const connectToVoiceAgent = async (
  callbacks: VoiceAgentCallbacks,
  plan: Plan,
): Promise<any> => {
  const { client, model } = await getLiveClient();

  const AudioContextCtor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!AudioContextCtor) {
    throw new Error('AudioContext no está disponible en este navegador.');
  }

  const outputAudioContext = new AudioContextCtor({ sampleRate: 24000 });
  let nextStartTime = 0;
  const sources = new Set<AudioBufferSourceNode>();
  let inputStream: MediaStream | null = null;
  let inputAudioContext: AudioContext | null = null;

  const sessionPromise = client.live.connect({
    model,
    config: {
      responseModalities: [Modality.AUDIO],
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      systemInstruction: getVoiceSystemInstruction(plan),
    },
    callbacks: {
      onopen: async () => {
        callbacks.onOpen();

        try {
          inputStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          inputAudioContext = new AudioContextCtor({ sampleRate: 16000 });

          const source = inputAudioContext.createMediaStreamSource(inputStream);
          const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);

          scriptProcessor.onaudioprocess = (event) => {
            const inputData = event.inputBuffer.getChannelData(0);
            const pcmBlob = createBlob(inputData);

            sessionPromise
              .then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              })
              .catch(callbacks.onError);
          };

          source.connect(scriptProcessor);
          scriptProcessor.connect(inputAudioContext.destination);
        } catch (error) {
          callbacks.onError(error);
        }
      },

      onmessage: async (message: LiveServerMessage) => {
        const modelTurn = message.serverContent?.modelTurn;
        const parts = modelTurn?.parts;
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

      onerror: (error: ErrorEvent) => callbacks.onError(error),

      onclose: () => {
        inputStream?.getTracks().forEach((track) => track.stop());
        void inputAudioContext?.close();
        void outputAudioContext.close();
        callbacks.onClose();
      },
    },
  });

  return sessionPromise;
};
