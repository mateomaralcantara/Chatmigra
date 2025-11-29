import React from 'react';
import { Conversation } from '../types';

interface ConversationHistoryProps {
  conversations: Conversation[];
  currentConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  isLoading: boolean;
}

const ConversationHistory: React.FC<ConversationHistoryProps> = ({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  isLoading
}) => {
  return (
    <div
      className="
        w-64 h-full flex-shrink-0 flex flex-col
        bg-black
        border-r border-gray-800
        text-gray-100
        shadow-lg
      "
    >
      {/* Botón Nuevo Chat */}
      <div className="p-3 border-b border-gray-800">
        <button
          onClick={onNewConversation}
          disabled={isLoading}
          className="
            w-full flex items-center justify-center space-x-2
            px-4 py-2 text-sm font-medium rounded-md
            bg-blue-600 text-white
            hover:bg-blue-500
            focus:outline-none focus:ring-2 focus:ring-offset-2
            focus:ring-blue-500 focus:ring-offset-black
            disabled:bg-gray-700 disabled:opacity-60
            transition-colors
          "
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
              clipRule="evenodd"
            />
          </svg>
          <span>Nuevo Chat</span>
        </button>
      </div>

      {/* Título Historial */}
      <div className="p-2 border-b border-gray-800">
        <h2 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
          Historial
        </h2>
      </div>

      {/* Lista de conversaciones */}
      <div className="flex-grow overflow-y-auto">
        <nav className="p-2 space-y-1">
          {conversations.length === 0 && (
            <p className="text-center text-xs text-gray-500 p-4">
              No hay conversaciones guardadas.
            </p>
          )}
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => onSelectConversation(conv.id)}
              disabled={isLoading}
              className={`
                w-full text-left px-3 py-2 text-sm font-medium rounded-md
                transition-colors flex items-center space-x-3
                disabled:opacity-50
                ${
                  currentConversationId === conv.id
                    ? 'bg-gray-900 text-blue-400 border border-gray-700'
                    : 'text-gray-200 hover:bg-gray-900'
                }
              `}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 flex-shrink-0"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
                <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h1a2 2 0 002-2V9a2 2 0 00-2-2h-1z" />
              </svg>
              <span className="truncate">
                Chat del {new Date(conv.created_at).toLocaleDateString()}
              </span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
};

export default ConversationHistory;
