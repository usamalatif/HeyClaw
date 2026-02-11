// Apple In-App Purchase verification
// Uses App Store Server API v2
// Docs: https://developer.apple.com/documentation/appstoreserverapi

const APPLE_BUNDLE_ID = 'com.heyclaw.app';

interface VerificationResult {
  valid: boolean;
  productId?: string;
  originalTransactionId?: string;
  expiresDate?: string;
}

export async function verifyReceipt(
  receiptData: string,
): Promise<VerificationResult> {
  // TODO: Implement proper App Store Server API v2 verification
  // 1. Decode the JWS (JSON Web Signature) transaction
  // 2. Verify the signature using Apple's root certificate
  // 3. Check the bundle ID matches
  // 4. Return product and transaction info

  // Placeholder for development
  console.log('Verifying IAP receipt (placeholder):', receiptData.slice(0, 50));

  return {
    valid: false,
    productId: undefined,
    originalTransactionId: undefined,
    expiresDate: undefined,
  };
}

export function getProductPlan(productId: string): string {
  const mapping: Record<string, string> = {
    'com.heyclaw.starter.monthly': 'starter',
    'com.heyclaw.pro.monthly': 'pro',
    'com.heyclaw.ultra.monthly': 'ultra',
  };

  return mapping[productId] ?? 'free';
}
