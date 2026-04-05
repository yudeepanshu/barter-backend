import { config } from '../../config/env';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

type UpdateSource = 'play-store' | 'direct-apk';
type Platform = 'android' | 'ios';
type UpdateType = 'none' | 'normal' | 'force';

type PlatformPolicy = {
  latestVersion: string;
  minimumSupportedVersion: string;
  forceUpdate: boolean;
  title: string;
  message: string;
  playStoreUrl?: string;
  directApkUrl?: string;
  appStoreUrl?: string;
  preferredSource?: UpdateSource;
};

type AppVersionPolicy = {
  android: PlatformPolicy;
  ios: PlatformPolicy;
};

export type UpsertAppVersionPolicyInput = AppVersionPolicy;

export type AppVersionPolicyResult = {
  platform: Platform;
  currentVersion: string;
  latestVersion: string;
  minimumSupportedVersion: string;
  updateType: UpdateType;
  dismissible: boolean;
  title: string;
  message: string;
  primaryCtaLabel: string;
  primaryUpdateUrl?: string;
  secondaryCtaLabel?: string;
  secondaryUpdateUrl?: string;
};

let cachedRemotePolicy: AppVersionPolicy | null = null;
let cachedRemotePolicyAt = 0;

let s3Client: S3Client | null = null;

function getS3Client() {
  if (s3Client) {
    return s3Client;
  }

  s3Client = new S3Client({
    region: config.STORAGE.S3_REGION,
    credentials: {
      accessKeyId: config.STORAGE.S3_ACCESS_KEY_ID,
      secretAccessKey: config.STORAGE.S3_SECRET_ACCESS_KEY,
    },
  });

  return s3Client;
}

function sanitizeVersion(value: string | undefined, fallback: string) {
  const normalized = (value ?? '').trim();
  return normalized.length > 0 ? normalized : fallback;
}

function parseVersion(input: string) {
  const cleaned = input.trim();
  if (!cleaned) {
    return [0];
  }

  return cleaned.split('.').map((part) => {
    const digitsOnly = part.match(/^\d+/)?.[0] ?? '0';
    const parsed = Number.parseInt(digitsOnly, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  });
}

function compareVersions(a: string, b: string) {
  const aParts = parseVersion(a);
  const bParts = parseVersion(b);
  const maxLength = Math.max(aParts.length, bParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const left = aParts[index] ?? 0;
    const right = bParts[index] ?? 0;
    if (left < right) {
      return -1;
    }
    if (left > right) {
      return 1;
    }
  }

  return 0;
}

function envPolicy(): AppVersionPolicy {
  return {
    android: {
      latestVersion: sanitizeVersion(config.APP_UPDATE.ANDROID.LATEST_VERSION, '1.0.0'),
      minimumSupportedVersion: sanitizeVersion(
        config.APP_UPDATE.ANDROID.MIN_SUPPORTED_VERSION,
        '1.0.0',
      ),
      forceUpdate: config.APP_UPDATE.ANDROID.FORCE_UPDATE,
      title: config.APP_UPDATE.ANDROID.TITLE,
      message: config.APP_UPDATE.ANDROID.MESSAGE,
      playStoreUrl: config.APP_UPDATE.ANDROID.PLAY_STORE_URL || undefined,
      directApkUrl: config.APP_UPDATE.ANDROID.DIRECT_APK_URL || undefined,
      preferredSource: config.APP_UPDATE.ANDROID.PREFERRED_SOURCE,
    },
    ios: {
      latestVersion: sanitizeVersion(config.APP_UPDATE.IOS.LATEST_VERSION, '1.0.0'),
      minimumSupportedVersion: sanitizeVersion(
        config.APP_UPDATE.IOS.MIN_SUPPORTED_VERSION,
        '1.0.0',
      ),
      forceUpdate: config.APP_UPDATE.IOS.FORCE_UPDATE,
      title: config.APP_UPDATE.IOS.TITLE,
      message: config.APP_UPDATE.IOS.MESSAGE,
      appStoreUrl: config.APP_UPDATE.IOS.APP_STORE_URL || undefined,
    },
  };
}

function parseRemotePolicy(raw: unknown): AppVersionPolicy | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const root = raw as Record<string, unknown>;
  const envFallback = envPolicy();

  const parsePlatform = (platformKey: 'android' | 'ios'): PlatformPolicy => {
    const source =
      root[platformKey] && typeof root[platformKey] === 'object'
        ? (root[platformKey] as Record<string, unknown>)
        : {};
    const fallback = envFallback[platformKey];

    return {
      latestVersion: sanitizeVersion(
        source.latestVersion as string | undefined,
        fallback.latestVersion,
      ),
      minimumSupportedVersion: sanitizeVersion(
        source.minimumSupportedVersion as string | undefined,
        fallback.minimumSupportedVersion,
      ),
      forceUpdate:
        typeof source.forceUpdate === 'boolean' ? source.forceUpdate : fallback.forceUpdate,
      title:
        typeof source.title === 'string' && source.title.trim().length > 0
          ? source.title
          : fallback.title,
      message:
        typeof source.message === 'string' && source.message.trim().length > 0
          ? source.message
          : fallback.message,
      playStoreUrl:
        typeof source.playStoreUrl === 'string' && source.playStoreUrl.trim().length > 0
          ? source.playStoreUrl
          : fallback.playStoreUrl,
      directApkUrl:
        typeof source.directApkUrl === 'string' && source.directApkUrl.trim().length > 0
          ? source.directApkUrl
          : fallback.directApkUrl,
      appStoreUrl:
        typeof source.appStoreUrl === 'string' && source.appStoreUrl.trim().length > 0
          ? source.appStoreUrl
          : fallback.appStoreUrl,
      preferredSource:
        source.preferredSource === 'play-store' || source.preferredSource === 'direct-apk'
          ? source.preferredSource
          : fallback.preferredSource,
    };
  };

  return {
    android: parsePlatform('android'),
    ios: parsePlatform('ios'),
  };
}

function buildPolicyObject(input: UpsertAppVersionPolicyInput): AppVersionPolicy {
  const envFallback = envPolicy();

  const normalizePlatformPolicy = (
    platformInput: PlatformPolicy,
    fallback: PlatformPolicy,
  ): PlatformPolicy => {
    return {
      latestVersion: sanitizeVersion(platformInput.latestVersion, fallback.latestVersion),
      minimumSupportedVersion: sanitizeVersion(
        platformInput.minimumSupportedVersion,
        fallback.minimumSupportedVersion,
      ),
      forceUpdate: Boolean(platformInput.forceUpdate),
      title: platformInput.title?.trim() || fallback.title,
      message: platformInput.message?.trim() || fallback.message,
      playStoreUrl: platformInput.playStoreUrl?.trim() || undefined,
      directApkUrl: platformInput.directApkUrl?.trim() || undefined,
      appStoreUrl: platformInput.appStoreUrl?.trim() || undefined,
      preferredSource:
        platformInput.preferredSource === 'play-store' ||
        platformInput.preferredSource === 'direct-apk'
          ? platformInput.preferredSource
          : fallback.preferredSource,
    };
  };

  return {
    android: normalizePlatformPolicy(input.android, envFallback.android),
    ios: normalizePlatformPolicy(input.ios, envFallback.ios),
  };
}

export async function uploadAppVersionPolicyToS3(input: UpsertAppVersionPolicyInput) {
  const policy = buildPolicyObject(input);

  const bucket = (config.APP_UPDATE.POLICY_S3_BUCKET || '').trim();
  const key = (config.APP_UPDATE.POLICY_S3_KEY || '').trim();

  if (!bucket) {
    throw new Error('APP_UPDATE_POLICY_S3_BUCKET is required to upload policy');
  }

  if (!key) {
    throw new Error('APP_UPDATE_POLICY_S3_KEY is required to upload policy');
  }

  const client = getS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(policy, null, 2),
      ContentType: 'application/json',
    }),
  );

  const policyUrl = `https://${bucket}.s3.${config.STORAGE.S3_REGION}.amazonaws.com/${encodeURIComponent(
    key,
  )}`;

  // Refresh in-memory cache immediately so clients get new policy without waiting for cache TTL.
  cachedRemotePolicy = policy;
  cachedRemotePolicyAt = Date.now();

  return {
    policy,
    policyUrl,
    bucket,
    key,
  };
}

async function getRemotePolicyIfConfigured(): Promise<AppVersionPolicy | null> {
  const policyUrl = config.APP_UPDATE.POLICY_URL.trim();
  if (!policyUrl) {
    return null;
  }

  const ttlMs = Math.max(config.APP_UPDATE.POLICY_CACHE_TTL_SECONDS, 30) * 1000;
  if (cachedRemotePolicy && Date.now() - cachedRemotePolicyAt < ttlMs) {
    return cachedRemotePolicy;
  }

  const response = await fetch(policyUrl, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`Version policy fetch failed with status ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  const parsed = parseRemotePolicy(payload);
  if (!parsed) {
    throw new Error('Version policy payload is invalid');
  }

  cachedRemotePolicy = parsed;
  cachedRemotePolicyAt = Date.now();
  return parsed;
}

async function getEffectivePolicy() {
  try {
    const remotePolicy = await getRemotePolicyIfConfigured();
    return remotePolicy ?? envPolicy();
  } catch {
    return envPolicy();
  }
}

function chooseAndroidUrls(policy: PlatformPolicy) {
  const storeUrl = policy.playStoreUrl?.trim() || undefined;
  const apkUrl = policy.directApkUrl?.trim() || undefined;
  const preferred = policy.preferredSource ?? 'direct-apk';

  if (preferred === 'play-store') {
    return {
      primaryLabel: 'Update via Play Store',
      primaryUrl: storeUrl ?? apkUrl,
      secondaryLabel: storeUrl && apkUrl ? 'Download APK' : undefined,
      secondaryUrl: storeUrl && apkUrl ? apkUrl : undefined,
    };
  }

  return {
    primaryLabel: 'Download update',
    primaryUrl: apkUrl ?? storeUrl,
    secondaryLabel: storeUrl && apkUrl ? 'Open Play Store' : undefined,
    secondaryUrl: storeUrl && apkUrl ? storeUrl : undefined,
  };
}

function chooseIosUrls(policy: PlatformPolicy) {
  const appStoreUrl = policy.appStoreUrl?.trim() || undefined;
  return {
    primaryLabel: 'Open App Store',
    primaryUrl: appStoreUrl,
    secondaryLabel: undefined,
    secondaryUrl: undefined,
  };
}

export async function getAppVersionPolicy(params: {
  platform: Platform;
  currentVersion: string;
}): Promise<AppVersionPolicyResult> {
  const { platform } = params;
  const currentVersion = sanitizeVersion(params.currentVersion, '0.0.0');
  const policy = await getEffectivePolicy();
  const platformPolicy = policy[platform];

  const latestVersion = sanitizeVersion(platformPolicy.latestVersion, '1.0.0');
  const minimumSupportedVersion = sanitizeVersion(
    platformPolicy.minimumSupportedVersion,
    latestVersion,
  );

  const belowMinimum = compareVersions(currentVersion, minimumSupportedVersion) < 0;
  const belowLatest = compareVersions(currentVersion, latestVersion) < 0;

  const updateType: UpdateType =
    belowMinimum || platformPolicy.forceUpdate ? 'force' : belowLatest ? 'normal' : 'none';

  const urlChoice =
    platform === 'android' ? chooseAndroidUrls(platformPolicy) : chooseIosUrls(platformPolicy);

  return {
    platform,
    currentVersion,
    latestVersion,
    minimumSupportedVersion,
    updateType,
    dismissible: updateType === 'normal',
    title: platformPolicy.title,
    message: platformPolicy.message,
    primaryCtaLabel: urlChoice.primaryLabel,
    primaryUpdateUrl: urlChoice.primaryUrl,
    secondaryCtaLabel: urlChoice.secondaryLabel,
    secondaryUpdateUrl: urlChoice.secondaryUrl,
  };
}
