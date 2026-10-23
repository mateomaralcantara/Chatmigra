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
  isLoading,
}) => {
  const getConversationLabel = (conversation: Conversation) => {
    const title = conversation.title?.trim();
    if (title) return title;

    return `Chat del ${new Date(conversation.created_at).toLocaleDateString()}`;
  };

  return (
    <aside className="cm-history-panel" aria-label="Historial de conversaciones">
      <header className="cm-history-head">
        <strong>Historial</strong>
        <span>Tus conversaciones de ChatMi</span>
      </header>

      <button
        type="button"
        onClick={onNewConversation}
        disabled={isLoading}
        className="cm-history-new"
      >
        ＋ Nuevo chat
      </button>

      <nav className="cm-history-list">
        {conversations.length === 0 && (
          <p className="cm-history-empty">Todavía no hay conversaciones guardadas.</p>
        )}

        {conversations.map((conversation) => (
          <button
            key={conversation.id}
            type="button"
            onClick={() => onSelectConversation(conversation.id)}
            disabled={isLoading}
            className={[
              'cm-history-item',
              currentConversationId === conversation.id ? 'is-active' : '',
            ].join(' ')}
          >
            <span aria-hidden="true">◌</span>
            <span>{getConversationLabel(conversation)}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
};

export default ConversationHistory;
