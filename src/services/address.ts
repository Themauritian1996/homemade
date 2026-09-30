/**
 * Adresse PRIVÉE du Cooker et recherche par zone.
 * - L'adresse exacte vit dans `user_private` (illisible directement) : lue et écrite par RPC seulement.
 * - Publiquement : la zone postale (« H2J ») et un point décalé de 100 à 300 m (serveur).
 * - Géocodage gratuit et sans clé : Nominatim (OpenStreetMap), repli sur Photon. Appels depuis le téléphone,
 *   avec une identification de l'app (politique d'utilisation de Nominatim).
 */
import { getLang } from '@/i18n';
import { DEMO_MODE } from '@/lib/config';
import { requireSupabase } from '@/lib/supabase';
import type { GeoPoint } from '@/types';

export interface MyAddress {
  address: string | null;
  postalCode: string | null;
  zone: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface GeoResult extends GeoPoint {
  label: string;
  postalCode: string | null;
}

const HEADERS = { 'User-Agent': 'HomemadeBeta/1.0 (+https://github.com/Themauritian1996/homemade)', Referer: 'https://homemade.app/' };

/** « h2j1a1 » → « H2J 1A1 » ; null si ce n'est pas un code postal canadien complet. */
export function normalizePostalCode(p: string): string | null {
  const c = p.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(c) ? `${c.slice(0, 3)} ${c.slice(3)}` : null;
}

/** Zone postale (3 premiers caractères) si la saisie ressemble à un code postal, complet ou partiel. */
export const postalZone = (p: string) => (/^[A-Z]\d[A-Z]/.test(p.toUpperCase().replace(/[^A-Z0-9]/g, '')) ? p.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) : null);

async function nominatim(query: string): Promise<GeoResult | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&countrycodes=ca&accept-language=${getLang()}&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const [hit] = (await res.json()) as { lat: string; lon: string; display_name: string; address?: { postcode?: string } }[];
  return hit ? { latitude: Number(hit.lat), longitude: Number(hit.lon), label: hit.display_name, postalCode: hit.address?.postcode ?? null } : null;
}

async function photon(query: string): Promise<GeoResult | null> {
  // Biais vers Montréal ; Photon renvoie du GeoJSON.
  const url = `https://photon.komoot.io/api/?limit=1&lat=45.52&lon=-73.58&lang=${getLang() === 'en' ? 'en' : 'fr'}&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Photon ${res.status}`);
  const f = ((await res.json()) as { features?: { geometry: { coordinates: [number, number] }; properties: Record<string, string> }[] }).features?.[0];
  if (!f) return null;
  const p = f.properties;
  return {
    latitude: f.geometry.coordinates[1],
    longitude: f.geometry.coordinates[0],
    label: [p.name, p.housenumber && p.street ? `${p.housenumber} ${p.street}` : p.street, p.city, p.postcode].filter(Boolean).join(', '),
    postalCode: p.postcode ?? null,
  };
}

/** Adresse, code postal (complet ou « H2J ») ou lieu → coordonnées. */
export async function geocode(query: string): Promise<GeoResult | null> {
  const q = query.trim();
  if (!q) return null;
  const zone = postalZone(q);
  const full = normalizePostalCode(q);
  const text = full ?? (zone && q.replace(/\s/g, '').length <= 3 ? zone : q);
  const withCountry = /canada|québec|quebec/i.test(text) ? text : `${text}, Canada`;
  try {
    const hit = await nominatim(withCountry);
    if (hit) return hit;
  } catch {
    // service occupé : repli
  }
  return photon(withCountry).catch(() => null);
}

export async function getMyAddress(): Promise<MyAddress | null> {
  if (DEMO_MODE) return null;
  const { data, error } = await requireSupabase().rpc('get_my_address');
  if (error) throw error;
  return (data as MyAddress) ?? null;
}

export async function saveMyAddress(address: string, postalCode: string, point: GeoPoint): Promise<MyAddress> {
  if (DEMO_MODE) return { address, postalCode, zone: postalZone(postalCode), latitude: point.latitude, longitude: point.longitude };
  const { data, error } = await requireSupabase().rpc('set_my_address', {
    p_address: address,
    p_postal_code: postalCode,
    p_lat: point.latitude,
    p_lng: point.longitude,
  });
  if (error) throw error;
  return data as MyAddress;
}

export interface PickupDetails extends GeoPoint {
  area: string;
  address: string | null;
  postalCode: string | null;
}

/** Adresse exacte d'une commande : seulement après acceptation (et paiement pour un achat). */
export async function fetchPickupDetails(orderId: string): Promise<PickupDetails | null> {
  if (DEMO_MODE) return null;
  const { data, error } = await requireSupabase().rpc('get_pickup_details', { p_order_id: orderId });
  if (error) throw error;
  return (data as PickupDetails) ?? null;
}
