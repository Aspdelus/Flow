import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WorkflowPlaygroundNewRunDialog, withAddedInputFiles } from './WorkflowPlaygroundNewRunDialog';

function render(locale: 'zh' | 'en', uploadProgress?: { done: number; total: number }): string {
  return renderToStaticMarkup(
    createElement(WorkflowPlaygroundNewRunDialog, {
      busy: Boolean(uploadProgress),
      error: null,
      locale,
      onClose: () => {},
      onSubmit: () => {},
      uploadProgress,
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

  it('offers input files for this run only, and shows the upload going (W31)', () => {
    const markup = render('zh');
    expect(markup).toMatch(/data-testid="new-run-file-input"[^>]*multiple|multiple[^>]*data-testid="new-run-file-input"/);
    expect(markup).toContain('输入文件（可选）');
    expect(markup).toContain('inputs/');
    expect(render('zh', { done: 2, total: 3 })).toContain('上传中 2/3');
    expect(render('en', { done: 0, total: 1 })).toContain('Uploading 0/1');
  });

  it('adds chosen files each in a slot, a file of the same name replacing the earlier one in its slot', () => {
    const file = (name: string, body: string) => new File([body], name);
    const first = withAddedInputFiles([], [file('a.csv', '1'), file('b.md', '2')]);
    expect(first.map((item) => item.slot)).toEqual(['a', 'b']);
    // A slot the user renamed stays renamed when its file is chosen again.
    const renamed = first.map((item) => (item.slot === 'a' ? { ...item, slot: 'sales' } : item));
    const next = withAddedInputFiles(renamed, [file('a.csv', 'newer'), file('c.txt', '3'), file('a.txt', '4')]);
    expect(next.map((item) => [item.slot, item.file.name])).toEqual([['sales', 'a.csv'], ['b', 'b.md'], ['c', 'c.txt'], ['a', 'a.txt']]);
    expect(next[0].file.size).toBe(5);
  });
});
