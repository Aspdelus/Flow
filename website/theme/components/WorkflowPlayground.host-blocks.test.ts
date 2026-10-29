import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  canvasDocumentFromProposalDto,
  defineA3SFlowCustomDagNode,
} from '@a3s-lab/flow-ui';
import { describe, expect, it } from 'vitest';
import {
  createHostModeCatalog,
  graphFromHostCanvas,
  hostCanvasFromGraph,
  hostPlanSignature,
} from './WorkflowPlayground.host';
import {
  HOST_COLLAPSED_SIZE,
  hostBlockEntryId,
  hostBlockId,
  hostBlockMembers,
  hostBlockStatus,
  hostBlockView,
  hostCollapsibleIds,
  hostContainersOfStep,
} from './WorkflowPlayground.host-blocks';
import { createPlaygroundNodeCatalog } from './WorkflowPlayground.custom-nodes';
import { compilePlaygroundGraph } from './WorkflowPlayground.model';

const fixture = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL('./fixtures/funnel-conformance-plans.json', import.meta.url),
    ),
    'utf8',
  ),
) as { plans: Record<number, { plan: Record<string, unknown> }> };

function catalog() {
  return createHostModeCatalog(createPlaygroundNodeCatalog('en'), [
    defineA3SFlowCustomDagNode({
      manifest: {
        type: 'host.preview.step',
        display_name: 'Host preview step',
        description: 'Caller-supplied preview manifest.',
        category: 'host',
        categoryLabel: 'Host',
        role: 'host',
        ports: { inputs: [], outputs: [] },
        input_types: [],
        output_types: [],
        fields: [],
        outputs: [],
      },
      capability: { id: 'host/preview-step', version: '1.0.0', handler: 'host.preview' },
    }),
  ]);
}

// plan 31: eu-stock -> eu-quote -> eu-tax (block 欧盟市场), the same for us
// (block US market), and report reading both taxes (block 汇总).
const blockedCanvas = () =>
  canvasDocumentFromProposalDto({
    run_id: 'run-blocks',
    proposal_digest: 'sha256:p',
    approval_hook_waiting: true,
    approval_token: 'tok',
    proposal: { plan: fixture.plans[31].plan },
  });

const EU = hostBlockId('欧盟市场');
const US = hostBlockId('US market');
const REPORT = hostBlockId('汇总');

function planGraph() {
  return graphFromHostCanvas(blockedCanvas(), 'zh', catalog());
}

function view(collapsed: Iterable<string>) {
  return hostBlockView(planGraph(), new Set(collapsed), 'zh', catalog().registry);
}

const node = (graph: ReturnType<typeof view>, id: string) => graph.nodes.find((item) => item.id === id);

describe('host canvas business blocks (W30)', () => {
  it('reads each top-level step’s block off its plan step', () => {
    const members = hostBlockMembers(planGraph());
    expect(Object.fromEntries(members)).toEqual({
      'eu-stock': '欧盟市场',
      'eu-quote': '欧盟市场',
      'eu-tax': '欧盟市场',
      'us-stock': 'US market',
      'us-quote': 'US market',
      'us-tax': 'US market',
      report: '汇总',
    });
    expect(hostCollapsibleIds(planGraph())).toEqual([EU, US, REPORT]);
  });

  it('draws each block as a group holding its steps, open when nothing is collapsed', () => {
    const graph = view([]);
    const eu = node(graph, EU);
    expect(eu?.data.dagNode.data.type).toBe('group');
    expect(eu?.data.dagNode.data.title).toBe('欧盟市场 · 3 步');
    expect([eu?.data.collapsible, eu?.data.collapsed]).toEqual([true, false]);
    for (const id of ['eu-stock', 'eu-quote', 'eu-tax']) {
      expect(node(graph, id)?.parentId).toBe(EU);
      expect(node(graph, id)?.hidden).toBeFalsy();
    }
    expect(node(graph, 'start')?.parentId).toBeUndefined();
    expect(node(graph, 'done')?.parentId).toBeUndefined();
    // The open block is wide enough for its three steps in a row.
    expect(Number(eu?.style?.width)).toBeGreaterThan(HOST_COLLAPSED_SIZE.width * 2);
  });

  it('collapses a block to a small card, hides its steps and draws its edges to the card', () => {
    const graph = view([EU, US, REPORT]);
    const eu = node(graph, EU);
    expect([eu?.data.collapsed, eu?.style?.width, eu?.style?.height]).toEqual([
      true,
      HOST_COLLAPSED_SIZE.width,
      HOST_COLLAPSED_SIZE.height,
    ]);
    // Its size is given as measured: React Flow never measures a node it rebuilds without one.
    expect(eu?.measured).toEqual(HOST_COLLAPSED_SIZE);
    expect(node(view([]), EU)?.measured?.width).toBe(Number(node(view([]), EU)?.style?.width));
    for (const id of ['eu-stock', 'eu-quote', 'eu-tax', 'us-tax', 'report']) expect(node(graph, id)?.hidden).toBe(true);
    const shown = graph.edges.filter((edge) => !edge.hidden).map((edge) => `${edge.source}>${edge.target}`);
    expect(shown).toEqual(expect.arrayContaining([`start>${EU}`, `start>${US}`, `${EU}>${REPORT}`, `${US}>${REPORT}`, `${REPORT}>done`]));
    // No visible edge ends at a hidden node, and each card-to-card edge is drawn once.
    const hidden = new Set(graph.nodes.filter((item) => item.hidden).map((item) => item.id));
    for (const edge of graph.edges.filter((item) => !item.hidden)) {
      expect(hidden.has(edge.source) || hidden.has(edge.target)).toBe(false);
    }
    expect(new Set(shown).size).toBe(shown.length);
    // Laid out left to right: the report card after both market cards.
    expect(eu!.position.x).toBeLessThan(node(graph, REPORT)!.position.x);
    expect(node(graph, US)!.position.x).toBeLessThan(node(graph, REPORT)!.position.x);
  });

  it('opening one block makes room for it and leaves the others collapsed', () => {
    const shut = view([EU, US, REPORT]);
    const open = view([US, REPORT]);
    expect(node(open, EU)?.data.collapsed).toBe(false);
    expect(node(open, 'eu-quote')?.hidden).toBeFalsy();
    expect(node(open, 'us-quote')?.hidden).toBe(true);
    // The report moves right to clear the opened block.
    expect(node(open, REPORT)!.position.x).toBeGreaterThan(node(shut, REPORT)!.position.x);
    // Inside the open block its own edges are shown; the hidden one's are not.
    const shown = open.edges.filter((edge) => !edge.hidden).map((edge) => `${edge.source}>${edge.target}`);
    expect(shown).toEqual(expect.arrayContaining(['eu-stock>eu-quote', 'eu-quote>eu-tax', `${EU}>${REPORT}`]));
    // An edge into or out of the open block attaches to the block, not to a step inside it,
    // and goes on inside from the block's entry to the step it reaches.
    const inside = new Set(['eu-stock', 'eu-quote', 'eu-tax']);
    for (const edge of open.edges.filter((item) => !item.hidden))
      expect(
        inside.has(edge.source) === inside.has(edge.target) ||
          edge.source === EU ||
          edge.target === EU ||
          edge.source === hostBlockEntryId(EU),
      ).toBe(true);
    expect(shown).toContain(`${hostBlockEntryId(EU)}>eu-stock`);
    expect(node(open, hostBlockEntryId(EU))?.parentId).toBe(EU);
    // Sized like the containers: React Flow never measures a node it rebuilds without one.
    expect(node(open, hostBlockEntryId(EU))?.measured?.width).toBeGreaterThan(0);
    expect(shown.some((pair) => pair.startsWith('eu-tax>') && !pair.endsWith('>eu-tax'))).toBe(false);
  });

  it('wires every step of an open block: what comes in from outside starts at its entry', () => {
    const open = view([]);
    const shown = open.edges.filter((edge) => !edge.hidden);
    for (const id of ['eu-stock', 'eu-quote', 'eu-tax', 'us-stock', 'us-quote', 'us-tax', 'report'])
      expect(shown.some((edge) => edge.target === id), id).toBe(true);
    // The report reads both markets: one entry edge, not one per market.
    expect(shown.filter((edge) => edge.target === 'report').map((edge) => edge.source)).toEqual([hostBlockEntryId(REPORT)]);
    // A collapsed block draws no entry.
    expect(node(view([EU]), hostBlockEntryId(EU))?.hidden).toBe(true);
    expect(view([EU]).edges.filter((edge) => !edge.hidden).some((edge) => edge.source === hostBlockEntryId(EU))).toBe(false);
  });

  it('is a view only: saving it gives the plan back unchanged, blocks included', () => {
    const canvas = blockedCanvas();
    const plan = graphFromHostCanvas(canvas, 'zh', catalog());
    const saved = hostCanvasFromGraph(canvas, plan);
    expect(hostPlanSignature(saved)).toBe(hostPlanSignature(canvas));
    expect((saved.plan.steps as { block?: string }[]).map((step) => step.block)).toEqual(
      (canvas.plan.steps as { block?: string }[]).map((step) => step.block),
    );
    // The view itself adds no plan step and its edges never reach the plan graph.
    const shut = view([EU, US, REPORT]);
    expect(shut.nodes.filter((item) => item.data.hostBlock).every((item) => !item.data.hostPlanStep)).toBe(true);
    expect(plan.edges.some((edge) => String(edge.id).startsWith('view:'))).toBe(false);
  });

  it('leaves a plan without blocks exactly as it was', () => {
    const plain = canvasDocumentFromProposalDto({
      run_id: 'run-plain',
      proposal: { plan: fixture.plans[0].plan },
    });
    const graph = graphFromHostCanvas(plain, 'en', catalog());
    expect(hostBlockView(graph, new Set(['anything']), 'en', catalog().registry)).toBe(graph);
  });

  it('collapses sub-plans like blocks and keeps loops open', () => {
    const subplans = canvasDocumentFromProposalDto({
      run_id: 'run-sub',
      proposal: { plan: fixture.plans[23].plan },
      subplans: [{ step_id: 'eu', proposal: null }, { step_id: 'us', proposal: null }],
    });
    const graph = graphFromHostCanvas(subplans, 'zh', catalog());
    expect(hostCollapsibleIds(graph)).toEqual(['eu', 'us']);
    const shut = hostBlockView(graph, new Set(['eu']), 'zh', catalog().registry);
    expect(node(shut, 'eu')?.data.collapsed).toBe(true);
    expect(node(shut, 'eu~task')?.hidden).toBe(true);
    expect(node(shut, 'us')?.data.collapsed).toBe(false);
    const loops = canvasDocumentFromProposalDto({ run_id: 'run-loop', proposal: { plan: fixture.plans[19].plan } });
    const loopGraph = graphFromHostCanvas(loops, 'zh', catalog());
    expect(hostCollapsibleIds(loopGraph)).toEqual([]);
    expect(hostBlockView(loopGraph, new Set(['refine']), 'zh', catalog().registry)).toBe(loopGraph);
  });

  it('draws an edge between two cards once, out of the block card’s done port', () => {
    const graph = planGraph();
    // A second step of the EU block also feeds the report.
    const extra = { ...graph.edges.find((edge) => edge.source === 'eu-tax' && edge.target === 'report')!, id: 'extra', source: 'eu-quote' };
    const shut = hostBlockView({ ...graph, edges: [...graph.edges, extra] }, new Set([EU, US, REPORT]), 'zh', catalog().registry);
    const toReport = shut.edges.filter((edge) => edge.source === EU && edge.target === REPORT);
    expect(toReport).toHaveLength(1);
    expect(toReport[0].sourceHandle).toBe('done');
    expect(new Set(shut.edges.map((edge) => edge.id)).size).toBe(shut.edges.length);
  });

  it('leaves out a lifted edge a longer path between the cards implies (B140)', () => {
    const graph = planGraph();
    // The report also reads straight from the start: lifted, that is start -> 汇总,
    // which start -> 欧盟市场 -> 汇总 already shows.
    const direct = { ...graph.edges.find((edge) => edge.source === 'eu-tax' && edge.target === 'report')!, id: 'direct', source: 'start', sourceHandle: 'next' };
    const shut = hostBlockView({ ...graph, edges: [...graph.edges, direct] }, new Set([EU, US, REPORT]), 'zh', catalog().registry);
    const wired = (source: string, target: string) => shut.edges.some((edge) => edge.source === source && edge.target === target);
    expect([wired('start', EU), wired(EU, REPORT), wired('start', REPORT)]).toEqual([true, true, false]);
  });

  it('leaves the plan’s own edges and a condition’s branch to a card as they are (B140)', () => {
    const graph = planGraph();
    // A plan edge inside an open block stays, even with a longer path: it can be selected and deleted.
    const declared = { ...graph.edges.find((edge) => edge.source === 'eu-quote' && edge.target === 'eu-tax')!, id: 'declared', source: 'eu-stock' };
    const open = hostBlockView({ ...graph, edges: [...graph.edges, declared] }, new Set([US, REPORT]), 'zh', catalog().registry);
    expect(open.edges.some((edge) => edge.id === 'declared')).toBe(true);
    // A branch lifted to a card stays, even when the condition also reaches the card another way.
    const condition = canvasDocumentFromProposalDto({
      run_id: 'run-cond-b140',
      proposal: {
        plan: {
          ...fixture.plans[9].plan,
          steps: (fixture.plans[9].plan.steps as Record<string, unknown>[]).map((step) =>
            ['tax', 'notify', 'signoff', 'logistics'].includes(String(step.step_id)) ? { ...step, block: 'Pay' } : step,
          ),
        },
      },
    });
    const conditionGraph = graphFromHostCanvas(condition, 'en', catalog());
    // route matches into Pay (tax), route~1 falls through into it (notify), and both also reach it through backorder.
    const around = { ...conditionGraph.edges.find((edge) => edge.source === 'tax')!, id: 'around', source: 'backorder', target: 'tax' };
    const shut = hostBlockView({ ...conditionGraph, edges: [...conditionGraph.edges, around] }, new Set([hostBlockId('Pay')]), 'en', catalog().registry);
    const into = (source: string) => shut.edges.filter((edge) => edge.source === source && edge.target === hostBlockId('Pay')).map((edge) => edge.sourceHandle);
    expect([into('route'), into('route~1')]).toEqual([['matched'], ['otherwise']]);
  });

  it('lays an open block out after what it reads, not beside the start', () => {
    const open = view([US, REPORT]);
    expect(node(open, EU)!.position.x).toBeGreaterThan(node(open, 'start')!.position.x);
    expect(node(open, REPORT)!.position.x).toBeGreaterThan(node(open, EU)!.position.x + Number(node(open, EU)!.style?.width));
  });

  it('keeps a condition’s case nodes in its block, and a loop’s body in its loop', () => {
    const condition = canvasDocumentFromProposalDto({
      run_id: 'run-cond',
      proposal: {
        plan: {
          ...fixture.plans[9].plan,
          steps: (fixture.plans[9].plan.steps as Record<string, unknown>[]).map((step) => ({ ...step, block: 'Order' })),
        },
      },
    });
    const graph = graphFromHostCanvas(condition, 'en', catalog());
    const caseNodes = graph.nodes.filter((item) => typeof item.data.hostConditionPart === 'string');
    expect(caseNodes.length).toBeGreaterThan(0);
    const members = hostBlockMembers(graph);
    for (const item of caseNodes) expect(members.get(item.id)).toBe('Order');
    const loop = canvasDocumentFromProposalDto({
      run_id: 'run-loop-blocks',
      proposal: {
        plan: {
          ...fixture.plans[19].plan,
          steps: (fixture.plans[19].plan.steps as Record<string, unknown>[]).map((step) => ({
            ...step,
            block: ['draft', 'check'].includes(String(step.step_id)) ? 'Elsewhere' : 'Quote',
          })),
        },
      },
    });
    const loopGraph = graphFromHostCanvas(loop, 'en', catalog());
    const loopMembers = hostBlockMembers(loopGraph);
    expect([loopMembers.get('refine'), loopMembers.get('draft'), loopMembers.get('check')]).toEqual(['Quote', undefined, undefined]);
    // A body step that names a block of its own still goes with its loop.
    expect([...loopMembers.values()]).not.toContain('Elsewhere');
    const shown = hostBlockView(loopGraph, new Set(), 'en', catalog().registry);
    expect(node(shown, 'draft')?.parentId).toBe('refine');
    expect(node(shown, 'refine')?.parentId).toBe(hostBlockId('Quote'));
  });

  it('puts an unlabelled loop in its body’s block when the body agrees', () => {
    const labelled = (blocks: Record<string, string>) =>
      graphFromHostCanvas(
        canvasDocumentFromProposalDto({
          run_id: 'run-loop-body',
          proposal: {
            plan: {
              ...fixture.plans[19].plan,
              steps: (fixture.plans[19].plan.steps as Record<string, unknown>[]).map((step) =>
                blocks[String(step.step_id)] ? { ...step, block: blocks[String(step.step_id)] } : step,
              ),
            },
          },
        }),
        'en',
        catalog(),
      );
    expect(hostBlockMembers(labelled({ draft: 'Quote', check: 'Quote', publish: 'Quote' })).get('refine')).toBe('Quote');
    expect(hostBlockMembers(labelled({ draft: 'Quote', check: 'Other', publish: 'Quote' })).get('refine')).toBeUndefined();
    // Its own block wins over the body's.
    expect(hostBlockMembers(labelled({ refine: 'Mine', draft: 'Quote', check: 'Quote' })).get('refine')).toBe('Mine');
  });

  it('names the containers a step is drawn in, for opening them to show it', () => {
    expect(hostContainersOfStep(planGraph(), 'eu-tax')).toEqual([EU]);
    expect(hostContainersOfStep(planGraph(), 'report')).toEqual([REPORT]);
    expect(hostContainersOfStep(planGraph(), 'ghost')).toEqual([]);
    const subplans = canvasDocumentFromProposalDto({
      run_id: 'run-sub',
      proposal: { plan: fixture.plans[23].plan },
      subplans: [{ step_id: 'eu', proposal: null }, { step_id: 'us', proposal: null }],
    });
    // A sub-plan's steps run as `<id>/<step>`: their sub-plan is opened.
    expect(hostContainersOfStep(graphFromHostCanvas(subplans, 'zh', catalog()), 'eu/audit')).toEqual(['eu']);
  });

  it('shows on a block what its steps are doing, a person they wait on first', () => {
    expect(hostBlockStatus(['success', 'waiting', 'running'])).toBe('waiting');
    expect(hostBlockStatus(['success', 'running'])).toBe('running');
    expect(hostBlockStatus(['success', 'error'])).toBe('error');
    expect(hostBlockStatus(['success', 'skipped'])).toBe('success');
    expect(hostBlockStatus(['skipped', 'skipped'])).toBe('skipped');
    expect(hostBlockStatus(['success', undefined])).toBeUndefined();
    expect(hostBlockStatus([])).toBeUndefined();
  });

  it('keeps the plan graph a valid Flow document (the view is not compiled)', () => {
    expect(compilePlaygroundGraph(planGraph().nodes, planGraph().edges, catalog()).ok).toBe(true);
  });
});
