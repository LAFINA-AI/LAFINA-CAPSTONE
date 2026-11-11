import React from 'react';
import {Alert} from 'react-native';
import type {AlertButton} from 'react-native';
import {act, fireEvent, render} from '@testing-library/react-native';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {ProfileScreen} from '../../src/ui/screens/ProfileScreen';
import {CharacterAvatar} from '../../src/ui/components/profile/CharacterAvatar';
import {
  AVATAR_BACKDROPS,
  areTraitsVisuallyDistinct,
  describeCharacterTraits,
  resolveCharacterTraits,
} from '../../src/ui/components/profile/characterAvatarGenerator';
import {
  avatarSeedStore,
  db,
  guestMigration,
  initDatabase,
  userStore,
} from '../../src/storage';
import {GUEST_USER_ID} from '../../src/constants';
import {removeAvatarImage} from '../../src/ui/components/profile/avatarFile';

describe('Profile Offline Random Character Avatar', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    jest.restoreAllMocks();
    db.executeSync('DELETE FROM active_session');
    db.executeSync('DELETE FROM user_preferences');
    db.executeSync('DELETE FROM local_settings');
    db.executeSync('DELETE FROM users');
  });

  test('resolveCharacterTraits is deterministic, avoids backdrop/outfit clashes, and avoids beanie+bun collisions', () => {
    const first = resolveCharacterTraits('seed-alpha-1');
    const second = resolveCharacterTraits('seed-alpha-1');
    expect(first).toEqual(second);

    const seenHairStyles = new Set<string>();
    const seenAccessories = new Set<string>();
    const seenOutfits = new Set<string>();
    const seenEyes = new Set<string>();
    const seenMouths = new Set<string>();

    for (let i = 0; i < 180; i += 1) {
      const traits = resolveCharacterTraits(`probe-seed-${i}`);
      const backdrop = AVATAR_BACKDROPS.find(
        b => b.id === traits.background.id,
      );
      expect(backdrop).toBeDefined();
      expect(backdrop?.clashOutfitIds).not.toContain(traits.outfitColor.id);
      if (traits.accessory === 'beanie') {
        expect(['spaceBuns', 'highPonytail']).not.toContain(traits.hairStyle);
      }
      seenHairStyles.add(traits.hairStyle);
      seenAccessories.add(traits.accessory);
      seenOutfits.add(traits.outfitStyle);
      seenEyes.add(traits.eyeStyle);
      seenMouths.add(traits.mouthStyle);
    }

    expect(seenHairStyles.size).toBe(8);
    expect(seenAccessories.size).toBe(6);
    expect(seenOutfits.size).toBe(4);
    expect(seenEyes.size).toBe(5);
    expect(seenMouths.size).toBe(5);
  });

  test('CharacterAvatar renders offline SVG portrait across diverse seeds without errors', () => {
    const {getByTestId, rerender} = render(
      <CharacterAvatar seed="render-seed-0" size={112} testID="char-avatar" />,
    );
    const node = getByTestId('char-avatar');
    expect(node.props.accessibilityRole).toBe('image');
    expect(node.props.accessibilityLabel).toBe(
      describeCharacterTraits(resolveCharacterTraits('render-seed-0')),
    );

    for (let i = 1; i <= 25; i += 1) {
      rerender(
        <CharacterAvatar
          seed={`render-seed-${i}`}
          size={112}
          testID="char-avatar"
        />,
      );
      expect(getByTestId('char-avatar').props.accessibilityLabel).toContain(
        'Character avatar with',
      );
    }
  });

  test('avatarSeedStore persists seeds per user and migrates guest seed safely', async () => {
    const guest = userStore.createGuestUser();
    const initial = avatarSeedStore.getOrCreate(guest.id);
    expect(initial).toBeTruthy();
    expect(avatarSeedStore.getOrCreate(guest.id)).toBe(initial);

    const randomized = avatarSeedStore.randomize(guest.id, initial);
    expect(randomized).not.toBe(initial);
    expect(avatarSeedStore.get(guest.id)).toBe(randomized);

    // Existing cloud user keeps their own seed if one is already saved.
    const establishedId = 'cloud-established-avatar';
    const now = new Date().toISOString();
    db.executeSync(
      `INSERT INTO users (id, username, email, role, is_new_user, created_at, updated_at)
       VALUES (?, ?, ?, 'student', 0, ?, ?)`,
      [establishedId, 'Established', 'est@example.invalid', now, now],
    );
    avatarSeedStore.set(establishedId, 'established-seed-keep');
    await guestMigration.linkGuestToCloudAccount(
      establishedId,
      'est@example.invalid',
    );
    expect(avatarSeedStore.get(establishedId)).toBe('established-seed-keep');
    expect(avatarSeedStore.get(GUEST_USER_ID)).toBeNull();

    // Fresh cloud user inherits guest's seed when none exists yet.
    const freshGuest = userStore.createGuestUser();
    avatarSeedStore.set(freshGuest.id, 'guest-chosen-seed');
    const freshCloudId = 'cloud-fresh-avatar';
    await guestMigration.linkGuestToCloudAccount(
      freshCloudId,
      'fresh@example.invalid',
    );
    expect(avatarSeedStore.get(freshCloudId)).toBe('guest-chosen-seed');
  });

  test('ProfileScreen shows random character avatar instead of initials and persists across remounts', () => {
    const guest = userStore.createGuestUser();

    const firstRender = render(
      <ThemeProvider userId={guest.id}>
        <ProfileScreen
          userId={guest.id}
          refreshTrigger={0}
          onRefresh={jest.fn()}
        />
      </ThemeProvider>,
    );

    const avatar = firstRender.getByTestId('profile-character-avatar');
    const firstLabel = avatar.props.accessibilityLabel;
    expect(firstLabel).toContain('Character avatar with');
    expect(firstRender.queryByText('GU')).toBeNull();
    firstRender.unmount();

    const secondRender = render(
      <ThemeProvider userId={guest.id}>
        <ProfileScreen
          userId={guest.id}
          refreshTrigger={0}
          onRefresh={jest.fn()}
        />
      </ThemeProvider>,
    );
    expect(
      secondRender.getByTestId('profile-character-avatar').props
        .accessibilityLabel,
    ).toBe(firstLabel);
  });

  test('tapping randomize badge rolls a visually distinct character avatar offline', () => {
    const guest = userStore.createGuestUser();
    const ui = render(
      <ThemeProvider userId={guest.id}>
        <ProfileScreen
          userId={guest.id}
          refreshTrigger={0}
          onRefresh={jest.fn()}
        />
      </ThemeProvider>,
    );

    const beforeSeed = avatarSeedStore.get(guest.id)!;
    const beforeTraits = resolveCharacterTraits(beforeSeed);

    fireEvent.press(ui.getByTestId('profile-randomize-avatar-btn'));

    const afterSeed = avatarSeedStore.get(guest.id)!;
    const afterTraits = resolveCharacterTraits(afterSeed);
    expect(afterSeed).not.toBe(beforeSeed);
    expect(areTraitsVisuallyDistinct(beforeTraits, afterTraits)).toBe(true);
    expect(
      ui.getByTestId('profile-character-avatar').props.accessibilityLabel,
    ).toBe(describeCharacterTraits(afterTraits));
  });

  test('ProfileScreen avatar menu supports rolling a new character and switching from a custom photo back to a character', async () => {
    const guest = userStore.createGuestUser();
    const alerts: Array<{
      title: string;
      message?: string;
      buttons?: AlertButton[];
    }> = [];
    jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
      alerts.push({title, message, buttons});
    });

    const ui = render(
      <ThemeProvider userId={guest.id}>
        <ProfileScreen
          userId={guest.id}
          refreshTrigger={0}
          onRefresh={jest.fn()}
        />
      </ThemeProvider>,
    );

    const seedBeforeMenu = avatarSeedStore.get(guest.id)!;
    fireEvent.press(ui.getByTestId('profile-avatar-btn'));
    const noPhotoAlert = alerts.find(a => a.title === 'Profile Avatar');
    expect(noPhotoAlert).toBeDefined();
    act(() => {
      noPhotoAlert?.buttons
        ?.find(btn => btn.text === 'New Random Character')
        ?.onPress?.();
    });
    const seedAfterMenu = avatarSeedStore.get(guest.id)!;
    expect(seedAfterMenu).not.toBe(seedBeforeMenu);
    ui.unmount();

    // Now set a custom device photo and verify switching back to a random character.
    userStore.setAvatarUri(guest.id, '/documents/avatars/custom-photo.jpg');
    const photoUi = render(
      <ThemeProvider userId={guest.id}>
        <ProfileScreen
          userId={guest.id}
          refreshTrigger={0}
          onRefresh={jest.fn()}
        />
      </ThemeProvider>,
    );

    expect(photoUi.queryByTestId('profile-character-avatar')).toBeNull();
    expect(photoUi.queryByTestId('profile-randomize-avatar-btn')).toBeNull();

    alerts.length = 0;
    fireEvent.press(photoUi.getByTestId('profile-avatar-btn'));
    const photoAlert = alerts.find(a => a.title === 'Profile Avatar');
    expect(photoAlert).toBeDefined();

    await act(async () => {
      photoAlert?.buttons
        ?.find(btn => btn.text === 'Use Random Character')
        ?.onPress?.();
    });

    expect(userStore.getUserById(guest.id)?.avatarUri).toBeNull();
    expect(photoUi.getByTestId('profile-character-avatar')).toBeTruthy();
    expect(photoUi.getByTestId('profile-randomize-avatar-btn')).toBeTruthy();
    expect(removeAvatarImage).toBeDefined();
  });
});
