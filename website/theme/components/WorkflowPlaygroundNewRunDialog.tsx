import { Paperclip, Plus, Sparkle, X } from '@phosphor-icons/react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { FlowWebsiteLocale } from './flow-node-catalog';
import { SelectControl } from '@a3s-lab/flow-ui/react';
import type { HostSubplanMode } from '@a3s-lab/flow-ui';
import {
  formatHostBytes,
  hostDefaultSlot,
  hostRunInputProblem,
  type HostRunInputChoice,
} from './WorkflowPlayground.host';

const PERMISSION_CEILING_PRESETS = ['read', 'read,write'] as const;
const SUBPLAN_MODES: readonly HostSubplanMode[] = ['auto', 'encouraged', 'forbidden'];
type PermissionCeilingPreset = (typeof PERMISSION_CEILING_PRESETS)[number];

export type WorkflowPlaygroundNewRunDialogProps = {
  busy: boolean;
  error: string | null;
  locale: FlowWebsiteLocale;
  onClose: () => void;
  onSubmit: (
    taskText: string,
    permissionCeiling: string[],
    subplans: HostSubplanMode,
    inputFiles: HostRunInputChoice[],
  ) => void;
  /** While the input files are being uploaded (W31). */
  uploadProgress?: { done: number; total: number } | null;
};

/** `files` with `added` appended, each in a slot named after it; a file of
 * the same name replaces the earlier one in its slot. */
export function withAddedInputFiles(
  files: readonly HostRunInputChoice[],
  added: readonly File[],
): HostRunInputChoice[] {
  const next = [...files];
  for (const file of added) {
    const same = next.findIndex((choice) => choice.file.name === file.name);
    if (same >= 0) next[same] = { ...next[same], file };
    else next.push({ slot: hostDefaultSlot(file.name, next.map((choice) => choice.slot)), file });
  }
  return next;
}

/**
 * "Start over from scratch" -- a genuinely new task, re-shortlisted against
 * the full catalog, as opposed to Copilot (WorkflowPlaygroundExtensionsPanel)
 * which can only rearrange the current run's already-frozen candidate set.
 * Deliberately a separate entry point (opened from WorkflowPlaygroundRunList,
 * not a Copilot-panel tab) so the two never get confused with each other.
 *
 * Modal structure/focus-trap pattern copied from
 * WorkflowPlaygroundTriggerDialog.tsx; this form is far simpler (a few fixed
 * fields, no dynamic JSON schema), so it doesn't need that file's SchemaField/error
 * map machinery.
 */
export function WorkflowPlaygroundNewRunDialog({
  busy,
  error,
  locale,
  onClose,
  onSubmit,
  uploadProgress,
}: WorkflowPlaygroundNewRunDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [taskText, setTaskText] = useState('');
  const [permissionCeiling, setPermissionCeiling] =
    useState<PermissionCeilingPreset>('read');
  // Whether the AI may split the task into sub-plans (W26), chosen up front.
  const [subplans, setSubplans] = useState<HostSubplanMode>('auto');
  // Files only this run gets (W31): uploaded before it starts, then in its
  // workspace under inputs/.
  const [inputFiles, setInputFiles] = useState<HostRunInputChoice[]>([]);
  const inputProblem = hostRunInputProblem(
    inputFiles.map(({ slot, file }) => ({ slot, name: file.name, size: file.size })),
    locale,
  );

  useEffect(() => {
    previousFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const frame = window.requestAnimationFrame(() => {
      dialogRef.current
        ?.querySelector<HTMLElement>('textarea, input, select, button')
        ?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [
        ...new Set(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button, input:not([type="hidden"]), textarea, select, [href], [tabindex]',
          ),
        ),
      ].filter(
        (element) =>
          !element.hasAttribute('disabled') &&
          element.getAttribute('aria-disabled') !== 'true' &&
          element.getAttribute('tabindex') !== '-1',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      previousFocus.current?.focus();
    };
  }, [onClose]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !taskText.trim() || inputProblem) return;
    onSubmit(taskText, permissionCeiling.split(','), subplans, inputFiles);
  };

  const title = locale === 'zh' ? '新建规划' : 'New task';
  const description =
    locale === 'zh'
      ? '提交一个全新的任务：Orchestrator 会针对完整目录重新检索候选 Agent，不受当前画布候选集的限制。'
      : "Submit a brand-new task: Orchestrator re-shortlists against the full catalog, not the current canvas's frozen candidates.";
  const taskLabel = locale === 'zh' ? '任务描述' : 'Task description';
  const taskPlaceholder =
    locale === 'zh'
      ? '例如：撰写一份中美日韩 AI 发展对比调研报告'
      : 'e.g. write a comparative survey of AI development across the US, China, Japan, and Korea';
  const ceilingLabel = locale === 'zh' ? '权限上限' : 'Permission ceiling';
  const ceilingReadOnly = locale === 'zh' ? '只读' : 'Read-only';
  const ceilingReadWrite = locale === 'zh' ? '读写' : 'Read + write';
  const subplansLabel = locale === 'zh' ? '子计划' : 'Sub-plans';
  const subplanModeLabels: Record<HostSubplanMode, string> =
    locale === 'zh'
      ? {
          auto: '由 AI 判断是否拆分',
          encouraged: '鼓励拆成子计划',
          forbidden: '不拆分（不使用子计划）',
        }
      : {
          auto: 'Let the AI decide',
          encouraged: 'Prefer sub-plans',
          forbidden: 'No sub-plans',
        };
  const subplanModeHints: Record<HostSubplanMode, string> =
    locale === 'zh'
      ? {
          auto: '任务里有几块各自需要多个步骤的部分时，AI 可能把它们分别拆成子计划。',
          encouraged: '要求 AI 把需要多个步骤的部分各拆成一个子计划，分别规划后与主计划一起批准。',
          forbidden: '整个任务只做一份计划；含子计划的方案和修改都会被拒绝。',
        }
      : {
          auto: 'The AI may split parts that each need several steps of their own into sub-plans.',
          encouraged: 'Ask the AI to plan each part that needs several steps as a sub-plan, approved with the main plan.',
          forbidden: 'One plan for the whole task; a plan or an edit with a sub-plan is refused.',
        };
  const filesLabel = locale === 'zh' ? '输入文件（可选）' : 'Input files (optional)';
  const addFilesLabel = locale === 'zh' ? '添加文件' : 'Add files';
  const filesHint =
    locale === 'zh'
      ? '每个文件有一个输入名（可改）：工作流按输入名读文件，以后"换文件再跑"时同一个输入名换上新文件，工作流不变。文件放进这个任务工作区的 inputs/，AI 规划时能看到文件名和文本文件的开头。'
      : 'Each file has an input name (editable): the workflow reads files by it, so running it again later puts a new file under the same name and keeps the workflow. Files go to this task\'s inputs/ folder; the planner sees their names and the start of text files.';
  const slotLabel = (name: string) =>
    locale === 'zh' ? `${name} 的输入名` : `Input name of ${name}`;
  const removeFileLabel = (name: string) =>
    locale === 'zh' ? `移除 ${name}` : `Remove ${name}`;
  const cancelLabel = locale === 'zh' ? '取消' : 'Cancel';
  const submitLabel = locale === 'zh' ? '提交' : 'Submit';
  const submittingLabel = uploadProgress
    ? locale === 'zh'
      ? `上传中 ${uploadProgress.done}/${uploadProgress.total}…`
      : `Uploading ${uploadProgress.done}/${uploadProgress.total}…`
    : locale === 'zh'
      ? '提交中…'
      : 'Submitting…';
  const closeLabel = locale === 'zh' ? '关闭' : 'Close';

  return (
    <div
      aria-label={title}
      className="a3s-workflow-dialog-backdrop a3s-new-run-dialog-backdrop"
      data-testid="new-run-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="a3s-new-run-dialog"
        data-testid="new-run-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <header className="a3s-new-run-dialog__header">
          <span aria-hidden="true">
            <Sparkle weight="fill" />
          </span>
          <div>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button
            aria-label={closeLabel}
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" />
          </button>
        </header>
        <p className="a3s-new-run-dialog__intro" id={descriptionId}>
          {description}
        </p>
        <form onSubmit={submit} noValidate>
          <label className="a3s-new-run-dialog__field">
            <span>{taskLabel}</span>
            <textarea
              autoFocus
              disabled={busy}
              onChange={(event) => setTaskText(event.currentTarget.value)}
              placeholder={taskPlaceholder}
              required
              rows={4}
              value={taskText}
            />
          </label>
          <label className="a3s-new-run-dialog__field">
            <span>{ceilingLabel}</span>
            <SelectControl
              disabled={busy}
              onChange={(event) =>
                setPermissionCeiling(
                  event.target.value as PermissionCeilingPreset,
                )
              }
              value={permissionCeiling}
            >
              <option value="read">{ceilingReadOnly}</option>
              <option value="read,write">{ceilingReadWrite}</option>
            </SelectControl>
          </label>
          <label className="a3s-new-run-dialog__field">
            <span>{subplansLabel}</span>
            <SelectControl
              data-testid="new-run-subplans"
              disabled={busy}
              onChange={(event) =>
                setSubplans(event.target.value as HostSubplanMode)
              }
              value={subplans}
            >
              {SUBPLAN_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {subplanModeLabels[mode]}
                </option>
              ))}
            </SelectControl>
            <small className="a3s-new-run-dialog__hint">
              {subplanModeHints[subplans]}
            </small>
          </label>
          <div className="a3s-new-run-dialog__field">
            <span>{filesLabel}</span>
            {inputFiles.length > 0 && (
              <ul className="a3s-new-run-dialog__files" data-testid="new-run-files">
                {inputFiles.map((choice, index) => (
                  <li key={choice.file.name}>
                    <input
                      aria-label={slotLabel(choice.file.name)}
                      className="a3s-new-run-dialog__slot"
                      data-testid="new-run-file-slot"
                      disabled={busy}
                      onChange={(event) => {
                        const slot = event.currentTarget.value;
                        setInputFiles((current) =>
                          current.map((item, at) => (at === index ? { ...item, slot } : item)),
                        );
                      }}
                      spellCheck={false}
                      value={choice.slot}
                    />
                    <span>{choice.file.name}</span>
                    <small>{formatHostBytes(choice.file.size)}</small>
                    <button
                      aria-label={removeFileLabel(choice.file.name)}
                      disabled={busy}
                      onClick={() =>
                        setInputFiles((current) =>
                          current.filter((item) => item !== choice),
                        )
                      }
                      type="button"
                    >
                      <X aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <label className="a3s-new-run-dialog__add-files">
              <Paperclip aria-hidden="true" />
              {addFilesLabel}
              <input
                data-testid="new-run-file-input"
                disabled={busy}
                multiple
                onChange={(event) => {
                  const chosen = Array.from(event.currentTarget.files ?? []);
                  event.currentTarget.value = '';
                  setInputFiles((current) => withAddedInputFiles(current, chosen));
                }}
                type="file"
              />
            </label>
            <small className="a3s-new-run-dialog__hint">{filesHint}</small>
            {inputProblem && (
              <p className="a3s-new-run-dialog__error" role="alert">
                {inputProblem}
              </p>
            )}
          </div>
          {error && (
            <p className="a3s-new-run-dialog__error" role="alert">
              {error}
            </p>
          )}
          <footer className="a3s-new-run-dialog__footer">
            <button
              className="a3s-new-run-dialog__cancel"
              disabled={busy}
              onClick={onClose}
              type="button"
            >
              {cancelLabel}
            </button>
            <button
              className="a3s-new-run-dialog__submit"
              disabled={busy || !taskText.trim() || Boolean(inputProblem)}
              type="submit"
            >
              <Plus aria-hidden="true" />
              {busy ? submittingLabel : submitLabel}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
