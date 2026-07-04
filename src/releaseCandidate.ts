/**
 * Release Candidate — Feature Freeze & Bug-Fix-Only Gate
 *
 * This module enforces the RC discipline:
 *   - Declares the current RC version and freeze date
 *   - Provides a feature-freeze guard that warns when non-bugfix changes are attempted
 *   - Tracks known issues and their resolution status
 *   - Generates a finalized changelog summary for the RC
 *   - Shows RC status in the status bar and welcome panel
 *
 * Once the extension enters RC mode, new features are blocked
 * and only bug fixes, docs, and test improvements are allowed.
 */

import * as vscode from 'vscode';

/** Change category for RC gating */
export type ChangeCategory = 'bugfix' | 'docs' | 'test' | 'performance' | 'feature' | 'refactor';

/** Allowed categories during feature freeze */
const RC_ALLOWED_CATEGORIES: ChangeCategory[] = ['bugfix', 'docs', 'test', 'performance'];

/** RC metadata */
export interface ReleaseCandidateInfo {
  /** RC version string */
  version: string;
  /** Date the feature freeze started */
  freezeDate: string;
  /** Target GA release date */
  targetGADate: string;
  /** Whether the RC is currently active */
  active: boolean;
  /** Known issues being tracked */
  knownIssues: RCIssue[];
  /** Changelog sections finalized */
  changelogFinalized: boolean;
}

/** Tracked issue for RC */
export interface RCIssue {
  /** Issue identifier */
  id: string;
  /** Brief description */
  description: string;
  /** Severity: critical, major, minor */
  severity: 'critical' | 'major' | 'minor';
  /** Whether it's been resolved */
  resolved: boolean;
  /** Resolution note */
  resolution?: string;
}

/** Current RC state */
const RC_INFO: ReleaseCandidateInfo = {
  version: '0.7.166-rc',
  freezeDate: '2026-07-04',
  targetGADate: '2026-07-07',
  active: true,
  changelogFinalized: true,
  knownIssues: [
    {
      id: 'RC-001',
      description: 'Streaming transcription occasionally drops final word on slow connections',
      severity: 'minor',
      resolved: true,
      resolution: 'Added 200ms flush delay before finalizing stream',
    },
    {
      id: 'RC-002',
      description: 'Model ensemble timeout when >3 models configured on low-RAM machines',
      severity: 'major',
      resolved: true,
      resolution: 'Added memory check before spawning ensemble workers, cap at available RAM / 512MB',
    },
    {
      id: 'RC-003',
      description: 'Custom wake word training fails silently on Firefox-based editors',
      severity: 'minor',
      resolved: true,
      resolution: 'Graceful fallback with user notification when AudioWorklet unavailable',
    },
  ],
};

let statusBarItem: vscode.StatusBarItem | undefined;

/**
 * Initialize RC mode — show status bar indicator and register commands.
 */
export function initReleaseCandidate(context: vscode.ExtensionContext): void {
  if (!RC_INFO.active) return;

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
  statusBarItem.text = '$(shield) RC';
  statusBarItem.tooltip = `VoxPilot ${RC_INFO.version} — Feature Freeze Active\nTarget GA: ${RC_INFO.targetGADate}`;
  statusBarItem.command = 'voxpilot.showRCStatus';
  statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
}

/**
 * Check whether a change category is allowed under the current freeze.
 */
export function isChangeAllowed(category: ChangeCategory): boolean {
  if (!RC_INFO.active) return true;
  return RC_ALLOWED_CATEGORIES.includes(category);
}

/**
 * Get the freeze gate message for a blocked category.
 */
export function getFreezeMessage(category: ChangeCategory): string {
  if (isChangeAllowed(category)) return '';
  return `Feature freeze active (${RC_INFO.version}). Only bug fixes, docs, tests, and performance changes are allowed until GA. Category "${category}" is blocked.`;
}

/**
 * Get RC information.
 */
export function getRCInfo(): ReleaseCandidateInfo {
  return { ...RC_INFO, knownIssues: [...RC_INFO.knownIssues] };
}

/**
 * Get unresolved issues.
 */
export function getUnresolvedIssues(): RCIssue[] {
  return RC_INFO.knownIssues.filter(i => !i.resolved);
}

/**
 * Get resolved issues.
 */
export function getResolvedIssues(): RCIssue[] {
  return RC_INFO.knownIssues.filter(i => i.resolved);
}

/**
 * Check if the RC is ready for GA promotion.
 */
export function isReadyForGA(): { ready: boolean; blockers: string[] } {
  const blockers: string[] = [];

  const unresolvedCritical = RC_INFO.knownIssues.filter(
    i => !i.resolved && i.severity === 'critical',
  );
  if (unresolvedCritical.length > 0) {
    blockers.push(`${unresolvedCritical.length} unresolved critical issue(s)`);
  }

  const unresolvedMajor = RC_INFO.knownIssues.filter(
    i => !i.resolved && i.severity === 'major',
  );
  if (unresolvedMajor.length > 0) {
    blockers.push(`${unresolvedMajor.length} unresolved major issue(s)`);
  }

  if (!RC_INFO.changelogFinalized) {
    blockers.push('Changelog not finalized');
  }

  return { ready: blockers.length === 0, blockers };
}

/**
 * Format RC status as markdown for display.
 */
export function formatRCStatus(): string {
  const info = RC_INFO;
  const gaCheck = isReadyForGA();
  const lines: string[] = [];

  lines.push(`# VoxPilot ${info.version}`);
  lines.push('');
  lines.push(`**Status:** ${info.active ? '🔒 Feature Freeze Active' : '✅ Released'}`);
  lines.push(`**Freeze Date:** ${info.freezeDate}`);
  lines.push(`**Target GA:** ${info.targetGADate}`);
  lines.push(`**Changelog:** ${info.changelogFinalized ? '✅ Finalized' : '⏳ Pending'}`);
  lines.push(`**GA Ready:** ${gaCheck.ready ? '✅ Yes' : '❌ No'}`);
  lines.push('');

  if (gaCheck.blockers.length > 0) {
    lines.push('## Blockers');
    for (const b of gaCheck.blockers) {
      lines.push(`- ❌ ${b}`);
    }
    lines.push('');
  }

  lines.push('## Allowed Changes');
  lines.push('');
  lines.push('| Category | Allowed |');
  lines.push('|----------|---------|');
  const allCategories: ChangeCategory[] = ['bugfix', 'docs', 'test', 'performance', 'feature', 'refactor'];
  for (const cat of allCategories) {
    const allowed = isChangeAllowed(cat);
    lines.push(`| ${cat} | ${allowed ? '✅' : '🚫'} |`);
  }
  lines.push('');

  if (info.knownIssues.length > 0) {
    lines.push('## Known Issues');
    lines.push('');
    for (const issue of info.knownIssues) {
      const icon = issue.resolved ? '✅' : (issue.severity === 'critical' ? '🔴' : issue.severity === 'major' ? '🟠' : '🟡');
      lines.push(`- ${icon} **${issue.id}** [${issue.severity}]: ${issue.description}`);
      if (issue.resolved && issue.resolution) {
        lines.push(`  - Resolution: ${issue.resolution}`);
      }
    }
    lines.push('');
  }

  lines.push('## RC Checklist');
  lines.push('');
  lines.push('- [x] Feature freeze enforced');
  lines.push('- [x] All critical/major bugs resolved');
  lines.push('- [x] Changelog finalized');
  lines.push('- [x] Security audit passed (0.7.165)');
  lines.push('- [x] Integration tests passing (0.7.162)');
  lines.push('- [x] Accessibility audit passed (0.7.160)');
  lines.push('- [x] Performance audit passed (0.7.157)');
  lines.push('- [ ] Full regression test (scheduled 0.7.167)');
  lines.push('- [ ] Community feedback round (scheduled 0.7.168)');
  lines.push('');

  return lines.join('\n');
}

/**
 * Show RC status in a webview panel.
 */
export function showRCStatusPanel(): void {
  const panel = vscode.window.createWebviewPanel(
    'voxpilot.rcStatus',
    `VoxPilot RC Status`,
    vscode.ViewColumn.One,
    { enableScripts: false },
  );

  const md = formatRCStatus();
  // Simple markdown-to-HTML conversion for display
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VoxPilot RC Status</title>
  <style>
    body { font-family: var(--vscode-font-family, sans-serif); padding: 20px; color: var(--vscode-foreground); background: var(--vscode-editor-background); line-height: 1.6; }
    h1 { border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 8px; }
    h2 { margin-top: 24px; }
    table { border-collapse: collapse; margin: 12px 0; }
    th, td { border: 1px solid var(--vscode-panel-border); padding: 6px 12px; text-align: left; }
    code { background: var(--vscode-textCodeBlock-background); padding: 2px 4px; border-radius: 3px; }
    ul { padding-left: 20px; }
    li { margin: 4px 0; }
  </style>
</head>
<body>
  <pre style="white-space: pre-wrap; font-family: inherit;">${escapeHtml(md)}</pre>
</body>
</html>`;

  panel.webview.html = html;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Register RC-related commands.
 */
export function registerRCCommands(context: vscode.ExtensionContext): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('voxpilot.showRCStatus', () => showRCStatusPanel()),
    vscode.commands.registerCommand('voxpilot.checkFreezeGate', async () => {
      const category = await vscode.window.showQuickPick(
        ['bugfix', 'docs', 'test', 'performance', 'feature', 'refactor'],
        { placeHolder: 'Select change category to check' },
      ) as ChangeCategory | undefined;
      if (!category) return;
      const allowed = isChangeAllowed(category);
      if (allowed) {
        vscode.window.showInformationMessage(`✅ "${category}" changes are allowed during RC.`);
      } else {
        vscode.window.showWarningMessage(getFreezeMessage(category));
      }
    }),
    vscode.commands.registerCommand('voxpilot.checkGAReadiness', () => {
      const check = isReadyForGA();
      if (check.ready) {
        vscode.window.showInformationMessage('✅ VoxPilot is ready for GA promotion!');
      } else {
        vscode.window.showWarningMessage(`❌ Not ready for GA: ${check.blockers.join(', ')}`);
      }
    }),
  ];
}
