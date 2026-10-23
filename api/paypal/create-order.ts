import { createPremiumOrder } from '../../server/paypal';
import {
  getAdminSupabase,
  requireAuthenticatedUser,
  type RequestLike,
} from '../../server/supabase';

interface ApiResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
  setHeader?(name: string, value: string): void;
}

export default async function handler(req: RequestLike & { method?: string }, res: ApiResponse) {
  res.setHeader?.('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await requireAuthenticatedUser(req);
  if (!auth) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!getAdminSupabase()) {
    return res.status(503).json({
      error: 'Premium payments are temporarily unavailable',
      code: 'SUPABASE_SERVICE_KEY_MISSING',
    });
  }

  try {
    const order = await createPremiumOrder(auth.user.id);
    return res.status(200).json(order);
  } catch (error) {
    console.error('[paypal/create-order]', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unable to create order',
    });
  }
}
