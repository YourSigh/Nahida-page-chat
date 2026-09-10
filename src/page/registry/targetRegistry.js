import { canRebindFingerprint, fingerprintFor, fingerprintScore } from "./fingerprint.js";

const isCurrentCandidate = (candidate) =>
  Boolean(candidate?.clickElement?.isConnected) && Boolean(candidate?.stateElement?.isConnected);

export class TargetRegistry {
  constructor({ discover }) {
    this.discover = discover;
    this.snapshotVersion = 0;
    this.entries = new Map();
    this.current = [];
  }

  registerSnapshot(candidates) {
    this.snapshotVersion += 1;
    const version = this.snapshotVersion;
    this.current = candidates.map((candidate, index) => {
      const id = `t${version}-${index + 1}`;
      const entry = {
        id,
        snapshotVersion: version,
        candidate,
        fingerprint: fingerprintFor(candidate)
      };
      this.entries.set(id, entry);
      return entry;
    });

    const oldestVersion = Math.max(1, version - 3);
    for (const [id, entry] of this.entries) {
      if (entry.snapshotVersion < oldestVersion) this.entries.delete(id);
    }
    return this.current;
  }

  currentEntries() {
    return this.current.slice();
  }

  resolve(targetId) {
    const id = String(targetId || "");
    const entry = this.entries.get(id);
    if (!entry) return { error: "目标已失效或从未被识别，请先重新读取页面状态。" };
    if (isCurrentCandidate(entry.candidate)) return { id, candidate: entry.candidate, rebound: false };

    const discovered = this.discover?.();
    const candidates = Array.isArray(discovered) ? discovered : [];
    let best = null;
    for (const candidate of candidates) {
      const fingerprint = fingerprintFor(candidate);
      const score = fingerprintScore(entry.fingerprint, fingerprint);
      if (!canRebindFingerprint(entry.fingerprint, fingerprint, score)) continue;
      if (!best || score > best.score) best = { candidate, fingerprint, score };
    }
    if (!best) {
      return { error: "目标已经被页面重绘且无法安全重新匹配，请重新读取页面状态。" };
    }

    entry.candidate = best.candidate;
    entry.fingerprint = best.fingerprint;
    return { id, candidate: best.candidate, rebound: true, rebindScore: best.score };
  }
}
