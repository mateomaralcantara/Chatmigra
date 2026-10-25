import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../services/supabaseClient';

type Position = 'top' | 'rail' | 'account';

interface ProfilePhotoMenuProps {
  position: Position;
  onAccount: () => void;
}

const BUCKET = 'chatmi-avatars';
const MAX_PHOTO_SIZE = 2 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

function ownedAvatarPath(user: User | null): string | null {
  const path: unknown = user?.user_metadata?.chatmi_avatar_path;
  if (typeof path !== 'string' || !user) return null;
  return path.startsWith(user.id + '/avatar-') &&
    /^[-a-zA-Z0-9/]+\.(jpg|png|webp)$/.test(path)
    ? path
    : null;
}

function avatarPublicUrl(path: string | null): string | null {
  if (!path) return null;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export default function ProfilePhotoMenu({ position, onAccount }: ProfilePhotoMenuProps) {
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (active) setUser(data.user);
    }).catch(() => {
      if (active) setUser(null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setUser(session?.user ?? null);
    });

    const refresh = () => {
      void supabase.auth.getUser().then(({ data }) => {
        if (active) setUser(data.user);
      });
    };

    window.addEventListener('chatmi:avatar-updated', refresh);
    return () => {
      active = false;
      subscription.unsubscribe();
      window.removeEventListener('chatmi:avatar-updated', refresh);
    };
  }, []);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const closeEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', closeEsc);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('keydown', closeEsc);
    };
  }, [open]);

  const avatarPath = ownedAvatarPath(user);
  const avatarUrl = avatarPublicUrl(avatarPath);
  const initial = (user?.user_metadata?.first_name || user?.email || 'M')
    .toString().trim().charAt(0).toUpperCase() || 'M';

  const onSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    event.target.value = '';
    setStatus('');
    setError('');
    if (!selected) return;
    if (!ALLOWED_TYPES[selected.type]) {
      setError('Usa una imagen JPG, PNG o WebP.');
      return;
    }
    if (selected.size <= 0 || selected.size > MAX_PHOTO_SIZE) {
      setError('La foto no puede superar los 2 MB.');
      return;
    }
    setFile(selected);
  };

  const save = async () => {
    if (!file || busy) return;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const { data: { user: authenticated }, error: authError } = await supabase.auth.getUser();
      if (authError || !authenticated) throw new Error('Debes iniciar sesión para subir una foto.');
      const extension = ALLOWED_TYPES[file.type];
      if (!extension || file.size > MAX_PHOTO_SIZE) throw new Error('Archivo no permitido.');
      const previousPath = ownedAvatarPath(authenticated);
      const path = authenticated.id + '/avatar-' + crypto.randomUUID() + extension;
      const storage = supabase.storage.from(BUCKET);
      const { error: uploadError } = await storage.upload(path, file, {
        upsert: false,
        contentType: file.type,
        cacheControl: '3600',
      });
      if (uploadError) {
        throw new Error('No se pudo subir la foto. Verifica que el almacenamiento chatmi-avatars esté configurado.');
      }
      const { data, error: updateError } = await supabase.auth.updateUser({
        data: { chatmi_avatar_path: path },
      });
      if (updateError || !data.user) {
        await storage.remove([path]).catch(() => undefined);
        throw new Error('No se pudo guardar la foto en tu perfil.');
      }
      setUser(data.user);
      setFile(null);
      setStatus('Foto de perfil actualizada.');
      window.dispatchEvent(new Event('chatmi:avatar-updated'));
      if (previousPath && previousPath !== path) {
        void storage.remove([previousPath]).catch(() => undefined);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo subir la foto.');
    } finally {
      setBusy(false);
    }
  };

  const removePhoto = async () => {
    if (busy || !user) return;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const oldPath = ownedAvatarPath(user);
      const { data, error: updateError } = await supabase.auth.updateUser({
        data: { chatmi_avatar_path: null },
      });
      if (updateError || !data.user) throw new Error('No se pudo quitar la foto.');
      setUser(data.user);
      setFile(null);
      setStatus('Foto eliminada del perfil.');
      window.dispatchEvent(new Event('chatmi:avatar-updated'));
      if (oldPath) void supabase.storage.from(BUCKET).remove([oldPath]).catch(() => undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo quitar la foto.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={wrapperRef} className={'cm-profile-wrap cm-profile-wrap--' + position}>
      <button
        type="button"
        className={position === 'account'
          ? 'cm-profile-account-trigger'
          : position === 'rail' ? 'cm-rail-profile cm-profile-avatar' : 'cm-top-profile cm-profile-avatar'}
        title="Abrir perfil y cargar foto"
        aria-label="Abrir perfil y cargar foto"
        aria-expanded={open}
        onClick={() => {
          setOpen((prev) => !prev);
          setError('');
          setStatus('');
        }}
      >
        {position === 'account' ? (
          <><span aria-hidden="true">📷</span> Subir foto de perfil</>
        ) : avatarUrl ? (
          <img className="cm-avatar-image" src={avatarUrl} alt="Tu foto de perfil" />
        ) : (
          <span aria-hidden="true">{initial}</span>
        )}
      </button>

      {open && (
        <section className="cm-profile-popover" aria-label="Personalizar perfil">
          <h2 className="cm-profile-heading">Mi perfil</h2>
          <p className="cm-profile-description">
            {user?.email || 'Inicia sesión para personalizar tu perfil'}
          </p>
          <div className="cm-profile-preview">
            {previewUrl || avatarUrl ? (
              <img src={previewUrl || avatarUrl || ''} alt="Vista previa de foto de perfil" />
            ) : (
              <span aria-hidden="true">{initial}</span>
            )}
          </div>

          {user ? (
            <>
              <input
                ref={inputRef}
                className="cm-profile-file-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={onSelect}
                aria-label="Seleccionar foto de perfil"
                disabled={busy}
              />
              <button
                type="button"
                className="cm-profile-choose"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
              >
                Subir foto (Upload)
              </button>
              <p className="cm-profile-help">JPG, PNG o WebP · hasta 2 MB. La foto será pública para quien tenga su enlace.</p>
              {file && (
                <div className="cm-profile-upload-actions">
                  <button className="cm-profile-save" type="button" onClick={() => void save()} disabled={busy}>
                    {busy ? 'Guardando…' : 'Guardar foto'}
                  </button>
                  <button className="cm-profile-cancel" type="button" onClick={() => setFile(null)} disabled={busy}>
                    Cancelar
                  </button>
                </div>
              )}
              {avatarPath && !file && (
                <button type="button" className="cm-profile-remove" onClick={() => void removePhoto()} disabled={busy}>
                  Quitar foto
                </button>
              )}
            </>
          ) : (
            <p className="cm-profile-help">El upload se habilita al iniciar sesión.</p>
          )}

          {error && <p className="cm-profile-feedback cm-profile-feedback--error" role="alert">{error}</p>}
          {status && <p className="cm-profile-feedback cm-profile-feedback--success" role="status">{status}</p>}

          {position !== 'account' && (
            <button type="button" className="cm-profile-account" onClick={() => { setOpen(false); onAccount(); }}>
              Ir a mi cuenta
            </button>
          )}
        </section>
      )}
    </div>
  );
}
