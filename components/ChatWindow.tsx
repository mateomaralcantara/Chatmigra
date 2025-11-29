import React, { useEffect, useRef } from 'react';
import { ChatMessage } from '../types';
import Message from './Message';
import LoadingSpinner from './LoadingSpinner';

interface ChatWindowProps {
  messages: ChatMessage[];
  isLoading: boolean;
}

const ChatWindow: React.FC<ChatWindowProps> = ({ messages, isLoading }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  return (
    <div className="chat-window flex-grow overflow-y-auto bg-black px-4 md:px-6 py-4 md:py-6 text-gray-100">
      <div className="flex flex-col space-y-4 max-w-3xl mx-auto">
        {messages.map((msg, index) => (
          <Message key={index} message={msg} />
        ))}

        {isLoading && messages[messages.length - 1]?.role === 'user' && (
          <div className="self-start flex items-center space-x-2">
            <LoadingSpinner />
            <span className="text-sm text-gray-200">
              ChatMig está pensando...
            </span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};

export default ChatWindow;
