/**
 * @jest-environment node
 */
import { TREE_METRICS, layoutTree } from '../treeLayout';
import type { ProgressionChainView, ProgressionNode } from '@/services';
import { VARIATIONS_BY_ID, variationsInChain } from '@/domain/program/catalog';
import type { ProgressionStatus } from '@/domain/types';

function node(variationId: string, status: ProgressionStatus): ProgressionNode {
  const variation = VARIATIONS_BY_ID.get(variationId)!;
  return {
    variation,
    status,
    qualifyingSessions: 0,
    masteryProgress: 0,
    bestRecorded: null,
    sessionsRecorded: 0,
    masteredAt: null,
    unlockedAt: null,
    phaseGated: false,
  };
}

const pushChain: ProgressionChainView = {
  chain: { id: 'chain-push-up', name: 'Push-Up', variationIds: [] },
  nodes: variationsInChain('chain-push-up').map((variation, index) =>
    node(variation.id, index === 0 ? 'mastered' : index === 1 ? 'current' : 'locked'),
  ),
  currentIndex: 1,
};

describe('skill tree layout', () => {
  it('lays a chain out as one row of evenly spaced nodes', () => {
    const layout = layoutTree([pushChain], null);

    expect(layout.rows).toHaveLength(1);
    expect(layout.nodes).toHaveLength(pushChain.nodes.length);

    const xs = layout.nodes.map((n) => n.x);
    const gaps = xs.slice(1).map((x, index) => x - xs[index]!);
    expect(new Set(gaps).size).toBe(1);
    expect(gaps[0]).toBe(TREE_METRICS.nodeWidth + TREE_METRICS.columnGap);

    expect(new Set(layout.nodes.map((n) => n.y)).size).toBe(1);
  });

  it('connects each node to the one before it', () => {
    const layout = layoutTree([pushChain], null);
    expect(layout.edges).toHaveLength(pushChain.nodes.length - 1);

    for (const edge of layout.edges) {
      expect(edge.x2).toBeGreaterThan(edge.x1);
      expect(edge.y1).toBe(edge.y2);
    }
  });

  it('marks only links out of a mastered node as travelled', () => {
    const layout = layoutTree([pushChain], null);
    expect(layout.edges[0]?.travelled).toBe(true);
    expect(layout.edges.slice(1).every((edge) => !edge.travelled)).toBe(true);
  });

  it('focuses the node the player is currently training', () => {
    const layout = layoutTree([pushChain], null);
    const current = layout.nodes.find((n) => n.node.status === 'current')!;

    expect(layout.focus).toEqual({
      x: current.x + current.width / 2,
      y: current.y + current.height / 2,
    });
  });

  it('has no focus when nothing is current', () => {
    const allLocked: ProgressionChainView = {
      ...pushChain,
      nodes: pushChain.nodes.map((n) => ({ ...n, status: 'locked' as const })),
      currentIndex: -1,
    };
    expect(layoutTree([allLocked], null).focus).toBeNull();
  });

  it('filters to the variations introduced in a phase', () => {
    const ascension = layoutTree([pushChain], 'ascension');
    expect(ascension.nodes).toHaveLength(1);
    expect(ascension.nodes[0]?.node.variation.name).toBe('Archer Push-Up');
  });

  it('omits a chain entirely rather than drawing an empty row', () => {
    const glute: ProgressionChainView = {
      chain: { id: 'chain-glute', name: 'Glute', variationIds: [] },
      nodes: [node('var-glute-bridge-single-leg', 'current')],
      currentIndex: 0,
    };
    const layout = layoutTree([glute], 'ascension');
    expect(layout.rows).toHaveLength(0);
    expect(layout.nodes).toHaveLength(0);
  });

  it('stacks multiple chains vertically without overlap', () => {
    const glute: ProgressionChainView = {
      chain: { id: 'chain-glute', name: 'Glute', variationIds: [] },
      nodes: [node('var-glute-bridge-single-leg', 'current')],
      currentIndex: 0,
    };
    const layout = layoutTree([pushChain, glute], null);

    const rowYs = [...new Set(layout.nodes.map((n) => n.y))].sort((a, b) => a - b);
    expect(rowYs).toHaveLength(2);
    expect(rowYs[1]! - rowYs[0]!).toBeGreaterThanOrEqual(TREE_METRICS.nodeHeight);
  });

  it('reports a canvas large enough to hold every node', () => {
    const layout = layoutTree([pushChain], null);
    for (const laid of layout.nodes) {
      expect(laid.x + laid.width).toBeLessThanOrEqual(layout.width);
      expect(laid.y + laid.height).toBeLessThanOrEqual(layout.height);
    }
  });

  it('produces an empty canvas for no chains rather than throwing', () => {
    const layout = layoutTree([], null);
    expect(layout.nodes).toEqual([]);
    expect(layout.focus).toBeNull();
  });
});
