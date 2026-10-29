import type { A3SFlowDagNodeRegistry, JsonObject } from '@a3s-lab/flow-ui';
import type { FlowWebsiteLocale } from './flow-node-catalog';
import { hostWithoutImpliedEdges } from './WorkflowPlayground.host';
import {
  layoutPlaygroundGraphInJavaScript,
  playgroundNodeVisualHeight,
  playgroundNodeVisualWidth,
} from './WorkflowPlayground.layout-kernel';
import {
  createPlaygroundEdge,
  createPlaygroundNode,
  type PlaygroundEdge,
  type PlaygroundGraphState,
  type PlaygroundNode,
} from './WorkflowPlayground.model';

/**
 * Business blocks (W30): the planner names the part of the task each step
 * belongs to (`block` on a plan step), and the canvas draws each block as one
 * container, collapsed until opened.  Sub-plans are blocks of their own and
 * collapse the same way; loops and iterations stay open.
 *
 * Blocks are a view, never an edit.  The canvas document stays the plan graph
 * (`graphFromHostCanvas`): Save, the step editor and every other edit work on
 * it as before, and {@link hostBlockView} draws it with each block's steps in a
 * block container and every collapsed container's contents hidden.
 */

/** Size of a collapsed block or sub-plan card. */
export const HOST_COLLAPSED_SIZE = { width: 300, height: 140 } as const;

/** The canvas id of block `name`'s container. */
export function hostBlockId(name: string): string {
  return `block:${name}`;
}

/** The canvas id of a block's entry node: where what flows into the block starts. */
export function hostBlockEntryId(blockId: string): string {
  return `${blockId}~start`;
}

/** True for a block container: drawn by the view, never a plan step. */
export function isHostBlockNode(node: { data: Record<string, unknown> }): boolean {
  return typeof node.data.hostBlock === 'string';
}

/** The plan step a canvas node stands for (a condition's extra case nodes stand for their condition). */
function stepOf(node: PlaygroundNode): string | null {
  if (typeof node.data.hostConditionPart === 'string') return node.data.hostConditionPart;
  return node.data.hostPlanStep ? node.id : null;
}

/**
 * Top-level node id -> the block it is drawn in: every top-level step whose
 * plan step names a `block` (a sub-plan is a block of its own and is in none),
 * and the extra case nodes of such a condition.  Nodes inside a container (a
 * loop's body, a sub-plan's steps) go wherever their container goes.
 */
export function hostBlockMembers(graph: PlaygroundGraphState): Map<string, string> {
  const named = (node: PlaygroundNode | undefined) => {
    const block = (node?.data.hostPlanStep as JsonObject | undefined)?.block;
    return typeof block === 'string' ? block.trim() : '';
  };
  const blockOfStep = new Map<string, string>();
  for (const node of graph.nodes) {
    const step = node.data.hostPlanStep as JsonObject | undefined;
    if (!step || step.kind === 'subplan') continue;
    let block = named(node);
    // A loop or iteration without a block takes its body's, when the body
    // agrees (as plan_check does): real planners label the body, not the loop.
    if (!block && (step.kind === 'loop' || step.kind === 'iteration')) {
      const body = new Set(graph.nodes.filter((item) => item.parentId === node.id && item.data.hostPlanStep).map(named));
      if (body.size === 1) block = [...body][0];
    }
    if (block) blockOfStep.set(node.id, block);
  }
  const members = new Map<string, string>();
  for (const node of graph.nodes) {
    const step = node.parentId ? null : stepOf(node);
    const block = step ? blockOfStep.get(step) : undefined;
    if (block) members.set(node.id, block);
  }
  return members;
}

/** Every container that starts collapsed: each block, then each sub-plan. */
export function hostCollapsibleIds(graph: PlaygroundGraphState): string[] {
  const blocks = [...new Set(hostBlockMembers(graph).values())].map(hostBlockId);
  const subplans = graph.nodes
    .filter((node) => (node.data.hostPlanStep as JsonObject | undefined)?.kind === 'subplan')
    .map((node) => node.id);
  return [...blocks, ...subplans];
}

/** The collapsible containers a plan step is drawn in, outermost first. */
export function hostContainersOfStep(graph: PlaygroundGraphState, stepId: string): string[] {
  const containers: string[] = [];
  // A sub-plan's steps run (and are drawn) as `<subplan>/<step>`.
  const owner = stepId.includes('/') ? stepId.slice(0, stepId.indexOf('/')) : stepId;
  const block = hostBlockMembers(graph).get(owner);
  if (block) containers.push(hostBlockId(block));
  if (owner !== stepId) containers.push(owner);
  return containers;
}

/** What a block shows from its steps' statuses: a person they wait on first, then work, then trouble, then done. */
export function hostBlockStatus(statuses: readonly (string | undefined)[]): string | undefined {
  for (const status of ['waiting', 'running', 'error', 'timedOut', 'rejected', 'cancelled'])
    if (statuses.includes(status)) return status;
  const ended = statuses.filter((status) => status === 'success' || status === 'skipped');
  if (ended.length === 0 || ended.length !== statuses.length) return undefined;
  return ended.every((status) => status === 'skipped') ? 'skipped' : 'success';
}

function ancestorScopes(id: string, byId: ReadonlyMap<string, PlaygroundNode>): (string | null)[] {
  const scopes: (string | null)[] = [];
  let parent = byId.get(id)?.parentId ?? null;
  while (parent !== null && !scopes.includes(parent)) {
    scopes.push(parent);
    parent = byId.get(parent)?.parentId ?? null;
  }
  return [...scopes, null];
}

/** `id` or its container that sits directly in `scope`. */
function endIn(id: string, scope: string | null, byId: ReadonlyMap<string, PlaygroundNode>): string {
  let current = id;
  const seen = new Set<string>();
  while ((byId.get(current)?.parentId ?? null) !== scope && !seen.has(current)) {
    seen.add(current);
    const parent = byId.get(current)?.parentId;
    if (!parent) break;
    current = parent;
  }
  return current;
}

/** An edge between `source` and `target` moved up to the innermost scope that holds both ends. */
function lifted(source: string, target: string, byId: ReadonlyMap<string, PlaygroundNode>): [string, string] {
  const targetScopes = new Set(ancestorScopes(target, byId));
  const scope = ancestorScopes(source, byId).find((candidate) => targetScopes.has(candidate)) ?? null;
  return [endIn(source, scope, byId), endIn(target, scope, byId)];
}

/** The nearest node of `id` the canvas shows: itself, else its outermost collapsed container. */
function shownAs(id: string, byId: ReadonlyMap<string, PlaygroundNode>, shut: ReadonlySet<string>): string {
  let shown = id;
  let parent = byId.get(id)?.parentId;
  const seen = new Set<string>();
  while (parent && !seen.has(parent)) {
    seen.add(parent);
    if (shut.has(parent)) shown = parent;
    parent = byId.get(parent)?.parentId;
  }
  return shown;
}

/**
 * The plan graph as the canvas shows it: each block's steps inside a `group`
 * container, every container in `collapsed` (a block or a sub-plan) drawn as
 * a small card with its contents hidden and the edges into or out of it
 * drawn to the card, and the whole laid out again so the plan closes up
 * around a collapsed card and makes room for an opened one.  A plan without
 * blocks and with nothing collapsed comes back unchanged.
 */
export function hostBlockView(
  graph: PlaygroundGraphState,
  collapsed: ReadonlySet<string>,
  locale: FlowWebsiteLocale,
  registry: A3SFlowDagNodeRegistry,
  onToggle?: (containerId: string) => void,
): PlaygroundGraphState {
  const members = hostBlockMembers(graph);
  const collapsible = new Set(hostCollapsibleIds(graph));
  if (members.size === 0 && ![...collapsible].some((id) => collapsed.has(id))) return graph;
  const zh = locale === 'zh';
  // One container per block, in the order the plan graph lists its first step.
  const blocks: string[] = [];
  for (const node of graph.nodes) {
    const block = members.get(node.id);
    if (block && !blocks.includes(block)) blocks.push(block);
  }
  const containers = blocks.map((block) => {
    const steps = graph.nodes.filter((node) => members.get(node.id) === block && node.data.hostPlanStep);
    const objectives = steps.map((node) => String((node.data.hostPlanStep as JsonObject).objective ?? '').trim()).filter(Boolean);
    const container = createPlaygroundNode(hostBlockId(block), 'group', { x: 0, y: 0 }, locale, {
      configuration: {
        title: zh ? `${block} · ${steps.length} 步` : `${block} · ${steps.length} step${steps.length === 1 ? '' : 's'}`,
        desc: objectives.join(zh ? '；' : '; '),
        start_node_id: hostBlockEntryId(hostBlockId(block)),
      },
      registry,
    });
    container.data = { ...container.data, hostBlock: block, hostBlockSteps: steps.map((node) => node.id) };
    return { ...container, deletable: false };
  });
  // Each block's entry node, like a sub-plan's sub-task: the edges that come
  // into the block from outside start here, so its first steps are wired.
  const entries = blocks.map((block) => {
    const parentId = hostBlockId(block);
    const entry = createPlaygroundNode(hostBlockEntryId(parentId), 'group-start', { x: 0, y: 0 }, locale, {
      configuration: { title: zh ? '进入本块' : 'Into this block', desc: '' },
      parentId,
      registry,
    });
    entry.data = { ...entry.data, hostBlockPart: block };
    return { ...entry, extent: 'parent' as const, deletable: false, selectable: false };
  });
  const inBlocks = graph.nodes.map((node) => {
    const block = members.get(node.id);
    if (!block) return node;
    const parentId = hostBlockId(block);
    return {
      ...node,
      parentId,
      extent: 'parent' as const,
      expandParent: true,
      data: { ...node.data, dagNode: { ...node.data.dagNode, parentId } },
    };
  });
  // Parents before children: React Flow needs each parent first.
  const placed: PlaygroundNode[] = [...containers, ...entries, ...inBlocks];
  const shut = new Set([...collapsible].filter((id) => collapsed.has(id)));
  const byId = new Map(placed.map((node) => [node.id, node]));
  const hidden = new Set(placed.filter((node) => shownAs(node.id, byId, shut) !== node.id).map((node) => node.id));
  const nodes = placed.map((node) => {
    if (hidden.has(node.id)) return { ...node, hidden: true };
    if (!collapsible.has(node.id)) return node;
    const data = { ...node.data, collapsible: true, collapsed: shut.has(node.id), onToggleCollapse: onToggle };
    if (!shut.has(node.id)) return { ...node, data };
    const { width, height } = HOST_COLLAPSED_SIZE;
    return { ...node, initialWidth: width, initialHeight: height, style: { ...node.style, width, height }, data };
  });

  // Edges as shown: an end that is hidden moves to the card that hides it,
  // and an edge that enters or leaves a block (open or not) attaches to the
  // block itself -- as in a Flow group, no edge crosses a container's edge.
  const edges: PlaygroundEdge[] = [];
  const shownPairs = new Set<string>();
  const viewEdge = (source: string, sourceHandle: string, target: string) => {
    if (source === target || shownPairs.has(`${source}>${target}`)) return;
    shownPairs.add(`${source}>${target}`);
    const made = createPlaygroundEdge({ source, sourceHandle, target, targetHandle: 'in' }, nodes, locale, registry);
    edges.push({ ...made, id: `view:${source}>${target}`, deletable: false, data: { ...made.data, hostViewEdge: true } });
  };
  for (const edge of graph.edges) {
    const shownTarget = shownAs(edge.target, byId, shut);
    const [source, target] = lifted(shownAs(edge.source, byId, shut), shownTarget, byId);
    if (source === edge.source && target === edge.target) {
      edges.push(edge);
      continue;
    }
    viewEdge(source, source === edge.source ? String(edge.sourceHandle ?? '') : 'done', target);
    // Inside every open block the edge enters, it goes on from the block's entry.
    for (let inner = shownTarget; inner !== target; ) {
      const parent = byId.get(inner)?.parentId;
      if (!parent) break;
      if (isHostBlockNode(byId.get(parent)!)) viewEdge(hostBlockEntryId(parent), 'next', inner);
      inner = parent;
    }
  }
  // Lifting can make a lifted edge one a longer path implies (two steps of a
  // block, one fed straight and one through another step): drop it, as the
  // plan projection does (B140).  A view edge is never saved.
  const shown = hostWithoutImpliedEdges(
    edges,
    (item) =>
      item.data?.hostViewEdge === true &&
      item.sourceHandle !== 'matched' &&
      item.sourceHandle !== 'otherwise',
  );
  const laidOut = layoutPlaygroundGraphInJavaScript({ ...graph, nodes, edges: shown });
  // React Flow keeps a node's measured size only on the node objects it is
  // given back, and a block container (and a collapsed card's size) and a
  // block's entry exist only here: without a size such a node is never
  // measured again, so it gets no handles and no edge reaches it.
  const sized = laidOut.nodes.map((item) => {
    if (item.hidden) return item;
    if (typeof item.data.hostBlockPart === 'string')
      return { ...item, measured: { width: playgroundNodeVisualWidth(item), height: playgroundNodeVisualHeight(item) } };
    if (!collapsible.has(item.id)) return item;
    const width = Number(item.style?.width);
    const height = Number(item.style?.height);
    return Number.isFinite(width) && Number.isFinite(height) ? { ...item, measured: { width, height } } : item;
  });
  return { ...laidOut, nodes: sized, edges: shown };
}
