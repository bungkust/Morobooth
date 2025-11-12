// Configuration management service for Morobooth
// Handles both config.txt and localStorage overrides

export type HeaderMode = 'text' | 'image';

export interface ConfigHeader {
  mode: HeaderMode;
  mainText: string;
  subText: string;
  imageUrl: string;
}

export interface ConfigBody {
  mainText: string;
  subText: string;
}

export interface Config {
  header: ConfigHeader;
  body: ConfigBody;
}

export interface ConfigOverride {
  enabled: boolean;
  sessionCode?: string;
  header: ConfigHeader;
  body: ConfigBody;
}

const DEFAULT_HEADER: ConfigHeader = {
  mode: 'text',
  mainText: 'Morobooth',
  subText: '2025',
  imageUrl: ''
};

const DEFAULT_BODY: ConfigBody = {
  mainText: 'Morobooth',
  subText: '2025'
};

let cachedConfig: Config | null = null;

function normalizeHeader(raw: any): ConfigHeader {
  const mode: HeaderMode = raw?.mode === 'image' || raw?.useImage ? 'image' : 'text';
  return {
    mode,
    mainText: raw?.mainText ?? '',
    subText: raw?.subText ?? '',
    imageUrl: mode === 'image' ? (raw?.imageUrl ?? '') : ''
  };
}

function normalizeBody(raw: any, fallback?: Partial<ConfigBody>): ConfigBody {
  return {
    mainText: raw?.mainText ?? fallback?.mainText ?? DEFAULT_BODY.mainText,
    subText: raw?.subText ?? fallback?.subText ?? DEFAULT_BODY.subText,
  };
}

function normalizeOverride(raw: any): ConfigOverride {
  if (!raw || typeof raw !== 'object') {
    return {
      enabled: false,
      header: { ...DEFAULT_HEADER, mainText: '', subText: '' },
      body: { ...DEFAULT_BODY }
    };
  }

  const header = normalizeHeader(raw.header ?? {
    mode: raw.useImage ? 'image' : 'text',
    mainText: raw.headerMainText ?? raw.mainText ?? '',
    subText: raw.headerSubText ?? raw.subText ?? '',
    imageUrl: raw.imageUrl
  });

  const body = normalizeBody(raw.body ?? {
    mainText: raw.mainText,
    subText: raw.subText
  });

  return {
    enabled: Boolean(raw.enabled),
    sessionCode: raw.sessionCode,
    header,
    body
  };
}

export async function loadConfig(): Promise<Config> {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    const override = getConfigOverride();
    if (override.enabled) {
      const header = override.header;
      const body = override.body;

      if (header.mode === 'image' && header.imageUrl) {
        cachedConfig = {
          header,
          body: normalizeBody(body)
        };
        return cachedConfig;
      }

      cachedConfig = {
        header: {
          mode: 'text',
          mainText: header.mainText || DEFAULT_HEADER.mainText,
          subText: header.subText || DEFAULT_HEADER.subText,
          imageUrl: ''
        },
        body: normalizeBody(body)
      };
      return cachedConfig;
    }

    cachedConfig = { header: { ...DEFAULT_HEADER }, body: { ...DEFAULT_BODY } };
    return cachedConfig;
  } catch (error) {
    console.warn('Failed to load config, using defaults:', error);
    cachedConfig = { header: { ...DEFAULT_HEADER }, body: { ...DEFAULT_BODY } };
    return cachedConfig;
  }
}

export function getConfigOverride(): ConfigOverride {
  try {
    const stored = localStorage.getItem('morobooth_config_override') || localStorage.getItem('pixelbooth_config_override');
    if (stored) {
      return normalizeOverride(JSON.parse(stored));
    }
  } catch (error) {
    console.warn('Failed to parse config override:', error);
  }
  
  return {
    enabled: false,
    header: {
      mode: 'text',
    mainText: '',
      subText: '',
      imageUrl: ''
    },
    body: { ...DEFAULT_BODY }
  };
}

export function setConfigOverride(config: ConfigOverride): void {
  try {
    const payload: ConfigOverride = {
      enabled: config.enabled,
      sessionCode: config.sessionCode,
      header: normalizeHeader(config.header),
      body: normalizeBody(config.body, DEFAULT_BODY)
    };
    localStorage.setItem('morobooth_config_override', JSON.stringify(payload));
    clearConfigCache();
  } catch (error) {
    console.error('Failed to save config override:', error);
    throw new Error('Failed to save configuration');
  }
}

export function clearConfigOverride(): void {
  try {
    localStorage.removeItem('morobooth_config_override');
    try { localStorage.removeItem('pixelbooth_config_override'); } catch {}
    clearConfigCache();
  } catch (error) {
    console.error('Failed to clear config override:', error);
  }
}

export function clearConfigCache() {
  cachedConfig = null;
}

export function getConfigPreview(): string {
  const override = getConfigOverride();
  if (override.enabled) {
    if (override.header.mode === 'image' && override.header.imageUrl) {
      return 'Custom image enabled';
    }
    return `${override.header.mainText || DEFAULT_HEADER.mainText}\n${override.header.subText || DEFAULT_HEADER.subText}`;
  }
  return 'Using config.txt values';
}
