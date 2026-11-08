import { Wallet } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import { AppText, Button, Screen, TextField } from '@/components/ui';
import { authClient } from '@/lib/auth-client';
import { API_URL } from '@/lib/config';
import { radius, space, useTheme } from '@/theme';

type Step = 'email' | 'code';

export default function LoginScreen() {
  const theme = useTheme();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    const address = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(address)) {
      setError('Masukkan alamat email yang valid.');
      return;
    }
    setPending(true);
    setError(null);
    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email: address,
      type: 'sign-in',
    });
    setPending(false);
    if (error) {
      setError(error.message ?? 'Gagal mengirim kode. Periksa koneksi ke server.');
      return;
    }
    setEmail(address);
    setStep('code');
  }

  async function verify() {
    if (!/^\d{6}$/.test(code.trim())) {
      setError('Kode terdiri dari 6 angka.');
      return;
    }
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.emailOtp({ email, otp: code.trim() });
    setPending(false);
    // On success the session changes and the root layout swaps to the app
    if (error) setError('Kode salah atau sudah kedaluwarsa.');
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior="height" style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: space.xl }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ gap: space.xl }}>
            <View style={{ alignItems: 'center', gap: space.md }}>
              <View
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: radius.lg,
                  backgroundColor: theme.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Wallet color={theme.onPrimary} size={36} />
              </View>
              <AppText variant="hero">Catetin</AppText>
              <AppText tone="muted" style={{ textAlign: 'center' }}>
                {step === 'email'
                  ? 'Masuk dengan email. Kode sekali pakai akan dikirim ke email kamu.'
                  : `Masukkan 6 angka yang dikirim ke ${email}.`}
              </AppText>
            </View>

            {step === 'email' ? (
              <View style={{ gap: space.md }}>
                <TextField
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  textContentType="emailAddress"
                  placeholder="nama@email.com"
                  onSubmitEditing={sendCode}
                  returnKeyType="send"
                />
                <Button title="Kirim kode" onPress={sendCode} loading={pending} />
              </View>
            ) : (
              <View style={{ gap: space.md }}>
                <TextField
                  label="Kode masuk"
                  value={code}
                  onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  placeholder="123456"
                  maxLength={6}
                  autoFocus
                  onSubmitEditing={verify}
                  style={{ fontSize: 24, letterSpacing: 8, textAlign: 'center' }}
                  hint="Kode hanya dikirim ke email pemilik akun Catetin."
                />
                <Button title="Masuk" onPress={verify} loading={pending} />
                <Button
                  title="Ganti email / kirim ulang"
                  variant="ghost"
                  onPress={() => {
                    setStep('email');
                    setCode('');
                    setError(null);
                  }}
                />
              </View>
            )}

            {error && (
              <AppText tone="danger" style={{ textAlign: 'center' }}>
                {error}
              </AppText>
            )}
            <AppText variant="caption" tone="muted" style={{ textAlign: 'center' }}>
              Server: {API_URL || 'belum diatur (EXPO_PUBLIC_API_URL)'}
            </AppText>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
