import Stripe from 'npm:stripe@22';
import { env } from './http.ts';

// Client HTTP basé sur fetch : requis dans le runtime Deno.
export const stripe = () => new Stripe(env('STRIPE_SECRET_KEY'), { httpClient: Stripe.createFetchHttpClient() });

export const cryptoProvider = Stripe.createSubtleCryptoProvider();

// Version d'API attendue par le SDK mobile pour les clés éphémères (voir la doc de @stripe/stripe-react-native).
export const EPHEMERAL_KEY_API_VERSION = env('STRIPE_EPHEMERAL_KEY_API_VERSION', '2024-06-20');

export const SERVICE_FEE_RATE = Number(env('SERVICE_FEE_RATE', '0.05')); // payé par l'Eater
export const PLATFORM_FEE_RATE = Number(env('PLATFORM_FEE_RATE', '0.12')); // prélevé sur le Cooker

export type { Stripe };
