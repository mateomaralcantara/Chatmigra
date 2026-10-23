import { supabase } from './supabaseClient';

export const FREE_TOKENS_MAX = 3000;

interface QuotaRow {
  tokens_remaining?: number | null;
  tokens_max?: number | null;
}

const storageKey = (email: string): string =>
  `chatmig:quotas:${email.trim().toLowerCase()}`;

const clamp = (value: number): number =>
  Math.max(0, Math.min(FREE_TOKENS_MAX, Math.floor(value)));

function readLocal(email: string): number | null {
  try {
    const raw = localStorage.getItem(storageKey(email));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { tokensRemaining?: unknown };
    return typeof parsed.tokensRemaining === 'number'
      ? clamp(parsed.tokensRemaining)
      : null;
  } catch {
    return null;
  }
}

function writeLocal(email: string, tokensRemaining: number): void {
  try {
    localStorage.setItem(
      storageKey(email),
      JSON.stringify({
        tokensRemaining: clamp(tokensRemaining),
        tokensMax: FREE_TOKENS_MAX,
      }),
    );
  } catch {
    // Cache local opcional.
  }
}

async function persistQuota(email: string, tokensRemaining: number): Promise<void> {
  const { error } = await supabase
    .from('account_quotas')
    .upsert(
      {
        user_email: email,
        messages_remaining: 0,
        messages_max: 0,
        tokens_remaining: clamp(tokensRemaining),
        tokens_max: FREE_TOKENS_MAX,
      },
      { onConflict: 'user_email' },
    );

  if (error) {
    console.warn('[quota] No se pudo persistir account_quotas:', error.message);
  }
}

export async function getFreeTokensRemaining(email: string): Promise<number> {
  const { data, error } = await supabase
    .from('account_quotas')
    .select('tokens_remaining,tokens_max')
    .eq('user_email', email)
    .maybeSingle();

  if (!error && data) {
    const row = data as QuotaRow;
    const remaining =
      typeof row.tokens_remaining === 'number'
        ? clamp(row.tokens_remaining)
        : FREE_TOKENS_MAX;

    writeLocal(email, remaining);
    return remaining;
  }

  const cached = readLocal(email);
  if (cached !== null) return cached;

  writeLocal(email, FREE_TOKENS_MAX);
  await persistQuota(email, FREE_TOKENS_MAX);
  return FREE_TOKENS_MAX;
}

