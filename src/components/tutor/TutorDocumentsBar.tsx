import type { ChangeEvent, RefObject } from 'react';
import { CONSULAR_SKILLS } from '../../../lib/tutor/consularSkills';
import { FACT_LABELS, type DocRow, type FactRow } from './tutorShared';

type Props = {
  caseId: string;
  loading: boolean;
  simulatorActive: boolean;
  docs: DocRow[];
  indexedIds: string[];
  selectedDocs: string[];
  facts: FactRow[];
  canReviewFacts: boolean;
  fileRef: RefObject<HTMLInputElement | null>;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onStartSimulator: () => void;
  onStopSimulator: () => void;
  onPrepare: () => void;
  onToggleDoc: (id: string) => void;
  onReviewFact: (fact: FactRow, approve: boolean) => void;
};

export default function TutorDocumentsBar({
  caseId, loading, simulatorActive, docs, indexedIds, selectedDocs, facts, canReviewFacts,
  fileRef, onUpload, onStartSimulator, onStopSimulator, onPrepare, onToggleDoc, onReviewFact,
}: Props) {
  return (
  <div className="cm-tutor-documents-bar">
    <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp" className="cm-expediente-file-input" onChange={onUpload} disabled={!caseId || loading} aria-label="Subir documentos al expediente" />
    <button type="button" className="cm-tutor-upload" onClick={() => fileRef.current?.click()} disabled={!caseId || loading}>＋ Subir documentos</button>
    <button type="button" className="cm-tutor-upload" onClick={onStartSimulator}
      disabled={!caseId || !docs.length || loading || simulatorActive || !indexedIds.length}>
      🎓 Iniciar simulacro ({CONSULAR_SKILLS.length} módulos)
    </button>
    {simulatorActive && <button type="button" className="cm-tutor-upload"
      onClick={onStopSimulator}>Terminar simulacro</button>}
    <button type="button" className="cm-tutor-upload" onClick={onPrepare}
      disabled={!caseId || loading || selectedDocs.every(id => indexedIds.includes(id)) || !selectedDocs.length}
      title="Prepara los documentos seleccionados con Gemini (puede consumir tu cuota) e inicia las preguntas">
      ⚡ Preparar y comenzar simulacro
    </button>
    <details className="cm-tutor-documents">
      <summary>Documentos ({docs.length}) · {selectedDocs.length} seleccionados</summary>
      <div className="cm-tutor-document-list">
        {docs.length ? docs.map(doc => <label key={doc.id}>
          <input type="checkbox" checked={selectedDocs.includes(doc.id)} onChange={() => onToggleDoc(doc.id)} disabled={loading} />
          <span title={doc.filename}>{doc.filename} {indexedIds.includes(doc.id) ? '✓ listo' : ''}</span>
        </label>) : <p>No hay documentos todavía.</p>}
      </div>
    </details>
    {facts.length > 0 && (
      <details className="cm-tutor-documents cm-tutor-facts">
        <summary>Datos del expediente ({facts.filter(f=>f.verification_status==='pending_review').length} por verificar)</summary>
        <div className="cm-tutor-fact-list">
          {facts.map(fact=>(
            <div className="cm-tutor-fact-row" key={fact.id}>
              <div>
                <strong>{FACT_LABELS[fact.fact_key] || fact.fact_key}:</strong> {fact.fact_value}
                <small> · {fact.verification_status==='verified'?'Verificado':fact.verification_status==='rejected'?'Rechazado':'Pendiente de verificación'}</small>
              </div>
              {fact.verification_status==='pending_review' && canReviewFacts && (
                <div className="cm-tutor-fact-actions">
                  <button type="button" disabled={loading} onClick={()=>onReviewFact(fact,true)}>Confirmar</button>
                  <button type="button" disabled={loading} onClick={()=>onReviewFact(fact,false)}>Rechazar</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </details>
    )}
    <span className="cm-tutor-format">PDF o imagen · 2 MB máximo por archivo</span>
  </div>
  );
}
