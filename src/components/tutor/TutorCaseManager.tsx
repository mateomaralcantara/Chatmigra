import { useState } from 'react';
import type { CaseRow } from './tutorShared';

type Props = {
  activeCase: CaseRow | undefined;
  isOwner: boolean;
  busy: boolean;
  onInvite: (email: string, role: 'applicant' | 'advisor') => Promise<string | undefined>;
  onRedeem: (code: string) => Promise<boolean>;
  onDelete: (confirmName: string) => Promise<boolean>;
  onLeave: () => Promise<boolean>;
};

/** Sharing and privacy controls for the selected private case. */
export default function TutorCaseManager({ activeCase, isOwner, busy, onInvite, onRedeem, onDelete, onLeave }: Props) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'applicant' | 'advisor'>('applicant');
  const [code, setCode] = useState('');
  const [redeemCode, setRedeemCode] = useState('');
  const [confirmName, setConfirmName] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);

  const nameMatches = Boolean(activeCase) && confirmName.trim() === activeCase?.applicant_name;

  return (
    <details className="cm-tutor-documents cm-tutor-case-manager">
      <summary>Gestionar expediente</summary>
      <div className="cm-tutor-case-manager-body">
        {activeCase && isOwner && (
          <section aria-label="Compartir expediente">
            <h3>Compartir</h3>
            <div className="cm-tutor-case-row">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="Correo de la persona invitada" aria-label="Correo a invitar" disabled={busy} />
              <select value={role} onChange={(e) => setRole(e.target.value as 'applicant' | 'advisor')}
                aria-label="Rol de la persona invitada" disabled={busy}>
                <option value="applicant">Aplicante</option>
                <option value="advisor">Asesor</option>
              </select>
              <button type="button" disabled={busy || !email.trim()}
                onClick={() => void onInvite(email.trim(), role).then((generated) => {
                  if (generated) { setCode(generated); setEmail(''); }
                })}>
                Crear invitación
              </button>
            </div>
            {code && (
              <div className="cm-tutor-case-row">
                <input value={code} readOnly aria-label="Código de invitación generado" />
                <button type="button" onClick={() => void navigator.clipboard?.writeText(code)}>Copiar</button>
              </div>
            )}
            <small>La persona necesita una cuenta ChatMi con ese correo confirmado. Comparte el código en privado; caduca en 7 días.</small>
          </section>
        )}

        <section aria-label="Aceptar invitación">
          <h3>¿Te invitaron a un expediente?</h3>
          <div className="cm-tutor-case-row">
            <input value={redeemCode} onChange={(e) => setRedeemCode(e.target.value)}
              placeholder="Código de invitación" aria-label="Código de invitación recibido" disabled={busy} />
            <button type="button" disabled={busy || !redeemCode.trim()}
              onClick={() => void onRedeem(redeemCode.trim()).then((ok) => { if (ok) setRedeemCode(''); })}>
              Aceptar invitación
            </button>
          </div>
        </section>

        {activeCase && (
          <section aria-label="Privacidad del expediente" className="cm-tutor-case-danger">
            <h3>Privacidad</h3>
            <p>El expediente y su historial se conservan al cerrar sesión. Cancelar una suscripción no los elimina.</p>
            {isOwner ? (
              <>
                <label htmlFor="tutor-delete-confirm">
                  Para eliminar definitivamente el expediente, sus documentos, mensajes e invitaciones, escribe <strong>{activeCase.applicant_name}</strong>:
                </label>
                <div className="cm-tutor-case-row">
                  <input id="tutor-delete-confirm" value={confirmName} autoComplete="off"
                    onChange={(e) => setConfirmName(e.target.value)} disabled={busy} />
                  <button type="button" className="cm-tutor-case-delete" disabled={busy || !nameMatches}
                    onClick={() => void onDelete(confirmName.trim()).then((ok) => { if (ok) setConfirmName(''); })}>
                    Eliminar expediente definitivamente
                  </button>
                </div>
              </>
            ) : confirmLeave ? (
              <div className="cm-tutor-case-row">
                <span>¿Salir? No se borran los documentos.</span>
                <button type="button" className="cm-tutor-case-delete" disabled={busy}
                  onClick={() => void onLeave().then(() => setConfirmLeave(false))}>Sí, salir</button>
                <button type="button" disabled={busy} onClick={() => setConfirmLeave(false)}>Cancelar</button>
              </div>
            ) : (
              <button type="button" disabled={busy} onClick={() => setConfirmLeave(true)}>Salir de este expediente compartido</button>
            )}
          </section>
        )}
      </div>
    </details>
  );
}
