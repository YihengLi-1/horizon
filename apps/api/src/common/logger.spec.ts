import { StructuredLogger } from "./logger";

describe("StructuredLogger", () => {
  let logger: StructuredLogger;
  const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

  beforeEach(() => {
    logger = new StructuredLogger();
    consoleSpy.mockClear();
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
    process.env.NODE_ENV = "test";
  });

  it("log() writes to console in non-production", () => {
    logger.log("test message", "TestContext");
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("test message"));
  });

  it("warn() writes to console in non-production", () => {
    logger.warn("warning message", "TestContext");
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("warning message"));
  });

  it("error() writes to console in non-production", () => {
    logger.error("error message", "stack trace", "TestContext");
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("error message"));
  });

  it("debug() writes to console in non-production", () => {
    logger.debug("debug message", "TestContext");
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("debug message"));
  });

  it("verbose() writes to console in non-production", () => {
    logger.verbose("verbose message", "TestContext");
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("verbose message"));
  });

  it("writes JSON to stdout in production mode", () => {
    const stdoutSpy = jest.spyOn(process.stdout, "write").mockImplementation(() => true);
    process.env.NODE_ENV = "production";
    const prodLogger = new StructuredLogger();

    prodLogger.log("prod message", "Context");

    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining('"message":"prod message"')
    );
    stdoutSpy.mockRestore();
  });
});
