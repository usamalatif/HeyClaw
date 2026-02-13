// Apple In-App Purchase verification
// Uses JWS decoding for App Store Server API v2 transactions
// Docs: https://developer.apple.com/documentation/appstoreserverapi

import {decodeJwt} from 'jose';

const APPLE_BUNDLE_ID = 'com.heyclaw.app';

export interface VerificationResult {
  valid: boolean;
  productId?: string;
  originalTransactionId?: string;
  expiresDate?: string;
  bundleId?: string;
}

// Decode and validate a signed transaction from StoreKit 2
// For MVP: decode the JWS payload without full certificate chain verification
// In production: add Apple root certificate verification via jose.jwtVerify()
export function decodeTransaction(signedTransaction: string): VerificationResult {
  try {
    const payload = decodeJwt(signedTransaction) as Record<string, any>;

    const bundleId = payload.bundleId ?? payload.appAppleId;
    const productId = payload.productId;
    const originalTransactionId = payload.originalTransactionId;
    const expiresDate = payload.expiresDate
      ? new Date(payload.expiresDate).toISOString()
      : undefined;

    // Validate bundle ID
    if (bundleId && bundleId !== APPLE_BUNDLE_ID) {
      console.warn(`Bundle ID mismatch: expected ${APPLE_BUNDLE_ID}, got ${bundleId}`);
      return {valid: false};
    }

    if (!productId) {
      console.warn('No productId in transaction payload');
      return {valid: false};
    }

    return {
      valid: true,
      productId,
      originalTransactionId: String(originalTransactionId),
      expiresDate,
      bundleId,
    };
  } catch (err) {
    console.error('Failed to decode transaction:', err);
    return {valid: false};
  }
}

// Decode App Store Server Notification V2 payload
export function decodeNotification(signedPayload: string): Record<string, any> | null {
  try {
    const payload = decodeJwt(signedPayload) as Record<string, any>;
    return payload;
  } catch (err) {
    console.error('Failed to decode notification:', err);
    return null;
  }
}

// Map product ID to plan name
export function getProductPlan(productId: string): string {
  const mapping: Record<string, string> = {
    'com.heyclaw.pro.monthly': 'pro',
    'com.heyclaw.premium.monthly': 'premium',
    // Legacy product IDs for existing subscribers
    'com.heyclaw.starter.monthly': 'pro',
    'com.heyclaw.ultra.monthly': 'premium',
  };

  return mapping[productId] ?? 'free';
}
