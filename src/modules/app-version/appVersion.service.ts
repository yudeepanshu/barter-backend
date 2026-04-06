import { config } from '../../config/env';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

type UpdateSource = 'play-store' | 'direct-apk';
type Platform = 'android' | 'ios';
type UpdateChannel = 'production' | 'beta' | 'alpha';
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

type ChannelPolicyMap = Record<UpdateChannel, AppVersionPolicy>;

export type UpsertAppVersionPolicyInput =
  | AppVersionPolicy
  | {
      channels: Partial<Record<UpdateChannel, AppVersionPolicy>>;
    };

export type AppVersionPolicyResult = {
  platform: Platform;
  channel: UpdateChannel;
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

let cachedRemotePolicy: ChannelPolicyMap | null = null;
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

type ParsedSemver = {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
};

function parseSemver(input: string): ParsedSemver {
  const cleaned = input.trim().replace(/^v/i, '').split('+')[0] ?? '';
  const match = cleaned.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?$/);

  if (!match) {
    return {
      major: 0,
      minor: 0,
      patch: 0,
      prerelease: [],
    };
  }

  const major = Number.parseInt(match[1] ?? '0', 10) || 0;
  const minor = Number.parseInt(match[2] ?? '0', 10) || 0;
  const patch = Number.parseInt(match[3] ?? '0', 10) || 0;
  const prereleaseRaw = (match[4] ?? '').trim();

  return {
    major,
    minor,
    patch,
    prerelease:
      prereleaseRaw.length > 0 ? prereleaseRaw.split(/[.-]/).filter((part) => part.length > 0) : [],
  };
}

function comparePrereleaseIdentifier(left: string, right: string) {
  const leftIsNumeric = /^\d+$/.test(left);
  const rightIsNumeric = /^\d+$/.test(right);

  if (leftIsNumeric && rightIsNumeric) {
    const leftNum = Number.parseInt(left, 10);
    const rightNum = Number.parseInt(right, 10);
    return leftNum === rightNum ? 0 : leftNum < rightNum ? -1 : 1;
  }

  if (leftIsNumeric && !rightIsNumeric) {
    return -1;
  }

  if (!leftIsNumeric && rightIsNumeric) {
    return 1;
  }

  return left === right ? 0 : left < right ? -1 : 1;
}

function compareVersions(a: string, b: string) {
  const left = parseSemver(a);
  const right = parseSemver(b);

  if (left.major !== right.major) {
    return left.major < right.major ? -1 : 1;
  }

  if (left.minor !== right.minor) {
    return left.minor < right.minor ? -1 : 1;
  }

  if (left.patch !== right.patch) {
    return left.patch < right.patch ? -1 : 1;
  }

  const leftHasPrerelease = left.prerelease.length > 0;
  const rightHasPrerelease = right.prerelease.length > 0;

  if (!leftHasPrerelease && !rightHasPrerelease) {
    return 0;
  }

  if (!leftHasPrerelease && rightHasPrerelease) {
    return 1;
  }

  if (leftHasPrerelease && !rightHasPrerelease) {
    return -1;
  }

  const maxLength = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = left.prerelease[index];
    const rightPart = right.prerelease[index];

    if (leftPart === undefined && rightPart !== undefined) {
      return -1;
    }

    if (leftPart !== undefined && rightPart === undefined) {
      return 1;
    }

    if (leftPart === undefined || rightPart === undefined) {
      continue;
    }

    const compared = comparePrereleaseIdentifier(leftPart, rightPart);
    if (compared !== 0) {
      return compared;
    }
  }

  return 0;
}

function envPolicySingle(): AppVersionPolicy {
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

function envPolicyByChannel(): ChannelPolicyMap {
  const single = envPolicySingle();
  return {
    production: single,
    beta: single,
    alpha: single,
  };
}

function parseRemotePolicy(raw: unknown): ChannelPolicyMap | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const root = raw as Record<string, unknown>;
  const envFallback = envPolicyByChannel();

  const parsePlatform = (
    sourceRoot: Record<string, unknown>,
    fallback: AppVersionPolicy,
    platformKey: 'android' | 'ios',
  ): PlatformPolicy => {
    const source =
      sourceRoot[platformKey] && typeof sourceRoot[platformKey] === 'object'
        ? (sourceRoot[platformKey] as Record<string, unknown>)
        : {};
    const fallbackPlatform = fallback[platformKey];

    return {
      latestVersion: sanitizeVersion(
        source.latestVersion as string | undefined,
        fallbackPlatform.latestVersion,
      ),
      minimumSupportedVersion: sanitizeVersion(
        source.minimumSupportedVersion as string | undefined,
        fallbackPlatform.minimumSupportedVersion,
      ),
      forceUpdate:
        typeof source.forceUpdate === 'boolean' ? source.forceUpdate : fallbackPlatform.forceUpdate,
      title:
        typeof source.title === 'string' && source.title.trim().length > 0
          ? source.title
          : fallbackPlatform.title,
      message:
        typeof source.message === 'string' && source.message.trim().length > 0
          ? source.message
          : fallbackPlatform.message,
      playStoreUrl:
        typeof source.playStoreUrl === 'string' && source.playStoreUrl.trim().length > 0
          ? source.playStoreUrl
          : fallbackPlatform.playStoreUrl,
      directApkUrl:
        typeof source.directApkUrl === 'string' && source.directApkUrl.trim().length > 0
          ? source.directApkUrl
          : fallbackPlatform.directApkUrl,
      appStoreUrl:
        typeof source.appStoreUrl === 'string' && source.appStoreUrl.trim().length > 0
          ? source.appStoreUrl
          : fallbackPlatform.appStoreUrl,
      preferredSource:
        source.preferredSource === 'play-store' || source.preferredSource === 'direct-apk'
          ? source.preferredSource
          : fallbackPlatform.preferredSource,
    };
  };

  const parsePolicyRoot = (
    sourceRoot: Record<string, unknown>,
    fallback: AppVersionPolicy,
  ): AppVersionPolicy => {
    return {
      android: parsePlatform(sourceRoot, fallback, 'android'),
      ios: parsePlatform(sourceRoot, fallback, 'ios'),
    };
  };

  // Legacy format: { android: {...}, ios: {...} }
  const hasLegacyShape = typeof root.android === 'object' || typeof root.ios === 'object';
  if (hasLegacyShape) {
    const legacy = parsePolicyRoot(root, envFallback.production);
    return {
      production: legacy,
      beta: legacy,
      alpha: legacy,
    };
  }

  // New format: { channels: { production: {...}, beta: {...}, alpha: {...} } }
  const channelsRoot =
    root.channels && typeof root.channels === 'object'
      ? (root.channels as Record<string, unknown>)
      : null;

  if (!channelsRoot) {
    return null;
  }

  const production =
    channelsRoot.production && typeof channelsRoot.production === 'object'
      ? parsePolicyRoot(channelsRoot.production as Record<string, unknown>, envFallback.production)
      : envFallback.production;

  const beta =
    channelsRoot.beta && typeof channelsRoot.beta === 'object'
      ? parsePolicyRoot(channelsRoot.beta as Record<string, unknown>, production)
      : production;

  const alpha =
    channelsRoot.alpha && typeof channelsRoot.alpha === 'object'
      ? parsePolicyRoot(channelsRoot.alpha as Record<string, unknown>, beta)
      : beta;

  return {
    production,
    beta,
    alpha,
  };
}

function buildPolicyObject(input: UpsertAppVersionPolicyInput): ChannelPolicyMap {
  const envFallback = envPolicyByChannel();

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

  const normalizePolicy = (
    policyInput: AppVersionPolicy,
    fallback: AppVersionPolicy,
  ): AppVersionPolicy => {
    return {
      android: normalizePlatformPolicy(policyInput.android, fallback.android),
      ios: normalizePlatformPolicy(policyInput.ios, fallback.ios),
    };
  };

  if ('channels' in input) {
    const production = input.channels.production
      ? normalizePolicy(input.channels.production, envFallback.production)
      : envFallback.production;
    const beta = input.channels.beta
      ? normalizePolicy(input.channels.beta, production)
      : production;
    const alpha = input.channels.alpha ? normalizePolicy(input.channels.alpha, beta) : beta;

    return {
      production,
      beta,
      alpha,
    };
  }

  const legacy = normalizePolicy(input, envFallback.production);

  return {
    production: legacy,
    beta: legacy,
    alpha: legacy,
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
      ACL: 'public-read',
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

async function getRemotePolicyIfConfigured(): Promise<ChannelPolicyMap | null> {
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

async function getEffectivePolicyByChannel() {
  try {
    const remotePolicy = await getRemotePolicyIfConfigured();
    return remotePolicy ?? envPolicyByChannel();
  } catch {
    return envPolicyByChannel();
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
  channel: UpdateChannel;
  currentVersion: string;
}): Promise<AppVersionPolicyResult> {
  const { platform } = params;
  const channel = params.channel;
  const currentVersion = sanitizeVersion(params.currentVersion, '0.0.0');
  const policyByChannel = await getEffectivePolicyByChannel();
  const channelPolicy = policyByChannel[channel] ?? policyByChannel.production;
  const platformPolicy = channelPolicy[platform];

  const latestVersion = sanitizeVersion(platformPolicy.latestVersion, '1.0.0');
  const minimumSupportedVersion = sanitizeVersion(
    platformPolicy.minimumSupportedVersion,
    latestVersion,
  );

  const belowMinimum = compareVersions(currentVersion, minimumSupportedVersion) < 0;
  const belowLatest = compareVersions(currentVersion, latestVersion) < 0;

  const updateType: UpdateType =
    belowMinimum || (platformPolicy.forceUpdate && belowLatest)
      ? 'force'
      : belowLatest
        ? 'normal'
        : 'none';

  const urlChoice =
    platform === 'android' ? chooseAndroidUrls(platformPolicy) : chooseIosUrls(platformPolicy);

  return {
    platform,
    channel,
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
