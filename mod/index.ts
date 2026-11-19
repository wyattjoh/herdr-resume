import { View, div } from "gpui-kit";
import { checking, exec, home, notify } from "herdr";

// Kept shells come back after a grace delay, so keep checking for a while after startup.
const EVERY_MS = 30_000;
const WINDOW_MS = 10 * 60_000;

type Report = {
  resumed: { address: string; agent: string }[];
  failed: { address: string; error: string }[];
};

/**
 * Invisible block that resumes agent sessions lost to a reboot, once per boot.
 *
 * The work is done by the `herdr-resume apply` CLI; this mod only runs it while the
 * window starts up and reports what happened.
 */
export default class Resume extends View {
  private started = 0;
  private busy = false;

  init(_props: unknown, cx: import("gpui-kit").Context): void {
    if (checking()) return;
    this.started = Date.now();
    cx.spawn(async () => this.apply());
    const task = cx.timer.every(EVERY_MS, (cx) => {
      if (Date.now() - this.started > WINDOW_MS) {
        task.cancel?.();
        return;
      }
      cx.spawn(async () => this.apply());
    });
  }

  private async apply(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const result = await exec(`${home()}/.local/bin/herdr-resume`, ["apply", "--json"], {
        timeout: 120_000,
      });
      const report = JSON.parse(result.stdout || "{}") as Partial<Report>;
      const resumed = report.resumed ?? [];
      const failed = report.failed ?? [];
      if (resumed.length) {
        notify({
          title: `Resumed ${resumed.length} agent session${resumed.length === 1 ? "" : "s"}`,
          body: resumed.map((r) => `${r.address} ${r.agent}`).join(", "),
          level: "success",
        });
      }
      if (failed.length) {
        notify({
          title: `Couldn't resume ${failed.length} agent session${failed.length === 1 ? "" : "s"}`,
          body: failed.map((f) => `${f.address}: ${f.error}`).join("\n"),
          level: "error",
        });
      }
    } catch (error) {
      notify({ title: "herdr-resume failed", body: String(error), level: "error" });
    } finally {
      this.busy = false;
    }
  }

  render() {
    return div().id("herdr-resume");
  }
}
