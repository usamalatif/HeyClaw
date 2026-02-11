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
  ActivityIndicator,
} from 'react-native';
import {useAuthStore, useChatStore} from '../lib/store';
import {api} from '../lib/api';

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

function TypingIndicator() {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animate = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]),
      );

    const a1 = animate(dot1, 0);
    const a2 = animate(dot2, 150);
    const a3 = animate(dot3, 300);
    a1.start();
    a2.start();
    a3.start();

    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [dot1, dot2, dot3]);

  const dotStyle = (dot: Animated.Value) => ({
    opacity: dot.interpolate({inputRange: [0, 1], outputRange: [0.3, 1]}),
    transform: [
      {
        translateY: dot.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -4],
        }),
      },
    ],
  });

  return (
    <View style={[styles.bubble, styles.assistantBubble, styles.typingBubble]}>
      <Text style={styles.bubbleAvatar}>🦞</Text>
      <View style={styles.dotsRow}>
        <Animated.View style={[styles.dot, dotStyle(dot1)]} />
        <Animated.View style={[styles.dot, dotStyle(dot2)]} />
        <Animated.View style={[styles.dot, dotStyle(dot3)]} />
      </View>
    </View>
  );
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isVoice?: boolean;
}

const MODEL_CREDITS = {standard: 10, power: 30, best: 100} as const;

export default function ChatScreen() {
  const {messages, setMessages, updateLastMessage, sessionId, setSessionId} =
    useChatStore();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(!sessionId);
  const [isWaiting, setIsWaiting] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const typingRef = useRef<NodeJS.Timeout | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const prevCountRef = useRef(messages.length);
  const {selectedModel, deductCredits, profile} = useAuthStore();

  // Clean up typing animation on unmount
  useEffect(() => {
    return () => {
      if (typingRef.current) clearInterval(typingRef.current);
    };
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({animated: true});
      }, 50);
    }
  }, [messages]);

  const creditsPerMsg = MODEL_CREDITS[selectedModel];
  const hasCredits = (profile?.creditsRemaining ?? 0) >= creditsPerMsg;

  // Load or create chat session on mount
  useEffect(() => {
    if (sessionId) {
      setInitialLoading(false);
      return;
    }
    const loadSession = async () => {
      try {
        const sessions = await api.getSessions();
        if (sessions.length > 0) {
          const session = await api.getSession(sessions[0].id);
          setSessionId(session.id);
          if (session.messages?.length > 0) {
            setMessages(session.messages);
          }
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
    if (!text || loading || !hasCredits) return;

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
      const res = await api.sendMessage(text, selectedModel);
      setIsWaiting(false);
      deductCredits(creditsPerMsg);

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
        } else {
          updateLastMessage(fullText.slice(0, charIndex));
        }
      }, 12);
    } catch (err: any) {
      setIsWaiting(false);
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
          {profile?.creditsRemaining ?? 0} cr
        </Text>
      </View>

      {initialLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#ff6b35" />
        </View>
      ) : (
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.messageList}
        ListFooterComponent={isWaiting ? <TypingIndicator /> : null}
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
          style={[styles.sendButton, !hasCredits && styles.sendButtonDisabled]}
          onPress={sendMessage}
          disabled={loading || !hasCredits}>
          <Text style={styles.sendButtonText}>
            {loading ? '...' : '\u2191'}
          </Text>
        </TouchableOpacity>
      </View>
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
    paddingBottom: 8,
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
  typingBubble: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#666',
  },
});
