import { useEffect, useState } from 'react';
import { aiAvailable } from '@/services/ai';

/** `null` pendant la vérification, puis vrai/faux. */
export function useAiAvailable(): boolean | null {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    aiAvailable().then((v) => alive && setOk(v));
    return () => {
      alive = false;
    };
  }, []);
  return ok;
}
