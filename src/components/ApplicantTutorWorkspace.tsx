import { useCallback, useEffect, useState, useRef, type ChangeEvent, type FormEvent } from 'react';
import { supabase } from '../services/supabaseClient';
import ApplicantCaseTasks from './ApplicantCaseTasks';

type Case = {
  id: string;
  owner_id: string;
  applicant_name: string;
  nationality: string;
  destination: string;
  visa_type: string;
  profile_notes: string;
};
type Document = {
  id: string;
  case_id: string;
  uploaded_by: string;
  filename: string;
  mime_type: string;
  category: string;
  size_bytes: number;
  storage_path: string;
};
type TutorMessage = { id?: string; role: 'user' | 'model'; content: string; created_at?: string };
type Category = 'perfil' | 'carta' | 'foto' | 'formulario' | 'otro';

const BUCKET = 'chatmi-applicant-cases';
const MAX_BYTES = 2 * 1024 * 1024;
const MIME_EXTENSION: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const CATEGORIES: Category[] = ['perfil', 'carta', 'foto', 'formulario', 'otro'];
const CASE_ROUTE = /^\/tutor\/([0-9a-f]{8}-[0-9a-f-]{27,})$/i;

function caseIdFromLocation(): string {
  return CASE_ROUTE.exec(window.location.pathname)?.[1] || '';
}

function openCaseRoute(id: string) {
  const path = id ? '/tutor/' + encodeURIComponent(id) : '/tutor';
  if (window.location.pathname !== path) window.history.pushState({}, '', path);
}

async function userId(): Promise<string> {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Inicia sesión para continuar.');
  return user.id;
}

async function tutorApi(body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Inicia sesión nuevamente.');
  const response = await fetch('/api/applicant-tutor', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + session.access_token,
    },
    body: JSON.stringify(body),
  });
  const result: { error?: string; inviteCode?: string; caseId?: string } =
    await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'No fue posible completar la invitación.');
  return result;
}

export default function ApplicantTutorWorkspace() {
  const [cases, setCases] = useState<Case[]>([]);
  const [selectedId, setSelectedId] = useState<string>(caseIdFromLocation);
  const activeCaseRef = useRef(selectedId);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [name, setName] = useState('');
  const [nationality, setNationality] = useState('');
  const [destination, setDestination] = useState('');
  const [visaType, setVisaType] = useState('');
  const [notes, setNotes] = useState('');
  const [category, setCategory] = useState<Category>('otro');
  const [question, setQuestion] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'applicant' | 'advisor'>('applicant');
  const [inviteCode, setInviteCode] = useState('');
  const [redeemCode, setRedeemCode] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [myId, setMyId] = useState('');

  const selectedCase = cases.find((item) => item.id === selectedId);

  const refreshCases = useCallback(async (preferId?: string) => {
    const id = await userId();
    setMyId(id);
    const { data, error: queryError } = await supabase
      .from('applicant_cases')
      .select('id,owner_id,applicant_name,nationality,destination,visa_type,profile_notes')
      .order('created_at', { ascending: false });
    if (queryError) throw new Error(
      'El Tutor aún no tiene instaladas sus tablas privadas de Supabase. Ejecuta su SQL de instalación.',
    );
    const found = (data || []) as Case[];
    setCases(found);
    setSelectedId((current) => {
      const wanted = preferId || current;
      return found.some((item) => item.id === wanted) ? wanted : '';
    });
  }, []);

  const refreshCaseData = useCallback(async (caseId: string) => {
    if (!caseId) {
      setDocuments([]);
      setSelectedDocs([]);
      setMessages([]);
      setHasOlderMessages(false);
      return;
    }
    const [fileRows, chatRows] = await Promise.all([
      supabase.from('applicant_case_documents')
        .select('id,case_id,uploaded_by,filename,mime_type,category,size_bytes,storage_path')
        .eq('case_id', caseId).order('created_at', { ascending: false }),
      supabase.from('applicant_case_messages')
        .select('id,role,content,created_at')
        .eq('case_id', caseId).order('created_at', { ascending: false }).limit(100),
    ]);
    if (fileRows.error || chatRows.error) {
      throw new Error('No se pudieron cargar los documentos o la tutoría.');
    }
    if (activeCaseRef.current !== caseId) return;
    const nextDocs = (fileRows.data || []) as Document[];
    setDocuments(nextDocs);
    setSelectedDocs((prev) => {
      const kept = prev.filter((id) => nextDocs.some((doc) => doc.id === id));
      return (kept.length ? kept : nextDocs.slice(0, 4).map((doc) => doc.id)).slice(0, 4);
    });
    const latest = (chatRows.data || []) as TutorMessage[];
    setMessages([...latest].reverse());
    setHasOlderMessages(latest.length === 100);
  }, []);

  const loadOlderMessages = async () => {
    if (!selectedId || busy || !messages.length) return;
    const before = messages[0].created_at;
    if (!before) return;
    setBusy(true);
    setError('');
    try {
      const { data, error: moreError } = await supabase
        .from('applicant_case_messages')
        .select('id,role,content,created_at')
        .eq('case_id', selectedId)
        .lt('created_at', before)
        .order('created_at', { ascending: false })
        .limit(100);
      if (moreError) throw new Error('No se pudo recuperar el historial anterior.');
      if (activeCaseRef.current !== selectedId) return;
      const older = (data || []) as TutorMessage[];
      setMessages((current) => [...older.reverse(), ...current]);
      setHasOlderMessages(older.length === 100);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo cargar el historial.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refreshCases().catch((caught) => setError(caught.message));
  }, [refreshCases]);

  useEffect(() => {
    const onPopState = () => setSelectedId(caseIdFromLocation());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    activeCaseRef.current = selectedId;
    setError('');
    setDocuments([]);
    setSelectedDocs([]);
    setMessages([]);
    setHasOlderMessages(false);
    void refreshCaseData(selectedId).catch((caught) => setError(caught.message));
  }, [selectedId, refreshCaseData]);

  useEffect(() => {
    if (!selectedCase) return;
    setNotes(selectedCase.profile_notes);
  }, [selectedCase?.id, selectedCase?.profile_notes]);

  const createCase = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true); setError(''); setStatus('');
    try {
      const id = await userId();
      const { data, error: insertError } = await supabase
        .from('applicant_cases')
        .insert({
          owner_id: id,
          applicant_name: name.trim().slice(0, 160),
          nationality: nationality.trim().slice(0, 120),
          destination: destination.trim().slice(0, 120),
          visa_type: visaType.trim().slice(0, 120),
        }).select('id').single();
      if (insertError || !data) throw new Error('No se pudo crear el expediente privado.');
      setName(''); setNationality(''); setDestination(''); setVisaType('');
      await refreshCases(data.id);
      openCaseRoute(data.id);
      setStatus('Expediente creado y guardado.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Error de creación.'); }
    finally { setBusy(false); }
  };

  const updateNotes = async () => {
    if (!selectedCase || busy) return;
    setBusy(true); setError(''); setStatus('');
    try {
      if (selectedCase.owner_id !== await userId()) throw new Error('Solo el responsable puede editar el perfil.');
      const { error: updateError } = await supabase.from('applicant_cases')
        .update({ profile_notes: notes.slice(0, 3000), updated_at: new Date().toISOString() })
        .eq('id', selectedCase.id).eq('owner_id', selectedCase.owner_id);
      if (updateError) throw new Error('No se pudo guardar el perfil.');
      await refreshCases(selectedId);
      setStatus('Perfil actualizado.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Error al guardar.'); }
    finally { setBusy(false); }
  };

  const uploadFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(event.target.files || []);
    event.target.value = '';
    if (!selectedCase || !list.length || busy) return;
    setBusy(true); setError(''); setStatus('');
    let completed = 0;
    try {
      const id = await userId();
      for (const file of list) {
        const ext = MIME_EXTENSION[file.type];
        if (!ext || !file.size || file.size > MAX_BYTES) {
          throw new Error('Formato o tamaño inválido. PDF, JPG, PNG o WebP; máximo 2 MB por archivo.');
        }
        const path = selectedCase.id + '/' + id + '/' + crypto.randomUUID() + '.' + ext;
        const store = supabase.storage.from(BUCKET);
        const { error: uploadError } = await store.upload(path, file, {
          contentType: file.type,
          upsert: false,
        });
        if (uploadError) throw new Error('No se pudo cargar el archivo al almacenamiento privado.');
        const { error: saveError } = await supabase.from('applicant_case_documents').insert({
          case_id: selectedCase.id,
          uploaded_by: id,
          filename: file.name.slice(0, 180),
          mime_type: file.type,
          size_bytes: file.size,
          storage_path: path,
          category,
        });
        if (saveError) {
          await store.remove([path]);
          throw new Error('No se pudo asociar el documento al expediente.');
        }
        completed += 1;
      }
      await refreshCaseData(selectedCase.id);
      setStatus(completed + ' documento(s) cargados en el expediente privado.');
    } catch (caught) {
      setError((caught instanceof Error ? caught.message : 'Error de carga.') +
        (completed ? ' Se guardaron ' + completed + ' archivo(s).' : ''));
      await refreshCaseData(selectedCase.id).catch(() => undefined);
    } finally { setBusy(false); }
  };

  const removeFile = async (doc: Document) => {
    if (!selectedCase || busy) return;
    if (!window.confirm('¿Eliminar este documento del expediente?')) return;
    setBusy(true); setError(''); setStatus('');
    try {
      const { error: storageError } = await supabase.storage.from(BUCKET).remove([doc.storage_path]);
      if (storageError) throw new Error('No se pudo eliminar el archivo privado.');
      const { error: dbError } = await supabase.from('applicant_case_documents')
        .delete().eq('id', doc.id).eq('case_id', selectedCase.id);
      if (dbError) throw new Error('Archivo retirado, pero no se pudo borrar el registro.');
      await refreshCaseData(selectedCase.id);
      setStatus('Documento eliminado.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Error al eliminar.'); }
    finally { setBusy(false); }
  };

  const toggleDocument = (id: string) => {
    setSelectedDocs((prev) => {
      if (prev.includes(id)) return prev.filter((value) => value !== id);
      if (prev.length >= 4) { setError('Selecciona un máximo de cuatro documentos por consulta.'); return prev; }
      setError('');
      return [...prev, id];
    });
  };

  const askTutor = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedCase || !question.trim() || busy) return;
    setBusy(true); setError(''); setStatus('');
    const userText = question.trim();
    const currentId = selectedCase.id;
    const previous = messages.slice(-12).map((m) => ({ role: m.role, content: m.content }));
    setMessages([...messages, { role: 'user', content: userText }]);
    try {
      const id = await userId();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Tu sesión expiró. Inicia sesión.');
      const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token,
        },
        body: JSON.stringify({
          caseId: currentId,
          documentIds: selectedDocs,
          messages: [...previous, { role: 'user', content: userText }],
        }),
      });
      const result: { error?: string; text?: string } = await response.json().catch(() => ({}));
      if (!response.ok || !result.text) throw new Error(result.error || 'No se pudo consultar el Tutor.');
      // Keep the applicant's case history separate from the general chat history.
      const rows = [
        { case_id: currentId, created_by: id, role: 'user', content: userText.slice(0, 15000) },
        { case_id: currentId, created_by: id, role: 'model', content: result.text.slice(0, 15000) },
      ];
      const { error: historyError } = await supabase.from('applicant_case_messages').insert(rows);
      if (historyError) throw new Error('La respuesta no pudo guardarse en el expediente. Intenta nuevamente.');
      setQuestion('');
      setMessages((current) => [...current, { role: 'model', content: result.text || '' }]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error al consultar el Tutor.');
      setMessages(messages);
    } finally { setBusy(false); }
  };

  const invite = async () => {
    if (!selectedCase || busy) return;
    setBusy(true); setError(''); setStatus('');
    try {
      const result = await tutorApi({
        action: 'invite', caseId: selectedCase.id,
        email: inviteEmail.trim(), role: inviteRole,
      });
      setInviteCode(result.inviteCode || '');
      setStatus('Comparte este código únicamente con el destinatario indicado.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Error al invitar.'); }
    finally { setBusy(false); }
  };

  const redeem = async () => {
    if (!redeemCode.trim() || busy) return;
    setBusy(true); setError(''); setStatus('');
    try {
      const result = await tutorApi({ action: 'redeem', code: redeemCode.trim() });
      setRedeemCode('');
      await refreshCases(result.caseId);
      if (result.caseId) openCaseRoute(result.caseId);
      setStatus('Ya tienes acceso al expediente compartido.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Código no aceptado.'); }
    finally { setBusy(false); }
  };

  const removeOrLeaveCase = async () => {
    if (!selectedCase || busy) return;
    const isOwner = selectedCase.owner_id === myId;
    const confirmation = isOwner
      ? window.prompt(
          'Eliminarás definitivamente el expediente, sus documentos, mensajes e invitaciones. Escribe exactamente el nombre del aplicante:',
          '',
        )
      : window.confirm('¿Salir de este expediente compartido? No se eliminarán los documentos.');
    if (isOwner ? confirmation !== selectedCase.applicant_name : !confirmation) return;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await tutorApi(isOwner
        ? { action: 'delete_case', caseId: selectedCase.id, confirmName: confirmation }
        : { action: 'leave', caseId: selectedCase.id });
      setSelectedId('');
      openCaseRoute('');
      setDocuments([]);
      setMessages([]);
      setSelectedDocs([]);
      await refreshCases();
      setStatus(isOwner
        ? 'Expediente eliminado. Su eliminación de copias de seguridad depende de la política de retención.'
        : 'Has salido del expediente compartido.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se completó la operación.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="cm-case-tutor" aria-label="Tutor Personal del Aplicante">
      <div className="cm-case-tutor-head">
        <h1>Tutor Personal del Aplicante</h1>
        <a
          href={window.location.pathname.startsWith('/tutor/') ? window.location.pathname : '/tutor'}
          target="_blank"
          rel="noopener noreferrer"
          className="cm-case-tutor-new-tab"
        >Abrir Tutor en otra pestaña</a>
        <p>Un espacio independiente por aplicante. Perfil, cartas, fotografías, formularios y conversaciones guardados en Supabase.</p>
        <button className="cm-case-tutor-back" type="button" onClick={() => {
          setSelectedId('');
          openCaseRoute('');
        }}>← Todos los expedientes</button>
      </div>
      {error && <p className="cm-case-tutor-error" role="alert">{error}</p>}
      {status && <p className="cm-case-tutor-success" role="status">{status}</p>}
      <div className="cm-case-tutor-grid">
        <aside className="cm-case-tutor-sidebar">
          <h2>Mis expedientes</h2>
          <div className="cm-case-tutor-cases">
            {cases.map((item) => (
              <button key={item.id} type="button"
                className={item.id === selectedId ? 'is-selected' : ''}
                onClick={() => { setSelectedId(item.id); openCaseRoute(item.id); setInviteCode(''); }}
              >{item.applicant_name}</button>
            ))}
            {!cases.length && <p>No hay expedientes todavía.</p>}
          </div>
          <details>
            <summary>+ Crear expediente</summary>
            <form onSubmit={(event) => void createCase(event)} className="cm-case-tutor-form">
              <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={160}
                placeholder="Nombre del aplicante" aria-label="Nombre del aplicante" />
              <input value={nationality} onChange={(e) => setNationality(e.target.value)} maxLength={120}
                placeholder="Nacionalidad" aria-label="Nacionalidad" />
              <input value={destination} onChange={(e) => setDestination(e.target.value)} maxLength={120}
                placeholder="País de destino" aria-label="País de destino" />
              <input value={visaType} onChange={(e) => setVisaType(e.target.value)} maxLength={120}
                placeholder="Tipo de visa o proceso" aria-label="Tipo de proceso" />
              <button type="submit" disabled={busy}>Crear expediente privado</button>
            </form>
          </details>
          <div className="cm-case-tutor-invite">
            <h3>Entrar a un expediente compartido</h3>
            <input value={redeemCode} onChange={(e) => setRedeemCode(e.target.value)} placeholder="Código de invitación"
              aria-label="Código de invitación" autoComplete="off" />
            <button onClick={() => void redeem()} type="button" disabled={busy || !redeemCode.trim()}>
              Aceptar invitación
            </button>
          </div>
        </aside>

        {selectedCase ? (
          <div className="cm-case-tutor-content">
            <nav className="cm-case-tutor-quicknav" aria-label="Secciones del expediente">
              <a href="#tutor-conversacion">Conversar con Tutor IA</a>
              <a href="#tutor-documentos">Documentos</a>
              <a href="#tutor-seguimiento">Seguimiento</a>
            </nav>
            <div id="tutor-conversacion" className="cm-case-tutor-panel cm-case-tutor-chat">
              <h2>Tutor de este expediente</h2>
              <p className="cm-case-tutor-hint">Responde solo sobre este aplicante, el perfil y los documentos seleccionados. Si un dato no consta, lo indicará.</p>
              <div className="cm-case-tutor-thread" aria-live="polite">
                {hasOlderMessages && (
                  <button type="button" disabled={busy} onClick={() => void loadOlderMessages()}>
                    Cargar mensajes anteriores
                  </button>
                )}
                {messages.map((msg, index) => (
                  <div key={msg.id || index} className={'cm-case-tutor-message ' + (msg.role === 'model' ? 'is-tutor' : 'is-applicant')}>
                    <strong>{msg.role === 'model' ? 'Tutor' : 'Pregunta'}</strong>
                    <p>{msg.content}</p>
                  </div>
                ))}
                {!messages.length && <p>Pregunta, por ejemplo: «¿Cuál es el nombre completo del aplicante?».</p>}
              </div>
              <form onSubmit={(e) => void askTutor(e)} className="cm-case-tutor-ask">
                <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2}
                  placeholder="Pregunta únicamente sobre este expediente..."
                  aria-label="Pregunta al Tutor Personal del Aplicante" />
                <button type="submit" disabled={busy || !question.trim()}>{busy ? 'Consultando…' : 'Preguntar al Tutor'}</button>
              </form>
            </div>
            <div className="cm-case-tutor-panel">
              <h2>{selectedCase.applicant_name}</h2>
              <p><strong>Nacionalidad:</strong> {selectedCase.nationality || 'Sin indicar'} · <strong>Destino:</strong> {selectedCase.destination || 'Sin indicar'} · <strong>Proceso:</strong> {selectedCase.visa_type || 'Sin indicar'}</p>
              <label htmlFor="cm-case-notes">Perfil, antecedentes y observaciones del aplicante</label>
              <textarea id="cm-case-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={3000}
                rows={3} disabled={busy || selectedCase.owner_id !== myId}
                placeholder="Información relevante para la tutoría..." />
              {selectedCase.owner_id === myId && (
                <button type="button" onClick={() => void updateNotes()} disabled={busy}>Guardar perfil</button>
              )}
            </div>

            <div id="tutor-documentos" className="cm-case-tutor-panel">
              <h2>Documentación del expediente</h2>
              <div className="cm-case-tutor-upload">
                <select value={category} onChange={(e) => setCategory(e.target.value as Category)} aria-label="Categoría del documento">
                  {CATEGORIES.map((cat) => <option value={cat} key={cat}>{cat}</option>)}
                </select>
                <label className="cm-case-tutor-upload-action">
                  <span>📎 Subir documentos</span>
                  <input type="file" multiple
                    accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                    onChange={(e) => void uploadFiles(e)} disabled={busy} />
                </label>
              </div>
              <p className="cm-case-tutor-hint">PDF o fotos · Máximo 2 MB cada uno. Privados para los miembros autorizados.</p>
              <p className="cm-case-tutor-hint">Selecciona hasta 4 documentos para que el Tutor los examine en la próxima pregunta.</p>
              <div className="cm-case-tutor-documents">
                {documents.map((doc) => (
                  <div key={doc.id} className="cm-case-tutor-document">
                    <label>
                      <input type="checkbox" checked={selectedDocs.includes(doc.id)}
                        onChange={() => toggleDocument(doc.id)} disabled={busy} />
                      <span>{doc.filename} <small>({doc.category})</small></span>
                    </label>
                    {(doc.uploaded_by === myId || selectedCase.owner_id === myId) &&
                      <button type="button" onClick={() => void removeFile(doc)} disabled={busy} aria-label={'Eliminar ' + doc.filename}>Eliminar</button>}
                  </div>
                ))}
                {!documents.length && <p>Aún no hay documentos. Sube el perfil, cartas, formularios o fotos.</p>}
              </div>
            </div>

            <div id="tutor-seguimiento"><ApplicantCaseTasks key={selectedCase.id} caseId={selectedCase.id} ownerId={selectedCase.owner_id} currentUserId={myId} /></div>

            {selectedCase.owner_id === myId && (
              <details className="cm-case-tutor-panel">
                <summary>Compartir expediente con el aplicante o un asesor</summary>
                <div className="cm-case-tutor-share">
                  <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
                    type="email" placeholder="Correo de la persona invitada" aria-label="Correo a invitar" />
                  <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'applicant' | 'advisor')}>
                    <option value="applicant">Aplicante</option>
                    <option value="advisor">Asesor</option>
                  </select>
                  <button type="button" disabled={busy || !inviteEmail} onClick={() => void invite()}>Crear invitación</button>
                  {inviteCode && (
                    <div className="cm-case-tutor-code">
                      <span>Código privado:</span>
                      <input value={inviteCode} readOnly aria-label="Código de invitación generado" />
                      <button type="button" onClick={() => void navigator.clipboard.writeText(inviteCode)}>Copiar</button>
                    </div>
                  )}
                  <p className="cm-case-tutor-hint">El destinatario debe tener una cuenta ChatMi con ese correo confirmado. Comparte el código de forma privada; caduca en 7 días.</p>
                </div>
              </details>
            )}

            <div className="cm-case-tutor-panel cm-case-tutor-danger">
              <h2>Gestión y privacidad del expediente</h2>
              <p>El expediente y su historial permanecen guardados al cerrar sesión. Cancelar una suscripción no elimina automáticamente estos datos.</p>
              <button type="button" disabled={busy} onClick={() => void removeOrLeaveCase()}>
                {selectedCase.owner_id === myId
                  ? 'Eliminar expediente y documentos definitivamente'
                  : 'Salir de este expediente compartido'}
              </button>
            </div>
          </div>
        ) : (
          <div className="cm-case-tutor-panel">
            <h2>Un expediente por aplicante</h2>
            <p>Crea un expediente o acepta una invitación para consultar su documentación.</p>
          </div>
        )}
      </div>
      <p className="cm-case-tutor-hint">
        No cargues datos personales sin autorización. Los documentos se almacenan en un bucket privado de Supabase;
        el análisis seleccionado se envía a Gemini. Las respuestas requieren verificación profesional cuando corresponda.
      </p>
    </section>
  );
}
