export async function apiRequest(
  path: string,
  options: RequestInit = {},
  token?: string,
) {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(`/api${path}`, { ...options, headers });
}

export async function getErrorMessage(response: Response) {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string"
    ) {
      return body.error;
    }
  } catch {
    /* A proxy error may not contain JSON. */
  }
  return `Request failed (${response.status}). Please try again.`;
}
