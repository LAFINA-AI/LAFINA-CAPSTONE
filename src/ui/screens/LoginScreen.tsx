import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  Alert,
  Image,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Mail, Lock, Check, Eye, EyeOff, AlertCircle } from 'lucide-react-native';
import { Fonts } from '../theme';
import { userStore } from '../../storage';
import { accountLinkService } from '../../cloud/accountLinkService';
import { syncWorker } from '../../sync/syncWorker';
import { useTheme } from '../contexts/ThemeContext';
import { useThemedStyles } from '../theme/createThemedStyles';
import type { ThemeColors } from '../contexts/ThemeContext';

const logo = require('../../assets/lafina_default_logo.png');

interface LoginScreenProps {
  onLoginSuccess: (userId: string) => void;
  onNavigateToRegister: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onLoginSuccess,
  onNavigateToRegister,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(false);
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(
    null,
  );

  const { colors, isDarkMode } = useTheme();
  const themed = useThemedStyles(getLoginThemedStyles);

  useEffect(() => {
    const saved = userStore.getRememberMe();
      if (saved.enabled) {
        setRememberMe(true);
        if (saved.email) {
          setEmail(saved.email);
        }
      }
    }, []);

  const handleRememberMeToggle = () => {
    setRememberMe(prev => !prev);
  };

  const handleEmailChange = (text: string) => {
    setEmail(text);
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
            userStore.setRememberMe(true, trimmedEmail.toLowerCase());
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

    const isEmailFocused = focusedField === 'email';
    const isPasswordFocused = focusedField === 'password';

    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View
            style={[
              styles.card,
              themed.card,
              isDarkMode ? styles.cardDarkBorder : styles.cardLightBorder,
            ]}
          >
              {/* Brand Mark */}
              <View style={styles.brandContainer}>
                <Image
                  source={logo}
                  style={styles.logoImage}
                  resizeMode="contain"
                  accessibilityLabel="LAFINA"
                />
              </View>

                {/* Header Typography */}
                <Text style={[styles.title, themed.title]}>Welcome Back</Text>
                <Text style={[styles.subtitle, themed.subtitle]}>
                  Sign in to access your offline schedule
                </Text>

                {/* Error Notice */}
                {error && (
                  <View
                    style={[
                      styles.errorCard,
                      isDarkMode ? styles.errorCardDark : styles.errorCardLight,
                    ]}
                    accessibilityRole="alert"
                  >
                    <AlertCircle
                      size={16}
                      color={colors.error}
                      style={styles.errorIcon}
                    />
                    <Text style={[styles.errorText, { color: colors.error }]}>
                      {error}
                    </Text>
                  </View>
                )}

                {/* Form Fields */}
                  <View style={styles.fieldGroup}>
                    <Text style={[styles.fieldLabel, themed.fieldLabel]}>
                      Email Address
                    </Text>
                    <View
                      style={[
                        styles.inputWrapper,
                        themed.inputWrapper,
                        isEmailFocused && themed.inputWrapperFocused,
                      ]}
                    >
                        <View style={styles.iconSlot}>
                          <Mail
                            size={18}
                            color={isEmailFocused ? colors.blue : colors.textSecondary}
                          />
                        </View>
                        <TextInput
                          style={[styles.input, themed.input]}
                          placeholder="student@ustp.edu.ph"
                          placeholderTextColor={colors.placeholder}
                          value={email}
                          onChangeText={handleEmailChange}
                          keyboardType="email-address"
                          autoCapitalize="none"
                          autoCorrect={false}
                          autoComplete="email"
                          textContentType="emailAddress"
                          onFocus={() => setFocusedField('email')}
                          onBlur={() => setFocusedField(null)}
                        />
                      </View>
                    </View>

                      <View style={styles.fieldGroup}>
                        <Text style={[styles.fieldLabel, themed.fieldLabel]}>Password</Text>
                        <View
                          style={[
                            styles.inputWrapper,
                            themed.inputWrapper,
                            isPasswordFocused && themed.inputWrapperFocused,
                          ]}
                        >
                            <View style={styles.iconSlot}>
                              <Lock
                                size={18}
                                color={isPasswordFocused ? colors.blue : colors.textSecondary}
                              />
                            </View>
                            <TextInput
                              style={[styles.input, themed.input]}
                              placeholder="••••••••"
                              placeholderTextColor={colors.placeholder}
                              secureTextEntry={!showPassword}
                              value={password}
                              onChangeText={setPassword}
                              autoCapitalize="none"
                              autoCorrect={false}
                              autoComplete="current-password"
                              textContentType="password"
                              onFocus={() => setFocusedField('password')}
                              onBlur={() => setFocusedField(null)}
                            />
                            <TouchableOpacity
                              onPress={() => setShowPassword(!showPassword)}
                              style={styles.eyeButton}
                              activeOpacity={0.7}
                              accessibilityRole="button"
                              accessibilityLabel={
                                showPassword ? 'Hide password' : 'Show password'
                              }
                              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                            >
                              {showPassword ? (
                  <EyeOff size={18} color={colors.textSecondary} />
                              ) : (
                  <Eye size={18} color={colors.textSecondary} />
                              )}
                            </TouchableOpacity>
                          </View>
                        </View>

                        {/* Options Row */}
                        <View style={styles.optionsRow}>
                          <TouchableOpacity
                            style={styles.rememberRow}
                            onPress={handleRememberMeToggle}
                            activeOpacity={0.75}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: rememberMe }}
                            accessibilityLabel="Remember me"
                          >
                            <View
                              style={[
                                styles.checkbox,
                                themed.checkbox,
                                rememberMe && themed.checkboxChecked,
                              ]}
                            >
                              {rememberMe && (
                  <Check size={12} strokeWidth={2.8} color="#FFFFFF" />
                              )}
                            </View>
                              <Text style={[styles.rememberText, themed.rememberText]}>
                                Remember me
                              </Text>
                          </TouchableOpacity>
                        </View>

                        {/* Primary Action Button */}
                        <TouchableOpacity
                          style={[
                            styles.primaryButton,
                            { backgroundColor: colors.blue },
                            loading && styles.buttonDisabled,
                          ]}
                          onPress={handleLogin}
                          disabled={loading}
                          activeOpacity={0.88}
                          accessibilityRole="button"
                          accessibilityLabel="Sign In"
                        >
                          {loading ? (
                            <ActivityIndicator color="#FFFFFF" size="small" />
                          ) : (
              <Text style={styles.primaryButtonText}>Sign In</Text>
                          )}
                        </TouchableOpacity>

                        {/* Understated Footer */}
                        <View style={styles.footer}>
                          <Text style={[styles.footerText, themed.footerText]}>
                            Don't have an account?{' '}
                          </Text>
                          <TouchableOpacity
                            onPress={onNavigateToRegister}
                            activeOpacity={0.75}
                            style={styles.registerTouchTarget}
                            accessibilityRole="button"
                            accessibilityLabel="Register for an account"
                          >
                            <Text style={[styles.registerLink, themed.link]}>Register</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </ScrollView>
                  </KeyboardAvoidingView>
                  );
};

const getLoginThemedStyles = (colors: ThemeColors) => ({
                    card: {
                    backgroundColor: colors.cardBg,
  },
                    title: {
                    color: colors.textPrimary,
  },
                    subtitle: {
                    color: colors.textSecondary,
  },
                  fieldLabel: {
                    color: colors.textPrimary,
  },
                    inputWrapper: {
                    borderColor: colors.border,
                  backgroundColor: colors.inputBg,
  },
                    inputWrapperFocused: {
                    borderColor: colors.blue,
  },
                  input: {
                    color: colors.textPrimary,
  },
                    rememberText: {
                    color: colors.textSecondary,
  },
                  checkbox: {
                    borderColor: colors.border,
                  backgroundColor: colors.cardBg,
  },
                  checkboxChecked: {
                    backgroundColor: colors.blue,
                  borderColor: colors.blue,
  },
                  footerText: {
                    color: colors.textSecondary,
  },
                    link: {
                    color: colors.blue,
  },
});

                  const styles = StyleSheet.create({
                    container: {
                    flex: 1,
  },
                  scrollContainer: {
                    flexGrow: 1,
                  justifyContent: 'center',
                  paddingHorizontal: 20,
                  paddingVertical: 32,
  },
                  card: {
                    borderRadius: 24,
                  paddingHorizontal: 26,
                  paddingTop: 32,
                  paddingBottom: 28,
                  width: '100%',
                  elevation: 10,
                  shadowColor: '#000000',
                  shadowOffset: {width: 0, height: 16},
                  shadowOpacity: 0.12,
                  shadowRadius: 28,
  },
                  cardDarkBorder: {
                    borderWidth: 1,
                  borderColor: 'rgba(255, 255, 255, 0.1)',
  },
                  cardLightBorder: {
                    borderWidth: 1,
                  borderColor: 'rgba(0, 0, 0, 0.06)',
  },
                  brandContainer: {
                    alignItems: 'center',
                  marginBottom: 16,
  },
                  logoImage: {
                    width: 140,
                  height: 56,
  },
                    title: {
                    fontFamily: Fonts.heading,
                  fontSize: 24,
                  fontWeight: '700',
                  textAlign: 'center',
                  letterSpacing: -0.4,
  },
                    subtitle: {
                    fontFamily: Fonts.body,
                  fontSize: 14,
                  textAlign: 'center',
                  marginTop: 6,
                  marginBottom: 24,
                  lineHeight: 20,
  },
                    errorCard: {
                    flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: 12,
                  marginBottom: 18,
                  borderWidth: 1,
  },
                    errorCardDark: {
                    backgroundColor: 'rgba(255, 59, 48, 0.12)',
                  borderColor: 'rgba(255, 59, 48, 0.28)',
  },
                    errorCardLight: {
                    backgroundColor: 'rgba(255, 59, 48, 0.08)',
                  borderColor: 'rgba(255, 59, 48, 0.2)',
  },
                  errorIcon: {
                    marginRight: 8,
  },
                  errorText: {
                    fontFamily: Fonts.body,
                  fontSize: 13,
                  fontWeight: '500',
                  flex: 1,
  },
                  fieldGroup: {
                    marginBottom: 16,
  },
                  fieldLabel: {
                    fontFamily: Fonts.body,
                  fontSize: 12,
                  fontWeight: '600',
                  marginBottom: 7,
                  letterSpacing: 0.4,
  },
                    inputWrapper: {
                    flexDirection: 'row',
                  alignItems: 'center',
                  borderWidth: 1,
                  borderRadius: 14,
                  paddingHorizontal: 14,
                  height: 52,
  },
                    iconSlot: {
                    marginRight: 10,
                  justifyContent: 'center',
                  alignItems: 'center',
  },
                  input: {
                    flex: 1,
                  height: '100%',
                  fontFamily: Fonts.body,
                  fontSize: 15,
                  paddingVertical: 0,
  },
                  eyeButton: {
                    padding: 6,
                  justifyContent: 'center',
                  alignItems: 'center',
  },
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
                  width: 18,
                  height: 18,
                  borderRadius: 5,
                  borderWidth: 1.5,
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginRight: 8,
  },
                    rememberText: {
                    fontFamily: Fonts.body,
                  fontSize: 13.5,
  },
                  primaryButton: {
                    height: 52,
                  borderRadius: 14,
                  justifyContent: 'center',
                  alignItems: 'center',
                  elevation: 4,
                  shadowColor: '#E6003A',
                  shadowOffset: {width: 0, height: 6},
                  shadowOpacity: 0.28,
                  shadowRadius: 10,
  },
                  buttonDisabled: {
                    opacity: 0.7,
  },
                    primaryButtonText: {
                    fontFamily: Fonts.body,
                  color: '#FFFFFF',
                  fontWeight: '600',
                  fontSize: 16,
                  letterSpacing: 0.2,
  },
                  footer: {
                    flexDirection: 'row',
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginTop: 22,
  },
                  footerText: {
                    fontFamily: Fonts.body,
                  fontSize: 14,
  },
                  registerTouchTarget: {
                  paddingVertical: 4,
  },
                  registerLink: {
                    fontFamily: Fonts.body,
                  fontWeight: '600',
                  fontSize: 14,
  },
});
