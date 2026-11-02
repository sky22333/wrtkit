async function request(path: string, opts?: RequestInit): Promise<Response> {
  const r = await fetch("/api" + path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts?.headers },
  });
  if (r.status === 401 && !path.startsWith("/auth/"))
    window.dispatchEvent(new Event("wrtkit-unauthorized"));
  if (!r.ok) {
    let message = `请求失败（${r.status}）`;
    try {
      const data: unknown = await r.json();
      if (
        data &&
        typeof data === "object" &&
        "error" in data &&
        typeof data.error === "string"
      )
        message = data.error;
    } catch {
      // Some network and proxy errors are not JSON.
    }
    throw Error(message);
  }
  return r;
}

export async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  return (await request(path, opts)).json() as Promise<T>;
}

export async function apiText(
  path: string,
  opts?: RequestInit,
): Promise<string> {
  return (await request(path, opts)).text();
}
