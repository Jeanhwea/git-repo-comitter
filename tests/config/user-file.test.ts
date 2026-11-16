import { resolve } from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fsMock = vi.hoisted(() => ({
  home: "/tmp/grc-home-test",
  existsSync: vi.fn<(path: string) => boolean>(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn<(path: string, encoding: string) => string>(),
  writeFileSync: vi.fn(),
  statSync: vi.fn(),
  chmodSync: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

vi.mock("os", () => ({ homedir: () => fsMock.home }));

vi.mock("fs", () => ({
  existsSync: fsMock.existsSync,
  mkdirSync: fsMock.mkdirSync,
  readFileSync: fsMock.readFileSync,
  writeFileSync: fsMock.writeFileSync,
  statSync: fsMock.statSync,
  chmodSync: fsMock.chmodSync,
}));

vi.mock("@/shared/logger", () => ({
  createLogger: () => ({ warn: fsMock.warn, debug: fsMock.debug }),
}));

import { loadUserConfigFile, saveUserConfig } from "@/config/user-file";

const CONFIG_DIR = resolve(fsMock.home, ".grc");
const CONFIG_PATH = resolve(CONFIG_DIR, "config.json");
const originalPlatform = process.platform;

function setPlatform(platform: string): void {
  Object.defineProperty(process, "platform", {
    value: platform,
    configurable: true,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setPlatform("linux");
  fsMock.existsSync.mockReturnValue(false);
  fsMock.statSync.mockReturnValue({ mode: 0o600 });
  fsMock.readFileSync.mockReturnValue("{}");
  fsMock.chmodSync.mockImplementation(() => undefined);
});

afterEach(() => {
  setPlatform(originalPlatform);
});

describe("config/user-file", () => {
  describe("loadUserConfigFile", () => {
    it("文件不存在时返回空配置且不读取", () => {
      expect(loadUserConfigFile()).toEqual({});
      expect(fsMock.readFileSync).not.toHaveBeenCalled();
    });

    it("JSON 解析失败时忽略配置", () => {
      fsMock.existsSync.mockReturnValue(true);
      fsMock.readFileSync.mockReturnValue("{非法 JSON");

      expect(loadUserConfigFile()).toEqual({});
      expect(fsMock.debug).toHaveBeenCalled();
    });

    it("非对象 JSON 被忽略", () => {
      fsMock.existsSync.mockReturnValue(true);
      fsMock.readFileSync.mockReturnValue("[]");

      expect(loadUserConfigFile()).toEqual({});
    });

    it("合法对象保留 llm 子对象", () => {
      fsMock.existsSync.mockReturnValue(true);
      fsMock.readFileSync.mockReturnValue(
        JSON.stringify({ apiKey: "k", llm: { model: "m" } }),
      );

      expect(loadUserConfigFile()).toEqual({
        apiKey: "k",
        llm: { model: "m" },
      });
    });

    it("llm 不是对象时按缺省处理", () => {
      fsMock.existsSync.mockReturnValue(true);
      fsMock.readFileSync.mockReturnValue(
        JSON.stringify({ apiKey: "k", llm: ["bad"] }),
      );

      expect(loadUserConfigFile()).toEqual({ apiKey: "k", llm: undefined });
    });

    it("权限过宽时告警但仍返回配置", () => {
      fsMock.existsSync.mockReturnValue(true);
      fsMock.statSync.mockReturnValue({ mode: 0o644 });
      fsMock.readFileSync.mockReturnValue('{"apiKey":"k"}');

      expect(loadUserConfigFile()).toEqual({ apiKey: "k" });
      expect(fsMock.warn).toHaveBeenCalledWith(
        expect.stringContaining("权限过宽"),
      );
    });

    it("权限探测失败不影响读取", () => {
      fsMock.existsSync.mockReturnValue(true);
      fsMock.statSync.mockImplementation(() => {
        throw new Error("stat failed");
      });
      fsMock.readFileSync.mockReturnValue('{"apiKey":"k"}');

      expect(loadUserConfigFile()).toEqual({ apiKey: "k" });
      expect(fsMock.warn).not.toHaveBeenCalled();
    });

    it("Windows 跳过权限检查", () => {
      setPlatform("win32");
      fsMock.existsSync.mockReturnValue(true);
      fsMock.readFileSync.mockReturnValue('{"apiKey":"k"}');

      expect(loadUserConfigFile()).toEqual({ apiKey: "k" });
      expect(fsMock.statSync).not.toHaveBeenCalled();
    });
  });

  describe("saveUserConfig", () => {
    it("首次保存创建目录并收紧权限", () => {
      saveUserConfig({ apiKey: "k" });

      expect(fsMock.mkdirSync).toHaveBeenCalledWith(CONFIG_DIR, {
        recursive: true,
        mode: 0o700,
      });
      expect(fsMock.writeFileSync).toHaveBeenCalledWith(
        CONFIG_PATH,
        JSON.stringify({ apiKey: "k" }, null, 2),
        { encoding: "utf-8", mode: 0o600 },
      );
      expect(fsMock.chmodSync).toHaveBeenCalledWith(CONFIG_PATH, 0o600);
      expect(fsMock.chmodSync).toHaveBeenCalledWith(CONFIG_DIR, 0o700);
    });

    it("目录已存在时不重复创建但仍收紧权限", () => {
      fsMock.existsSync.mockReturnValue(true);

      saveUserConfig({ apiKey: "k" });

      expect(fsMock.mkdirSync).not.toHaveBeenCalled();
      expect(fsMock.chmodSync).toHaveBeenCalledWith(CONFIG_PATH, 0o600);
    });

    it("收紧权限失败不阻断保存", () => {
      fsMock.chmodSync.mockImplementation(() => {
        throw new Error("chmod failed");
      });

      expect(() => saveUserConfig({})).not.toThrow();
      expect(fsMock.writeFileSync).toHaveBeenCalled();
    });
  });
});
