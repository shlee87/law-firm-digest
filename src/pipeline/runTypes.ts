// Phase 13 D-01 split — shared type module so runDaily.ts and runWeekly.ts
// reference one source of truth for Reporter / RunOptions / RunReport.
//
// Note on RunOptions field relevance per mode:
//   - skipEmail: irrelevant to runDaily (sendMail not imported). Honored by
//     runWeekly so the cli/checkFirm.ts dry path can suppress mail send.
//     Plan 13-05 simplifies if both daily+weekly end up not using it.
//   - skipGemini: relevant to runDaily only.
//   - saveHtmlPath: irrelevant to runDaily (composeDigest not imported);
//     relevant to runWeekly's compose path.
//   - skipStateWrite: relevant to BOTH (daily writes seen.json + pending.json,
//     weekly truncates pending.json + writes seen.json).

import type { FirmResult, FirmConfig } from '../types.js';
import type { StalenessWarnings } from '../observability/staleness.js';
import type { Recorder } from '../observability/recorder.js';
import type { DataQualityMarker } from './detectClusters.js';

export interface Reporter {
  section(name: string, detail: string): void;
}

export const noopReporter: Reporter = { section: () => {} };

export interface RunOptions {
  firmFilter?: string;
  skipEmail?: boolean;
  skipStateWrite?: boolean;
  skipGemini?: boolean;
  saveHtmlPath?: string;
  reporter?: Reporter;
}

export interface RunReport {
  results: FirmResult[];
  digestSent: boolean;
  saveHtmlWritten?: string;
  archivePath?: string;
  warnings: StalenessWarnings;
  recorder: Recorder;
  jsRenderFailures: number;
  markers: DataQualityMarker[];
  firms: FirmConfig[];
}
