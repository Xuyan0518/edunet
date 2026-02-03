/**
 * Get authentication token from localStorage
 */
export function getAuthToken(): string | null {
  const token = localStorage.getItem('edunet-token');
  return token;
}

/**
 * Get authorization headers for API requests
 */
export function getAuthHeaders(): HeadersInit {
  const token = getAuthToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return headers;
}

/**
 * Save authentication token to localStorage
 */
export function saveAuthToken(token: string): void {
  localStorage.setItem('edunet-token', token);
}

/**
 * Remove authentication token from localStorage
 */
export function removeAuthToken(): void {
  localStorage.removeItem('edunet-token');
}
