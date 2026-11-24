import React from 'react';
import {act, fireEvent, render} from '@testing-library/react-native';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {ProfileScreen} from '../../src/ui/screens/ProfileScreen';
import {HomeHeader} from '../../src/ui/screens/dashboard/components/modern/HomeHeader';
import {CharacterAvatar} from '../../src/ui/components/profile/CharacterAvatar';
import {DefaultProfileAvatar} from '../../src/ui/components/profile/DefaultProfileAvatar';
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
  normalizeAvatarSeed,
  syncOutboxStore,
  userStore,
} from '../../src/storage';
import {buildProfileSyncPayload} from '../../src/storage/profileSyncPayload';
import {GUEST_USER_ID} from '../../src/constants';
import {removeAvatarImage} from '../../src/ui/components/profile/avatarFile';

describe('Profile Default Neutral Avatar & Synced Character Avatars', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    jest.restoreAllMocks();
    db.executeSync('DELETE FROM active_session');
    db.executeSync('DELETE FROM sync_outbox');
    db.executeSync('DELETE FROM sync_metadata');
    db.executeSync('DELETE FROM user_preferences');
    db.executeSync('DELETE FROM local_settings');
    db.executeSync('DELETE FROM users');
  });

  test('normalizeAvatarSeed accepts opaque seeds and rejects file paths, URLs, and data URIs', () => {
    expect(normalizeAvatarSeed('char-m4k9p1-1-a8f3b2')).toBe(
      'char-m4k9p1-1-a8f3b2',
    );
    expect(normalizeAvatarSeed('  seed_alpha.1  ')).toBe('seed_alpha.1');
    expect(normalizeAvatarSeed(null)).toBeNull();
    expect(normalizeAvatarSeed('')).toBeNull();
    expect(normalizeAvatarSeed('   ')).toBeNull();
    expect(
      normalizeAvatarSeed('file:///data/user/0/app/files/avatars/me.jpg'),
    ).toBeNull();
    expect(normalizeAvatarSeed('/documents/avatars/custom.jpg')).toBeNull();
    expect(normalizeAvatarSeed('https://example.com/photo.png')).toBeNull();
    expect(
      normalizeAvatarSeed('data:image/png;base64,iVBORw0KGgo='),
    ).toBeNull();
    expect(normalizeAvatarSeed('../secret')).toBeNull();
    expect(normalizeAvatarSeed('a'.repeat(129))).toBeNull();
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

  test('DefaultProfileAvatar and CharacterAvatar render accessible SVG portraits offline', () => {
    const neutral = render(
      <DefaultProfileAvatar size={112} testID="neutral-avatar" />,
    );
    const neutralNode = neutral.getByTestId('neutral-avatar');
    expect(neutralNode.props.accessibilityRole).toBe('image');
    expect(neutralNode.props.accessibilityLabel).toBe('Default profile avatar');
    neutral.unmount();

    const {getByTestId, rerender} = render(
      <CharacterAvatar seed="render-seed-0" size={112} testID="char-avatar" />,
    );
    const node = getByTestId('char-avatar');
    expect(node.props.accessibilityRole).toBe('image');
    expect(node.props.accessibilityLabel).toBe(
      describeCharacterTraits(resolveCharacterTraits('render-seed-0')),
    );

    for (let i = 1; i <= 15; i += 1) {
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

  test('avatarSeedStore defaults to null, enqueues cloud profile sync only for signed-in users, and migrates guest seed safely', async () => {
    const guest = userStore.createGuestUser();
    expect(avatarSeedStore.get(guest.id)).toBeNull();
    expect(userStore.getUserById(guest.id)?.avatarSeed).toBeNull();

    // Guest picking a character stays local (no cloud outbox rows).
    const randomized = avatarSeedStore.randomize(guest.id);
    expect(randomized).toBeTruthy();
    expect(avatarSeedStore.get(guest.id)).toBe(randomized);
    expect(syncOutboxStore.getPendingMutations(guest.id)).toHaveLength(0);

    // Rejecting invalid file path seeds leaves existing seed untouched.
    expect(avatarSeedStore.set(guest.id, '/documents/avatars/me.jpg')).toBe(
      false,
    );
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
    const pendingForCloud = syncOutboxStore.getPendingMutations(establishedId);
    expect(pendingForCloud).toHaveLength(1);
    expect(pendingForCloud[0]?.entityType).toBe('profile');
    expect(pendingForCloud[0]?.payload.avatar_seed).toBe(
      'established-seed-keep',
    );

    await guestMigration.linkGuestToCloudAccount(
      establishedId,
      'est@example.invalid',
    );
    expect(avatarSeedStore.get(establishedId)).toBe('established-seed-keep');
    expect(avatarSeedStore.get(GUEST_USER_ID)).toBeNull();

    // Fresh cloud user inherits guest's chosen character seed and queues sync.
    const freshGuest = userStore.createGuestUser();
    avatarSeedStore.set(freshGuest.id, 'guest-chosen-seed');
    const freshCloudId = 'cloud-fresh-avatar';
    await guestMigration.linkGuestToCloudAccount(
      freshCloudId,
      'fresh@example.invalid',
    );
    expect(avatarSeedStore.get(freshCloudId)).toBe('guest-chosen-seed');
    const freshOutbox = syncOutboxStore.getPendingMutations(freshCloudId);
    const profileMut = freshOutbox.find(m => m.entityType === 'profile');
    expect(profileMut?.payload.avatar_seed).toBe('guest-chosen-seed');
  });

  test('ProfileScreen shows default neutral person on first use and stays neutral across remounts until changed', () => {
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

    expect(firstRender.getByTestId('profile-default-avatar')).toBeTruthy();
    expect(firstRender.queryByTestId('profile-character-avatar')).toBeNull();
    expect(
      firstRender.queryByTestId('profile-randomize-avatar-btn'),
    ).toBeNull();
    expect(avatarSeedStore.get(guest.id)).toBeNull();
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
    expect(secondRender.getByTestId('profile-default-avatar')).toBeTruthy();
    expect(avatarSeedStore.get(guest.id)).toBeNull();
  });

  test('ProfileScreen avatar modal lets users pick a character avatar, roll a distinct character, and reset to default neutral person', async () => {
    const guest = userStore.createGuestUser();
    const onRefresh = jest.fn();

    const ui = render(
      <ThemeProvider userId={guest.id}>
        <ProfileScreen
          userId={guest.id}
          refreshTrigger={0}
          onRefresh={onRefresh}
        />
      </ThemeProvider>,
    );

    // Open modal from neutral default avatar.
    fireEvent.press(ui.getByTestId('profile-avatar-btn'));
    expect(ui.getByTestId('profile-avatar-modal')).toBeTruthy();
    expect(ui.getByTestId('profile-avatar-modal-default')).toBeTruthy();
    expect(ui.queryByTestId('profile-avatar-action-reset')).toBeNull();

    // Switch to a character avatar.
    await act(async () => {
      fireEvent.press(ui.getByTestId('profile-avatar-action-character'));
    });

    const firstSeed = avatarSeedStore.get(guest.id);
    expect(firstSeed).toBeTruthy();
    expect(ui.getByTestId('profile-character-avatar')).toBeTruthy();
    expect(ui.getByTestId('profile-randomize-avatar-btn')).toBeTruthy();
    expect(ui.queryByTestId('profile-default-avatar')).toBeNull();
    expect(onRefresh).toHaveBeenCalled();

    // Tapping quick-roll dice badge picks a visually distinct character.
    const beforeTraits = resolveCharacterTraits(firstSeed!);
    fireEvent.press(ui.getByTestId('profile-randomize-avatar-btn'));
    const secondSeed = avatarSeedStore.get(guest.id);
    expect(secondSeed).not.toBe(firstSeed);
    expect(
      areTraitsVisuallyDistinct(
        beforeTraits,
        resolveCharacterTraits(secondSeed!),
      ),
    ).toBe(true);

    // Reset back to default neutral person via modal.
    fireEvent.press(ui.getByTestId('profile-avatar-btn'));
    expect(ui.getByTestId('profile-avatar-action-reset')).toBeTruthy();
    await act(async () => {
      fireEvent.press(ui.getByTestId('profile-avatar-action-reset'));
    });

    expect(avatarSeedStore.get(guest.id)).toBeNull();
    expect(ui.getByTestId('profile-default-avatar')).toBeTruthy();
    expect(ui.queryByTestId('profile-character-avatar')).toBeNull();
    expect(ui.queryByTestId('profile-randomize-avatar-btn')).toBeNull();
  });

  test('local device photos stay strictly local (never in profile sync payload) and can be removed or replaced by a character', async () => {
    const userId = 'student-local-photo-check';
    const now = new Date().toISOString();
    db.executeSync(
      `INSERT INTO users (id, username, email, role, is_new_user, created_at, updated_at)
       VALUES (?, ?, ?, 'student', 0, ?, ?)`,
      [userId, 'Student', 'student@example.invalid', now, now],
    );

    userStore.setAvatarUri(userId, '/documents/avatars/custom-photo.jpg');
    expect(syncOutboxStore.getPendingMutations(userId)).toHaveLength(0);
    const payload = buildProfileSyncPayload(userId);
    expect(payload).not.toHaveProperty('avatar_uri');
    expect(payload.avatar_seed).toBeNull();

    const photoUi = render(
      <ThemeProvider userId={userId}>
        <ProfileScreen
          userId={userId}
          refreshTrigger={0}
          onRefresh={jest.fn()}
        />
      </ThemeProvider>,
    );

    expect(photoUi.queryByTestId('profile-default-avatar')).toBeNull();
    expect(photoUi.queryByTestId('profile-character-avatar')).toBeNull();
    expect(photoUi.queryByTestId('profile-randomize-avatar-btn')).toBeNull();

    fireEvent.press(photoUi.getByTestId('profile-avatar-btn'));
    expect(
      photoUi.getByTestId('profile-avatar-action-remove-photo'),
    ).toBeTruthy();

    await act(async () => {
      fireEvent.press(
        photoUi.getByTestId('profile-avatar-action-remove-photo'),
      );
    });

    expect(userStore.getUserById(userId)?.avatarUri).toBeNull();
    expect(photoUi.getByTestId('profile-default-avatar')).toBeTruthy();
    expect(removeAvatarImage).toBeDefined();
  });

  test('HomeHeader renders neutral default avatar when avatarSeed is null and CharacterAvatar when set', () => {
    const guest = userStore.createGuestUser();
    const ui = render(
      <ThemeProvider userId={guest.id}>
        <HomeHeader
          now={new Date('2026-11-24T09:00:00Z')}
          greetingName="Student"
          academicBadge={null}
          photoSource={null}
          avatarSeed={null}
          onOpenCustomize={jest.fn()}
        />
      </ThemeProvider>,
    );
    expect(ui.getByTestId('home-default-avatar')).toBeTruthy();
    expect(ui.queryByTestId('home-character-avatar')).toBeNull();

    ui.rerender(
      <ThemeProvider userId={guest.id}>
        <HomeHeader
          now={new Date('2026-11-24T09:00:00Z')}
          greetingName="Student"
          academicBadge={null}
          photoSource={null}
          avatarSeed="char-home-1-abc"
          onOpenCustomize={jest.fn()}
        />
      </ThemeProvider>,
    );
    expect(ui.getByTestId('home-character-avatar')).toBeTruthy();
    expect(ui.queryByTestId('home-default-avatar')).toBeNull();
  });
});
