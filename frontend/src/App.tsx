import { useEffect, useMemo, useState } from "react";
import {
  Activity, Aperture, Archive, BarChart3, ChevronDown, CircleDot,
  Download, Focus, GitBranch, Globe2, Pause, Play, Plus, RefreshCw,
  Search, Settings, ShieldCheck, Users, X,
} from "lucide-react";

type Project = {
  id: string;
  name: string;
  platform: string;
  query_type: string;
  query_value?: string;
};

type GraphNode = { id: string; label: string; kind: "account" | "post"; platform: string; entityId: string };
type GraphEdge = { id: string; source: string; target: string; kind: string; weight: number };
type GraphPayload = { nodes: GraphNode[]; edges: GraphEdge[] };

const demoNodes: GraphNode[] = [
  { id:"a1",label:"truth_radar",kind:"account",platform:"x",entityId:"" },
  { id:"a2",label:"@health_observer",kind:"account",platform:"x",entityId:"" },
  { id:"a3",label:"@neo_data_lab",kind:"account",platform:"x",entityId:"" },
  { id:"a4",label:"@media_watch",kind:"account",platform:"x",entityId:"" },
  { id:"a5",label:"@polling_facts",kind:"account",platform:"x",entityId:"" },
  { id:"a6",label:"@signal_report",kind:"account",platform:"x",entityId:"" },
];

const demoEdges: GraphEdge[] = [
  { id:"e1",source:"a1",target:"a2",kind:"MENTIONED",weight:2 },
  { id:"e2",source:"a1",target:"a3",kind:"REPOSTED",weight:3 },
  { id:"e3",source:"a2",target:"a4",kind:"COMMENTED_ON",weight:1 },
  { id:"e4",source:"a3",target:"a4",kind:"MENTIONED",weight:2 },
  { id:"e5",source:"a3",target:"a5",kind:"MENTIONED",weight:1 },
  { id:"e6",source:"a4",target:"a6",kind:"REPOSTED",weight:2 },
  { id:"e7",source:"a5",target:"a6",kind:"MENTIONED",weight:1 },
];

const demoPositions: Record<string,[number,number]> = {
  a1:[250,155],a2:[490,95],a3:[600,225],a4:[420,315],
  a5:[650,380],a6:[300,410],
};

export default function App() {
  const [projects,setProjects] = useState<Project[]>([]);
  const [project,setProject] = useState<Project | null>(null);
  const [graph,setGraph] = useState<GraphPayload>({nodes:demoNodes,edges:demoEdges});
  const [mode,setMode] = useState("account");
  const [metric,setMetric] = useState("betweenness");
  const [selected,setSelected] = useState<GraphNode | null>(demoNodes[0]);
  const [query,setQuery] = useState("@truth_radar");
  const [platform,setPlatform] = useState("tiktok");
  const [health,setHealth] = useState<"checking"|"ok"|"error">("checking");
  const [running,setRunning] = useState(false);
  const [jobStatus,setJobStatus] = useState("Idle");
  const [notice,setNotice] = useState("");

  useEffect(() => {
    fetch("/health").then(r=>r.json()).then(()=>setHealth("ok")).catch(()=>setHealth("error"));
    fetch("/api/projects").then(r=>r.json()).then((rows:Project[])=>{
      setProjects(rows);
      if(rows[0]) setProject(rows[0]);
    }).catch(()=>setHealth("error"));
  },[]);

  const positions = useMemo(() => {
    if(graph.nodes.length === demoNodes.length) return demoPositions;
    const result: Record<string,[number,number]> = {};
    const cx=470, cy=275, radius=210;
    graph.nodes.forEach((node,i)=>{
      const angle=(i/Math.max(1,graph.nodes.length))*Math.PI*2-Math.PI/2;
      result[node.id]=[cx+Math.cos(angle)*radius,cy+Math.sin(angle)*radius*.72];
    });
    return result;
  },[graph]);

  async function createProject() {
    if(!query.trim()) return;
    setRunning(true);
    const response=await fetch("/api/projects",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      name:`Project ${projects.length+1}`,platform,query_type:"account",query_value:query,
      collection_config:{window:"30d"},
    })});
    if(response.ok){
      const created=await response.json();
      setProjects([created,...projects]); setProject(created);
      setNotice("Project created");
    }
    setRunning(false);
  }

  async function collect() {
    if(!project){setNotice("Create a project first");return;}
    setRunning(true); setJobStatus("Queued");
    const response=await fetch(`/api/projects/${project.id}/collections`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({operation:project.query_type,params:{query:query}})});
    if(!response.ok){setNotice("Collection could not be started");setRunning(false);return;}
    const job=await response.json();
    let status=job.status;
    for(let i=0;i<20;i++){
      await new Promise(r=>setTimeout(r,1000));
      const result=await fetch(`/api/collections/${job.id}`).then(r=>r.json());
      status=result.status; setJobStatus(status[0].toUpperCase()+status.slice(1));
      if(["completed","failed","partial","cancelled"].includes(status)){
        setRunning(false);
        setNotice(status==="failed" ? (result.error_message || "Collection failed") : `${result.normalized_count} records normalized`);
        break;
      }
    }
  }

  async function loadGraph(nextMode=mode) {
    if(project){
      const payload=await fetch(`/api/projects/${project.id}/graph?mode=${nextMode}`).then(r=>r.json());
      if(payload.nodes?.length) setGraph(payload);
    }
  }

  async function runAnalysis() {
    if(!project){setNotice("Create a project first");return;}
    setRunning(true);
    const response=await fetch(`/api/projects/${project.id}/analysis-runs`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({graphMode:mode,metric})});
    if(response.ok){
      const run=await response.json();
      setNotice(`Analysis ${run.status}: ${run.node_count} nodes, ${run.edge_count} edges`);
      await loadGraph(mode);
    }else setNotice("Analysis could not be created");
    setRunning(false);
  }

  function download(type:"nodes"|"edges"|"metrics") {
    const blob=new Blob([type==="nodes"?JSON.stringify(graph.nodes,null,2):type==="edges"?JSON.stringify(graph.edges,null,2):JSON.stringify({metric,graphMode:mode},null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob); const anchor=document.createElement("a");
    anchor.href=url; anchor.download=`sna-${type}.json`; anchor.click(); URL.revokeObjectURL(url);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><Aperture size={16}/></div><div><strong>SNA Studio</strong><span> / OSINT Intelligence</span></div></div>
        <button className="top-project">NOISE &amp; MOD <ChevronDown size={12}/></button>
        <span className="top-divider"/>
        <button className="top-project">Project: <b>{project?.name || "Election2024_Debate_Audit"}</b></button>
        <div className="top-status">
          <span className={health==="ok"?"online":"offline"}>● {health==="ok"?"EnsembleData API Connected":"API Offline"}</span>
          <span>● Local DB: PostgreSQL</span>
          <span>● {jobStatus}</span>
          <span className="cpu">CPU: 12.4%</span>
        </div>
      </header>

      <aside className="left-panel">
        <nav className="rail">
          <button className="rail-active"><GitBranch size={17}/>Network Topology</button>
          <button><Archive size={17}/>Harvest &amp; Queue</button>
          <button><BarChart3 size={17}/>Key Actors Ranking</button>
          <button><ShieldCheck size={17}/>Evidence &amp; Payload</button>
          <button><Activity size={17}/>Source Clusters</button>
          <button><CircleDot size={17}/>Chain of Custody</button>
        </nav>

        <section className="controls">
          <button className="new-project" onClick={createProject}><Plus size={16}/>Create project</button>
          <label>ECOSYSTEM / PLATFORM
            <select value={platform} onChange={e=>setPlatform(e.target.value)}><option value="tiktok">TikTok</option><option value="x">X / Twitter</option><option value="instagram">Instagram</option><option value="youtube">YouTube</option></select>
          </label>
          <label>QUERY TARGET
            <div className="input-row"><Search size={14}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="@account, URL or hashtag"/></div>
          </label>
          <label>GRAPH MODE
            <select value={mode} onChange={e=>{setMode(e.target.value);loadGraph(e.target.value)}}><option value="account">Account interaction</option><option value="bipartite">Account-post bipartite</option><option value="post">Post interaction</option></select>
          </label>
          <label>METRIC SELECTOR
            <select value={metric} onChange={e=>setMetric(e.target.value)}><option value="degree">Degree Centrality</option><option value="betweenness">Betweenness Centrality</option><option value="closeness">Closeness / Harmonic</option><option value="pagerank">PageRank</option><option value="clustering">Clustering Coefficient</option></select>
          </label>
          <button className="collect" onClick={collect} disabled={running}><RefreshCw size={15}/>{running?"Processing…":"Collect & Expand Graph"}</button>
          <button className="analysis" onClick={runAnalysis} disabled={running}><Play size={14}/>Run analysis</button>
        </section>
      </aside>

      <section className="workspace">
        <div className="canvas-toolbar">
          <div><span className="cyan">FOCUS: </span><b>{selected?.label || "All network"}</b></div>
          <div className="toolbar-actions"><button><Focus size={14}/>Fit</button><button><Pause size={14}/>Pause layout</button><button onClick={()=>download("nodes")}><Download size={14}/>Export</button></div>
        </div>
        <div className="graph-canvas">
          <svg viewBox="0 0 900 520" role="img" aria-label="Interactive social network graph">
            <defs>
              <filter id="glow"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
            </defs>
            {graph.edges.map((edge)=>{
              const source=positions[edge.source]||[450,260], target=positions[edge.target]||[450,260];
              return <line key={edge.id} x1={source[0]} y1={source[1]} x2={target[0]} y2={target[1]} className="edge" strokeWidth={1+edge.weight*.45}/>;
            })}
            {graph.nodes.map((node,i)=>{
              const pos=positions[node.id]||[450+Math.cos(i)*100,260+Math.sin(i)*100];
              const isSelected=selected?.id===node.id;
              return <g key={node.id} className={isSelected?"node selected":"node"} onClick={()=>setSelected(node)} style={{cursor:"pointer"}}>
                {isSelected&&<circle cx={pos[0]} cy={pos[1]} r="18" className="node-ring"/>}
                <circle cx={pos[0]} cy={pos[1]} r={isSelected?9:6+(i%3)} fill={i%4===0?"#21d4d1":i%4===1?"#a95cff":"#25a6ff"} filter="url(#glow)"/>
                <text x={pos[0]+12} y={pos[1]-10} className="node-label">{node.label}</text>
              </g>;
            })}
          </svg>
        </div>
        <div className="canvas-footer">
          <span><b>{graph.nodes.length}</b> nodes</span><span><b>{graph.edges.length}</b> edges</span>
          <span className="legend"><i className="cyan-dot"/>Account <i className="purple-dot"/>Post <i className="blue-dot"/>Mentioned</span>
        </div>
      </section>

      <aside className="right-panel">
        <section className="inspector">
          <div className="panel-title"><span>Entity Inspector</span><X size={13}/></div>
          <div className="entity-card">
            <div className="avatar">{selected?.label?.slice(0,1).toUpperCase()}</div>
            <div><strong>{selected?.label || "Select a node"}</strong><small>{selected?.platform || "unknown"} · {selected?.kind || "entity"}</small></div>
          </div>
          <dl>
            <dt>Source class</dt><dd>{selected?.kind==="account"?"Social account":"Post"}</dd>
            <dt>Graph key</dt><dd className="mono">{selected?.id || "—"}</dd>
            <dt>Provider</dt><dd>OBSERVED_ONLY</dd>
            <dt>Evidence status</dt><dd className="cyan">PROVENANCE</dd>
          </dl>
          <div className="metric-box"><span>Selected metric</span><strong>{metric}</strong><small>Node-level score</small></div>
          <div className="sample-note"><ShieldCheck size={14}/><span>Scores describe the observed graph only. They do not imply identity or intent.</span></div>
        </section>
      </aside>

      <section className="bottom-panel">
        <div className="rank-title"><span>Key Actor Ranking</span><button onClick={()=>download("metrics")}><Download size={13}/>CSV</button></div>
        <table><thead><tr><th>Rank</th><th>Node</th><th>Platform</th><th>{metric}</th></tr></thead><tbody>
          {graph.nodes.slice(0,6).map((node,i)=><tr key={node.id} onClick={()=>setSelected(node)}><td>{i+1}</td><td>{node.label}</td><td>{node.platform}</td><td>{(0.25-i*.025).toFixed(4)}</td></tr>)}
        </tbody></table>
      </section>
      {notice&&<button className="notice" onClick={()=>setNotice("")}>{notice}<X size={12}/></button>}
    </main>
  );
}
