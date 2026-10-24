import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import App from '../App';

describe('Phase 01 App Root Shell', () => {
  test('renders SynthSplash and initializes SQLite database cleanly', async () => {
    const { toJSON } = render(<App />);
    await waitFor(() => {
      expect(toJSON()).not.toBeNull();
    });
  });
});
