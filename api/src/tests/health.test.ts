import { describe, it, expect } from "vitest";
import app from "../index";

describe("Health endpoint", () => {
  it("should return 200 with healthy status when services are up", async () => {
    const res = await app.fetch(new Request("http://localhost/health"));
    const body = (await res.json()) as {
      status: string;
      services: { postgres: string; redis: string };
    };

    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.services.postgres).toBe("healthy");
    expect(body.services.redis).toBe("healthy");
  });

  it("should return 404 for unknown routes", async () => {
    const res = await app.fetch(new Request("http://localhost/nonexistent"));
    expect(res.status).toBe(404);
  });
});
