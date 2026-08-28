export function shouldSuppressTerminalResponses(
  lastRenderedBuffer: string,
  nextBuffer: string,
  hasRenderedBuffer = false,
) {
  return !hasRenderedBuffer || !nextBuffer.startsWith(lastRenderedBuffer);
}
