import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WorkflowPlaygroundGateDialog } from './WorkflowPlaygroundGateDialog';

function render(stepId: string, locale: 'zh' | 'en'): string {
  return renderToStaticMarkup(
    createElement(WorkflowPlaygroundGateDialog, {
      busy: false,
      error: null,
      gate: {
        run_id: 'run-gate',
        step_id: stepId,
        objective: 'check the draft',
        proposal_digest: 'sha256:g',
        tenant_id: 'tenant',
        inputs: [],
      },
      locale,
      onClose: () => {},
      onDecide: () => {},
    }),
  );
}

describe('WorkflowPlaygroundGateDialog', () => {
  it('says what a rejection ends: the run, or only the sub-plan the gate is in', () => {
    expect(render('signoff', 'zh')).toContain('驳回会在这里结束本次运行。');
    const inSubplan = render('eu/approve_draft', 'zh');
    expect(inSubplan).toContain('驳回会在这里结束子计划 eu，运行的其他部分继续。');
    expect(inSubplan).not.toContain('结束本次运行');
    expect(render('eu/approve_draft', 'en')).toContain(
      'reject to end sub-plan eu at this step; the rest of the run goes on.',
    );
  });
});
