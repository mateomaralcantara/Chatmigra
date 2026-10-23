import './index.css';
import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import { ChatMessage, Plan, Conversation, User } from './types';
import { runChatStream, connectToVoiceAgent } from './services/geminiService';
import { supabase } from './services/supabaseClient';
import ChatWindow from './components/ChatWindow';
import ChatInput from './components/ChatInput';
import ConversationHistory from './components/ConversationHistory';
import VoiceAgentOverlay from './components/VoiceAgentOverlay';
import AccountDashboard from './components/AccountDashboard';
import SuggestedPrompts from './components/SuggestedPrompts';
import { logActivity } from './services/activityService';

type View = 'chat' | 'dashboard';
type AgentStatus = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error';

interface VoiceSession {
  close: () => void;
}

interface LiveTranscription {
  user: string;
  model: string;
}

interface AppProps {
  user: User;
  plan: Plan;
  onLogout: () => void;
  initialView?: View;
}

const INITIAL_MESSAGE: ChatMessage = {
  role: 'model',
  content:
    '¡Hola! Soy **ChatMig**, tu asistente migratorio. ¿Cómo puedo orientarte hoy? Selecciona una conversación anterior o inicia un nuevo chat.',
};

const NEW_CONVERSATION_MESSAGE: ChatMessage = {
  role: 'model',
  content:
    '¡Hola! Soy **ChatMig**, tu asistente migratorio. ¿Cómo puedo orientarte hoy? Cuéntame tu país de ciudadanía, país de destino y tu objetivo (turismo, trabajo, estudios, etc.).',
};

// Texto que se adjunta a cada respuesta cuando el plan es FREE
const FREE_UPSELL_SUFFIX = `
---

🔓 Estás usando la versión GRATUITA de ChatMig (respuestas limitadas).
Activa el plan **PREMIUM** para respuestas más extensas, acceso al agente de voz
y todas las mejoras continuas del asistente.`;

const App: React.FC<AppProps> = ({ user, plan, onLogout, initialView }) => {
  // ---------- ESTADO PRINCIPAL ----------

  const [currentPlan, setCurrentPlan] = useState<Plan>(() => plan);

  useEffect(() => {
    setCurrentPlan(plan);
  }, [plan]);

  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const messagesRef = useRef<ChatMessage[]>([INITIAL_MESSAGE]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] =
    useState<string | null>(null);

  const [currentView, setCurrentView] = useState<View>(initialView ?? 'chat');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusPremium, setFocusPremium] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Voice agent
  const [isVoiceAgentActive, setIsVoiceAgentActive] = useState(false);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle');
  const [liveTranscription, setLiveTranscription] =
    useState<LiveTranscription>({ user: '', model: '' });

  const sessionRef = useRef<VoiceSession | null>(null);
  const userTranscriptionRef = useRef('');
  const modelTranscriptionRef = useRef('');

  // ---------- HELPERS ----------

  const clearModelPlaceholderIfEmpty = useCallback(() => {
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last && last.role === 'model' && !last.content) {
        return prev.slice(0, -1);
      }
      return prev;
    });
  }, []);

  const appendModelChunk = useCallback((text: string) => {
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (!last || last.role !== 'model') return prev;
      return [...prev.slice(0, -1), { ...last, content: last.content + text }];
    });
  }, []);

  // ---------- CARGA DE HISTORIAL ----------

  const fetchConversations = useCallback(async () => {
    try {
      setError(null);

      const { data, error } = await supabase
        .from('conversations')
        .select('id, created_at, title')
        .eq('user_email', user.email)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching conversations:', error);
        setError(
          'No se pudo cargar el historial de conversaciones. Verifica que las tablas de Supabase estén configuradas.'
        );
        return;
      }

      setConversations((data as Conversation[]) || []);
    } catch (e) {
      console.error('Error inesperado cargando conversaciones:', e);
      setError('Error inesperado al cargar el historial.');
    }
  }, [user.email]);

  useEffect(() => {
    if (currentView !== 'chat') return;
    fetchConversations();
  }, [currentView, fetchConversations]);

  // ---------- MANEJO DE CONVERSACIONES ----------

  const handleNewConversation = useCallback(() => {
    setCurrentConversationId(null);
    setMessages([NEW_CONVERSATION_MESSAGE]);
    setError(null);
    setIsHistoryOpen(false);
  }, []);

  const handleSelectConversation = useCallback(
    async (id: string) => {
      if (isLoading) return;

      setIsLoading(true);
      setError(null);
      setCurrentConversationId(id);
      setIsHistoryOpen(false);

      try {
        const { data, error } = await supabase
          .from('messages')
          .select('role, content')
          .eq('conversation_id', id)
          .order('created_at', { ascending: true });

        if (error) {
          console.error('Error fetching messages:', error);
          setError('No se pudieron cargar los mensajes de esta conversación.');
          setMessages([]);
          return;
        }

        const loadedMessages: ChatMessage[] = (data || []).map((m: any) => ({
          role: m.role as 'user' | 'model',
          content: m.content,
        }));

        setMessages(loadedMessages.length ? loadedMessages : [INITIAL_MESSAGE]);
      } catch (e) {
        console.error('Error inesperado cargando mensajes:', e);
        setError('Ocurrió un error al cargar los mensajes.');
        setMessages([]);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading]
  );

  // ---------- ENVIAR MENSAJE / GEMINI STREAM ----------

  const handleSendMessage = useCallback(
    async (inputText: string) => {
      const text = inputText.trim();
      if (!text || isLoading) return;

      setError(null);
      setIsLoading(true);

      const isNewConversation = !currentConversationId;
      const newUserMessage: ChatMessage = { role: 'user', content: text };

      const baseMessages = isNewConversation ? [] : messagesRef.current;
      const updatedMessages = [...baseMessages, newUserMessage];

      setMessages(updatedMessages);

      // Log actividad: mensaje enviado
      logActivity({
        userEmail: user.email,
        type: 'chat_message_sent',
        metadata: { plan: currentPlan, length: text.length },
      }).catch(err =>
        console.error('Error registrando actividad (sent):', err)
      );

      const conversationTitle = text.replace(/\s+/g, ' ').trim().slice(0, 80);
      let convId = currentConversationId;

      try {
        // Crear conversación si no existe
        if (!convId) {
          const { data, error } = await supabase
            .from('conversations')
            .insert([{ user_email: user.email, title: conversationTitle }])
            .select('id, created_at, title')
            .single();

          if (error || !data) {
            console.error('Error al crear conversación:', error);
            setError('Error al crear una nueva conversación.');
            setIsLoading(false);
            return;
          }

          convId = data.id;
          setCurrentConversationId(convId);
          setConversations(prev => [
            {
              id: convId!,
              created_at: data.created_at,
              title: data.title ?? conversationTitle,
            },
            ...prev,
          ]);
        }

        // Guardar mensaje de usuario
        const { error: insertUserError } = await supabase
          .from('messages')
          .insert([
            {
              conversation_id: convId,
              role: 'user',
              content: text,
            },
          ]);

        if (insertUserError) {
          console.error('Error guardando mensaje de usuario:', insertUserError);
        }

        // Placeholder del modelo
        setMessages(prev => [...prev, { role: 'model', content: '' }]);

        const stream = await runChatStream(updatedMessages, currentPlan);
        let fullModelResponse = '';

        for await (const chunk of stream as any) {
          let chunkText = '';

          if (typeof chunk.text === 'function') {
            chunkText = chunk.text();
          } else if (typeof chunk.text === 'string') {
            chunkText = chunk.text;
          }

          if (!chunkText) continue;

          fullModelResponse += chunkText;
          appendModelChunk(chunkText);
        }

        if (fullModelResponse) {
          // Bloque de imágenes
          const imageBlock = `

<image-json>${JSON.stringify({
            query: text,
            cantidad: 3,
          })}</image-json>`;

          // Para FREE: añadir invitación a pasar a PREMIUM
          let finalContent = fullModelResponse;

          if (currentPlan === Plan.FREE) {
            finalContent += FREE_UPSELL_SUFFIX;
          }

          finalContent += imageBlock;

          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (!last || last.role !== 'model') return prev;

            return [
              ...prev.slice(0, -1),
              { ...last, content: finalContent },
            ];
          });

          const { error: insertModelError } = await supabase
            .from('messages')
            .insert([
              {
                conversation_id: convId,
                role: 'model',
                content: finalContent,
              },
            ]);

          if (insertModelError) {
            console.error(
              'Error guardando mensaje del modelo:',
              insertModelError
            );
          }

          // Log actividad: respuesta del modelo
          logActivity({
            userEmail: user.email,
            type: 'chat_message_answered',
            metadata: { plan: currentPlan, model: 'gemini' },
          }).catch(err =>
            console.error('Error registrando actividad (answered):', err)
          );
        } else {
          // Si Gemini no devolvió nada, limpiamos el placeholder
          clearModelPlaceholderIfEmpty();
        }
      } catch (e: unknown) {
        const errMsg =
          e instanceof Error ? e.message : 'Ocurrió un error inesperado.';
        console.error('Gemini API Error:', errMsg);

        setError(
          `Lo siento, ocurrió un error. Por favor, intenta de nuevo. (${errMsg})`
        );

        clearModelPlaceholderIfEmpty();
      } finally {
        setIsLoading(false);
      }
    },
    [
      isLoading,
      currentConversationId,
      currentPlan,
      user.email,
      appendModelChunk,
      clearModelPlaceholderIfEmpty,
    ]
  );

  // ---------- VOICE AGENT ----------

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
          const transcript = `**Transcripción de la conversación de voz:**\n\n**Tú:** ${userText}\n\n**ChatMig:** ${modelText}`;
          await handleSendMessage(transcript);
        }
      }

      userTranscriptionRef.current = '';
      modelTranscriptionRef.current = '';
      setLiveTranscription({ user: '', model: '' });
    },
    [handleSendMessage]
  );

  const toggleVoiceAgent = useCallback(async () => {
    // Bloqueo total del agente de voz para plan FREE
    if (currentPlan === Plan.FREE) {
      setError(
        'El agente de voz está disponible solo en el plan PREMIUM. Actualiza tu plan para usarlo.'
      );
      setFocusPremium(true);
      setCurrentView('dashboard');
      return;
    }

    if (isVoiceAgentActive) {
      await stopVoiceAgent(true);
      return;
    }

    try {
      setAgentStatus('connecting');
      setIsVoiceAgentActive(true);
      setLiveTranscription({ user: '', model: '' });

      const session = await connectToVoiceAgent(
        {
          onOpen: () => setAgentStatus('listening'),
          onUserTranscription: text => {
            userTranscriptionRef.current += text;
            setLiveTranscription(prev => ({
              ...prev,
              user: userTranscriptionRef.current,
            }));
          },
          onModelTranscription: text => {
            modelTranscriptionRef.current += text;
            setLiveTranscription(prev => ({
              ...prev,
              model: modelTranscriptionRef.current,
            }));
          },
          onModelSpeaking: isSpeaking =>
            setAgentStatus(isSpeaking ? 'speaking' : 'listening'),
          onTurnComplete: () => {
            userTranscriptionRef.current = '';
            modelTranscriptionRef.current = '';
          },
          onError: e => {
            console.error('Voice Agent Error:', e);
            setError('Error en la conexión de voz.');
            setAgentStatus('error');
          },
          onClose: () => {
            setAgentStatus('idle');
            setIsVoiceAgentActive(false);
          },
        },
        currentPlan
      );

      sessionRef.current = session as VoiceSession;
    } catch (e) {
      console.error('Failed to start voice agent', e);
      setError(
        'No se pudo iniciar el agente de voz. Asegúrate de permitir el acceso al micrófono.'
      );
      setIsVoiceAgentActive(false);
      setAgentStatus('error');
    }
  }, [isVoiceAgentActive, currentPlan, stopVoiceAgent]);

  // ---------- IR DIRECTO A PLAN PREMIUM (UPGRADE) ----------

  const goToPremiumPlan = useCallback(() => {
    setCurrentView('dashboard');
    setFocusPremium(true);
  }, []);

  useEffect(() => {
    const onNewChat = () => handleNewConversation();
    const onNavigate = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (detail === 'chat' || detail === 'dashboard') {
        setCurrentView(detail);
      }
    };
    const onVoice = () => {
      void toggleVoiceAgent();
    };
    const onUpgrade = () => {
      goToPremiumPlan();
    };
    const onHistory = () => {
      setIsHistoryOpen((open) => !open);
    };

    window.addEventListener('chatmi:new-chat', onNewChat);
    window.addEventListener('chatmi:navigate', onNavigate);
    window.addEventListener('chatmi:voice', onVoice);
    window.addEventListener('chatmi:upgrade', onUpgrade);
    window.addEventListener('chatmi:history', onHistory);

    return () => {
      window.removeEventListener('chatmi:new-chat', onNewChat);
      window.removeEventListener('chatmi:navigate', onNavigate);
      window.removeEventListener('chatmi:voice', onVoice);
      window.removeEventListener('chatmi:upgrade', onUpgrade);
      window.removeEventListener('chatmi:history', onHistory);
    };
  }, [
    handleNewConversation,
    toggleVoiceAgent,
    goToPremiumPlan,
  ]);

  // ---------- DERIVADOS ----------

  const showSuggestions = useMemo(
    () => !currentConversationId && messages.length <= 1 && !isLoading,
    [currentConversationId, messages.length, isLoading]
  );

  // ---------- RENDER ----------

  return (
    <div className="cm-app">
      {currentView === 'chat' && (
        <div className="cm-chat-view">
          {isHistoryOpen && (
            <div
              className="cm-history-backdrop"
              role="presentation"
              onClick={() => setIsHistoryOpen(false)}
            >
              <div
                className="cm-history-drawer"
                onClick={(event) => event.stopPropagation()}
              >
                <ConversationHistory
                  conversations={conversations}
                  currentConversationId={currentConversationId}
                  onSelectConversation={handleSelectConversation}
                  onNewConversation={handleNewConversation}
                  isLoading={isLoading}
                />
              </div>
            </div>
          )}

          {showSuggestions ? (
            <section className="cm-home-state" aria-label="Inicio de ChatMi">
              <h1 className="cm-home-title">¿En qué puedo ayudarte hoy?</h1>
              <p className="cm-home-subtitle">
                Pregunta sobre visas, residencia, documentos, entrevistas o próximos pasos.
              </p>

              <div className="cm-home-composer">
                <ChatInput
                  onSendMessage={handleSendMessage}
                  isLoading={isLoading}
                  onToggleVoice={toggleVoiceAgent}
                  isVoiceActive={isVoiceAgentActive}
                />

                <SuggestedPrompts onSendMessage={handleSendMessage} />
              </div>
            </section>
          ) : (
            <>
              <ChatWindow
                messages={messages}
                isLoading={isLoading}
                plan={currentPlan}
                userEmail={user.email}
                onGoToUpgrade={goToPremiumPlan}
              />

              {error && (
                <div className="cm-inline-error">
                  {error}
                </div>
              )}

              <div className="cm-chat-composer-dock">
                <ChatInput
                  onSendMessage={handleSendMessage}
                  isLoading={isLoading}
                  onToggleVoice={toggleVoiceAgent}
                  isVoiceActive={isVoiceAgentActive}
                />
              </div>
            </>
          )}

          {isVoiceAgentActive && currentPlan !== Plan.FREE && (
            <VoiceAgentOverlay
              status={agentStatus}
              transcription={liveTranscription}
              onClose={toggleVoiceAgent}
            />
          )}
        </div>
      )}

      {currentView === 'dashboard' && (
        <div className="cm-dashboard-view">
          <div className="cm-dashboard-card">
            <AccountDashboard
              user={user}
              plan={currentPlan}
              onPlanChange={setCurrentPlan}
              focusPremium={focusPremium}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
