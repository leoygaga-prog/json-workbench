import type { WorkerRequest, WorkerResponse } from "../workers/dataWorker";

export class DataWorkerClient {
  private worker: Worker;
  private pending = new Map<string, (response: WorkerResponse) => void>();
  private progressHandlers = new Map<string, (response: WorkerResponse) => void>();

  constructor() {
    this.worker = new Worker(new URL("../workers/dataWorker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      if (response.type === "progress") {
        const handler = this.progressHandlers.get(response.id);
        handler?.(response);
        return;
      }
      const resolver = this.pending.get(response.id);
      if (resolver) {
        resolver(response);
        this.pending.delete(response.id);
        this.progressHandlers.delete(response.id);
      }
    };
  }

  request(
    message: WorkerRequest,
    onProgress?: (response: WorkerResponse) => void,
  ) {
    return new Promise<WorkerResponse>((resolve) => {
      this.pending.set(message.id, resolve);
      if (onProgress) {
        this.progressHandlers.set(message.id, onProgress);
      }
      this.worker.postMessage(message);
    });
  }
}

