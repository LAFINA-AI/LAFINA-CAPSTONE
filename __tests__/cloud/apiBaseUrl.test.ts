/**
 * A test build can send online features to a backend on the developer's
 * computer; everything else uses the production backend.
 */
import {
  apiBaseUrlsFor,
  CLOUD_API_BASE_URL,
  LOCAL_API_BASE_URL,
} from '../../src/cloud/cloudClient';

it('uses only the test server a test build was made with', () => {
  expect(apiBaseUrlsFor(false, 'http://127.0.0.1:8000')).toEqual([
    'http://127.0.0.1:8000',
  ]);
  expect(apiBaseUrlsFor(true, 'http://localhost:8000/')).toEqual([
    'http://localhost:8000',
  ]);
});

it('without an override, production first (and the local server in development)', () => {
  expect(apiBaseUrlsFor(false)).toEqual([CLOUD_API_BASE_URL]);
  expect(apiBaseUrlsFor(false, '')).toEqual([CLOUD_API_BASE_URL]);
  expect(apiBaseUrlsFor(true, null)).toEqual([
    CLOUD_API_BASE_URL,
    LOCAL_API_BASE_URL,
  ]);
});

it('ignores an override that is not a plain server address', () => {
  for (const bad of [
    'ftp://127.0.0.1',
    'http://127.0.0.1:8000/v1?x=1',
    'mailto:someone@example.com',
    '127.0.0.1:8000',
  ]) {
    expect(apiBaseUrlsFor(false, bad)).toEqual([CLOUD_API_BASE_URL]);
  }
});
