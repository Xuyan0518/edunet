const FALLBACK_CORS_ORIGINS = ['http://localhost:3001', 'http://localhost:5173'];

export const buildAllowedCorsOrigins = (
  configuredOrigins: string,
  renderHostname: string,
): string[] => {
  const configured = configuredOrigins
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const renderOrigin = renderHostname.trim()
    ? `https://${renderHostname.trim()}`
    : null;
  const origins = configured.length ? configured : FALLBACK_CORS_ORIGINS;

  return Array.from(new Set(renderOrigin ? [...origins, renderOrigin] : origins));
};
