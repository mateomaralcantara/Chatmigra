// src/components/ChatWindow.tsx
import React, { useEffect, useRef, useMemo } from 'react';
import { ChatMessage as ChatMessageType, Plan } from '../types';
import ChatMessage from './ChatMessage';
import LoadingSpinner from './LoadingSpinner';

interface ChatWindowProps {
  messages: ChatMessageType[];
  isLoading: boolean;
  plan: Plan;
  userEmail: string;
  onGoToUpgrade: () => void;
}

const ChatWindow: React.FC<ChatWindowProps> = ({
  messages,
  isLoading,
  plan,
  userEmail,
  onGoToUpgrade,
}) => {
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll suave al final cuando cambian mensajes o estado de carga
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Filtrado defensivo: evitamos mensajes undefined / corruptos
  const safeMessages = useMemo(
    () =>
      (Array.isArray(messages) ? messages : []).filter(
        (m): m is ChatMessageType =>
          !!m &&
          typeof (m as any).role === 'string' &&
          typeof (m as any).content === 'string'
      ),
    [messages]
  );

  return (
    <div className="flex-1 overflow-hidden bg-slate-950">
      {/* Centramos el contenido del chat */}
      <div className="h-full flex flex-col items-center">
        <div className="flex-1 w-full max-w-3xl overflow-y-auto px-4 py-4 space-y-3">
          {safeMessages.map((message, index) => (
            <ChatMessage
              key={index}
              message={message}
              plan={plan}
              userEmail={userEmail}
              onGoToUpgrade={onGoToUpgrade}
            />
          ))}

          {isLoading && (
            <div className="flex items-center gap-2 mt-2 text-gray-200 text-sm">
              <LoadingSpinner />
              <span>ChatMig está pensando...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>
    </div>
  );
};

export default ChatWindow;
