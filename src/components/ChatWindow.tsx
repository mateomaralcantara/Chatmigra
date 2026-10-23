import React, { useEffect, useMemo, useRef } from 'react';
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const safeMessages = useMemo(
    () =>
      (Array.isArray(messages) ? messages : []).filter(
        (message): message is ChatMessageType =>
          !!message &&
          typeof message.role === 'string' &&
          typeof message.content === 'string',
      ),
    [messages],
  );

  return (
    <div className="cm-chat-transcript">
      <div className="cm-chat-thread">
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
          <div className="cm-thinking">
            <LoadingSpinner />
            <span>ChatMi está pensando…</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};

export default ChatWindow;
