import { EventEmitter } from "events";

export type WebhookEvent =
  | { type: "enrollment.created"; payload: { studentId: string; sectionId: string; status: string } }
  | { type: "enrollment.updated"; payload: { id: string; oldStatus: string; newStatus: string } }
  | { type: "announcement.created"; payload: { id: string; title: string; audience: string } };

class WebhookEmitter extends EventEmitter {}

export const webhookBus = new WebhookEmitter();

const webhookRegistry: { id: string; url: string; events: string[]; secret: string }[] = [];

export function registerWebhook(url: string, events: string[], secret: string): string {
  const id = Math.random().toString(36).slice(2);
  webhookRegistry.push({ id, url, events, secret });
  return id;
}

export function getWebhooks() {
  return webhookRegistry.map((webhook) => ({
    id: webhook.id,
    url: webhook.url,
    events: webhook.events
  }));
}

export function removeWebhook(id: string) {
  const index = webhookRegistry.findIndex((webhook) => webhook.id === id);
  if (index >= 0) {
    webhookRegistry.splice(index, 1);
  }
}

export async function dispatch(event: WebhookEvent): Promise<void> {
  webhookBus.emit(event.type, event.payload);
  const targets = webhookRegistry.filter(
    (webhook) => webhook.events.includes("*") || webhook.events.includes(event.type)
  );
  await Promise.allSettled(
    targets.map(async (target) => {
      try {
        await fetch(target.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-SIS-Event": event.type,
            "X-SIS-Webhook-ID": target.id
          },
          body: JSON.stringify({
            event: event.type,
            payload: event.payload,
            timestamp: new Date().toISOString()
          }),
          signal: AbortSignal.timeout(5000)
        });
      } catch {
        // Non-blocking delivery.
      }
    })
  );
}
