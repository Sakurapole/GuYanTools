const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function waitForDevServer(url: string, timeoutMs = 20000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1000);

    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (response.ok || response.status < 500) {
        return;
      }
      lastError = new Error(`Unexpected status: ${response.status}`);
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
    }

    await delay(250);
  }

  throw new Error(`Timed out waiting for dev server: ${url}. Last error: ${String(lastError)}`);
}
