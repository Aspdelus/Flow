import { ArrowsClockwise, Paperclip, X } from '@phosphor-icons/react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { HostRunInputFile } from '@a3s-lab/flow-ui';
import type { FlowWebsiteLocale } from './flow-node-catalog';
import {
  formatHostBytes,
  hostRunInputProblem,
  type HostRunInputChoice,
} from './WorkflowPlayground.host';

export type WorkflowPlaygroundRunAgainDialogProps = {
  busy: boolean;
  error: string | null;
  locale: FlowWebsiteLocale;
  /** The run's current effective text: its own input, else the planning task. */
  inputText: string;
  /** The run's input files, by slot: what the workflow reads. */
  inputFiles: readonly HostRunInputFile[];
  onClose: () => void;
  /** The new run's text and the slots given a new file; others keep this run's. */
  onSubmit: (changed: HostRunInputChoice[], inputText: string) => void;
  uploadProgress?: { done: number; total: number } | null;
};

/**
 * "Run again with other input" (W31): the workflow this run was approved
 * with runs again as a new run -- same plan, its human edits and sub-plans
 * included, no planning -- with new text and a new file in any of its input
 * slots.  The new run waits for its own approval.  Same modal shell and
 * styles as WorkflowPlaygroundNewRunDialog.
 */
export function WorkflowPlaygroundRunAgainDialog({
  busy,
  error,
  locale,
  inputText: currentInputText,
  inputFiles,
  onClose,
  onSubmit,
  uploadProgress,
}: WorkflowPlaygroundRunAgainDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [inputText, setInputText] = useState(currentInputText);
  const [replaced, setReplaced] = useState<Record<string, File>>({});
  const changed: HostRunInputChoice[] = inputFiles
    .filter((kept) => replaced[kept.slot])
    .map((kept) => ({ slot: kept.slot, file: replaced[kept.slot] }));
  const problem = hostRunInputProblem(
    changed.map(({ slot, file }) => ({ slot, name: file.name, size: file.size })),
    locale,
  );
  const zh = locale === 'zh';

  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLElement>('input, button')?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus();
    };
  }, [busy, onClose]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || problem) return;
    onSubmit(changed, inputText);
  };

  const title = zh ? '换输入再跑' : 'Run again with other input';
  const description = zh
    ? '用这次批准过的工作流再跑一次（同一份计划，含人工修改和子计划，不重新规划）。输入另一段文字，或给要换的输入选新文件；没换的沿用这次的内容。新运行会停在审批，点"批准"后开始。'
    : 'Run the workflow this run was approved with again (the same plan, human edits and sub-plans included, not planned anew). Enter other text or replace any input files; everything unchanged keeps this run\'s value. The new run waits for your approval.';
  const submitLabel = uploadProgress
    ? zh
      ? `上传中 ${uploadProgress.done}/${uploadProgress.total}…`
      : `Uploading ${uploadProgress.done}/${uploadProgress.total}…`
    : busy
      ? zh
        ? '提交中…'
        : 'Submitting…'
      : zh
        ? '再跑一次'
        : 'Run again';

  return (
    <div
      aria-label={title}
      className="a3s-workflow-dialog-backdrop a3s-new-run-dialog-backdrop"
      data-testid="run-again-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="a3s-new-run-dialog"
        data-testid="run-again-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <header className="a3s-new-run-dialog__header">
          <span aria-hidden="true">
            <ArrowsClockwise weight="bold" />
          </span>
          <div>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button
            aria-label={zh ? '关闭' : 'Close'}
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
            <span>{zh ? '本次运行输入' : 'Input for this run'}</span>
            <textarea
              data-testid="run-again-input-text"
              disabled={busy}
              onChange={(event) => setInputText(event.currentTarget.value)}
              rows={6}
              value={inputText}
            />
            <small className="a3s-new-run-dialog__hint">
              {zh
                ? '计划里 task.task_text 等任务入口会读到这段文字。清空则改用最初的任务描述。'
                : 'Task ports such as task.task_text read this text. Clear it to use the original task description.'}
            </small>
          </label>
          <div className="a3s-new-run-dialog__field">
            <span>{zh ? '输入文件' : 'Input files'}</span>
            {inputFiles.length === 0 ? (
              <small className="a3s-new-run-dialog__hint">
                {zh
                  ? '这个工作流没有输入文件，只换上面的文字也可以再跑。'
                  : 'This workflow has no input files; you can run it again with only the text above changed.'}
              </small>
            ) : (
              <ul className="a3s-new-run-dialog__files" data-testid="run-again-slots">
                {inputFiles.map((kept) => {
                  const next = replaced[kept.slot];
                  return (
                    <li key={kept.slot}>
                      <code className="a3s-new-run-dialog__slot-name">{kept.slot}</code>
                      <span>
                        {next ? `${next.name}` : kept.name}
                        {next ? (zh ? '（新）' : ' (new)') : ''}
                      </span>
                      <small>{formatHostBytes(next ? next.size : kept.bytes)}</small>
                      {next ? (
                        <button
                          aria-label={zh ? `${kept.slot} 改回原文件` : `Keep the file of ${kept.slot}`}
                          disabled={busy}
                          onClick={() =>
                            setReplaced(({ [kept.slot]: _dropped, ...rest }) => rest)
                          }
                          type="button"
                        >
                          <X aria-hidden="true" />
                        </button>
                      ) : null}
                      <label className="a3s-new-run-dialog__add-files">
                        <Paperclip aria-hidden="true" />
                        {zh ? '换文件' : 'Replace'}
                        <input
                          data-testid={`run-again-file-${kept.slot}`}
                          disabled={busy}
                          onChange={(event) => {
                            const file = event.currentTarget.files?.[0];
                            event.currentTarget.value = '';
                            if (file) setReplaced((current) => ({ ...current, [kept.slot]: file }));
                          }}
                          type="file"
                        />
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            {problem && (
              <p className="a3s-new-run-dialog__error" role="alert">
                {problem}
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
              {zh ? '取消' : 'Cancel'}
            </button>
            <button
              className="a3s-new-run-dialog__submit"
              data-testid="run-again-submit"
              disabled={busy || Boolean(problem)}
              type="submit"
            >
              <ArrowsClockwise aria-hidden="true" />
              {submitLabel}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
