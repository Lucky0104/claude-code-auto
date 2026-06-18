async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function apiGet<T>(path: string): Promise<T> {
  return unwrap<T>(await fetch(path, { credentials: "include" }));
}

export async function apiSend<T>(path: string, method: string, body?: unknown): Promise<T> {
  return unwrap<T>(
    await fetch(path, {
      method,
      credentials: "include",
      headers: body !== undefined ? { "content-type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  );
}
