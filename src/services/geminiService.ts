/// <reference types="vite/client" />

import {
  GoogleGenAI,
  Modality,
  type LiveServerMessage,
} from '@google/genai';
import { supabase } from './supabaseClient';
import { type ChatMessage, Plan } from '../types';
import { createBlob, decode, decodeAudioData } from '../../utils/audio';

interface ChatApiResponse {
  text?: string;
  model?: string;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  } | null;
  quota?: {
    enforced?: boolean;
    remaining?: number | null;
  };
  error?: string;
  code?: string;
}

interface ChatChunk {
  text: string;
  usageMetadata?: ChatApiResponse['usageMetadata'];
  quotaRemaining?: number | null;
}

interface VoiceTokenResponse {
  token?: string;
  model?: string;
  apiVersion?: string;
  error?: string;
}

async function authHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');
  }

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
  };
}

const getVoiceSystemInstruction = (plan: Plan) => `
Eres ChatMi, un asistente migratorio conversacional.
Habla principalmente en el idioma del usuario, por defecto español neutro.
Sé profesional, claro y conciso.
No garantices aprobaciones ni sustituyas asesoría legal profesional.
El plan actual es "${plan}".
`;

export async function* runChatStream(
  chatHistory: ChatMessage[],
  _plan: Plan,
): AsyncGenerator<ChatChunk> {
  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({
      messages: chatHistory,
    }),
  });

  const data = (await response.json().catch(() => ({}))) as ChatApiResponse;

  if (!response.ok) {
    throw new Error(
      data.error || `Gemini backend respondió HTTP ${response.status}`,
    );
  }

  const text = typeof data.text === 'string' ? data.text.trim() : '';

  if (!text) {
    throw new Error('Gemini devolvió una respuesta vacía.');
  }

  yield {
    text,
    usageMetadata: data.usageMetadata,
    quotaRemaining: data.quota?.remaining ?? null,
  };
}


export const EXPEDIENTE_MAX_BYTES = 2 * 1024 * 1024;
export const EXPEDIENTE_ALLOWED_MIMES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export async function analyzeMigrationDocument(
  file: File,
  instructions: string,
): Promise<string> {
  if (file.size === 0 || file.size > EXPEDIENTE_MAX_BYTES) {
    throw new Error('El expediente debe pesar entre 1 byte y 2 MB.');
  }
  if (!EXPEDIENTE_ALLOWED_MIMES.includes(file.type as (typeof EXPEDIENTE_ALLOWED_MIMES)[number])) {
    throw new Error('Sube un PDF o una imagen JPG, PNG o WebP.');
  }

  // The document is sent to our authenticated backend over HTTPS; never to public Storage.
  const encoded = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el expediente.'));
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('No se pudo leer el expediente.'));
        return;
      }
      const comma = reader.result.indexOf(',');
      if (comma < 0) {
        reject(new Error('El archivo no tiene un formato válido.'));
        return;
      }
      resolve(reader.result.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });

  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({
      messages: [{
        role: 'user',
        content: (instructions.trim() || 'Analiza este expediente migratorio y prepara un informe detallado de revisión.').slice(0, 2500),
      }],
      attachment: {
        name: file.name.slice(0, 120),
        mimeType: file.type,
        data: encoded,
      },
    }),
  });
  const data = (await response.json().catch(() => ({}))) as ChatApiResponse;
  if (!response.ok) {
    throw new Error(data.error || 'No se pudo analizar el expediente.');
  }
  const text = typeof data.text === 'string' ? data.text.trim() : '';
  if (!text) throw new Error('Gemini no devolvió un análisis del expediente.');
  return text;
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
    headers: await authHeaders(),
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
      apiVersion: data.apiVersion || 'v1alpha',
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
