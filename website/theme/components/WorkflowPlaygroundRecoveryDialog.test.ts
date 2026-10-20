import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WorkflowPlaygroundRecoveryDialog } from './WorkflowPlaygroundRecoveryDialog';

describe('WorkflowPlaygroundRecoveryDialog', () => {
  it('offers no context field: the host refuses a recovery that changes the run context', () => {
    const markup = renderToStaticMarkup(
      createElement(WorkflowPlaygroundRecoveryDialog, {
        agentRefs: [],
        busy: false,
        error: null,
        failure: {
          schema_version: 'host.flow-recovery-request.v1',
          run_id: 'run-1',
          hook_id: 'recovery:step-001.0',
          token: 'tok',
          metadata: {
            step_id: 'step-001',
            step_name: 'orchestrator.agent_step',
            attempt: 0,
            error: 'boom',
            original_step: { step_id: 'step-001', objective: 'review' },
            proposal_digest: 'sha256:a',
            completed_step_outputs: [],
          },
        },
        locale: 'zh',
        onClose: () => {},
        onSubmit: () => {},
      }),
    );
    expect(markup).toContain('目标描述');
    expect(markup).not.toContain('上下文');
    expect(markup.match(/<textarea/g)).toHaveLength(1);
    expect(markup).not.toContain('recovery-dialog-timeout-hint');
  });

  it('shows the failure without the host prefix, and says a timed-out step meets the same deadline again', () => {
    const markup = renderToStaticMarkup(
      createElement(WorkflowPlaygroundRecoveryDialog, {
        agentRefs: [],
        busy: false,
        error: null,
        failure: {
          schema_version: 'host.flow-recovery-request.v1',
          run_id: 'run-1',
          hook_id: 'recovery:map.0',
          token: 'tok',
          metadata: {
            step_id: 'map',
            step_name: 'orchestrator.agent_step',
            attempt: 0,
            error:
              "runtime error: TIMEOUT: the step's deadline (30s for this dispatch) passed before its Code run ended; reconciliation pending",
            original_step: { step_id: 'map', objective: 'map every criterion' },
            proposal_digest: 'sha256:a',
            completed_step_outputs: [],
          },
        },
        locale: 'zh',
        onClose: () => {},
        onSubmit: () => {},
      }),
    );
    expect(markup).not.toContain('runtime error:');
    expect(markup).toContain("TIMEOUT: the step&#x27;s deadline (30s for this dispatch)");
    expect(markup).toContain('原样重试会再次超时');
  });
});
