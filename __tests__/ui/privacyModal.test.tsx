import React from 'react';
import {Platform, StatusBar} from 'react-native';
import {fireEvent, render} from '@testing-library/react-native';
import {initDatabase} from '../../src/storage';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {PrivacyModal} from '../../src/ui/components/profile/PrivacyModal';
import {
  PRIVACY_POLICY_EFFECTIVE_DATE,
  PRIVACY_SECTIONS,
} from '../../src/ui/components/profile/privacyPolicyContent';

describe('PrivacyModal', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  it('renders header safe-area inset, overview highlights, and all protective sections', () => {
    const onClose = jest.fn();
    const screen = render(
      <ThemeProvider userId={null} initialUIVariant="modern">
        <PrivacyModal visible onClose={onClose} />
      </ThemeProvider>,
    );

    expect(screen.getByText('Privacy Policy')).toBeTruthy();
    expect(
      screen.getByText(`Effective ${PRIVACY_POLICY_EFFECTIVE_DATE}`),
    ).toBeTruthy();
    expect(screen.getByText('RA 10173 Aligned')).toBeTruthy();
    expect(screen.getByTestId('privacy-hero-card')).toBeTruthy();

    for (const section of PRIVACY_SECTIONS) {
      expect(screen.getByText(section.title)).toBeTruthy();
      expect(screen.getByTestId(`privacy-section-${section.id}`)).toBeTruthy();
    }

    // Protective legal callouts
    expect(screen.getByText('Recording Consent Responsibility')).toBeTruthy();
    expect(
      screen.getByText('Avoid Sharing Highly Sensitive Data'),
    ).toBeTruthy();
    expect(screen.getByText('Limitation of Liability')).toBeTruthy();

    // Header must have safe top padding so it clears the status bar
    const header = screen.getByTestId('privacy-modal-header');
    const flatStyle = Array.isArray(header.props.style)
      ? Object.assign({}, ...header.props.style)
      : header.props.style;
    const expectedMinTop =
      Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 12 : 12;
    expect(flatStyle.paddingTop).toBeGreaterThanOrEqual(expectedMinTop);
  });

  it('dismisses cleanly from both Close and I Understand buttons', () => {
    const onClose = jest.fn();
    const screen = render(
      <ThemeProvider userId={null} initialUIVariant="classic">
        <PrivacyModal visible onClose={onClose} />
      </ThemeProvider>,
    );

    fireEvent.press(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByTestId('privacy-modal-acknowledge-btn'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('does not expose hidden backend AI or voice vendor names', () => {
    const combinedText = PRIVACY_SECTIONS.map(section =>
      [
        section.title,
        section.summary,
        ...(section.bullets ?? []).map(b => `${b.label} ${b.text}`),
        section.callout
          ? `${section.callout.title} ${section.callout.text}`
          : '',
      ].join(' '),
    ).join('\n');

    expect(combinedText).not.toMatch(/\b(Eleven\s?Labs|Deep\s?Seek|Gemini)\b/i);
  });
});
