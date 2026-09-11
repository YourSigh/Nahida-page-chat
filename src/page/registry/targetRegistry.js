import { canRebindFingerprint, fingerprintFor, fingerprintScore, logicalKeyFor } from "./fingerprint.js";

const isCurrentCandidate = (candidate) =>
  Boolean(candidate?.clickElement?.isConnected) && Boolean(candidate?.stateElement?.isConnected);

const metadataFor = (id, snapshotVersion, candidate, fingerprint) => ({
  id,
  snapshotVersion,
  fingerprint,
  logicalKey: candidate.logicalKey || fingerprint.logicalKey || "",
  questionId: candidate.questionId || "",
  questionKey: candidate.questionKey || fingerprint.questionKey || "",
  optionKey: candidate.optionKey || "",
  kind: candidate.kind || fingerprint.kind || "",
  name: candidate.name || "",
  text: candidate.text || "",
  lastSeenVersion: snapshotVersion
});

const staleResult = (targetId, message = "目标已失效，请刷新页面状态后重试。") => ({
  error: message,
  status: "target_stale",
  targetId: String(targetId || "")
});

export class TargetRegistry {
  constructor({ discover }) {
    this.discover = discover;
    this.snapshotVersion = 0;
    // Current ids retain live candidates only while they are useful.
    this.entries = new Map();
    // Historical ids retain metadata, never old DOM references.
    this.history = new Map();
    // Logical identity points to the latest metadata/candidate for fast rebind.
    this.logicalTargets = new Map();
    this.current = [];
  }

  registerSnapshot(candidates) {
    this.snapshotVersion += 1;
    const version = this.snapshotVersion;
    this.current = candidates.map((candidate, index) => {
      const id = `t${version}-${index + 1}`;
      const fingerprint = fingerprintFor(candidate);
      const metadata = metadataFor(id, version, candidate, fingerprint);
      const entry = {
        candidate,
        ...metadata
      };
      this.entries.set(id, entry);
      this.history.set(id, metadata);
      if (metadata.logicalKey) {
        this.logicalTargets.set(metadata.logicalKey, {
          ...metadata,
          latestTargetId: id,
          latestCandidate: candidate
        });
      }
      return entry;
    });

    // Release old DOM references, but keep id -> fingerprint/logical key
    // metadata for the entire page-controller lifetime.
    for (const [id, entry] of this.entries) {
      if (entry.snapshotVersion < version) {
        this.entries.delete(id);
      }
    }
    return this.current;
  }

  refresh() {
    const discovered = this.discover?.();
    return this.registerSnapshot(Array.isArray(discovered) ? discovered : []);
  }

  currentEntries() {
    return this.current.slice();
  }

  metadataForTarget(targetId) {
    const id = String(targetId || "");
    const entry = this.entries.get(id);
    if (entry) return { ...entry, candidate: undefined };
    const metadata = this.history.get(id);
    return metadata ? { ...metadata } : null;
  }

  findLogicalMatches(logicalKey, candidates) {
    if (!logicalKey) return [];
    return (Array.isArray(candidates) ? candidates : [])
      .map((candidate) => ({ candidate, fingerprint: fingerprintFor(candidate), logicalKey: logicalKeyFor(candidate) }))
      .filter((item) => item.logicalKey === logicalKey);
  }

  updateReboundEntry(id, metadata, match) {
    const nextEntry = {
      ...metadata,
      snapshotVersion: this.snapshotVersion,
      candidate: match.candidate,
      fingerprint: match.fingerprint
    };
    this.entries.set(id, nextEntry);
    this.history.set(id, {
      ...metadata,
      snapshotVersion: this.snapshotVersion,
      fingerprint: match.fingerprint,
      lastSeenVersion: this.snapshotVersion
    });
    if (metadata.logicalKey) {
      this.logicalTargets.set(metadata.logicalKey, {
        ...metadata,
        fingerprint: match.fingerprint,
        latestTargetId: id,
        latestCandidate: match.candidate,
        lastSeenVersion: this.snapshotVersion
      });
    }
    return { id, candidate: match.candidate, rebound: true, rebindScore: match.score };
  }

  resolve(targetId) {
    const id = String(targetId || "");
    const entry = this.entries.get(id);
    const metadata = entry || this.history.get(id);
    if (!metadata) return staleResult(id, "目标已失效或从未被识别，请先重新读取页面状态。");
    if (entry && isCurrentCandidate(entry.candidate)) return { id, candidate: entry.candidate, rebound: false };

    const discovered = this.discover?.();
    const candidates = Array.isArray(discovered) ? discovered : [];
    const logicalMatches = this.findLogicalMatches(metadata.logicalKey, candidates)
      .filter((match) => canRebindFingerprint(metadata.fingerprint, match.fingerprint, fingerprintScore(metadata.fingerprint, match.fingerprint)));
    if (logicalMatches.length === 1) {
      const match = { ...logicalMatches[0], score: fingerprintScore(metadata.fingerprint, logicalMatches[0].fingerprint) };
      return this.updateReboundEntry(id, metadata, match);
    }
    if (logicalMatches.length > 1) {
      return {
        error: "找到多个可能的同名目标，无法安全重新绑定，请重新读取页面状态。",
        status: "target_rebind_failed",
        reason: "ambiguous",
        targetId: id,
        logicalKey: metadata.logicalKey
      };
    }

    let best = null;
    for (const candidate of candidates) {
      const fingerprint = fingerprintFor(candidate);
      const score = fingerprintScore(metadata.fingerprint, fingerprint);
      if (!canRebindFingerprint(metadata.fingerprint, fingerprint, score)) continue;
      if (!best || score > best.score) best = { candidate, fingerprint, score };
    }
    if (!best) {
      return staleResult(id, "目标已经被页面重绘且无法安全重新匹配，请刷新页面状态后重试。");
    }
    return this.updateReboundEntry(id, metadata, best);
  }
}
