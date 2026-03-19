"use client";

/**
 * Prerequisite dependency graph: given a set of courses with their prereq links,
 * renders a compact layered SVG DAG for a target course.
 */

type CourseSummary = {
  id: string;
  code: string;
  prerequisiteLinks?: Array<{ prerequisiteCourse?: { id?: string; code?: string } }>;
};

type Props = {
  courseId: string;
  courses: CourseSummary[];
};

type Node = { id: string; code: string; x: number; y: number; layer: number };
type Edge = { from: string; to: string };

const NODE_W = 80;
const NODE_H = 28;
const H_GAP = 28;
const V_GAP = 36;

function buildGraph(courseId: string, courses: CourseSummary[]) {
  const byId = new Map(courses.map((c) => [c.id, c]));
  const nodes = new Map<string, Node>();
  const edges: Edge[] = [];

  // BFS backwards from target to collect all ancestors (up to 3 levels)
  function traverse(id: string, layer: number) {
    if (layer > 4 || nodes.has(id)) return;
    const c = byId.get(id);
    if (!c) return;
    nodes.set(id, { id, code: c.code, x: 0, y: 0, layer });
    for (const link of c.prerequisiteLinks ?? []) {
      const preId = link.prerequisiteCourse?.id;
      if (!preId) continue;
      edges.push({ from: preId, to: id });
      traverse(preId, layer - 1);
    }
  }

  traverse(courseId, 0);

  // Also add direct dependents (courses that require target) — up to 1 level forward
  for (const c of courses) {
    const requiresTarget = (c.prerequisiteLinks ?? []).some((l) => l.prerequisiteCourse?.id === courseId);
    if (requiresTarget && !nodes.has(c.id)) {
      nodes.set(c.id, { id: c.id, code: c.code, x: 0, y: 0, layer: 1 });
      edges.push({ from: courseId, to: c.id });
    }
  }

  // Compute layout by layer
  const layerGroups = new Map<number, string[]>();
  for (const [id, node] of nodes) {
    const arr = layerGroups.get(node.layer) ?? [];
    arr.push(id);
    layerGroups.set(node.layer, arr);
  }

  const layers = [...layerGroups.keys()].sort((a, b) => a - b);
  const maxPerLayer = Math.max(...layers.map((l) => layerGroups.get(l)!.length));

  for (const layer of layers) {
    const ids = layerGroups.get(layer)!;
    const col = layers.indexOf(layer);
    ids.forEach((id, row) => {
      const n = nodes.get(id)!;
      n.x = col * (NODE_W + H_GAP) + 10;
      n.y = row * (NODE_H + V_GAP) + 10;
    });
  }

  const width = layers.length * (NODE_W + H_GAP) + 20;
  const height = maxPerLayer * (NODE_H + V_GAP) + 20;

  return { nodes: [...nodes.values()], edges, width, height };
}

export default function PrereqGraph({ courseId, courses }: Props) {
  const { nodes, edges, width, height } = buildGraph(courseId, courses);

  if (nodes.length <= 1) return null; // nothing interesting to show

  const byId = new Map(nodes.map((n) => [n.id, n]));

  function midX(n: Node) { return n.x + NODE_W / 2; }
  function midY(n: Node) { return n.y + NODE_H / 2; }

  return (
    <div className="mt-2 overflow-x-auto rounded-lg border border-slate-100 bg-slate-50/60 p-2">
      <p className="mb-1 text-[10px] font-semibold text-slate-400">先修课依赖链</p>
      <svg width={width} height={height} className="font-mono">
        <defs>
          <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#94a3b8" />
          </marker>
        </defs>
        {/* Edges */}
        {edges.map((e, i) => {
          const from = byId.get(e.from);
          const to = byId.get(e.to);
          if (!from || !to) return null;
          const x1 = from.x + NODE_W;
          const y1 = midY(from);
          const x2 = to.x;
          const y2 = midY(to);
          const cx = (x1 + x2) / 2;
          return (
            <path
              key={i}
              d={`M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`}
              fill="none"
              stroke="#94a3b8"
              strokeWidth="1.5"
              markerEnd="url(#arrow)"
            />
          );
        })}
        {/* Nodes */}
        {nodes.map((n) => {
          const isTarget = n.id === courseId;
          return (
            <g key={n.id} transform={`translate(${n.x},${n.y})`}>
              <rect
                width={NODE_W}
                height={NODE_H}
                rx={6}
                className={isTarget ? "fill-indigo-600 stroke-indigo-700" : "fill-white stroke-slate-300"}
                strokeWidth="1"
              />
              <text
                x={NODE_W / 2}
                y={NODE_H / 2 + 4}
                textAnchor="middle"
                fontSize="9"
                className={isTarget ? "fill-white font-bold" : "fill-slate-700"}
                fontWeight={isTarget ? "700" : "500"}
              >
                {n.code}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
