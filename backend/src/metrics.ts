type GraphInstance = {
  order: number;
  forEachNode: (callback: (node: string) => void) => void;
  degree: (node: string) => number;
  outDegree: (node: string) => number;
  forEachInNeighbor: (node: string, callback: (source: string) => void) => void;
  forEachNeighbor: (node: string, callback: (neighbor: string) => void) => void;
  neighbors: (node: string) => string[];
  hasEdge: (source: string, target: string) => boolean;
};

export function calculateMetrics(graph: GraphInstance, name: string): Record<string, number> {
  const values: Record<string, number> = {};
  if (name === "degree") {
    graph.forEachNode((node) => { values[node] = graph.degree(node); });
  } else if (name === "pagerank") {
    let rank: Record<string, number> = {};
    graph.forEachNode((node) => { rank[node] = 1 / graph.order; });
    for (let i = 0; i < 20; i++) {
      const next: Record<string, number> = {};
      graph.forEachNode((node) => {
        let sum = 0;
        graph.forEachInNeighbor(node, (source) => {
          sum += rank[source] / Math.max(1, graph.outDegree(source));
        });
        next[node] = 0.15 / graph.order + 0.85 * sum;
      });
      rank = next;
    }
    Object.assign(values, rank);
  } else if (name === "closeness") {
    graph.forEachNode((node) => {
      const distances = bfs(graph, node);
      let sum = 0;
      let reachable = 0;
      Object.values(distances).forEach((distance) => { if (distance > 0) { sum += distance; reachable++; } });
      values[node] = sum ? reachable / sum : 0;
    });
  } else if (name === "betweenness") {
    graph.forEachNode((node) => { values[node] = 0; });
    graph.forEachNode((source) => {
      const stack: string[][] = [];
      const predecessors = new Map<string, string[]>();
      const sigma = new Map<string, number>();
      const distance = new Map<string, number>();
      graph.forEachNode((node) => { predecessors.set(node, []); sigma.set(node, 0); distance.set(node, -1); });
      const queue: string[] = [source];
      sigma.set(source, 1); distance.set(source, 0);
      for (let i = 0; i < queue.length; i++) {
        const current = queue[i];
        stack.push([current]);
        graph.forEachNeighbor(current, (neighbor) => {
          if (distance.get(neighbor) === undefined || distance.get(neighbor)! < 0) {
            queue.push(neighbor); distance.set(neighbor, distance.get(current)! + 1);
          }
          if (distance.get(neighbor) === distance.get(current)! + 1) {
            sigma.set(neighbor, sigma.get(neighbor)! + sigma.get(current)!);
            predecessors.get(neighbor)!.push(current);
          }
        });
      }
      const dependency = new Map<string, number>();
      graph.forEachNode((node) => dependency.set(node, 0));
      while (stack.length) {
        const batch = stack.pop()!;
        const target = batch[0];
        for (const predecessor of predecessors.get(target)!) {
          const contribution = (sigma.get(predecessor)! / sigma.get(target)!) * (1 + dependency.get(target)!);
          dependency.set(predecessor, dependency.get(predecessor)! + contribution);
        }
        if (target !== source) values[target] += dependency.get(target)!;
      }
    });
  } else if (name === "clustering") {
    graph.forEachNode((node) => {
      const neighbors = graph.neighbors(node);
      if (neighbors.length < 2) { values[node] = 0; return; }
      let links = 0;
      for (let i = 0; i < neighbors.length; i++) {
        for (let j = i + 1; j < neighbors.length; j++) {
          if (graph.hasEdge(neighbors[i], neighbors[j])) links++;
        }
      }
      values[node] = (2 * links) / (neighbors.length * (neighbors.length - 1));
    });
  }
  return values;
}

function bfs(graph: GraphInstance, source: string) {
  const distance: Record<string, number> = {};
  const queue = [source];
  distance[source] = 0;
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i];
    graph.forEachNeighbor(node, (neighbor) => {
      if (!(neighbor in distance)) { distance[neighbor] = distance[node] + 1; queue.push(neighbor); }
    });
  }
  return distance;
}
