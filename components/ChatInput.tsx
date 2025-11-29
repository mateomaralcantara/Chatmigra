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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = value.trim();
    if (!text || isLoading) return;
    onSendMessage(text);
    setValue('');
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="
        px-3 sm:px-4 py-3
        flex items-end gap-3
        bg-black
        border-t border-gray-800
      "
    >
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={1}
        placeholder="Escribe tu mensaje para ChatMig..."
        className="
          flex-1 min-h-[52px] max-h-40
          rounded-xl border border-gray-700
          bg-neutral-900 text-gray-100
          placeholder:text-gray-500
          px-3 py-2 text-sm
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
          resize-none
        "
      />

      <button
        type="button"
        onClick={onToggleVoice}
        className="
          hidden sm:inline-flex items-center justify-center
          h-10 w-10 rounded-full border border-gray-600
          text-gray-300 text-sm
          hover:border-blue-500 hover:text-blue-400
          disabled:opacity-50
        "
        disabled={isLoading}
      >
        {isVoiceActive ? '🎙️' : '🎧'}
      </button>

      <button
        type="submit"
        disabled={isLoading || !value.trim()}
        className="
          inline-flex items-center justify-center
          h-10 px-4 rounded-xl
          bg-blue-600 text-white text-sm font-semibold
          hover:bg-blue-500
          disabled:bg-gray-600 disabled:cursor-not-allowed
          transition
        "
      >
        {isLoading ? 'Enviando...' : 'Enviar'}
      </button>
    </form>
  );
};

export default ChatInput;
