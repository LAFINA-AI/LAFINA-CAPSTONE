import React, {useState} from 'react';
import {userStore} from '../../storage';
import {onboardingProgressStore} from '../../storage/onboardingProgressStore';
import {IntroPager} from './onboarding/IntroPager';

interface WelcomeScreenProps {
  onGetStarted: (userId: string) => void;
  onNavigateToLogin: () => void;
  onNavigateToRegister: () => void;
}

/**
 * The introduction shown before anyone signs in (four pages: what LAFINA
 * is, planning by text or voice, USTP handbook answers for students with a
 * COR, and local-first storage). After it has been seen once on this phone
 * it opens on the last page. Starting without an account reuses the
 * phone's guest profile; it never creates a second guest identity.
 */
export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onGetStarted,
  onNavigateToLogin,
  onNavigateToRegister,
}) => {
  const [startFailed, setStartFailed] = useState(false);
  const [initialPage] = useState(() => (onboardingProgressStore.introSeen() ? 3 : 0));

  const markSeen = () => {
    try {
      onboardingProgressStore.markIntroSeen();
    } catch {
      // Not remembering the introduction only means it is shown again.
    }
  };

  const handleGetStarted = () => {
    markSeen();
    let guestId: string;
    try {
      const guest = userStore.createGuestUser();
      userStore.setCurrentUser(guest.id);
      guestId = guest.id;
    } catch (error) {
      console.error('Could not start guest mode:', error);
      setStartFailed(true);
      return;
    }
    setStartFailed(false);
    onGetStarted(guestId);
  };

  return (
    <IntroPager
      mode="welcome"
      initialPage={initialPage}
      onFinish={handleGetStarted}
      onSignIn={() => {
        markSeen();
        onNavigateToLogin();
      }}
      onCreateAccount={() => {
        markSeen();
        onNavigateToRegister();
      }}
      error={
        startFailed
          ? 'LAFINA couldn’t save your guest profile, so nothing was started. Please try again.'
          : null
      }
    />
  );
};
