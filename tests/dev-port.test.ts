import { afterEach, describe, expect, test } from "bun:test";
import net from "node:net";
import { getAvailablePortConfig } from "../scripts/dev-port.mjs";

const originalDevPort = process.env.AUTOPILOT_DEV_PORT;
const originalHmrPort = process.env.AUTOPILOT_HMR_PORT;

afterEach(() => {
  if (originalDevPort === undefined) {
    delete process.env.AUTOPILOT_DEV_PORT;
  } else {
    process.env.AUTOPILOT_DEV_PORT = originalDevPort;
  }

  if (originalHmrPort === undefined) {
    delete process.env.AUTOPILOT_HMR_PORT;
  } else {
    process.env.AUTOPILOT_HMR_PORT = originalHmrPort;
  }
});

describe("development ports", () => {
  test("skips a port occupied on an IPv6 localhost address", async () => {
    const server = net.createServer();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "::1", () => resolve());
    });

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected an assigned TCP port");
      }

      process.env.AUTOPILOT_DEV_PORT = String(address.port);
      delete process.env.AUTOPILOT_HMR_PORT;

      const ports = await getAvailablePortConfig(process.cwd(), "localhost");

      expect(ports.devPort).not.toBe(address.port);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
