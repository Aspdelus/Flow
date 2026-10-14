import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WorkflowPlaygroundNewRunDialog } from './WorkflowPlaygroundNewRunDialog';

function render(locale: 'zh' | 'en'): string {
  return renderToStaticMarkup(
    createElement(WorkflowPlaygroundNewRunDialog, {
      busy: false,
      error: null,
      locale,
      onClose: () => {},
      onSubmit: () => {},
    }),
  );
}

describe('WorkflowPlaygroundNewRunDialog', () => {
  it('lets the requester choose up front whether the AI may use sub-plans, auto by default', () => {
    const markup = render('zh');
    expect(markup).toContain('子计划');
    expect(markup).toContain('data-testid="new-run-subplans"');
    const subplans = markup.slice(markup.indexOf('data-testid="new-run-subplans"'));
    for (const label of ['由 AI 判断是否拆分', '鼓励拆成子计划', '不拆分（不使用子计划）']) {
      expect(subplans).toMatch(new RegExp(`role="option"[^>]*>${label}<`));
    }
    // auto is chosen until the requester picks another.
    expect(subplans).toMatch(/role="combobox"[^>]*><span>由 AI 判断是否拆分<\/span>/);
    expect(subplans).toMatch(/type="hidden"[^>]*value="auto"/);
    expect(markup).toContain('AI 可能把它们分别拆成子计划');
    expect(render('en')).toContain('Let the AI decide');
  });
});
