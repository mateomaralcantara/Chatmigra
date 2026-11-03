import type { RefObject } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { MessageRow } from './tutorShared';

type Props = {
  caseId: string;
  messages: MessageRow[];
  previousMessages: MessageRow[];
  olderAvailable: boolean;
  loading: boolean;
  simulatorActive: boolean;
  onLoadOlder: () => void;
  endRef: RefObject<HTMLDivElement | null>;
};

export default function TutorMessages({
  caseId, messages, previousMessages, olderAvailable, loading, simulatorActive, onLoadOlder, endRef,
}: Props) {
  return (
    <div className="cm-tutor-chat-scroll" aria-live="polite">
      {!messages.length && (
        <div className="cm-tutor-chat-welcome">
          <h1>{caseId ? 'Simulacro consular dirigido por tu Tutor' : 'Tutor Migratorio Personal'}</h1>
          <p>{caseId ? 'La práctica tranquila comienza automáticamente; puedes volver aquí para elegir el simulacro documental.' : 'Preparando una práctica privada. No necesitas subir documentos.'}</p>
        </div>
      )}
      <div className="cm-tutor-chat-messages">
        {previousMessages.length>0 && (
          <details className="cm-tutor-previous">
            <summary>Historial anterior ({previousMessages.length}) — separado del simulacro</summary>
            <div className="cm-tutor-previous-messages">
              {previousMessages.map((item,index)=>(
                <div key={item.id||index} className={'cm-tutor-chat-bubble '+(item.role==='user'?'is-user':'is-model')}>
                  <strong>{item.role==='user'?'Tú':'Tutor anterior'}</strong>
                  <p>{item.content}</p>
                </div>
              ))}
            </div>
          </details>
        )}
        {olderAvailable && <button type="button" className="cm-tutor-older" onClick={onLoadOlder} disabled={loading}>Cargar mensajes anteriores</button>}
        {messages.map((item, index) =>
          <div key={item.id || index} className={'cm-tutor-chat-bubble ' + (item.role === 'user' ? 'is-user' : 'is-model')}>
            <span className="cm-tutor-chat-role">{item.role === 'user' ? 'Tú' : 'Tutor IA'}</span>
            {item.role === 'model'
              ? <div className="cm-tutor-chat-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{item.content}</ReactMarkdown></div>
              : <p>{item.content}</p>}
          </div>
        )}
        {loading && <p className="cm-tutor-chat-thinking" role="status">{simulatorActive ? 'Evaluando tu respuesta…' : 'Consultando expediente…'}</p>}
        <div ref={endRef} />
      </div>
    </div>
  );
}
