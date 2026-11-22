import React, {useEffect, useState} from 'react';
import {Alert, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {Check, Lock, Mail} from 'lucide-react-native';
import {Fonts} from '../theme';
import {userStore} from '../../storage';
import {accountLinkService} from '../../cloud/accountLinkService';
import {syncWorker} from '../../sync/syncWorker';
import {useTheme} from '../contexts/ThemeContext';
import {AuthShell} from '../components/auth/AuthShell';
import {AuthInput} from '../components/auth/AuthInput';
import {AuthButton} from '../components/auth/AuthButton';
import {IntroColors} from './onboarding/intro/introTokens';

interface LoginScreenProps {
  onLoginSuccess: (userId: string) => void;
  onNavigateToRegister: () => void;
  onBack?: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onLoginSuccess,
  onNavigateToRegister,
  onBack,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(false);

  const {colors, isDarkMode} = useTheme();

  useEffect(() => {
    const saved = userStore.getRememberMe();
    if (saved.enabled) {
      setRememberMe(true);
      if (saved.email) {
        setEmail(saved.email);
      }
      if (saved.password) {
        setPassword(saved.password);
      }
    }
  }, []);

  const handleRememberMeToggle = () => {
    setRememberMe(prev => !prev);
  };

  const handleLogin = async () => {
    if (loading) return;

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password.trim()) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await accountLinkService.login(trimmedEmail, password);
      if (
        (result.status === 'success' || result.status === 'local_only') &&
        result.localUserId
      ) {
        // Persist or clear Remember Me on successful login
        if (rememberMe) {
          userStore.setRememberMe(true, trimmedEmail.toLowerCase(), password);
        } else {
          userStore.setRememberMe(false, null);
        }

        if (result.status === 'success') {
          syncWorker.performSync().catch(err => {
            console.warn('[LoginScreen] Background sync error:', err);
          });
        }

        if (result.status === 'local_only') {
          Alert.alert(
            'Signed In for Offline Mode',
            `${result.message}\n\nLAFINA will retry automatic FastAPI linking on startup or when the app resumes with internet access.`,
          );
        }

        onLoginSuccess(result.localUserId);
      } else {
        setError(result.message);
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'An error occurred during login',
      );
    } finally {
      setLoading(false);
    }
  };

  const isFormReady = Boolean(email.trim()) && Boolean(password.trim());
  const checkboxBorder = isDarkMode ? colors.border : '#5F5D73';
  const rememberColor = isDarkMode ? colors.textSecondary : '#26243B';

  return (
    <AuthShell
      activeTab="login"
      title="Welcome back"
      subtitle="Sign in to access your schedule and keep it in sync."
      onSelectTab={tab => {
        if (tab === 'register') onNavigateToRegister();
      }}
      onBack={onBack}
      error={error}
    >
      <AuthInput
        label="Email"
        placeholder="student@ustp.edu.ph"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        renderIcon={color => <Mail size={18} color={color} />}
      />

      <AuthInput
        label="Password"
        placeholder="••••••••"
        secureTextEntry={!showPassword}
        value={password}
        onChangeText={setPassword}
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        renderIcon={color => <Lock size={18} color={color} />}
        showPasswordToggle
        showPassword={showPassword}
        onPasswordToggle={() => setShowPassword(prev => !prev)}
      />

      <View style={styles.optionsRow}>
        <TouchableOpacity
          style={styles.rememberRow}
          onPress={handleRememberMeToggle}
          activeOpacity={0.75}
          accessibilityRole="checkbox"
          accessibilityState={{checked: rememberMe}}
          accessibilityLabel="Remember me"
          hitSlop={{top: 8, bottom: 8, left: 4, right: 8}}
        >
          <View
            style={[
              styles.checkbox,
              {
                borderColor: rememberMe ? IntroColors.brand : checkboxBorder,
                backgroundColor: rememberMe ? IntroColors.brand : 'transparent',
              },
            ]}
          >
            {rememberMe ? (
              <Check size={13} strokeWidth={3} color="#FFFFFF" />
            ) : null}
          </View>
          <Text style={[styles.rememberText, {color: rememberColor}]}>
            Remember me
          </Text>
        </TouchableOpacity>
      </View>

      <AuthButton
        title="Sign in"
        onPress={handleLogin}
        loading={loading}
        muted={!isFormReady}
        testID="login-submit-button"
      />
    </AuthShell>
  );
};

const styles = StyleSheet.create({
  optionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: 2,
    marginBottom: 22,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  rememberText: {
    fontFamily: Fonts.body,
    fontSize: 13.5,
  },
});
