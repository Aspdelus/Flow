import { describe, expect, it } from 'vitest';
import { HostClientError, type HostRunArtifact } from '@a3s-lab/flow-ui';
import {
  hostArtifactApiUnavailable,
  hostArtifactsForNode,
} from './WorkflowPlaygroundHostOutputs';

function artifact(kind: string, stepId?: string): HostRunArtifact {
  return {
    schema_version: 'host.run-artifact.v1',
    run_id: 'run',
    kind,
    step_id: stepId,
    digest: `sha256:${'a'.repeat(64)}`,
    bytes: 10,
    media_type: 'text/markdown',
  };
}

describe('host output artifact projection', () => {
  it('shows the aggregate on start and only the selected steps own outputs', () => {
    const artifacts = [
      artifact('run_result'),
      artifact('step_output', 'eu/audit'),
      artifact('step_output', 'summary'),
    ];
    expect(
      hostArtifactsForNode(artifacts, 'start').map((item) => item.kind),
    ).toEqual(['run_result']);
    expect(
      hostArtifactsForNode(artifacts, 'summary').map((item) => item.step_id),
    ).toEqual(['summary']);
    expect(
      hostArtifactsForNode(artifacts, 'eu/audit').map((item) => item.step_id),
    ).toEqual(['eu/audit']);
    expect(hostArtifactsForNode(artifacts, 'other')).toEqual([]);
  });

  it('treats a missing optional artifact API as unavailable, not as a run failure', () => {
    expect(
      hostArtifactApiUnavailable(new HostClientError('old host', 404)),
    ).toBe(true);
    expect(
      hostArtifactApiUnavailable(new HostClientError('offline', 500)),
    ).toBe(false);
    expect(hostArtifactApiUnavailable(new Error('offline'))).toBe(false);
  });
});
