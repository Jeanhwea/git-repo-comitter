/**
 * shared/logger 的单元测试：分级方法、日志槽对记录（含命名空间与参数）的捕获，
 * 以及低于当前级别的日志被静默丢弃。
 */
import { afterEach, describe, expect, test } from "vitest";

import {
  createLogger,
  setLogLevel,
  setLogSink,
  type LogRecord,
  type LogSink,
} from "@/shared/logger";

describe("shared/logger", () => {
  afterEach(() => {
    setLogSink(null);
    setLogLevel("info");
  });

  test("createLogger 返回带分级方法的对象", () => {
    const log = createLogger("test");
    for (const m of ["trace", "debug", "info", "warn", "error"] as const) {
      expect(typeof log[m]).toBe("function");
    }
  });

  test("setLogSink 能捕获日志记录并透传命名空间与参数", () => {
    const records: LogRecord[] = [];
    const sink: LogSink = (r) => records.push(r);
    setLogLevel("debug");
    setLogSink(sink);

    const log = createLogger("unit");
    log.info("hello %s", "world");

    expect(records.length).toBeGreaterThan(0);
    const rec = records[0]!;
    expect(rec.namespace).toBe("unit");
    expect(rec.level).toBe("info");
    expect(rec.message).toContain("hello");
    expect(rec.args[0]).toBe("world");
    expect(rec.text).toContain("world");
  });

  test("低于当前级别的日志被静默丢弃", () => {
    const records: LogRecord[] = [];
    setLogLevel("warn"); // info / debug 不输出
    setLogSink((r) => records.push(r));

    const log = createLogger("unit");
    log.debug("should be dropped");
    expect(records.length).toBe(0);
    log.warn("kept");
    expect(records.length).toBe(1);
  });
});
