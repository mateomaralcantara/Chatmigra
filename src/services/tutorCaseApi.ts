// Case management actions served by /api/applicant-tutor. The server checks
// ownership and membership; the browser never deletes a whole case directly.
import { supabase } from './supabaseClient';

type CaseAction =
  | { action: 'invite'; caseId: string; email: string; role: 'applicant' | 'advisor' }
  | { action: 'redeem'; code: string }
  | { action: 'delete_case'; caseId: string; confirmName: string }
  | { action: 'leave'; caseId: string };

export interface CaseActionResult {
  inviteCode?: string;
  caseId?: string;
  removedDocuments?: number;
}

export async function caseAction(body: CaseAction): Promise<CaseActionResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');
  const response = await fetch('/api/applicant-tutor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
    body: JSON.stringify(body),
  });
  const result: CaseActionResult & { error?: string } = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'No se pudo completar la operación (HTTP ' + response.status + ').');
  return result;
}
