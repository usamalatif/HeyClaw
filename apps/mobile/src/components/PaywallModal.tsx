import React from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import {useIAPStore, purchaseSubscription, restorePurchases} from '../lib/iap';

interface PaywallModalProps {
  visible: boolean;
  onClose: () => void;
}

const PLANS = [
  {
    sku: 'com.heyclaw.pro.monthly',
    name: 'Pro',
    price: '$9.99/mo',
    highlight: '500 messages/day',
    badge: 'Popular',
    features: ['500 messages per day', '30 min voice/day', 'Premium voices', 'Chat history'],
  },
  {
    sku: 'com.heyclaw.premium.monthly',
    name: 'Premium',
    price: '$29.99/mo',
    highlight: '2,000 messages/day',
    features: ['2,000 messages per day', '120 min voice/day', 'All premium features', 'Priority support'],
  },
];

export default function PaywallModal({visible, onClose}: PaywallModalProps) {
  const {products, purchasing, restoring, error} = useIAPStore();

  const getPrice = (sku: string) => {
    const product = products.find(p => p.productId === sku);
    return (product as any)?.localizedPrice ?? null;
  };

  const handlePurchase = (sku: string) => {
    purchaseSubscription(sku);
  };

  const handleRestore = () => {
    restorePurchases();
  };

  const isLoading = purchasing || restoring;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Upgrade Your Plan</Text>
          <TouchableOpacity onPress={onClose} disabled={isLoading}>
            <Text style={styles.closeButton}>Done</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.subtitle}>
          Unlock more daily conversations with your AI agent
        </Text>

        <View style={styles.freeTier}>
          <Text style={styles.freeLabel}>Free Plan</Text>
          <Text style={styles.freeDetail}>50 messages/day · 5 min voice/day</Text>
        </View>

        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <ScrollView style={styles.plansList} contentContainerStyle={styles.plansContent}>
          {PLANS.map(plan => {
            const livePrice = getPrice(plan.sku);
            return (
              <View key={plan.sku} style={styles.planCard}>
                <View style={styles.planHeader}>
                  <Text style={styles.planName}>{plan.name}</Text>
                  {plan.badge && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{plan.badge}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.planPrice}>
                  {livePrice ?? plan.price}
                </Text>
                <Text style={styles.planHighlight}>
                  {plan.highlight}
                </Text>
                <View style={styles.featuresList}>
                  {plan.features.map((feature, i) => (
                    <Text key={i} style={styles.featureItem}>
                      {'\u2713'} {feature}
                    </Text>
                  ))}
                </View>
                <TouchableOpacity
                  style={styles.purchaseButton}
                  onPress={() => handlePurchase(plan.sku)}
                  disabled={isLoading}>
                  {purchasing ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.purchaseButtonText}>
                      Subscribe
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity onPress={handleRestore} disabled={isLoading}>
            <Text style={styles.restoreText}>
              {restoring ? 'Restoring...' : 'Restore Purchases'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.legalText}>
            Subscriptions auto-renew monthly. Cancel anytime in Settings.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },
  closeButton: {
    fontSize: 16,
    color: '#ff6b35',
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 14,
    color: '#999',
    paddingHorizontal: 24,
    marginBottom: 12,
  },
  freeTier: {
    marginHorizontal: 24,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  freeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
  },
  freeDetail: {
    fontSize: 13,
    color: '#666',
  },
  errorBanner: {
    backgroundColor: '#e6394620',
    marginHorizontal: 24,
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  errorText: {
    color: '#e63946',
    fontSize: 13,
    textAlign: 'center',
  },
  plansList: {
    flex: 1,
  },
  plansContent: {
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  planCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  planName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  badge: {
    backgroundColor: '#ff6b35',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 10,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  planPrice: {
    fontSize: 28,
    fontWeight: '800',
    color: '#ff6b35',
    marginTop: 4,
  },
  planHighlight: {
    fontSize: 14,
    color: '#999',
    marginTop: 2,
    marginBottom: 12,
  },
  featuresList: {
    marginBottom: 16,
  },
  featureItem: {
    fontSize: 14,
    color: '#ccc',
    marginBottom: 4,
  },
  purchaseButton: {
    backgroundColor: '#ff6b35',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  purchaseButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    alignItems: 'center',
  },
  restoreText: {
    color: '#ff6b35',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  legalText: {
    color: '#666',
    fontSize: 11,
    textAlign: 'center',
  },
});
