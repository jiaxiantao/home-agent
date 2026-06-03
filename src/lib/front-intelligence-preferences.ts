export type IntelligenceStyle = "steps" | "risk" | "code";
export type IntelligenceDepth = "brief" | "detailed";

export type IntelligencePreferences = {
  style: IntelligenceStyle;
  depth: IntelligenceDepth;
  includeMetrics: boolean;
};

export type IntelligenceLearningProfile = {
  styleScores: Record<IntelligenceStyle, number>;
  depthScores: Record<IntelligenceDepth, number>;
};

export type IntelligenceHistoryEvent = {
  at: string;
  style: IntelligenceStyle;
  depth: IntelligenceDepth;
  includeMetrics: boolean;
};

const STORAGE_KEY = "assistant-intelligence-preferences-v1";
const LEARNING_STORAGE_KEY = "assistant-intelligence-learning-v1";
const HISTORY_STORAGE_KEY = "assistant-intelligence-history-v1";

export const defaultIntelligencePreferences: IntelligencePreferences = {
  style: "steps",
  depth: "detailed",
  includeMetrics: true,
};

export const defaultLearningProfile: IntelligenceLearningProfile = {
  styleScores: {
    steps: 0,
    risk: 0,
    code: 0,
  },
  depthScores: {
    brief: 0,
    detailed: 0,
  },
};

export function loadIntelligencePreferences(): IntelligencePreferences {
  if (typeof window === "undefined") {
    return defaultIntelligencePreferences;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultIntelligencePreferences;
    }
    const parsed = JSON.parse(raw) as Partial<IntelligencePreferences>;
    return {
      style:
        parsed.style === "steps" || parsed.style === "risk" || parsed.style === "code"
          ? parsed.style
          : defaultIntelligencePreferences.style,
      depth:
        parsed.depth === "brief" || parsed.depth === "detailed"
          ? parsed.depth
          : defaultIntelligencePreferences.depth,
      includeMetrics:
        typeof parsed.includeMetrics === "boolean"
          ? parsed.includeMetrics
          : defaultIntelligencePreferences.includeMetrics,
    };
  } catch {
    return defaultIntelligencePreferences;
  }
}

export function saveIntelligencePreferences(value: IntelligencePreferences) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function loadLearningProfile(): IntelligenceLearningProfile {
  if (typeof window === "undefined") {
    return defaultLearningProfile;
  }
  try {
    const raw = window.localStorage.getItem(LEARNING_STORAGE_KEY);
    if (!raw) {
      return defaultLearningProfile;
    }
    const parsed = JSON.parse(raw) as Partial<IntelligenceLearningProfile>;
    return {
      styleScores: {
        steps: Number(parsed.styleScores?.steps ?? 0),
        risk: Number(parsed.styleScores?.risk ?? 0),
        code: Number(parsed.styleScores?.code ?? 0),
      },
      depthScores: {
        brief: Number(parsed.depthScores?.brief ?? 0),
        detailed: Number(parsed.depthScores?.detailed ?? 0),
      },
    };
  } catch {
    return defaultLearningProfile;
  }
}

export function saveLearningProfile(profile: IntelligenceLearningProfile) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(LEARNING_STORAGE_KEY, JSON.stringify(profile));
}

export function resetLearningProfile() {
  if (typeof window === "undefined") {
    return defaultLearningProfile;
  }
  window.localStorage.removeItem(LEARNING_STORAGE_KEY);
  return defaultLearningProfile;
}

export function bumpLearningProfile(
  profile: IntelligenceLearningProfile,
  signal: Partial<{
    style: IntelligenceStyle;
    depth: IntelligenceDepth;
  }>,
) {
  return {
    styleScores: {
      ...profile.styleScores,
      ...(signal.style
        ? {
            [signal.style]: profile.styleScores[signal.style] + 1,
          }
        : {}),
    },
    depthScores: {
      ...profile.depthScores,
      ...(signal.depth
        ? {
            [signal.depth]: profile.depthScores[signal.depth] + 1,
          }
        : {}),
    },
  };
}

export function inferRecommendedPreferences(
  profile: IntelligenceLearningProfile,
): Pick<IntelligencePreferences, "style" | "depth"> | null {
  const styleEntries = Object.entries(profile.styleScores) as Array<
    [IntelligenceStyle, number]
  >;
  const depthEntries = Object.entries(profile.depthScores) as Array<
    [IntelligenceDepth, number]
  >;
  const [style, styleScore] = [...styleEntries].sort((a, b) => b[1] - a[1])[0];
  const [depth, depthScore] = [...depthEntries].sort((a, b) => b[1] - a[1])[0];

  if (styleScore + depthScore < 3) {
    return null;
  }

  return { style, depth };
}

export function loadHistoryEvents(): IntelligenceHistoryEvent[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as IntelligenceHistoryEvent[];
    return Array.isArray(parsed) ? parsed.slice(-20) : [];
  } catch {
    return [];
  }
}

export function saveHistoryEvents(events: IntelligenceHistoryEvent[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(events.slice(-20)));
}

export function pushHistoryEvent(
  events: IntelligenceHistoryEvent[],
  preferences: IntelligencePreferences,
) {
  const next: IntelligenceHistoryEvent = {
    at: new Date().toISOString(),
    style: preferences.style,
    depth: preferences.depth,
    includeMetrics: preferences.includeMetrics,
  };
  const latest = events[events.length - 1];
  if (
    latest &&
    latest.style === next.style &&
    latest.depth === next.depth &&
    latest.includeMetrics === next.includeMetrics
  ) {
    return events;
  }
  return [...events, next].slice(-20);
}

export function resetHistoryEvents() {
  if (typeof window === "undefined") {
    return [];
  }
  window.localStorage.removeItem(HISTORY_STORAGE_KEY);
  return [];
}

export function exportIntelligenceConfig(data: {
  preferences: IntelligencePreferences;
  learning: IntelligenceLearningProfile;
  history: IntelligenceHistoryEvent[];
}) {
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      preferences: data.preferences,
      learning: data.learning,
      history: data.history.slice(-20),
    },
    null,
    2,
  );
}

export function importIntelligenceConfig(raw: string): {
  preferences: IntelligencePreferences;
  learning: IntelligenceLearningProfile;
  history: IntelligenceHistoryEvent[];
} | null {
  try {
    const parsed = JSON.parse(raw) as {
      preferences?: Partial<IntelligencePreferences>;
      learning?: Partial<IntelligenceLearningProfile>;
      history?: IntelligenceHistoryEvent[];
    };
    const preferences: IntelligencePreferences = {
      style:
        parsed.preferences?.style === "steps" ||
        parsed.preferences?.style === "risk" ||
        parsed.preferences?.style === "code"
          ? parsed.preferences.style
          : defaultIntelligencePreferences.style,
      depth:
        parsed.preferences?.depth === "brief" || parsed.preferences?.depth === "detailed"
          ? parsed.preferences.depth
          : defaultIntelligencePreferences.depth,
      includeMetrics:
        typeof parsed.preferences?.includeMetrics === "boolean"
          ? parsed.preferences.includeMetrics
          : defaultIntelligencePreferences.includeMetrics,
    };
    const learning: IntelligenceLearningProfile = {
      styleScores: {
        steps: Number(parsed.learning?.styleScores?.steps ?? 0),
        risk: Number(parsed.learning?.styleScores?.risk ?? 0),
        code: Number(parsed.learning?.styleScores?.code ?? 0),
      },
      depthScores: {
        brief: Number(parsed.learning?.depthScores?.brief ?? 0),
        detailed: Number(parsed.learning?.depthScores?.detailed ?? 0),
      },
    };
    const history = Array.isArray(parsed.history) ? parsed.history.slice(-20) : [];
    return { preferences, learning, history };
  } catch {
    return null;
  }
}
