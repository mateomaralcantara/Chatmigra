import React, { useState } from 'react';

interface ChatInputProps {
  onSendMessage: (text: string) => void;
  isLoading: boolean;
  onToggleVoice: () => void;
  isVoiceActive: boolean;
}

const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  isLoading,
  onToggleVoice,
  isVoiceActive,
}) => {
  const [value, setValue] = useState('');

  const submit = () => {
    const text = value.trim();
    if (!text || isLoading) return;
    onSendMessage(text);
    setValue('');
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    submit();
  };

  return (
    <form onSubmit={handleSubmit} className="cm-composer">
      <button
        type="button"
        className="cm-composer-plus"
        aria-label="Adjuntar archivo"
        title="Adjuntar archivo"
      >
        +
      </button>

      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
        rows={1}
        placeholder="Pregunta a ChatMi"
        aria-label="Mensaje para ChatMi"
      />

      <div className="cm-composer-actions">
        <button
          type="button"
          className="cm-model-chip"
          title="Modelo activo"
          aria-label="Modelo Gemini 3.8"
        >
          Gemini 3.8
        </button>

        <button
          type="button"
          onClick={onToggleVoice}
          className="cm-composer-mic"
          disabled={isLoading}
          aria-label={isVoiceActive ? 'Finalizar voz' : 'Hablar con ChatMi'}
          title={isVoiceActive ? 'Finalizar voz' : 'Hablar con ChatMi'}
        >
          {isVoiceActive ? '●' : '♩'}
        </button>

        <button
          type="submit"
          disabled={isLoading || !value.trim()}
          className="cm-composer-send"
          aria-label="Enviar mensaje"
          title="Enviar"
        >
          {isLoading ? '…' : '↑'}
        </button>
      </div>
    </form>
  );
};

export default ChatInput;
