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
} from 'react-native';
import {useAuthStore} from '../lib/store';
import {api} from '../lib/api';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isVoice?: boolean;
}

const MODEL_CREDITS = {standard: 10, power: 30, best: 100} as const;

export default function ChatScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const sessionIdRef = useRef<string | null>(null);
  const {selectedModel, deductCredits, profile} = useAuthStore();

  const creditsPerMsg = MODEL_CREDITS[selectedModel];
  const hasCredits = (profile?.creditsRemaining ?? 0) >= creditsPerMsg;

  // Load or create chat session on mount
  useEffect(() => {
    const loadSession = async () => {
      try {
        const sessions = await api.getSessions();
        if (sessions.length > 0) {
          const session = await api.getSession(sessions[0].id);
          sessionIdRef.current = session.id;
          if (session.messages?.length > 0) {
            setMessages(session.messages);
          }
        } else {
          const session = await api.createSession();
          sessionIdRef.current = session.id;
        }
      } catch {
        // Offline or error — continue without persistence
      }
    };
    loadSession();
  }, []);

  const saveMessages = useCallback(async (msgs: Message[]) => {
    if (!sessionIdRef.current || msgs.length === 0) return;
    try {
      const title = msgs[0]?.content.slice(0, 50) || 'New Chat';
      await api.updateSession(sessionIdRef.current, {messages: msgs, title});
    } catch {
      // Save failed silently
    }
  }, []);

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

    try {
      const res = await api.sendMessage(text, selectedModel);
      deductCredits(creditsPerMsg);

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: res.response,
      };
      const withAssistant = [...withUser, assistantMsg];
      setMessages(withAssistant);
      saveMessages(withAssistant);
    } catch (err: any) {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Error: ${err.message}`,
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
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

      <FlatList
        data={messages}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.messageList}
        renderItem={({item}) => (
          <View
            style={[
              styles.bubble,
              item.role === 'user' ? styles.userBubble : styles.assistantBubble,
            ]}>
            {item.role === 'assistant' && (
              <Text style={styles.bubbleAvatar}>🦞</Text>
            )}
            <Text
              style={[
                styles.bubbleText,
                item.role === 'user'
                  ? styles.userBubbleText
                  : styles.assistantBubbleText,
              ]}>
              {item.content}
            </Text>
            {item.isVoice && <Text style={styles.voiceIcon}>🎤</Text>}
          </View>
        )}
      />

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
});
