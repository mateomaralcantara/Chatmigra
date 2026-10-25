import './index.css';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { type ChatMessage, type Conversation, Plan, type User } from './types';
import { analyzeMigrationDocument, connectToVoiceAgent, runChatStream } from './services/geminiService';
import { supabase } from './services/supabaseClient';
import AccountDashboard from './components/AccountDashboard';
import ApplicantTutorChat from './components/ApplicantTutorChat';
import ChatInput from './components/ChatInput';
import ChatWindow from './components/ChatWindow';
import ConversationHistory from './components/ConversationHistory';
import SuggestedPrompts from './components/SuggestedPrompts';
import VoiceAgentOverlay from './components/VoiceAgentOverlay';
import { logActivity } from './services/activityService';

type View = 'chat' | 'dashboard' | 'tutor';

function viewFromPath(path: string): View {
  if (path === '/tutor' || path.startsWith('/tutor/')) return 'tutor';
  if (path === '/work') return 'dashboard';
  return 'chat';
}

function pathForView(view: View): string {
  return view === 'tutor' ? '/tutor' : view === 'dashboard' ? '/work' : '/';
}
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
    '¡Hola! Soy ChatMi, tu asistente migratorio. ¿Cómo puedo orientarte hoy?',
};

const NEW_CONVERSATION_MESSAGE: ChatMessage = {
  role: 'model',
  content:
    '¡Hola! Soy ChatMi. Cuéntame tu país de ciudadanía, país de destino y tu objetivo migratorio.',
};

const App: React.FC<AppProps> = ({
  user,
  plan,
  onLogout,
}) => {
  const [currentPlan, setCurrentPlan] = useState<Plan>(plan);
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const messagesRef = useRef<ChatMessage[]>([INITIAL_MESSAGE]);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] =
    useState<string | null>(null);

  const [currentView, setCurrentView] = useState<View>(() => viewFromPath(window.location.pathname));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusPremium, setFocusPremium] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const [isVoiceAgentActive, setIsVoiceAgentActive] = useState(false);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle');
  const [liveTranscription, setLiveTranscription] =
    useState<LiveTranscription>({ user: '', model: '' });

  const sessionRef = useRef<VoiceSession | null>(null);
  const userTranscriptionRef = useRef('');
  const modelTranscriptionRef = useRef('');

  useEffect(() => {
    setCurrentPlan(plan);
  }, [plan]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const clearModelPlaceholderIfEmpty = useCallback(() => {
    setMessages((previous) => {
      const last = previous[previous.length - 1];
      return last?.role === 'model' && !last.content
        ? previous.slice(0, -1)
        : previous;
    });
  }, [user.email]);

  const appendModelChunk = useCallback((text: string) => {
    setMessages((previous) => {
      const last = previous[previous.length - 1];
      if (!last || last.role !== 'model') return previous;

      return [
        ...previous.slice(0, -1),
        {
          ...last,
          content: last.content + text,
        },
      ];
    });
  }, []);

  const fetchConversations = useCallback(async () => {
    try {
      const { data, error: conversationsError } = await supabase
        .from('conversations')
        .select('id,created_at,title')
        .eq('user_email', user.email)
        .order('created_at', { ascending: false });

      if (conversationsError) {
        console.warn(
          '[conversations] Historial no disponible; el chat seguirá funcionando:',
          conversationsError.message,
        );
        setConversations([]);
        return;
      }

      setConversations((data || []) as Conversation[]);
    } catch (caught) {
      console.warn('[conversations] Historial omitido:', caught);
      setConversations([]);
    }
  }, []);

  useEffect(() => {
    if (currentView === 'chat') {
      void fetchConversations();
    }
  }, [currentView, fetchConversations]);

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
      setIsHistoryOpen(false);

      try {
        const { data, error: messagesError } = await supabase
          .from('messages')
          .select('role,content')
          .eq('conversation_id', id)
          .order('created_at', { ascending: true });

        if (messagesError) {
          throw messagesError;
        }

        const loaded: ChatMessage[] = (data || [])
          .filter(
            (message) =>
              (message.role === 'user' || message.role === 'model') &&
              typeof message.content === 'string',
          )
          .map((message) => ({
            role: message.role as 'user' | 'model',
            content: String(message.content),
          }));

        setCurrentConversationId(id);
        setMessages(loaded.length > 0 ? loaded : [INITIAL_MESSAGE]);
      } catch (caught) {
        console.error('[history] No se pudo abrir conversación:', caught);
        setError('No se pudo abrir esa conversación. Puedes continuar en un chat nuevo.');
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading],
  );

  const persistUserMessage = useCallback(
    async (
      text: string,
      title: string,
    ): Promise<{ conversationId: string | null; authUserId: string | null }> => {
      try {
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();

        if (!authUser) {
          return { conversationId: null, authUserId: null };
        }

        let conversationId = currentConversationId;

        if (!conversationId) {
          let created = await supabase
            .from('conversations')
            .insert({
              user_id: authUser.id,
              user_email: authUser.email ?? user.email,
              title,
            })
            .select('id,created_at,title')
            .single();

          if (created.error || !created.data) {
            created = await supabase
              .from('conversations')
              .insert({
                user_email: authUser.email ?? user.email,
                title,
              })
              .select('id,created_at,title')
              .single();
          }

          const data = created.data;
          const conversationError = created.error;

          if (conversationError || !data) {
            console.warn(
              '[persistence] No se pudo crear conversación; Gemini continuará:',
              conversationError?.message,
            );
            return { conversationId: null, authUserId: authUser.id };
          }

          const newConversationId = String(data.id);
          conversationId = newConversationId;
          setCurrentConversationId(newConversationId);
          setConversations((previous) => [
            {
              id: newConversationId,
              created_at: String(data.created_at),
              title: data.title ?? title,
            },
            ...previous,
          ]);
        }

        let userMessageWrite = await supabase.from('messages').insert({
          conversation_id: conversationId,
          user_id: authUser.id,
          role: 'user',
          content: text,
        });

        if (userMessageWrite.error) {
          userMessageWrite = await supabase.from('messages').insert({
            conversation_id: conversationId,
            role: 'user',
            content: text,
          });
        }

        if (userMessageWrite.error) {
          console.warn(
            '[persistence] Mensaje de usuario no guardado:',
            userMessageWrite.error.message,
          );
        }

        return { conversationId, authUserId: authUser.id };
      } catch (caught) {
        console.warn('[persistence] Persistencia degradada:', caught);
        return { conversationId: null, authUserId: null };
      }
    },
    [currentConversationId, user.email],
  );

  const handleSendMessage = useCallback(
    async (inputText: string) => {
      const text = inputText.trim();
      if (!text || isLoading) return;

      setError(null);
      setIsLoading(true);

      const isNewConversation = !currentConversationId;
      const userMessage: ChatMessage = { role: 'user', content: text };
      const baseMessages = isNewConversation ? [] : messagesRef.current;
      const updatedMessages = [...baseMessages, userMessage];
      const title = text.replace(/\s+/g, ' ').slice(0, 80);

      setMessages([...updatedMessages, { role: 'model', content: '' }]);

      const persistencePromise = persistUserMessage(text, title);

      void logActivity({
        userEmail: user.email,
        type: 'chat_message_sent',
        metadata: { plan: currentPlan, length: text.length },
      });

      try {
        const stream = runChatStream(updatedMessages, currentPlan);
        let fullResponse = '';

        for await (const chunk of stream) {
          if (!chunk.text) continue;
          fullResponse += chunk.text;
          appendModelChunk(chunk.text);
        }

        if (!fullResponse) {
          clearModelPlaceholderIfEmpty();
          throw new Error('Gemini no devolvió contenido.');
        }

        const persistence = await persistencePromise;

        if (persistence.conversationId && persistence.authUserId) {
          let modelWrite = await supabase.from('messages').insert({
            conversation_id: persistence.conversationId,
            user_id: persistence.authUserId,
            role: 'model',
            content: fullResponse,
          });

          if (modelWrite.error) {
            modelWrite = await supabase.from('messages').insert({
              conversation_id: persistence.conversationId,
              role: 'model',
              content: fullResponse,
            });
          }

          if (modelWrite.error) {
            console.warn(
              '[persistence] Respuesta no guardada:',
              modelWrite.error.message,
            );
          }
        }

        void logActivity({
          userEmail: user.email,
          type: 'chat_message_answered',
          metadata: { plan: currentPlan, model: 'gemini' },
        });
      } catch (caught) {
        const message =
          caught instanceof Error ? caught.message : 'Ocurrió un error inesperado.';

        console.error('[chat]', caught);
        clearModelPlaceholderIfEmpty();
        setError(message);
      } finally {
        setIsLoading(false);
      }
    },
    [
      appendModelChunk,
      clearModelPlaceholderIfEmpty,
      currentConversationId,
      currentPlan,
      isLoading,
      persistUserMessage,
      user.email,
    ],
  );

  const handleAnalyzeDocument = useCallback(
    async (file: File, instructions: string): Promise<void> => {
      if (isLoading) return;
      setError(null);
      setIsLoading(true);

      const question = instructions.trim() ||
        'Revisa este expediente migratorio: requisitos, riesgos, documentos faltantes y próximos pasos.';
      // Documents are analyzed only in memory. Do not persist raw files, conversation rows,
      // document text or the resulting sensitive report in the database.
      setCurrentConversationId(null);
      setMessages([
        { role: 'user', content: '📎 Expediente: ' + file.name + '\n' + question },
        { role: 'model', content: '' },
      ]);

      try {
        const report = await analyzeMigrationDocument(file, question);
        setMessages([
          { role: 'user', content: '📎 Expediente: ' + file.name + '\n' + question },
          { role: 'model', content: report },
        ]);
      } catch (caught) {
        setMessages([{ role: 'user', content: '📎 Expediente: ' + file.name + '\n' + question }]);
        const detail = caught instanceof Error ? caught.message : 'No se pudo analizar el expediente.';
        setError(detail);
        throw caught;
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading],
  );

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
          await handleSendMessage(
            `Transcripción de voz\n\nTú: ${userText}\n\nChatMi: ${modelText}`,
          );
        }
      }

      userTranscriptionRef.current = '';
      modelTranscriptionRef.current = '';
      setLiveTranscription({ user: '', model: '' });
    },
    [handleSendMessage],
  );

  const toggleVoiceAgent = useCallback(async () => {
    if (currentPlan === Plan.FREE) {
      setError('La conversación por voz está disponible en Premium.');
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
            setError('La conversación por voz encontró un error.');
            setAgentStatus('error');
          },
          onClose: () => {
            setAgentStatus('idle');
            setIsVoiceAgentActive(false);
          },
        },
        currentPlan,
      );

      sessionRef.current = session as VoiceSession;
    } catch (caught) {
      console.error('[voice] inicio falló:', caught);
      setError(
        caught instanceof Error
          ? caught.message
          : 'No se pudo iniciar la conversación por voz.',
      );
      setIsVoiceAgentActive(false);
      setAgentStatus('error');
    }
  }, [currentPlan, isVoiceAgentActive, stopVoiceAgent]);

  const goToPremiumPlan = useCallback(() => {
    setCurrentView('dashboard');
    window.history.pushState({}, '', '/work');
    setFocusPremium(true);
  }, []);

  useEffect(() => {
    const onNewChat = () => {
      handleNewConversation();
      if (window.location.pathname !== '/') window.history.pushState({}, '', '/');
      setCurrentView('chat');
    };
    const onNavigate = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (detail === 'chat' || detail === 'dashboard' || detail === 'tutor') {
        const path = pathForView(detail);
        if (window.location.pathname !== path) {
          window.history.pushState({}, '', path);
        }
        setCurrentView(detail);
      }
    };
    const onPopState = () => setCurrentView(viewFromPath(window.location.pathname));
    const onVoice = () => void toggleVoiceAgent();
    const onUpgrade = () => goToPremiumPlan();
    const onHistory = () => setIsHistoryOpen((open) => !open);

    window.addEventListener('chatmi:new-chat', onNewChat);
    window.addEventListener('chatmi:navigate', onNavigate);
    window.addEventListener('popstate', onPopState);
    window.addEventListener('chatmi:voice', onVoice);
    window.addEventListener('chatmi:upgrade', onUpgrade);
    window.addEventListener('chatmi:history', onHistory);

    return () => {
      window.removeEventListener('chatmi:new-chat', onNewChat);
      window.removeEventListener('chatmi:navigate', onNavigate);
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('chatmi:voice', onVoice);
      window.removeEventListener('chatmi:upgrade', onUpgrade);
      window.removeEventListener('chatmi:history', onHistory);
    };
  }, [goToPremiumPlan, handleNewConversation, toggleVoiceAgent]);

  const showSuggestions = useMemo(
    () => !currentConversationId && messages.length <= 1 && !isLoading,
    [currentConversationId, isLoading, messages.length],
  );

  return (
    <div className={currentView === 'tutor' ? 'cm-app cm-app--tutor' : 'cm-app'}>
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

              {error && <div className="cm-inline-error">{error}</div>}

              <div className="cm-home-composer">
                <ChatInput
                  onSendMessage={handleSendMessage}
                  onAnalyzeDocument={handleAnalyzeDocument}
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

              {error && <div className="cm-inline-error">{error}</div>}

              <div className="cm-chat-composer-dock">
                <ChatInput
                  onSendMessage={handleSendMessage}
                  onAnalyzeDocument={handleAnalyzeDocument}
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

      {currentView === 'tutor' && (
        <ApplicantTutorChat />
      )}

      {currentView === 'dashboard' && (
        <div className="cm-dashboard-view">
          <div className="cm-dashboard-card">
            <AccountDashboard
              user={user}
              plan={currentPlan}
              onPlanChange={setCurrentPlan}
              onLogout={onLogout}
              focusPremium={focusPremium}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
