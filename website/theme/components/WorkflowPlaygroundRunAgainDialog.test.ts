import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WorkflowPlaygroundRunAgainDialog } from './WorkflowPlaygroundRunAgainDialog';

function render(locale: 'zh' | 'en', inputFiles = [{ slot: 'sales', name: 'q3.csv', bytes: 12288, sha256: 'sha256:x' }], uploadProgress?: { done: number; total: number }) {
  return renderToStaticMarkup(
    createElement(WorkflowPlaygroundRunAgainDialog, {
      busy: Boolean(uploadProgress),
      error: null,
      inputFiles,
      locale,
      onClose: () => {},
      onSubmit: () => {},
      uploadProgress,
    }),
  );
}

describe('WorkflowPlaygroundRunAgainDialog (W31)', () => {
  it('lists each input slot with its current file and a way to replace it', () => {
    const markup = render('zh');
    expect(markup).toContain('换文件再跑');
    expect(markup).toContain('不重新规划');
    expect(markup).toContain('>sales<');
    expect(markup).toContain('q3.csv');
    expect(markup).toContain('12 KB');
    expect(markup).toContain('data-testid="run-again-file-sales"');
    expect(markup).toMatch(/data-testid="run-again-submit"[^>]*>|<button[^>]*data-testid="run-again-submit"/);
  });

  it('says a workflow without input files runs again as it is, and shows the upload going', () => {
    expect(render('en', [])).toContain('runs again as it is');
    expect(render('zh', undefined, { done: 1, total: 2 })).toContain('上传中 1/2');
  });
});
