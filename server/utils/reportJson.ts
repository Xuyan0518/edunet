export type ParsedReportJson = {
  value: unknown | null;
  rawText: string | null;
  parseError: string | null;
};

export const serializeReportJson = (input: unknown): unknown | null => {
  if (input === undefined || input === null) return null;
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      return input;
    }
  }
  return input;
};

export const parseReportJson = (input: unknown): ParsedReportJson => {
  if (input === undefined || input === null) {
    return { value: null, rawText: null, parseError: null };
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) {
      return { value: null, rawText: '', parseError: null };
    }
    try {
      return { value: JSON.parse(trimmed), rawText: trimmed, parseError: null };
    } catch (err) {
      const parseError = err instanceof Error ? err.message : String(err);
      return { value: null, rawText: input, parseError };
    }
  }

  if (typeof input === 'object') {
    return { value: input, rawText: null, parseError: null };
  }

  return { value: input, rawText: String(input), parseError: null };
};
