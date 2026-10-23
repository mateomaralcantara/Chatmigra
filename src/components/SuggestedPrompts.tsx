import React from 'react';

interface SuggestedPromptsProps {
  onSendMessage: (text: string) => void;
}

const prompts = [
  '¿Qué necesito para solicitar una visa de turista a Estados Unidos?',
  'Explícame los pasos para una visa de estudiante.',
  '¿Cómo preparo una entrevista consular?',
];

const SuggestedPrompts: React.FC<SuggestedPromptsProps> = ({
  onSendMessage,
}) => {
  return (
    <div className="cm-suggestions" aria-label="Preguntas sugeridas">
      {prompts.map((prompt) => (
        <button
          key={prompt}
          type="button"
          className="cm-suggestion"
          onClick={() => onSendMessage(prompt)}
        >
          <span className="cm-suggestion-icon" aria-hidden="true">✦</span>
          <span className="cm-suggestion-copy">{prompt}</span>
          <span className="cm-suggestion-arrow" aria-hidden="true">↗</span>
        </button>
      ))}
    </div>
  );
};

export default SuggestedPrompts;
