import { useCallback, useEffect, useState } from 'react';
import {
  createHostClient,
  formatHostBytes,
  type HostModeConfig,
} from './WorkflowPlayground.host';
import { HostClientError, type HostRunArtifact } from '@a3s-lab/flow-ui';
import type { FlowWebsiteLocale } from './flow-node-catalog';

/** Artifacts relevant to one canvas node. The start node owns the aggregate
 * result; an agent node owns its complete source text, not another step's. */
export function hostArtifactsForNode(
  artifacts: readonly HostRunArtifact[],
  nodeId: string,
): HostRunArtifact[] {
  return artifacts.filter((artifact) =>
    nodeId === 'start'
      ? artifact.kind === 'run_result'
      : artifact.kind === 'step_output' && artifact.step_id === nodeId,
  );
}

export function hostArtifactApiUnavailable(error: unknown): boolean {
  return error instanceof HostClientError && error.status === 404;
}

export function WorkflowPlaygroundHostOutputs({
  hostMode,
  locale,
  nodeId,
  runStatus,
}: {
  hostMode: HostModeConfig;
  locale: FlowWebsiteLocale;
  nodeId: string;
  runStatus?: string;
}) {
  const [artifacts, setArtifacts] = useState<HostRunArtifact[]>([]);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      setArtifacts(
        await createHostClient(hostMode).listRunArtifacts(hostMode.runId),
      );
      setError('');
    } catch (cause) {
      if (hostArtifactApiUnavailable(cause)) {
        // A new canvas may connect to an older host without this optional API.
        setArtifacts([]);
        setError('');
      } else {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    }
  }, [hostMode]);
  useEffect(() => {
    void load();
  }, [load, nodeId, runStatus]);

  const selected = hostArtifactsForNode(artifacts, nodeId);
  if (selected.length === 0 && !error) return null;
  const client = createHostClient(hostMode);
  return (
    <section
      className="flow-playground-host-input-files"
      data-testid="host-output-artifacts"
    >
      <h3>{locale === 'zh' ? '完整输出' : 'Complete outputs'}</h3>
      <p>
        {locale === 'zh'
          ? '完整原文保存在运行产物中；Flow 事件只保留有界摘要和校验引用。'
          : 'Complete source text is stored as a run artifact; Flow events carry only bounded excerpts and verified references.'}
      </p>
      {error ? <p role="alert">{error}</p> : null}
      <ul>
        {selected.map((artifact) => {
          const url = client.runArtifactUrl(hostMode.runId, artifact.digest);
          return (
            <li
              key={`${artifact.kind}-${artifact.step_id ?? 'run'}-${artifact.port ?? 'source'}-${artifact.digest}`}
            >
              <code>
                {artifact.kind === 'run_result'
                  ? 'run-output.json'
                  : `${artifact.step_id}${artifact.port ? `.${artifact.port}` : ''}`}
              </code>
              <small>{formatHostBytes(artifact.bytes)}</small>
              <a href={url} target="_blank" rel="noreferrer">
                {locale === 'zh' ? '查看' : 'View'}
              </a>
              <a href={`${url}?download=1`} download>
                {locale === 'zh' ? '下载' : 'Download'}
              </a>
            </li>
          );
        })}
      </ul>
      <button type="button" onClick={() => void load()}>
        {locale === 'zh' ? '刷新产物' : 'Refresh artifacts'}
      </button>
    </section>
  );
}
