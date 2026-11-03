import { rejectIfRateLimited } from '../server/http';
import { createHash, randomBytes } from 'node:crypto';
import { getAdminSupabase, requireAuthenticatedUser, type RequestLike } from '../server/supabase';

interface Request extends RequestLike {
  method?: string;
  body?: unknown;
}
interface Response {
  status(code: number): Response;
  json(value: unknown): void;
  setHeader?(name: string, value: string): void;
}
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_PATTERN = /^[a-f0-9]{48}$/;
const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

function payload(value: unknown): Record<string, unknown> {
  try {
    const v = typeof value === 'string' ? JSON.parse(value) : value;
    return v !== null && typeof v === 'object' && !Array.isArray(v)
      ? v as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export default async function handler(req: Request, res: Response) {
  res.setHeader?.('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });
  const auth = await requireAuthenticatedUser(req);
  if (!auth || !auth.user.email) {
    return res.status(401).json({ error: 'Inicia sesión para acceder al expediente.' });
  }
  if (rejectIfRateLimited(res, auth.user.id, 'applicant-tutor')) return;
  const body = payload(req.body);
  const action = body.action;
  if (action !== 'invite' && action !== 'redeem' && action !== 'delete_case' && action !== 'leave') {
    return res.status(400).json({ error: 'Acción no reconocida.' });
  }
  const admin = getAdminSupabase();
  if (!admin) return res.status(503).json({
    error: 'No está configurado el servicio privado de expedientes.',
  });

  try {
    if (action === 'delete_case' || action === 'leave') {
      const caseId = typeof body.caseId === 'string' ? body.caseId : '';
      if (!UUID_PATTERN.test(caseId)) {
        return res.status(400).json({ error: 'Expediente incorrecto.' });
      }

      const { data: target, error: caseError } = await auth.supabase
        .from('applicant_cases')
        .select('id,owner_id,applicant_name')
        .eq('id', caseId)
        .maybeSingle();
      if (caseError || !target) {
        return res.status(403).json({ error: 'No tienes acceso a este expediente.' });
      }

      if (action === 'leave') {
        if (target.owner_id === auth.user.id) {
          return res.status(400).json({ error: 'El responsable debe eliminar el expediente, no abandonar su propio caso.' });
        }
        const { error: leaveError } = await admin.from('applicant_case_members')
          .delete().eq('case_id', caseId).eq('user_id', auth.user.id);
        if (leaveError) throw new Error('CASE_LEAVE_FAILED');
        return res.status(200).json({ success: true });
      }

      if (target.owner_id !== auth.user.id) {
        return res.status(403).json({ error: 'Solo el responsable puede eliminar este expediente.' });
      }
      const confirmation = typeof body.confirmName === 'string' ? body.confirmName.trim() : '';
      if (!confirmation || confirmation !== target.applicant_name) {
        return res.status(400).json({ error: 'Escribe exactamente el nombre del aplicante para confirmar.' });
      }

      // Delete stored files through Storage API BEFORE cascading relational rows.
      // Never DELETE directly from storage.objects (would leave orphaned objects).
      const paths: string[] = [];
      let offset = 0;
      while (true) {
        const { data: batch, error: fileError } = await admin
          .from('applicant_case_documents')
          .select('storage_path')
          .eq('case_id', caseId)
          .order('id', { ascending: true })
          .range(offset, offset + 199);
        if (fileError) throw new Error('CASE_DOCUMENT_SCAN_FAILED');
        if (!batch?.length) break;
        for (const row of batch) {
          if (typeof row.storage_path !== 'string' ||
              !row.storage_path.startsWith(caseId + '/')) {
            throw new Error('CASE_DOCUMENT_PATH_INVALID');
          }
          paths.push(row.storage_path);
        }
        if (batch.length < 200) break;
        offset += batch.length;
        if (paths.length > 1000) {
          return res.status(413).json({ error: 'Expediente demasiado grande para esta operación. Contacta soporte para eliminación segura.' });
        }
      }
      for (let i = 0; i < paths.length; i += 100) {
        const { error: removeError } = await admin.storage
          .from('chatmi-applicant-cases')
          .remove(paths.slice(i, i + 100));
        if (removeError) throw new Error('CASE_STORAGE_DELETE_FAILED');
      }
      const { data: deleted, error: deleteError } = await admin
        .from('applicant_cases')
        .delete().eq('id', caseId).eq('owner_id', auth.user.id)
        .select('id');
      if (deleteError || !deleted?.length) throw new Error('CASE_DELETE_FAILED');
      return res.status(200).json({ success: true, removedDocuments: paths.length });
    }

    if (action === 'invite') {
      const caseId = typeof body.caseId === 'string' ? body.caseId : '';
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const memberRole = body.role === 'advisor' ? 'advisor' : 'applicant';
      if (!UUID_PATTERN.test(caseId) || email.length > 254 || !EMAIL_PATTERN.test(email)) {
        return res.status(400).json({ error: 'Indica un expediente y correo válidos.' });
      }
      if (email === auth.user.email.toLowerCase()) {
        return res.status(400).json({ error: 'Ya eres responsable de este expediente.' });
      }

      // Authenticated owner's RLS-scoped query; never trust a caseId alone.
      const { data: selected, error: ownerError } = await auth.supabase
        .from('applicant_cases')
        .select('id,owner_id')
        .eq('id', caseId)
        .eq('owner_id', auth.user.id)
        .maybeSingle();
      if (ownerError || !selected) {
        return res.status(403).json({ error: 'Solo el responsable puede invitar colaboradores.' });
      }

      const token = randomBytes(24).toString('hex');
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const { error: insertError } = await admin.from('applicant_case_invites').insert({
        case_id: caseId,
        invited_by: auth.user.id,
        invite_email: email,
        member_role: memberRole,
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      });
      if (insertError) throw new Error('INVITE_WRITE_FAILED');
      // Show the one-time code only to the owner, who shares it by a secure channel.
      return res.status(200).json({ inviteCode: token, email, role: memberRole });
    }

    const token = typeof body.code === 'string' ? body.code.trim().toLowerCase() : '';
    if (!TOKEN_PATTERN.test(token)) {
      return res.status(400).json({ error: 'Código de invitación inválido.' });
    }
    if (!auth.user.email_confirmed_at) {
      return res.status(403).json({ error: 'Confirma tu correo antes de aceptar un expediente.' });
    }
    const hash = createHash('sha256').update(token).digest('hex');
    const { data: invite, error: inviteError } = await admin
      .from('applicant_case_invites')
      .select('id,case_id,invite_email,member_role,redeemed_at,expires_at')
      .eq('token_hash', hash)
      .maybeSingle();

    if (inviteError || !invite || invite.redeemed_at ||
        new Date(invite.expires_at).getTime() <= Date.now() ||
        invite.invite_email !== auth.user.email.toLowerCase()) {
      return res.status(403).json({ error: 'Invitación vencida o no destinada a tu cuenta.' });
    }
    const { error: memberError } = await admin.from('applicant_case_members').upsert({
      case_id: invite.case_id,
      user_id: auth.user.id,
      member_role: invite.member_role,
    }, { onConflict: 'case_id,user_id', ignoreDuplicates: true });
    if (memberError) throw new Error('MEMBER_WRITE_FAILED');

    await admin.from('applicant_case_invites')
      .update({ redeemed_at: new Date().toISOString() })
      .eq('id', invite.id)
      .is('redeemed_at', null);
    return res.status(200).json({ caseId: invite.case_id });
  } catch {
    return res.status(500).json({
      error: 'No se pudo completar la operación del expediente. Revisa el estado del Tutor.',
    });
  }
}
