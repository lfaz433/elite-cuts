export interface StaffBookingIntentFields {
  status?: string;
  paymentStatus?: string;
  pricePaid?: number;
  tip?: number;
  paymentMethod?: string;
}

export type StaffBookingCreateAction =
  | { status: 'approved' }
  | {
    status: 'completed';
    payment: {
      amountMinor: number;
      tipMinor: number;
      method: 'cash';
      evidence: { type: 'staff_cash_attestation' };
    };
  };

function minorUnits(value: number | undefined, field: string): number {
  const amount = value ?? 0;
  const minor = Math.round(amount * 100);
  if (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(minor)) {
    throw new Error(`${field} is invalid`);
  }
  return minor;
}

export function staffCreateActionForBooking(
  fields: StaffBookingIntentFields,
): StaffBookingCreateAction | undefined {
  if (!fields.status || fields.status === 'pending') return undefined;
  if (fields.status === 'approved') {
    if (fields.paymentStatus === 'paid') {
      throw new Error('An approved booking cannot be marked paid before completion');
    }
    return { status: 'approved' };
  }
  if (fields.status !== 'completed' || fields.paymentStatus !== 'paid') {
    throw new Error('Unsupported staff booking lifecycle');
  }
  if (fields.paymentMethod === 'card') {
    throw new Error('Card payments require verified processor evidence');
  }
  return {
    status: 'completed',
    payment: {
      amountMinor: minorUnits(fields.pricePaid, 'pricePaid'),
      tipMinor: minorUnits(fields.tip, 'tip'),
      method: 'cash',
      evidence: { type: 'staff_cash_attestation' },
    },
  };
}
