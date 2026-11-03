import { describe, expect, it } from 'vitest';
import { PayPalError, validatePremiumCapture, type PayPalCapture } from '../../server/paypal';

const USER = 'user-1';

function capture(overrides: { status?: string; captureStatus?: string; customId?: string; value?: string; currency?: string; id?: string } = {}): PayPalCapture {
  return {
    status: overrides.status ?? 'COMPLETED',
    purchase_units: [
      {
        custom_id: overrides.customId ?? USER,
        payments: {
          captures: [
            {
              id: 'id' in overrides ? overrides.id : 'CAP-1',
              status: overrides.captureStatus ?? 'COMPLETED',
              amount: { currency_code: overrides.currency ?? 'USD', value: overrides.value ?? '19.95' },
            },
          ],
        },
      },
    ],
  };
}

describe('validatePremiumCapture', () => {
  it('accepts a completed 19.95 USD capture for the same user', () => {
    expect(validatePremiumCapture(capture(), USER)).toEqual({ captureId: 'CAP-1', amount: 19.95, currency: 'USD' });
  });

  it.each([
    ['order not completed', { status: 'APPROVED' }],
    ['capture pending', { captureStatus: 'PENDING' }],
    ['paid by another account', { customId: 'someone-else' }],
    ['wrong amount', { value: '0.01' }],
    ['wrong currency', { currency: 'EUR' }],
    ['missing capture id', { id: undefined }],
  ])('rejects %s', (_label, overrides) => {
    expect(() => validatePremiumCapture(capture(overrides), USER)).toThrow(PayPalError);
  });

  it('rejects an empty PayPal answer', () => {
    expect(() => validatePremiumCapture({}, USER)).toThrow('PAYPAL_CAPTURE_VALIDATION_FAILED');
  });
});
