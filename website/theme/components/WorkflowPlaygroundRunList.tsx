import { ArrowClockwise, Clock, Sparkle } from '@phosphor-icons/react';
import { useState } from 'react';
import type { FlowWebsiteLocale } from './flow-node-catalog';
import type { HostSubplanMode } from '@a3s-lab/flow-ui';
import type { HostRunInputChoice, HostRunSummary } from './WorkflowPlayground.host';
import { WorkflowPlaygroundNewRunDialog } from './WorkflowPlaygroundNewRunDialog';

// Keys match Flow's WorkflowRunStatus JSON casing (serde rename_all =
// "snake_case", confirmed against a live GET /v1/runs response) -- these are
// NOT the Rust variant names (Running, Suspended, ...); a prior PascalCase
// version of this map never matched anything and silently fell back to the
// raw status string.
const STATUS_LABEL: Readonly<Record<string, { zh: string; en: string }>> = {
  pending: { zh: '待处理', en: 'Pending' },
  running: { zh: '运行中', en: 'Running' },
  suspended: { zh: '挂起中', en: 'Suspended' },
  cancelling: { zh: '取消中', en: 'Cancelling' },
  completed: { zh: '已完成', en: 'Completed' },
  failed: { zh: '失败', en: 'Failed' },
  cancelled: { zh: '已取消', en: 'Cancelled' },
  // Not Flow statuses: the run output's, for a run a reviewer rejected at a
  // gate, and for one whose task the planner refused (nothing ran).
  rejected_at_gate: { zh: '已驳回', en: 'Rejected' },
  refused: { zh: '未能规划', en: 'Not planned' },
  continued_as_new: { zh: '已续期', en: 'Continued' },
};

/** What to call a run: how it ended when Flow's "completed" hides that. */
export function runStatusShown(status: string, outcome?: string): string {
  return outcome === 'rejected_at_gate' || outcome === 'refused'
    ? outcome
    : status;
}

export function statusLabel(status: string, locale: FlowWebsiteLocale): string {
  const entry = STATUS_LABEL[status.toLowerCase()];
  if (!entry) return status;
  return locale === 'zh' ? entry.zh : entry.en;
}

export type WorkflowPlaygroundRunListProps = {
  busy: boolean;
  error: string | null;
  locale: FlowWebsiteLocale;
  onRefresh: () => void;
  onSelect: (runId: string) => void;
  runs: readonly HostRunSummary[];
  /** Submit a brand-new task (full-catalog reshortlist, see
   * WorkflowPlaygroundNewRunDialog). Rejects on failure -- the dialog stays
   * open and shows the error; resolves (regardless of return value) to close
   * the dialog and let the caller navigate to the new run. */
  onSubmitNewRun: (
    taskText: string,
    permissionCeiling: string[],
    subplans: HostSubplanMode,
    inputFiles: HostRunInputChoice[],
    onUploaded?: (done: number, total: number) => void,
  ) => Promise<void>;
};

/**
 * Left-side run-history picker, shown when a host is connected but no run
 * is selected yet (`hostMode.runId === ''`). Structurally mirrors
 * `WorkflowPlaygroundLibrary` (an `aside` overlay with a scrollable list of
 * clickable items) rather than introducing a new panel pattern.
 */
export function WorkflowPlaygroundRunList({
  busy,
  error,
  locale,
  onRefresh,
  onSelect,
  runs,
  onSubmitNewRun,
}: WorkflowPlaygroundRunListProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const title = locale === 'zh' ? '我的任务' : 'My tasks';
  const description =
    locale === 'zh'
      ? '查看之前提交的任务和它们的方案。'
      : 'Open a task you submitted earlier and its plan.';
  const refreshLabel = locale === 'zh' ? '刷新' : 'Refresh';
  const newRunLabel = locale === 'zh' ? '新建规划' : 'New task';
  const emptyLabel =
    locale === 'zh'
      ? '还没有任务，点右上角新建一个。'
      : 'No tasks yet. Start one with the button above.';

  const submitNewRun = async (
    taskText: string,
    permissionCeiling: string[],
    subplans: HostSubplanMode,
    inputFiles: HostRunInputChoice[],
  ) => {
    setSubmitting(true);
    setSubmitError(null);
    setUploadProgress(inputFiles.length > 0 ? { done: 0, total: inputFiles.length } : null);
    try {
      await onSubmitNewRun(taskText, permissionCeiling, subplans, inputFiles, (done, total) =>
        setUploadProgress({ done, total }),
      );
      setDialogOpen(false);
    } catch (submitError_: unknown) {
      setSubmitError(
        submitError_ instanceof Error
          ? submitError_.message
          : String(submitError_),
      );
    } finally {
      setSubmitting(false);
      setUploadProgress(null);
    }
  };

  return (
    <aside
      aria-label={title}
      className="a3s-node-library a3s-run-list"
      data-testid="host-run-list"
    >
      <header>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <button
          aria-label={newRunLabel}
          disabled={busy}
          onClick={() => {
            setSubmitError(null);
            setDialogOpen(true);
          }}
          title={newRunLabel}
          type="button"
        >
          <Sparkle aria-hidden="true" />
        </button>
        <button
          aria-label={refreshLabel}
          disabled={busy}
          onClick={onRefresh}
          title={refreshLabel}
          type="button"
        >
          <ArrowClockwise aria-hidden="true" />
        </button>
      </header>

      <div className="a3s-node-library__groups" role="list">
        {error && <p className="a3s-run-list__error">{error}</p>}
        {!error && !busy && runs.length === 0 && (
          <p className="a3s-run-list__empty">{emptyLabel}</p>
        )}
        <section>
          <div>
            {runs.map((run) => (
              <button
                key={run.runId}
                data-testid={`host-run-list-item-${run.runId}`}
                onClick={() => onSelect(run.runId)}
                role="listitem"
                type="button"
              >
                <span>
                  <Clock aria-hidden="true" />
                </span>
                <span>
                  <strong>{run.runId}</strong>
                  <span className="a3s-run-list__status">
                    {statusLabel(runStatusShown(run.status, run.outcome), locale)}
                  </span>
                  {run.taskText && (
                    <span className="a3s-run-list__task">{run.taskText}</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>

      {dialogOpen && (
        <WorkflowPlaygroundNewRunDialog
          busy={submitting}
          error={submitError}
          locale={locale}
          onClose={() => setDialogOpen(false)}
          onSubmit={(taskText, permissionCeiling, subplans, inputFiles) =>
            void submitNewRun(taskText, permissionCeiling, subplans, inputFiles)
          }
          uploadProgress={uploadProgress}
        />
      )}
    </aside>
  );
}
