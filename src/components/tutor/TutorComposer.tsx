import type { FormEvent } from 'react';
import type { Mode } from './tutorShared';

type Props = {
  mode: Mode;
  caseId: string;
  loading: boolean;
  simulatorActive: boolean;
  question: string;
  canSend: boolean;
  listening: boolean;
  speaking: boolean;
  voiceOn: boolean;
  transcript: string;
  onQuestionChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onAsk: (text: string) => void;
  onPickFiles: () => void;
  onSwitchMode: (mode: Mode) => void;
  onToggleVoice: () => void;
};

export default function TutorComposer({
  mode, caseId, loading, simulatorActive, question, canSend, listening, speaking, voiceOn, transcript,
  onQuestionChange, onSubmit, onAsk, onPickFiles, onSwitchMode, onToggleVoice,
}: Props) {
  return mode === 'chat' ? (
    <form className="cm-composer cm-tutor-composer" onSubmit={onSubmit}>
      <button type="button" className="cm-composer-plus" aria-label="Subir documentos" title="Subir documentos" onClick={onPickFiles} disabled={!caseId || loading}>+</button>
      <textarea aria-label={simulatorActive ? 'Responder al entrevistador' : 'Preguntar sobre los documentos'} rows={1} value={question} disabled={!caseId || loading}
        onChange={event => onQuestionChange(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (question.trim()) onAsk(question); } }}
        placeholder={simulatorActive ? 'Responde la pregunta del entrevistador…' : 'Consulta sobre los documentos del expediente…'} />
      <div className="cm-composer-actions">
        <span className="cm-model-chip">{simulatorActive ? 'Evaluación + repregunta' : 'Gemini / RAG'}</span>
        <button type="button" className="cm-composer-mic" aria-label="Ir a Voz" title="Conversación por voz" onClick={() => onSwitchMode('voice')}>♫</button>
        <button type="submit" className="cm-composer-send" aria-label="Enviar respuesta" disabled={loading || !question.trim() || !canSend}>↑</button>
      </div>
    </form>
  ) : (
    <div className="cm-tutor-voice-panel">
      <button type="button" className={'cm-tutor-voice-button ' + (listening ? 'is-listening' : '')} aria-pressed={voiceOn}
        onClick={onToggleVoice} disabled={!caseId || !simulatorActive || loading}>
        {voiceOn ? '■ Detener voz' : '🎙 Iniciar voz'}
      </button>
      <div aria-live="polite">
        {speaking ? 'El Tutor está haciendo su pregunta…' : listening ? 'Escuchando tu respuesta…' : voiceOn ? 'Preparando la siguiente pregunta…' : simulatorActive ? 'Pulsa Iniciar voz: el Tutor hablará primero.' : 'Prepara los documentos e inicia el simulacro para activar Voz.'}
      </div>
      {transcript && <p className="cm-tutor-voice-transcript">Escuché: {transcript}</p>}
      <small>El Tutor dirige la entrevista. La voz depende del navegador y no requiere Gemini para las preguntas guiadas.</small>
    </div>
  );
}
