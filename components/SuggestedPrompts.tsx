import React from 'react';

interface SuggestedPromptsProps {
  onSendMessage: (text: string) => void;
}

const prompts = [
  "¿Qué necesito para una visa de turista a Estados Unidos?",
  "¿Cómo puedo obtener un permiso de trabajo en Canadá?",
  "Explícame el proceso de reunificación familiar en España.",
  "¿Cuáles son los requisitos para estudiar en Australia?",
];

const SuggestedPrompts: React.FC<SuggestedPromptsProps> = ({ onSendMessage }) => {
  return (
    <div className="p-4 pt-3 max-w-3xl mx-auto bg-black text-gray-100">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {prompts.map((prompt, index) => (
          <button
            key={index}
            onClick={() => onSendMessage(prompt)}
            className="
              w-full text-left text-sm p-3
              bg-neutral-900 hover:bg-neutral-800
              text-gray-100
              rounded-lg
              transition-colors
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-black
            "
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
};

export default SuggestedPrompts;
