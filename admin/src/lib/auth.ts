export function getAuthToken() {
  return localStorage.getItem("admin_token");
}

export function setAuthToken(token: string) {
  localStorage.setItem("admin_token", token);
}

export function clearAuthToken() {
  localStorage.removeItem("admin_token");
}

export function isAdmin() {
  const token = getAuthToken();
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    // Check role
    if (payload.role !== "admin") return false;
    // Check expiry — exp is in seconds
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      clearAuthToken();
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
