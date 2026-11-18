import GraphModule from "graphology";
const GraphConstructor = GraphModule;
export async function buildGraph(client, projectId, mode) {
    const graph = new GraphConstructor({ type: "mixed", multi: true });
    const payload = { nodes: [], edges: [] };
    const posts = await client.query(`
    SELECT p.id,p.platform_post_id,p.text_content,p.platform,a.id author_id,a.username,a.display_name
    FROM social_posts p
    LEFT JOIN social_accounts a ON a.id=p.author_account_id
  `);
    const accounts = await client.query(`
    SELECT DISTINCT a.id,a.platform_user_id,a.username,a.display_name,a.platform
    FROM social_accounts a
  `);
    if (mode === "bipartite") {
        for (const account of accounts.rows) {
            const key = `account:${account.platform}:${account.platform_user_id}`;
            if (!graph.hasNode(key))
                graph.addNode(key, { kind: "account", label: account.username || account.display_name || account.platform_user_id });
            payload.nodes.push({ id: key, label: account.username || account.display_name || account.platform_user_id, kind: "account", platform: account.platform, entityId: account.id });
        }
        for (const post of posts.rows) {
            const key = `post:${post.platform}:${post.platform_post_id}`;
            if (!graph.hasNode(key))
                graph.addNode(key, { kind: "post", label: post.text_content?.slice(0, 32) || post.platform_post_id });
            payload.nodes.push({ id: key, label: post.text_content?.slice(0, 32) || post.platform_post_id, kind: "post", platform: post.platform, entityId: post.id });
            if (post.author_id) {
                const account = accounts.rows.find((row) => row.id === post.author_id);
                if (account) {
                    const source = `account:${account.platform}:${account.platform_user_id}`;
                    graph.addDirectedEdgeWithKey(`authored:${post.id}`, source, key, { kind: "AUTHORED", weight: 1 });
                    payload.edges.push({ id: `authored:${post.id}`, source, target: key, kind: "AUTHORED", weight: 1, directed: true });
                }
            }
        }
    }
    else if (mode === "post") {
        for (const post of posts.rows) {
            const key = `post:${post.platform}:${post.platform_post_id}`;
            if (!graph.hasNode(key))
                graph.addNode(key, { kind: "post", label: post.text_content?.slice(0, 32) || post.platform_post_id });
            payload.nodes.push({ id: key, label: post.text_content?.slice(0, 32) || post.platform_post_id, kind: "post", platform: post.platform, entityId: post.id });
        }
    }
    else {
        for (const account of accounts.rows) {
            const key = `account:${account.platform}:${account.platform_user_id}`;
            if (!graph.hasNode(key))
                graph.addNode(key, { kind: "account", label: account.username || account.display_name || account.platform_user_id });
            payload.nodes.push({ id: key, label: account.username || account.display_name || account.platform_user_id, kind: "account", platform: account.platform, entityId: account.id });
        }
        const interactions = await client.query(`
      SELECT i.*,a.platform_user_id actor_user_id,a.platform actor_platform,
             ta.platform_user_id target_user_id,ta.platform target_platform
      FROM social_interactions i
      LEFT JOIN social_accounts a ON a.id=i.actor_account_id
      LEFT JOIN social_accounts ta ON ta.id=i.target_account_id
    `);
        for (const interaction of interactions.rows) {
            if (!interaction.actor_user_id || !interaction.target_user_id)
                continue;
            const source = `account:${interaction.actor_platform}:${interaction.actor_user_id}`;
            const target = `account:${interaction.target_platform}:${interaction.target_user_id}`;
            if (!graph.hasNode(source) || !graph.hasNode(target))
                continue;
            if (!graph.hasEdge(source, target)) {
                graph.addDirectedEdgeWithKey(`interaction:${interaction.id}`, source, target, { kind: interaction.interaction_type, weight: 1 });
                payload.edges.push({ id: `interaction:${interaction.id}`, source, target, kind: interaction.interaction_type, weight: 1, directed: true });
            }
        }
    }
    return { graph, payload };
}
