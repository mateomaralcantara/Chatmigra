import React, { useRef, useState } from 'react';
import {
  EXPEDIENTE_ALLOWED_MIMES,
  EXPEDIENTE_MAX_BYTES,
} from '../services/geminiService';

interface ChatInputProps {
  onSendMessage: (text: string) => void;
  onAnalyzeDocument: (file: File, instructions: string) => Promise<void>;
  isLoading: boolean;
  onToggleVoice: () => void;
  isVoiceActive: boolean;
}

const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  onAnalyzeDocument,
  isLoading,
  onToggleVoice,
  isVoiceActive,
}) => {
  const [value, setValue] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    setFileError('');
    if (!file) return;

    if (!EXPEDIENTE_ALLOWED_MIMES.includes(
      file.type as (typeof EXPEDIENTE_ALLOWED_MIMES)[number],
    )) {
      setFileError('Solo PDF o imagen JPG, PNG o WebP.');
      return;
    }
    if (!file.size || file.size > EXPEDIENTE_MAX_BYTES) {
      setFileError('El expediente no puede superar los 2 MB.');
      return;
    }

    setAttachment(file);
  };

  const submit = async () => {
    const text = value.trim();
    if ((!text && !attachment) || isLoading) return;
    setFileError('');

    if (attachment) {
      try {
        await onAnalyzeDocument(attachment, text);
        setValue('');
        setAttachment(null);
      } catch (error) {
        setFileError(error instanceof Error ? error.message : 'No se pudo analizar el archivo.');
      }
      return;
    }
    onSendMessage(text);
    setValue('');
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void submit();
  };

  return (
    <div className="cm-composer-container">
      <form onSubmit={handleSubmit} className="cm-composer">
        <input
          ref={fileInputRef}
          type="file"
          className="cm-expediente-file-input"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          aria-label="Elegir expediente migratorio PDF o imagen"
          onChange={selectFile}
          disabled={isLoading}
        />
        <button
          type="button"
          className="cm-composer-plus"
          aria-label="Subir expediente migratorio"
          title="Adjuntar expediente para Tutor Migratorio"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
        >
          +
        </button>

        <div className="cm-composer-entry">
          {attachment && (
            <div className="cm-expediente-attached" role="status">
              <span className="cm-expediente-file-label" title={attachment.name}>
                📎 {attachment.name}
              </span>
              <button
                type="button"
                className="cm-expediente-remove"
                aria-label="Quitar expediente adjunto"
                title="Quitar adjunto"
                disabled={isLoading}
                onClick={() => setAttachment(null)}
              >
                ×
              </button>
            </div>
          )}
          <textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
            rows={1}
            placeholder={attachment ? '¿Qué deseas revisar de este expediente?' : 'Pregunta a ChatMi'}
            aria-label={attachment ? 'Instrucciones para el Tutor Migratorio' : 'Mensaje para ChatMi'}
          />
        </div>

        <div className="cm-composer-actions">
          <span className="cm-model-chip" title="Modelo de texto configurado en el servidor">
            Gemini
          </span>

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
            disabled={isLoading || (!value.trim() && !attachment)}
            className="cm-composer-send"
            aria-label={attachment ? 'Analizar expediente' : 'Enviar mensaje'}
            title={attachment ? 'Analizar expediente' : 'Enviar'}
          >
            {isLoading ? '…' : '↑'}
          </button>
        </div>
      </form>

      {attachment && (
        <p className="cm-expediente-privacy">
          Tutor Migratorio · El documento se envía para análisis con IA y no se archiva automáticamente en ChatMi.
        </p>
      )}
      {fileError && <p className="cm-expediente-error" role="alert">{fileError}</p>}
    </div>
  );
};

export default ChatInput;
