import React, {useMemo, useState} from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {Check, Lock, Mail, User} from 'lucide-react-native';
import {Fonts} from '../theme';
import {validatePassword} from '../../storage';
import {accountLinkService} from '../../cloud/accountLinkService';
import {syncWorker} from '../../sync/syncWorker';
import {useTheme} from '../contexts/ThemeContext';
import {AuthShell} from '../components/auth/AuthShell';
import {AuthInput} from '../components/auth/AuthInput';
import {AuthButton} from '../components/auth/AuthButton';
import {TermsModal} from '../components/auth/TermsModal';
import {PrivacyModal} from '../components/profile/PrivacyModal';
import {IntroColors} from './onboarding/intro/introTokens';

interface RegisterScreenProps {
  onRegisterSuccess: (userId: string) => void;
  onNavigateToLogin: () => void;
  onBack?: () => void;
}

const STRENGTH_SEGMENT_COUNT = 5;

const getPasswordStrength = (
  password: string,
): {score: number; color: string} => {
  if (!password) {
    return {score: 0, color: '#E3E1EC'};
  }
  let score = 1;
  if (password.length >= 6) score += 1;
  if (password.length >= 8) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[A-Z]/.test(password) || /[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 2) {
    return {score, color: '#E05252'};
  }
  if (score === 3) {
    return {score, color: '#E59400'};
  }
  return {score, color: IntroColors.green};
};

export const RegisterScreen: React.FC<RegisterScreenProps> = ({
  onRegisterSuccess,
  onNavigateToLogin,
  onBack,
}) => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [termsVisible, setTermsVisible] = useState(false);
  const [privacyVisible, setPrivacyVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {colors, isDarkMode} = useTheme();
  const strength = useMemo(() => getPasswordStrength(password), [password]);

  const isFormReady =
    Boolean(username.trim()) &&
    Boolean(email.trim()) &&
    Boolean(password) &&
    agreedToTerms;

  const completeRegistration = (userId: string, message?: string) => {
    if (message) {
      Alert.alert('Offline-Only Account', message);
    }
    onRegisterSuccess(userId);
  };

  const handleOfflineOnlyRegistration = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await accountLinkService.registerOfflineOnly({
        username,
        email,
        password,
      });
      if (result.status === 'offline_only' && result.localUserId) {
        completeRegistration(result.localUserId, result.message);
      } else {
        setError(result.message);
      }
    } catch (registrationError: unknown) {
      setError(
        registrationError instanceof Error
          ? registrationError.message
          : 'Offline registration failed.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (loading) return;

    if (!username.trim() || !email.trim() || !password) {
      setError('Please fill in all fields');
      return;
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      setError(passwordValidation.error);
      return;
    }

    if (password.length < 8 || !/\d/.test(password)) {
      setError('Use 8+ characters with a number.');
      return;
    }

    if (!agreedToTerms) {
      setError('Please agree to the Terms and Privacy Policy');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await accountLinkService.registerCloudFirst({
        username,
        email,
        password,
      });

      if (
        result.status === 'offline' ||
        result.status === 'server_unavailable'
      ) {
        setLoading(false);
        Alert.alert(
          result.status === 'offline'
            ? 'Device Offline'
            : 'FastAPI Unavailable',
          `${result.message}\n\nYou can cancel and try again, or explicitly create an offline-only account.`,
          [
            {text: 'Cancel', style: 'cancel'},
            {
              text: 'Create Offline-Only Account',
              onPress: handleOfflineOnlyRegistration,
            },
          ],
        );
        return;
      }

      if (result.status === 'success' && result.localUserId) {
        syncWorker.performSync().catch(err => {
          console.warn('[RegisterScreen] Background sync error:', err);
        });
        completeRegistration(result.localUserId);
        return;
      }

      if (result.status === 'local_only' && result.localUserId) {
        completeRegistration(result.localUserId, result.message);
        return;
      }

      setError(result.message);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const inactiveBarColor = isDarkMode ? colors.border : '#E3E1EC';
  const helperColor = isDarkMode ? colors.textSecondary : '#626277';
  const termsTextColor = isDarkMode ? colors.textPrimary : '#26243B';
  const linkColor = isDarkMode ? '#9D93FF' : IntroColors.brand;
  const checkboxBorder = isDarkMode ? colors.border : '#5F5D73';

  return (
    <AuthShell
      activeTab="register"
      title="Create your account"
      subtitle="Back up your schedule and keep it in sync."
      onSelectTab={tab => {
        if (tab === 'login') onNavigateToLogin();
      }}
      onBack={onBack}
      error={error}
    >
      <AuthInput
        label="Name"
        placeholder="What should LAFINA call you?"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        renderIcon={color => <User size={18} color={color} />}
      />

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
        placeholder="Create a password"
        secureTextEntry={!showPassword}
        value={password}
        onChangeText={setPassword}
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        renderIcon={color => <Lock size={18} color={color} />}
        showPasswordToggle
        showPassword={showPassword}
        onPasswordToggle={() => setShowPassword(prev => !prev)}
        containerStyle={styles.passwordInputGroup}
      />

      {/* Password Strength Meter */}
      <View
        style={styles.strengthRow}
        accessibilityLabel={`Password strength ${strength.score} of ${STRENGTH_SEGMENT_COUNT}`}
        testID="register-password-strength"
      >
        {Array.from({length: STRENGTH_SEGMENT_COUNT}, (_, index) => {
          const active = index < strength.score;
          return (
            <View
              key={index}
              style={[
                styles.strengthSegment,
                {
                  backgroundColor: active ? strength.color : inactiveBarColor,
                },
              ]}
            />
          );
        })}
      </View>
      <Text style={[styles.passwordHint, {color: helperColor}]}>
        Use 8+ characters with a number.
      </Text>

      {/* Terms and Privacy Policy */}
      <View style={styles.termsRow}>
        <TouchableOpacity
          onPress={() => setAgreedToTerms(prev => !prev)}
          activeOpacity={0.75}
          accessibilityRole="checkbox"
          accessibilityState={{checked: agreedToTerms}}
          accessibilityLabel="I agree to the Terms and Privacy Policy"
          testID="register-terms-checkbox"
          hitSlop={{top: 8, bottom: 8, left: 8, right: 6}}
          style={styles.checkboxHitArea}
        >
          <View
            style={[
              styles.checkbox,
              {
                borderColor: agreedToTerms ? IntroColors.brand : checkboxBorder,
                backgroundColor: agreedToTerms
                  ? IntroColors.brand
                  : 'transparent',
              },
            ]}
          >
            {agreedToTerms ? (
              <Check size={13} strokeWidth={3} color="#FFFFFF" />
            ) : null}
          </View>
        </TouchableOpacity>

        <View style={styles.termsCopyWrap}>
          <Pressable
            onPress={() => setAgreedToTerms(prev => !prev)}
            hitSlop={{top: 6, bottom: 6}}
          >
            <Text style={[styles.termsText, {color: termsTextColor}]}>
              I agree to the{' '}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setTermsVisible(true)}
            accessibilityRole="link"
            testID="register-terms-link"
            hitSlop={{top: 6, bottom: 6}}
          >
            <Text style={[styles.termsLink, {color: linkColor}]}>Terms</Text>
          </Pressable>
          <Text style={[styles.termsText, {color: termsTextColor}]}> and </Text>
          <Pressable
            onPress={() => setPrivacyVisible(true)}
            accessibilityRole="link"
            testID="register-privacy-link"
            hitSlop={{top: 6, bottom: 6}}
          >
            <Text style={[styles.termsLink, {color: linkColor}]}>
              Privacy Policy
            </Text>
          </Pressable>
        </View>
      </View>

      <AuthButton
        title="Create account"
        onPress={handleRegister}
        loading={loading}
        muted={!isFormReady}
        testID="register-submit-button"
      />

      <TermsModal
        visible={termsVisible}
        onClose={() => setTermsVisible(false)}
      />
      <PrivacyModal
        visible={privacyVisible}
        onClose={() => setPrivacyVisible(false)}
      />
    </AuthShell>
  );
};

const styles = StyleSheet.create({
  passwordInputGroup: {
    marginBottom: 12,
  },
  strengthRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  strengthSegment: {
    flex: 1,
    height: 3.5,
    borderRadius: 2,
  },
  passwordHint: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
    lineHeight: 17,
    marginBottom: 18,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 22,
  },
  checkboxHitArea: {
    paddingRight: 10,
    justifyContent: 'center',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  termsCopyWrap: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  termsText: {
    fontFamily: Fonts.body,
    fontSize: 13.5,
    lineHeight: 20,
  },
  termsLink: {
    fontFamily: Fonts.body,
    fontSize: 13.5,
    lineHeight: 20,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
});
