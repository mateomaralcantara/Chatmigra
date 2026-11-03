import { useCallback, useEffect, useRef, useState } from 'react';
import { connectToVoiceAgent } from '../services/geminiService';
import { Plan } from '../types';

export type AgentStatus = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error';

interface VoiceSession {
  close: () => void;
}

export interface LiveTranscription {
  user: string;
  model: string;
}

interface Options {
  plan: Plan;
  /** Receives the finished voice transcript so it is saved in the chat. */
  onTranscript: (text: string) => unknown;
  onError: (message: string) => void;
  onPremiumRequired: () => void;
}

/** Live Gemini voice conversation (Premium only). */
export function useVoiceAgent({ plan, onTranscript, onError, onPremiumRequired }: Options) {
  const [isVoiceAgentActive, setIsVoiceAgentActive] = useState(false);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle');
  const [liveTranscription, setLiveTranscription] =
    useState<LiveTranscription>({ user: '', model: '' });

  const sessionRef = useRef<VoiceSession | null>(null);
  const userTranscriptionRef = useRef('');
  const modelTranscriptionRef = useRef('');

  // Callbacks change on every render of the parent; keep the latest ones
  // without restarting the voice session.
  const onTranscriptRef = useRef(onTranscript);
  const onErrorRef = useRef(onError);
  const onPremiumRequiredRef = useRef(onPremiumRequired);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    onErrorRef.current = onError;
    onPremiumRequiredRef.current = onPremiumRequired;
  });

  // Never leave the microphone open after the screen unmounts.
  useEffect(() => () => sessionRef.current?.close(), []);

  const stopVoiceAgent = useCallback(
    async (sendTranscript: boolean) => {
      setAgentStatus('idle');
      setIsVoiceAgentActive(false);
      sessionRef.current?.close();
      sessionRef.current = null;

      if (sendTranscript) {
        const userText = userTranscriptionRef.current.trim();
        const modelText = modelTranscriptionRef.current.trim();

        if (userText || modelText) {
          await onTranscriptRef.current(
            `Transcripción de voz\n\nTú: ${userText}\n\nChatMi: ${modelText}`,
          );
        }
      }

      userTranscriptionRef.current = '';
      modelTranscriptionRef.current = '';
      setLiveTranscription({ user: '', model: '' });
    },
    [],
  );

  const toggleVoiceAgent = useCallback(async () => {
    if (plan === Plan.FREE) {
      onErrorRef.current('La conversación por voz está disponible en Premium.');
      onPremiumRequiredRef.current();
      return;
    }

    if (isVoiceAgentActive) {
      await stopVoiceAgent(true);
      return;
    }

    try {
      setAgentStatus('connecting');
      setIsVoiceAgentActive(true);

      const session = await connectToVoiceAgent(
        {
          onOpen: () => setAgentStatus('listening'),
          onUserTranscription: (text) => {
            userTranscriptionRef.current += text;
            setLiveTranscription((previous) => ({
              ...previous,
              user: userTranscriptionRef.current,
            }));
          },
          onModelTranscription: (text) => {
            modelTranscriptionRef.current += text;
            setLiveTranscription((previous) => ({
              ...previous,
              model: modelTranscriptionRef.current,
            }));
          },
          onModelSpeaking: (speaking) =>
            setAgentStatus(speaking ? 'speaking' : 'listening'),
          onTurnComplete: () => undefined,
          onError: (voiceError) => {
            console.error('[voice]', voiceError);
            onErrorRef.current('La conversación por voz encontró un error.');
            setAgentStatus('error');
          },
          onClose: () => {
            setAgentStatus('idle');
            setIsVoiceAgentActive(false);
          },
        },
        plan,
      );

      sessionRef.current = session as VoiceSession;
    } catch (caught) {
      console.error('[voice] inicio falló:', caught);
      onErrorRef.current(
        caught instanceof Error
          ? caught.message
          : 'No se pudo iniciar la conversación por voz.',
      );
      setIsVoiceAgentActive(false);
      setAgentStatus('error');
    }
  }, [plan, isVoiceAgentActive, stopVoiceAgent]);

  return {
    isActive: isVoiceAgentActive,
    status: agentStatus,
    liveTranscription,
    toggle: toggleVoiceAgent,
    stop: stopVoiceAgent,
  };
}
