import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { supabase } from '../../services/supabaseClient';
import { caseAction } from '../../services/tutorCaseApi';
import { BUCKET, type DocRow } from './tutorShared';

interface Options {
  caseId: string;
  busyRef: MutableRefObject<boolean>;
  mountedRef: MutableRefObject<boolean>;
  setLoading: (value: boolean) => void;
  setError: (value: string) => void;
  setNotice: Dispatch<SetStateAction<string>>;
  setSelectedDocs: Dispatch<SetStateAction<string[]>>;
  refreshCase: (id: string) => Promise<void>;
  refreshCases: (preferred?: string) => Promise<void>;
  forgetCurrentCase: () => Promise<void>;
}

/** Sharing, privacy and document deletion for the Tutor's selected case. */
export function useCaseManagement({
  caseId, busyRef, mountedRef, setLoading, setError, setNotice, setSelectedDocs,
  refreshCase, refreshCases, forgetCurrentCase,
}: Options) {
  // Runs one action with the Tutor's shared busy/error/notice state.
  const run = async <T,>(work: () => Promise<T>, success: string): Promise<T | undefined> => {
    if (busyRef.current) return undefined;
    busyRef.current = true; setLoading(true); setError(''); setNotice('');
    try {
      const result = await work();
      if (mountedRef.current) setNotice(success);
      return result;
    } catch (e) {
      if (mountedRef.current) setError(e instanceof Error ? e.message : 'No se pudo completar la operación.');
      return undefined;
    } finally { busyRef.current = false; if (mountedRef.current) setLoading(false); }
  };

  const inviteToCase = (email: string, role: 'applicant' | 'advisor') =>
    run(async () => (await caseAction({ action: 'invite', caseId, email, role })).inviteCode,
      'Invitación creada. Comparte el código solo con esa persona.');

  const redeemInvite = async (code: string) => Boolean(await run(async () => {
    const result = await caseAction({ action: 'redeem', code });
    await refreshCases(result.caseId);
    return true;
  }, 'Ya tienes acceso al expediente compartido.'));

  const deleteCase = async (confirmName: string) => Boolean(await run(async () => {
    await caseAction({ action: 'delete_case', caseId, confirmName });
    await forgetCurrentCase();
    return true;
  }, 'Expediente eliminado con sus documentos y mensajes.'));

  const leaveCase = async () => Boolean(await run(async () => {
    await caseAction({ action: 'leave', caseId });
    await forgetCurrentCase();
    return true;
  }, 'Saliste del expediente compartido.'));

  const removeDocument = async (doc: DocRow) => {
    if (!window.confirm('¿Eliminar «' + doc.filename + '» del expediente? No se puede deshacer.')) return;
    const forCase = caseId;
    await run(async () => {
      const { error: storageError } = await supabase.storage.from(BUCKET).remove([doc.storage_path]);
      if (storageError) throw new Error('No se pudo eliminar el archivo privado.');
      const { error: rowError } = await supabase.from('applicant_case_documents')
        .delete().eq('id', doc.id).eq('case_id', forCase);
      if (rowError) throw new Error('El archivo se retiró, pero no se pudo borrar su registro.');
      setSelectedDocs(previous => previous.filter(id => id !== doc.id));
      await refreshCase(forCase);
    }, 'Documento eliminado.');
  };

  return { inviteToCase, redeemInvite, deleteCase, leaveCase, removeDocument };
}
