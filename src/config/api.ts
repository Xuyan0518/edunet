// API Configuration
const getDefaultApiBaseUrl = () => {
  if (import.meta.env.DEV) return 'http://localhost:3003/api';
  if (typeof window !== 'undefined') return `${window.location.origin}/api`;
  return '/api';
};

export const API_CONFIG = {
  BASE_URL: import.meta.env.VITE_API_URL || getDefaultApiBaseUrl(),
} as const;

// Helper function to build API URLs
export const buildApiUrl = (endpoint: string): string => {
  // Remove leading slash if present to avoid double slashes
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  return `${API_CONFIG.BASE_URL}/${cleanEndpoint}`;
};
