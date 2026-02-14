import React, {useState, useEffect, useRef, useCallback} from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Easing,
  ActivityIndicator,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {useAuthStore, useChatStore} from '../lib/store';
import {api} from '../lib/api';
import PaywallModal from '../components/PaywallModal';
import {scheduleReminder} from '../lib/notifications';

// Renders text with **bold** markdown support
function FormattedText({
  children,
  style,
}: {
  children: string;
  style: any;
}) {
  const parts = children.split(/(\*\*[^*]+\*\*)/g);
  return (
    <Text style={style}>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <Text key={i} style={{fontWeight: '700'}}>
              {part.slice(2, -2)}
            </Text>
          );
        }
        return part;
      })}
    </Text>
  );
}

function ThinkingIndicator() {
  const dots = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;
  const bubblePulse = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Wave animation on dots — staggered smooth sine-like bounce
    const dotAnims = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 180),
          Animated.timing(dot, {
            toValue: 1,
            duration: 400,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 400,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.delay((2 - i) * 180),
        ]),
      ),
    );
    dotAnims.forEach(a => a.start());

    // Subtle pulse on the bubble background
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(bubblePulse, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(bubblePulse, {
          toValue: 0,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();

    // Shimmer sweep across the bubble
    const shimmerAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
        Animated.delay(500),
      ]),
    );
    shimmerAnim.start();

    return () => {
      dotAnims.forEach(a => a.stop());
      pulse.stop();
      shimmerAnim.stop();
    };
  }, [dots, bubblePulse, shimmer]);

  const dotStyle = (dot: Animated.Value) => ({
    opacity: dot.interpolate({inputRange: [0, 1], outputRange: [0.35, 1]}),
    transform: [
      {scaleX: dot.interpolate({inputRange: [0, 1], outputRange: [1, 1.3]})},
      {scaleY: dot.interpolate({inputRange: [0, 1], outputRange: [1, 1.3]})},
      {translateY: dot.interpolate({inputRange: [0, 1], outputRange: [0, -8]})},
    ],
  });

  return (
    <View style={styles.thinkingContainer}>
      {/* Shimmer overlay bar */}
      <Animated.View
        style={[
          styles.thinkingShimmer,
          {
            opacity: shimmer.interpolate({inputRange: [0, 0.5, 1], outputRange: [0, 0.12, 0]}),
            transform: [
              {translateX: shimmer.interpolate({inputRange: [0, 1], outputRange: [-100, 250]})},
            ],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.thinkingBubble,
          {
            opacity: bubblePulse.interpolate({inputRange: [0, 1], outputRange: [1, 0.85]}),
            transform: [{scale: bubblePulse.interpolate({inputRange: [0, 1], outputRange: [1, 1.02]})}],
          },
        ]}>
        <Text style={styles.thinkingAvatar}>🦞</Text>
        <View style={styles.thinkingContent}>
          <View style={styles.thinkingDotsRow}>
            {dots.map((dot, i) => (
              <Animated.View key={i} style={[styles.thinkingDot, dotStyle(dot)]} />
            ))}
          </View>
          <Text style={styles.thinkingLabel}>Thinking</Text>
        </View>
      </Animated.View>
    </View>
  );
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isVoice?: boolean;
}

export default function ChatScreen() {
  const {messages, setMessages, updateLastMessage, sessionId, setSessionId} =
    useChatStore();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(!sessionId);
  const [isWaiting, setIsWaiting] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const typingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const prevCountRef = useRef(messages.length);
  const {updateUsage, profile} = useAuthStore();

  // Clean up typing animation on unmount
  useEffect(() => {
    return () => {
      if (typingRef.current) clearInterval(typingRef.current);
    };
  }, []);

  // Reliable scroll: track content height vs container height
  const contentHeightRef = useRef(0);
  const containerHeightRef = useRef(0);
  const shouldScrollRef = useRef(true);

  const scrollToBottom = useCallback((animated = false) => {
    const offset = contentHeightRef.current - containerHeightRef.current;
    if (offset > 0) {
      flatListRef.current?.scrollToOffset({offset, animated});
    }
  }, []);

  // Auto-scroll when messages change or waiting indicator appears
  useEffect(() => {
    if (messages.length > 0 || isWaiting) {
      shouldScrollRef.current = true;
      // Delay to let layout settle after state change
      setTimeout(() => scrollToBottom(), 80);
    }
  }, [messages, isWaiting, scrollToBottom]);

  // Scroll to bottom when tab gains focus (e.g. switching from voice tab)
  useFocusEffect(
    useCallback(() => {
      if (messages.length > 0) {
        setTimeout(() => scrollToBottom(), 100);
      }
    }, [messages.length, scrollToBottom]),
  );

  const hasMessages = (profile?.dailyMessagesUsed ?? 0) < (profile?.dailyMessagesLimit ?? 5);
  const [showPaywall, setShowPaywall] = useState(false);

  // Load recent messages (Redis-cached) then ensure session exists
  useEffect(() => {
    if (sessionId) {
      setInitialLoading(false);
      return;
    }
    const loadSession = async () => {
      try {
        // Fast path: load last 10 messages from Redis cache
        const recent = await api.getRecentMessages();
        if (recent.messages?.length > 0) {
          setMessages(recent.messages);
        }

        // Ensure a session exists for saving future messages
        const sessions = await api.getSessions();
        if (sessions.length > 0) {
          setSessionId(sessions[0].id);
        } else {
          const session = await api.createSession();
          setSessionId(session.id);
        }
      } catch {
        // Offline or error — continue without persistence
      } finally {
        setInitialLoading(false);
      }
    };
    loadSession();
  }, [sessionId, setSessionId, setMessages]);

  const saveMessages = useCallback(async (msgs: Message[]) => {
    if (!sessionId || msgs.length === 0) return;
    try {
      const title = msgs[0]?.content.slice(0, 50) || 'New Chat';
      await api.updateSession(sessionId, {messages: msgs, title});
    } catch {
      // Save failed silently
    }
  }, [sessionId]);

  // Auto-save when voice messages arrive from the shared store
  useEffect(() => {
    if (messages.length > prevCountRef.current && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.isVoice && lastMsg.role === 'assistant') {
        saveMessages(messages);
      }
    }
    prevCountRef.current = messages.length;
  }, [messages, saveMessages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;
    if (!hasMessages) {
      setShowPaywall(true);
      return;
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
    };
    const withUser = [...messages, userMsg];
    setMessages(withUser);
    setInput('');
    setLoading(true);
    setIsWaiting(true);

    try {
      const res = await api.sendMessage(text);
      setIsWaiting(false);
      if (res.usage) {
        updateUsage(res.usage.messagesUsed, res.usage.messagesLimit);
      }

      // Handle any actions returned by the agent (e.g. reminders)
      console.log('[Chat] Response actions:', res.actions?.length ?? 0, res.actions ? JSON.stringify(res.actions) : '');
      if (res.actions?.length > 0) {
        for (const action of res.actions) {
          console.log('[Chat] Processing action:', action.type, action.params);
          if (action.type === 'reminder' && action.params?.length >= 3) {
            const delaySeconds = parseInt(action.params[0], 10);
            console.log('[Chat] Scheduling reminder:', {delay: delaySeconds, title: action.params[1], body: action.params[2]});
            if (!isNaN(delaySeconds) && delaySeconds > 0) {
              scheduleReminder(action.params[1], action.params[2], delaySeconds)
                .then(() => console.log('[Chat] Reminder scheduled successfully'))
                .catch(err => {
                  console.error('[Chat] Failed to schedule reminder:', err);
                });
            }
          }
        }
      }

      const fullText: string = res.response;
      const assistantMsgId = (Date.now() + 1).toString();

      // Add empty assistant message, then animate typing
      setMessages([
        ...withUser,
        {id: assistantMsgId, role: 'assistant', content: ''},
      ]);
      setIsTyping(true);

      let charIndex = 0;
      typingRef.current = setInterval(() => {
        charIndex += 2;
        if (charIndex >= fullText.length) {
          clearInterval(typingRef.current!);
          typingRef.current = null;
          const finalMsgs: Message[] = [
            ...withUser,
            {id: assistantMsgId, role: 'assistant', content: fullText},
          ];
          setMessages(finalMsgs);
          saveMessages(finalMsgs);
          setIsTyping(false);
          setLoading(false);
          setTimeout(() => scrollToBottom(), 50);
        } else {
          updateLastMessage(fullText.slice(0, charIndex));
        }
      }, 12);
    } catch (err: any) {
      setIsWaiting(false);
      if (/limit/i.test(err.message)) {
        setShowPaywall(true);
      }
      useChatStore.getState().addMessage({
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Error: ${err.message}`,
      });
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>HeyClaw</Text>
        <Text style={styles.headerCredits}>
          {profile?.dailyMessagesUsed ?? 0}/{profile?.dailyMessagesLimit ?? 5}
        </Text>
      </View>

      {initialLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#ff6b35" />
        </View>
      ) : (
      <FlatList
        ref={flatListRef}
        style={{flex: 1}}
        data={messages}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={(_w, h) => {
          contentHeightRef.current = h;
          if (shouldScrollRef.current) {
            scrollToBottom();
          }
        }}
        onLayout={(e) => {
          containerHeightRef.current = e.nativeEvent.layout.height;
        }}
        onScrollBeginDrag={() => {
          shouldScrollRef.current = false;
        }}
        onMomentumScrollEnd={(e) => {
          // Re-enable auto-scroll if user scrolled near the bottom
          const {contentOffset, contentSize, layoutMeasurement} = e.nativeEvent;
          const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
          if (distanceFromBottom < 50) {
            shouldScrollRef.current = true;
          }
        }}
        ListFooterComponent={isWaiting ? <ThinkingIndicator /> : null}
        renderItem={({item}) => (
          <View
            style={[
              styles.bubble,
              item.role === 'user' ? styles.userBubble : styles.assistantBubble,
            ]}>
            {item.role === 'assistant' && (
              <Text style={styles.bubbleAvatar}>🦞</Text>
            )}
            <FormattedText
              style={[
                styles.bubbleText,
                item.role === 'user'
                  ? styles.userBubbleText
                  : styles.assistantBubbleText,
              ]}>
              {item.content}
            </FormattedText>
            {isTyping &&
              item.role === 'assistant' &&
              item.id === messages[messages.length - 1]?.id && (
                <Text style={styles.cursor}>▌</Text>
              )}
            {item.isVoice && <Text style={styles.voiceIcon}>🎤</Text>}
          </View>
        )}
      />
      )}

      {!hasMessages && (
        <TouchableOpacity style={styles.upgradeBar} onPress={() => setShowPaywall(true)}>
          <Text style={styles.upgradeBarText}>Daily limit reached. Tap to upgrade.</Text>
        </TouchableOpacity>
      )}

      <View style={styles.inputBar}>
        <TextInput
          style={styles.textInput}
          placeholder="Type a message..."
          placeholderTextColor="#666"
          value={input}
          onChangeText={setInput}
          onSubmitEditing={sendMessage}
          editable={!loading}
        />
        <TouchableOpacity
          style={[styles.sendButton, !hasMessages && styles.sendButtonDisabled]}
          onPress={sendMessage}
          disabled={loading}>
          <Text style={styles.sendButtonText}>
            {loading ? '...' : '\u2191'}
          </Text>
        </TouchableOpacity>
      </View>

      <PaywallModal visible={showPaywall} onClose={() => setShowPaywall(false)} />
    </KeyboardAvoidingView>
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
    paddingTop: 60,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  headerCredits: {
    fontSize: 14,
    color: '#ff6b35',
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageList: {
    padding: 16,
    paddingBottom: 80,
  },
  bubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  userBubble: {
    backgroundColor: '#ff6b35',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: '#1a1a1a',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  bubbleAvatar: {
    fontSize: 16,
    marginRight: 8,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 22,
    flex: 1,
  },
  userBubbleText: {
    color: '#fff',
  },
  assistantBubbleText: {
    color: '#ddd',
  },
  voiceIcon: {
    fontSize: 12,
    marginLeft: 4,
  },
  upgradeBar: {
    backgroundColor: '#ff6b3520',
    paddingVertical: 10,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#ff6b3540',
  },
  upgradeBarText: {
    color: '#ff6b35',
    fontSize: 14,
    fontWeight: '600',
  },
  inputBar: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 15,
    marginRight: 8,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ff6b35',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#333',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  cursor: {
    color: '#ff6b35',
    fontWeight: '300',
  },
  thinkingContainer: {
    alignSelf: 'flex-start',
    maxWidth: '60%',
    marginBottom: 8,
    overflow: 'hidden',
    borderRadius: 18,
  },
  thinkingShimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 80,
    height: '100%',
    backgroundColor: '#ff6b35',
    borderRadius: 18,
    zIndex: 1,
  },
  thinkingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  thinkingAvatar: {
    fontSize: 18,
    marginRight: 10,
  },
  thinkingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  thinkingDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  thinkingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ff6b35',
  },
  thinkingLabel: {
    color: '#888',
    fontSize: 13,
    fontWeight: '500',
    marginLeft: 2,
  },
});
