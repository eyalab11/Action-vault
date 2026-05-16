/**
 * Auth screen — email + password for MVP.
 * Swap in Supabase social auth (Apple, Google) later.
 */

import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Redirect } from 'expo-router';
import { useAuthStore } from '../stores/auth';
import { colors, radius, typography, spacing, cardShadow } from '../lib/theme';

export default function AuthScreen() {
  const { session, signInWithEmail, signUpWithEmail } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [loading, setLoading] = useState(false);

  if (session) return <Redirect href="/(tabs)/add" />;

  async function handleSubmit() {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'signin') {
        await signInWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        {/* Warm circle mark */}
        <View style={styles.markWrap}>
          <View style={styles.mark}>
            <Text style={styles.markLetter}>A</Text>
          </View>
        </View>

        <Text style={styles.logo}>ActionVault</Text>
        <Text style={styles.tagline}>
          Your private oasis for saved content.{'\n'}Distilled into action.
        </Text>

        {/* Form card */}
        <View style={styles.formCard}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={colors.textLight}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={colors.textLight}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <Pressable
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>
                {mode === 'signin' ? 'Sign in' : 'Create account'}
              </Text>
            )}
          </Pressable>
        </View>

        <Pressable
          onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
        >
          <Text style={styles.toggleText}>
            {mode === 'signin'
              ? "Don't have an account? Sign up"
              : 'Already have an account? Sign in'}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingBottom: 40,
  },

  markWrap: { alignItems: 'center', marginBottom: 24 },
  mark: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...cardShadow,
    shadowOpacity: 0.15,
  },
  markLetter: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },

  logo: {
    ...typography.display,
    textAlign: 'center',
    marginBottom: 10,
  },
  tagline: {
    ...typography.body,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 36,
  },

  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 20,
    marginBottom: 24,
    ...cardShadow,
  },

  input: {
    height: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 12,
    color: colors.textPrimary,
    backgroundColor: colors.bg,
  },

  button: {
    height: 52,
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  toggleText: {
    color: colors.textMuted,
    textAlign: 'center',
    fontSize: 14,
  },
});
