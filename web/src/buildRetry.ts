export type BuildAttempt = { jobId: string; body: string };

export function retryBody(
  attempt: BuildAttempt | null,
  jobId: string,
): string | null {
  return attempt?.jobId === jobId ? attempt.body : null;
}
