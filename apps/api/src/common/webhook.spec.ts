import {
  registerWebhook,
  getWebhooks,
  removeWebhook,
  dispatch,
  webhookBus
} from "./webhook";

// Isolate registry between tests by using a fresh module for state-sensitive tests
beforeEach(() => {
  // Clear registry by removing all webhooks
  const hooks = getWebhooks();
  for (const h of hooks) removeWebhook(h.id);
});

describe("registerWebhook", () => {
  it("returns a unique string ID", () => {
    const id1 = registerWebhook("https://a.test/hook", ["*"], "secret1");
    const id2 = registerWebhook("https://b.test/hook", ["*"], "secret2");
    expect(typeof id1).toBe("string");
    expect(id1).not.toBe(id2);
  });
});

describe("getWebhooks", () => {
  it("returns registered webhooks without secret", () => {
    registerWebhook("https://a.test/hook", ["enrollment.created"], "supersecret");
    const hooks = getWebhooks();
    expect(hooks).toHaveLength(1);
    expect(hooks[0]).toMatchObject({
      url: "https://a.test/hook",
      events: ["enrollment.created"]
    });
    expect("secret" in hooks[0]).toBe(false);
  });

  it("returns empty array when no webhooks registered", () => {
    expect(getWebhooks()).toHaveLength(0);
  });
});

describe("removeWebhook", () => {
  it("removes a webhook by ID", () => {
    const id = registerWebhook("https://a.test/hook", ["*"], "sec");
    removeWebhook(id);
    expect(getWebhooks()).toHaveLength(0);
  });

  it("is a no-op when ID does not exist", () => {
    registerWebhook("https://a.test/hook", ["*"], "sec");
    expect(() => removeWebhook("nonexistent-id")).not.toThrow();
    expect(getWebhooks()).toHaveLength(1);
  });
});

describe("dispatch", () => {
  it("emits event on webhookBus", async () => {
    const listener = jest.fn();
    webhookBus.on("enrollment.created", listener);

    await dispatch({
      type: "enrollment.created",
      payload: { studentId: "s1", sectionId: "sec1", status: "ENROLLED" }
    });

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: "s1" })
    );
    webhookBus.off("enrollment.created", listener);
  });

  it("calls registered webhook URL via fetch", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });

    registerWebhook("https://target.test/hook", ["enrollment.updated"], "secret");
    await dispatch({
      type: "enrollment.updated",
      payload: { id: "e1", oldStatus: "WAITLISTED", newStatus: "ENROLLED" }
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "https://target.test/hook",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-SIS-Event": "enrollment.updated"
        })
      })
    );
  });

  it("fires wildcard webhook for any event type", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });

    registerWebhook("https://target.test/hook", ["*"], "secret");
    await dispatch({
      type: "announcement.created",
      payload: { id: "a1", title: "Test", audience: "ALL" }
    });

    expect(global.fetch).toHaveBeenCalled();
  });

  it("does not call URL when event not subscribed", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });

    registerWebhook("https://target.test/hook", ["enrollment.created"], "secret");
    await dispatch({
      type: "enrollment.updated",
      payload: { id: "e1", oldStatus: "PENDING", newStatus: "ENROLLED" }
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("does not throw when fetch fails", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("network error"));
    registerWebhook("https://bad.host/hook", ["*"], "secret");

    await expect(
      dispatch({ type: "announcement.created", payload: { id: "a1", title: "T", audience: "ALL" } })
    ).resolves.not.toThrow();
  });
});
