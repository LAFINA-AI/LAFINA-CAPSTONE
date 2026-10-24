import { UPDATE_PUBLIC_KEY } from './releaseKey';

export interface UpdateConfig {
  owner: string;
  repo: string;
  product: string;
  manifestAsset: string;
  publicKey: string;
}

export const UPDATE_CONFIG: UpdateConfig = {
  owner: 'LAFINA-AI',
  repo: 'LAFINA-CAPSTONE',
  product: 'com.lafina.capstone',
  manifestAsset: 'lafina-update-android.json',
  publicKey: UPDATE_PUBLIC_KEY,
};

const repoUrl = (config: UpdateConfig): string => `https://github.com/${config.owner}/${config.repo}`;

export const latestAssetUrl = (config: UpdateConfig, asset: string): string =>
  `${repoUrl(config)}/releases/latest/download/${asset}`;

export const latestReleasePageUrl = (config: UpdateConfig): string =>
  `${repoUrl(config)}/releases/latest`;

export const latestReleaseApiUrl = (config: UpdateConfig): string =>
  `https://api.github.com/repos/${config.owner}/${config.repo}/releases/latest`;
