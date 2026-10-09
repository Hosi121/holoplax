// Keep browser DOM types isolated from the binding package while forwarding data as a stream.
export function webStream(body: {
  getReader(): {
    read(): Promise<{ done: boolean; value?: Uint8Array }>;
    cancel(reason?: unknown): Promise<void>;
  };
}): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  return new ReadableStream({
    async pull(controller) {
      const chunk = await reader.read();
      if (chunk.done) controller.close();
      else if (chunk.value) controller.enqueue(chunk.value);
    },
    cancel: (reason) => reader.cancel(reason),
  });
}
