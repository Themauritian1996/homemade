/** Stub web de @stripe/stripe-react-native (le paiement natif n'existe que sur Android/iOS). */
import React from 'react';

export function StripeProvider({ children }: { children: React.ReactNode } & Record<string, unknown>) {
  return <>{children}</>;
}

const unsupported = async () => ({ error: { code: 'Unsupported', message: 'Paiement disponible sur mobile uniquement.' } });

export function useStripe() {
  return { initPaymentSheet: unsupported, presentPaymentSheet: unsupported };
}
