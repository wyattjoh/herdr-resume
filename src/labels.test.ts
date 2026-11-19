import { expect, test } from "bun:test";
import { clearLabels, readRecord, recordLabels, type ResumeRecord } from "./labels";

const record: ResumeRecord = {
  agent: "pi",
  session: "/s/a=b.jsonl",
  cwd: "/w",
  program: "pi",
  args: ["--thinking", "high"],
  started: 42,
};

test("labels round-trip, including values containing =", () => {
  const labels = Object.fromEntries(
    recordLabels(record).map((p) => p.split(/=(.*)/s, 2) as [string, string]),
  );
  expect(readRecord(labels)).toEqual(record);
});

test("malformed labels read as no record", () => {
  expect(readRecord({ "resume.agent": "codex" })).toBeUndefined();
  expect(
    readRecord({
      "resume.agent": "pi",
      "resume.session": "s",
      "resume.cwd": "/",
      "resume.started": "1",
      "resume.args": "{",
    }),
  ).toBeUndefined();
  expect(readRecord(undefined)).toBeUndefined();
});

test("clearLabels removes every key", () => {
  expect(clearLabels().every((p) => p.endsWith("="))).toBe(true);
});
