import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage } from '../types';
import LoadingSpinner from './LoadingSpinner';
import Checklist from './Checklist';
import Timeline from './Timeline';
import ImageSupport from './ImageSupport';

interface MessageProps {
  message: ChatMessage;
}

const Message: React.FC<MessageProps> = ({ message }) => {
  const isModel = message.role === 'model';
  const content = message.content || '';

  const containerClasses = isModel
    ? 'self-start flex items-end space-x-3'
    : 'self-end flex items-end space-x-3 flex-row-reverse';

  const bubbleClasses = isModel
    ? 'bg-white dark:bg-gray-700 rounded-r-lg rounded-bl-lg'
    : 'bg-blue-500 dark:bg-blue-600 text-white rounded-l-lg rounded-br-lg';

  const avatar = (
    <div
      className={`w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0 ${
        isModel ? 'bg-gray-500' : 'bg-blue-500'
      }`}
    >
      {isModel ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 12h20M12 2a10 10 0 0 1 10 10c0 3.87-2.14 7.25-5.28 8.94M12 2a10 10 0 0 0-10 10c0 3.87-2.14 7.25-5.28 8.94" />
          <path d="M12 22a10 10 0 0 1-10-10c0-3.87-2.14-7.25-5.28-8.94" />
          <path d="M12 22a10 10 0 0 0 10-10c0-3.87-2.14-7.25-5.28-8.94" />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
            clipRule="evenodd"
          />
        </svg>
      )}
    </div>
  );

  const renderContent = () => {
    // Texto sin bloques especiales
    const hasSpecialBlocks = /<(checklist-json|timeline-json|image-json)>/.test(
      content
    );

    if (!hasSpecialBlocks) {
      return (
        <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-headings:my-3">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      );
    }

    // Dividimos en texto + bloques especiales
    const blockRegex =
      /(<(checklist-json|timeline-json|image-json)>[\s\S]*?<\/\2>)/g;

    const parts = content
      .split(blockRegex)
      .filter((part) => part && part.trim() !== '');

    return parts.map((part, index) => {
      const isChecklist = part.startsWith('<checklist-json>');
      const isTimeline = part.startsWith('<timeline-json>');
      const isImage = part.startsWith('<image-json>');

      if (isChecklist || isTimeline || isImage) {
        const jsonRegex =
          /<(?:checklist-json|timeline-json|image-json)>([\s\S]*?)<\/(?:checklist-json|timeline-json|image-json)>/;
        const match = part.match(jsonRegex);

        if (match && match[1]) {
          try {
            const data = JSON.parse(match[1]);

            if (isChecklist) return <Checklist key={index} data={data} />;
            if (isTimeline) return <Timeline key={index} data={data} />;
            if (isImage) {
              return (
                <ImageSupport
                  key={index}
                  query={data.query}
                  count={data.cantidad || data.count || 3}
                />
              );
            }
          } catch (e) {
            console.error('Failed to parse JSON content', e);
            return (
              <div
                key={index}
                className="text-red-500 text-xs p-2 bg-red-100 dark:bg-red-900/50 rounded"
              >
                Error al mostrar componente: JSON inválido.
              </div>
            );
          }
        }
      }

      // Texto normal entre bloques
      return (
        <div
          key={index}
          className="prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-headings:my-3"
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{part}</ReactMarkdown>
        </div>
      );
    });
  };

  return (
    <div className={containerClasses}>
      {avatar}
      <div className={`p-4 shadow-sm max-w-xl ${bubbleClasses}`}>
        {isModel && !content ? <LoadingSpinner /> : renderContent()}
      </div>
    </div>
  );
};

export default Message;
