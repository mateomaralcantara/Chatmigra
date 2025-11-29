import './index.css';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChatMessage, Plan, Conversation, User } from './types';
import { runChatStream, connectToVoiceAgent } from './services/geminiService';
import { supabase } from './services/supabaseClient';
import Header from './components/Header';
import ChatWindow from './components/ChatWindow';
import ChatInput from './components/ChatInput';
import SuggestedPrompts from './components/SuggestedPrompts';
import ConversationHistory from './components/ConversationHistory';
import VoiceAgentOverlay from './components/VoiceAgentOverlay';
import AccountDashboard from './components/AccountDashboard';
import AdminDashboard from './components/AdminDashboard';

type View = 'chat' | 'dashboard' | 'admin';

interface AppProps {
  user: User;
  plan: Plan;
  onLogout: () => void;
  initialView?: View;
}

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL as string | undefined;

const INITIAL_MESSAGE: ChatMessage = {
  role: 'model',
  content:
    '¡Hola! Soy **ChatMig**, tu asistente migratorio. ¿Cómo puedo orientarte hoy? Selecciona una conversación anterior o inicia un nuevo chat.',
};

const App: React.FC<AppProps> = ({ user, plan, onLogout, initialView }) => {
  const isAdmin =
    !!ADMIN_EMAIL && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<View>(
    initialView ?? (isAdmin ? 'admin' : 'chat')
  );

  const [isVoiceAgentActive, setIsVoiceAgentActive] = useState(false);
  const [agentStatus, setAgentStatus] = useState<
    'idle' | 'connecting' | 'listening' | 'speaking' | 'error'
  >('idle');
  const [liveTranscription, setLiveTranscription] = useState<{ user: string; model: string }>({
    user: '',
    model: '',
  });

  const sessionRef = useRef<any | null>(null);
  const userTranscriptionRef = useRef('');
  const modelTranscriptionRef = useRef('');

  useEffect(() => {
    if (currentView === 'admin' && isAdmin) return;

    const fetchConversations = async () => {
      try {
        const { data, error } = await supabase
          .from('conversations')
          .select('id, created_at')
          .eq('user_email', user.email)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching conversations:', error);
          setError(
            'No se pudo cargar el historial de conversaciones. Verifica que las tablas de Supabase estén configuradas.'
          );
        } else {
          setConversations((data as Conversation[]) || []);
        }
      } catch (e) {
        console.error('Error inesperado cargando conversaciones:', e);
        setError('Error inesperado al cargar el historial.');
      }
    };

    fetchConversations();
  }, [user.email, currentView, isAdmin]);

  const handleNewConversation = () => {
    setCurrentConversationId(null);
    setMessages([
      {
        role: 'model',
        content:
          '¡Hola! Soy **ChatMig**, tu asistente migratorio. ¿Cómo puedo orientarte hoy? Cuéntame sobre tu país de ciudadanía, país de destino y tu objetivo (turismo, trabajo, estudios, etc.).',
      },
    ]);
    setError(null);
  };

  const handleSelectConversation = async (id: string) => {
    if (isLoading) return;
    setIsLoading(true);
    setError(null);
    setCurrentConversationId(id);

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
      } else {
        const loadedMessages: ChatMessage[] = (data || []).map((m: any) => ({
          role: m.role as 'user' | 'model',
          content: m.content,
        }));
        setMessages(loadedMessages.length ? loadedMessages : [INITIAL_MESSAGE]);
      }
    } catch (e) {
      console.error('Error inesperado cargando mensajes:', e);
      setError('Ocurrió un error al cargar los mensajes.');
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = useCallback(
    async (inputText: string) => {
      if (!inputText.trim() || isLoading) return;

      setError(null);
      setIsLoading(true);

      const isNewConversation = !currentConversationId;
      const newUserMessage: ChatMessage = { role: 'user', content: inputText };

      const updatedMessages = [...(isNewConversation ? [] : messages), newUserMessage];
      setMessages(updatedMessages);

      let convId = currentConversationId;

      try {
        if (!convId) {
          const { data, error } = await supabase
            .from('conversations')
            .insert([{ user_email: user.email }])
            .select('id, created_at')
            .single();

          if (error || !data) {
            console.error('Error al crear conversación:', error);
            setError('Error al crear una nueva conversación.');
            setIsLoading(false);
            return;
          }

          convId = data.id;
          setCurrentConversationId(convId);
          setConversations(prev => [{ id: convId!, created_at: data.created_at }, ...prev]);
        }

        await supabase.from('messages').insert([
          {
            conversation_id: convId,
            role: 'user',
            content: inputText,
          },
        ]);

        setMessages(prev => [...prev, { role: 'model', content: '' }]);

        const stream = await runChatStream(updatedMessages, plan);
        let fullModelResponse = '';

        for await (const chunk of stream as any) {
          let chunkText = '';

          if (typeof chunk.text === 'function') {
            chunkText = chunk.text();
          } else if (typeof chunk.text === 'string') {
            chunkText = chunk.text;
          }

          if (chunkText) {
            fullModelResponse += chunkText;

            setMessages(prev => {
              const lastMessage = prev[prev.length - 1];
              if (lastMessage && lastMessage.role === 'model') {
                const updatedLastMessage: ChatMessage = {
                  ...lastMessage,
                  content: fullModelResponse,
                };
                return [...prev.slice(0, -1), updatedLastMessage];
              }
              return prev;
            });
          }
        }

        if (fullModelResponse) {
          await supabase.from('messages').insert([
            {
              conversation_id: convId,
              role: 'model',
              content: fullModelResponse,
            },
          ]);
        } else {
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last && last.role === 'model' && !last.content) {
              return prev.slice(0, -1);
            }
            return prev;
          });
        }
      } catch (e: any) {
        const errorMessage = e instanceof Error ? e.message : 'Ocurrió un error inesperado.';
        console.error('Gemini API Error:', errorMessage);
        const userFriendlyError = `Lo siento, ocurrió un error. Por favor, intenta de nuevo. (${errorMessage})`;
        setError(userFriendlyError);

        setMessages(prev => {
          const lastMessage = prev[prev.length - 1];
          if (lastMessage && lastMessage.role === 'model' && lastMessage.content === '') {
            return prev.slice(0, -1);
          }
          return prev;
        });
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, messages, plan, currentConversationId, user.email]
  );

  const toggleVoiceAgent = async () => {
    if (isVoiceAgentActive) {
      setAgentStatus('idle');
      setIsVoiceAgentActive(false);
      sessionRef.current?.close();
      sessionRef.current = null;

      if (userTranscriptionRef.current || modelTranscriptionRef.current) {
        const transcript = `**Transcripción de la conversación de voz:**\n\n**Tú:** ${userTranscriptionRef.current}\n\n**ChatMig:** ${modelTranscriptionRef.current}`;
        handleSendMessage(transcript);
      }

      userTranscriptionRef.current = '';
      modelTranscriptionRef.current = '';
    } else {
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
              if (isVoiceAgentActive) {
                setAgentStatus('idle');
                setIsVoiceAgentActive(false);
              }
            },
          },
          plan
        );

        sessionRef.current = session;
      } catch (e) {
        console.error('Failed to start voice agent', e);
        setError('No se pudo iniciar el agente de voz. Asegúrate de permitir el acceso al micrófono.');
        setIsVoiceAgentActive(false);
        setAgentStatus('error');
      }
    }
  };

  const showSuggestions = !currentConversationId && messages.length <= 1;

  return (
    <div className="app-shell">
      <div className="flex h-screen text-slate-100 overflow-hidden">
        {currentView === 'chat' && (
          <ConversationHistory
            conversations={conversations}
            currentConversationId={currentConversationId}
            onSelectConversation={handleSelectConversation}
            onNewConversation={handleNewConversation}
            isLoading={isLoading}
          />
        )}

        <div className="flex flex-col flex-grow relative">
          <Header
            user={user}
            onLogout={onLogout}
            currentView={currentView}
            onNavigate={setCurrentView}
          />

          {currentView === 'chat' && (
            <>
              <ChatWindow messages={messages} isLoading={isLoading} />
              {error && (
                <div className="px-4 py-2 text-center text-red-400 bg-red-900/30">
                  {error}
                </div>
              )}
              <div className="bg-slate-950/70 border-t border-slate-800">
                {showSuggestions && !isLoading && (
                  <SuggestedPrompts onSendMessage={handleSendMessage} />
                )}
                <ChatInput
                  onSendMessage={handleSendMessage}
                  isLoading={isLoading}
                  onToggleVoice={toggleVoiceAgent}
                  isVoiceActive={isVoiceAgentActive}
                />
              </div>
            </>
          )}

          {currentView === 'dashboard' && (
            <div className="p-4 sm:p-6">
              <div className="glass-panel p-4 sm:p-6">
                <AccountDashboard user={user} plan={plan} />
              </div>
            </div>
          )}

          {currentView === 'admin' && (
            <div className="p-4 sm:p-6">
              <div className="glass-panel p-4 sm:p-6">
                <AdminDashboard user={user} />
              </div>
            </div>
          )}

          {isVoiceAgentActive && (
            <VoiceAgentOverlay
              status={agentStatus}
              transcription={liveTranscription}
              onClose={toggleVoiceAgent}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
