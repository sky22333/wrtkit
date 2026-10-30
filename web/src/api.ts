export async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch("/api" + path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts?.headers },
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error || "请求失败");
  return data as T;
}
