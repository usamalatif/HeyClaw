import {create} from 'zustand';
import {Platform, Linking} from 'react-native';
import {
  initConnection,
  endConnection,
  getSubscriptions,
  requestSubscription,
  getAvailablePurchases,
  finishTransaction,
  purchaseUpdatedListener,
  purchaseErrorListener,
  type Subscription,
  type SubscriptionPurchase,
  type PurchaseError,
} from 'react-native-iap';
import {api} from './api';
import {useAuthStore} from './store';

const PRODUCT_IDS = [
  'com.heyclaw.pro.monthly',
  'com.heyclaw.premium.monthly',
  // Legacy IDs (still accepted by backend)
  'com.heyclaw.starter.monthly',
  'com.heyclaw.ultra.monthly',
];

interface IAPState {
  products: Subscription[];
  purchasing: boolean;
  restoring: boolean;
  error: string | null;
  setProducts: (products: Subscription[]) => void;
  setPurchasing: (purchasing: boolean) => void;
  setRestoring: (restoring: boolean) => void;
  setError: (error: string | null) => void;
}

export const useIAPStore = create<IAPState>(set => ({
  products: [],
  purchasing: false,
  restoring: false,
  error: null,
  setProducts: products => set({products}),
  setPurchasing: purchasing => set({purchasing}),
  setRestoring: restoring => set({restoring}),
  setError: error => set({error}),
}));

function updateProfileFromAPI(user: any) {
  useAuthStore.getState().setProfile({
    id: user.id,
    email: user.email,
    name: user.name,
    plan: user.plan || 'free',
    agentName: user.agent?.displayName || 'HeyClaw',
    voice: user.agent?.voice || 'alloy',
    dailyMessagesUsed: user.usage?.textMessages || 0,
    dailyMessagesLimit: user.limits?.dailyTextMessages || 50,
    dailyVoiceSeconds: user.usage?.voiceSeconds || 0,
    dailyVoiceLimit: (user.limits?.dailyVoiceInputMinutes || 5) * 60,
  });
}

let purchaseUpdateSubscription: ReturnType<typeof purchaseUpdatedListener> | null = null;
let purchaseErrorSubscription: ReturnType<typeof purchaseErrorListener> | null = null;

async function handlePurchase(purchase: SubscriptionPurchase) {
  const store = useIAPStore.getState();
  try {
    const receipt = purchase.transactionReceipt;
    if (!receipt) return;

    // Send to backend for verification
    await api.verifyReceipt(receipt, purchase.productId);

    // Reload profile with updated plan + limits
    const user = await api.getMe();
    updateProfileFromAPI(user);

    // Acknowledge the transaction with Apple
    await finishTransaction({purchase, isConsumable: false});
    store.setPurchasing(false);
    store.setError(null);
  } catch (err: any) {
    console.error('Purchase verification failed:', err);
    store.setPurchasing(false);
    store.setError(err.message || 'Purchase verification failed');
  }
}

export async function initIAP() {
  if (Platform.OS !== 'ios') return;

  try {
    await initConnection();

    // Fetch available subscriptions
    const subs = await getSubscriptions({skus: PRODUCT_IDS});
    useIAPStore.getState().setProducts(subs);

    // Listen for purchases
    purchaseUpdateSubscription = purchaseUpdatedListener(
      async (purchase: SubscriptionPurchase) => {
        await handlePurchase(purchase);
      },
    );

    purchaseErrorSubscription = purchaseErrorListener(
      (error: PurchaseError) => {
        console.warn('Purchase error:', error);
        useIAPStore.getState().setPurchasing(false);
        if (error.code !== 'E_USER_CANCELLED') {
          useIAPStore.getState().setError(error.message || 'Purchase failed');
        }
      },
    );
  } catch (err) {
    console.error('IAP init failed:', err);
  }
}

export async function purchaseSubscription(sku: string) {
  const store = useIAPStore.getState();
  store.setPurchasing(true);
  store.setError(null);

  try {
    await requestSubscription({sku});
    // Result handled by purchaseUpdatedListener
  } catch (err: any) {
    store.setPurchasing(false);
    if (err.code !== 'E_USER_CANCELLED') {
      store.setError(err.message || 'Purchase failed');
    }
  }
}

export async function restorePurchases() {
  const store = useIAPStore.getState();
  store.setRestoring(true);
  store.setError(null);

  try {
    const purchases = await getAvailablePurchases();
    if (purchases.length === 0) {
      store.setRestoring(false);
      store.setError('No purchases to restore');
      return;
    }

    // Find the most recent subscription purchase
    const sorted = purchases
      .filter(p => PRODUCT_IDS.includes(p.productId))
      .sort((a, b) => (b.transactionDate ?? 0) - (a.transactionDate ?? 0));

    if (sorted.length > 0) {
      const latest = sorted[0];
      const receipt = latest.transactionReceipt;
      if (receipt) {
        await api.verifyReceipt(receipt, latest.productId);
        const user = await api.getMe();
        updateProfileFromAPI(user);
      }
    }

    store.setRestoring(false);
  } catch (err: any) {
    store.setRestoring(false);
    store.setError(err.message || 'Restore failed');
  }
}

export function openSubscriptionManagement() {
  Linking.openURL('https://apps.apple.com/account/subscriptions');
}

export async function endIAP() {
  purchaseUpdateSubscription?.remove();
  purchaseErrorSubscription?.remove();
  purchaseUpdateSubscription = null;
  purchaseErrorSubscription = null;
  await endConnection();
}
