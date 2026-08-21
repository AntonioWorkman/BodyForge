import type { PhaseId } from '@/domain/types';
import type { ProgressionChainView, ProgressionNode } from '@/services';

/**
 * Skill tree layout.
 *
 * Chains run left to right as rows of connected nodes. The geometry is computed
 * here rather than in the screen so the layout is data-driven and testable, and
 * so the view can centre itself on the player's current node without measuring
 * rendered elements.
 */
export const TREE_METRICS = {
  nodeWidth: 148,
  nodeHeight: 76,
  columnGap: 44,
  rowGap: 40,
  rowLabelHeight: 26,
  paddingX: 20,
  paddingY: 16,
} as const;

export interface LaidOutNode {
  node: ProgressionNode;
  chainId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LaidOutEdge {
  fromId: string;
  toId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** True when both ends have been reached, so the link reads as travelled. */
  travelled: boolean;
}

export interface LaidOutRow {
  chainId: string;
  chainName: string;
  y: number;
}

export interface TreeLayout {
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  rows: LaidOutRow[];
  width: number;
  height: number;
  /** Centre of the player's current node, for auto-scrolling on open. */
  focus: { x: number; y: number } | null;
}

/**
 * Lays out the chains that belong to `phase`, or all of them when `phase` is
 * null. A chain is included when any of its variations is reachable in that
 * phase, so filtering never produces an empty screen for a valid phase.
 */
export function layoutTree(
  chains: readonly ProgressionChainView[],
  phase: PhaseId | null,
): TreeLayout {
  const nodes: LaidOutNode[] = [];
  const edges: LaidOutEdge[] = [];
  const rows: LaidOutRow[] = [];

  const { nodeWidth, nodeHeight, columnGap, rowGap, rowLabelHeight, paddingX, paddingY } =
    TREE_METRICS;

  let y = paddingY;
  let maxRight = 0;
  let focus: TreeLayout['focus'] = null;

  for (const chain of chains) {
    const visible = phase
      ? chain.nodes.filter((node) => node.variation.minimumPhase === phase)
      : chain.nodes;

    if (visible.length === 0) continue;

    rows.push({ chainId: chain.chain.id, chainName: chain.chain.name, y });
    const rowTop = y + rowLabelHeight;

    visible.forEach((node, index) => {
      const x = paddingX + index * (nodeWidth + columnGap);

      nodes.push({
        node,
        chainId: chain.chain.id,
        x,
        y: rowTop,
        width: nodeWidth,
        height: nodeHeight,
      });

      maxRight = Math.max(maxRight, x + nodeWidth);

      if (index > 0) {
        const previous = visible[index - 1];
        if (previous) {
          edges.push({
            fromId: previous.variation.id,
            toId: node.variation.id,
            x1: x - columnGap,
            y1: rowTop + nodeHeight / 2,
            x2: x,
            y2: rowTop + nodeHeight / 2,
            travelled: previous.status === 'mastered',
          });
        }
      }

      if (!focus && (node.status === 'current' || node.status === 'ready')) {
        focus = { x: x + nodeWidth / 2, y: rowTop + nodeHeight / 2 };
      }
    });

    y = rowTop + nodeHeight + rowGap;
  }

  return {
    nodes,
    edges,
    rows,
    width: maxRight + paddingX,
    height: y + paddingY,
    focus,
  };
}
