function text(value) {
    return typeof value === "string" || typeof value === "number" ? String(value) : null;
}
function number(value) {
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}
export async function normalizeProviderRecord(client, platform, record) {
    let count = 0;
    for (const item of record.accounts) {
        const id = text(item.unique_id ?? item.id ?? item.secUid ?? item.user_id);
        if (!id)
            continue;
        await client.query(`
      INSERT INTO social_accounts (platform, platform_user_id, username, display_name, profile_url, bio, follower_count, following_count, verified, raw_data)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (platform, platform_user_id) DO UPDATE SET
        username=EXCLUDED.username, display_name=EXCLUDED.display_name,
        profile_url=EXCLUDED.profile_url, bio=EXCLUDED.bio,
        follower_count=EXCLUDED.follower_count, following_count=EXCLUDED.following_count,
        verified=EXCLUDED.verified, raw_data=EXCLUDED.raw_data, last_seen_at=now()
    `, [
            platform, id, text(item.username ?? item.uniqueId),
            text(item.nickname ?? item.display_name), text(item.profile_url ?? item.url),
            text(item.signature ?? item.bio),
            number(item.follower_count ?? item.followerCount),
            number(item.following_count ?? item.followingCount),
            typeof item.verified === "boolean" ? item.verified : null,
            item,
        ]);
        count++;
    }
    for (const item of record.posts) {
        const postId = text(item.id ?? item.post_id ?? item.aweme_id);
        if (!postId)
            continue;
        const authorValue = item.author;
        const authorId = text(item.author_id ?? authorValue?.unique_id ?? authorValue?.id);
        let authorDbId = null;
        if (authorId) {
            const author = await client.query(`
        INSERT INTO social_accounts (platform, platform_user_id, username, display_name, profile_url, raw_data)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (platform, platform_user_id) DO UPDATE SET last_seen_at=now()
        RETURNING id
      `, [platform, authorId, text(authorValue?.unique_id ?? authorValue?.username),
                text(authorValue?.nickname), text(authorValue?.profile_url), item.author ?? {}]);
            authorDbId = author.rows[0].id;
        }
        await client.query(`
      INSERT INTO social_posts (platform, platform_post_id, author_account_id, post_url, text_content, media_type,
        published_at, like_count, comment_count, share_count, view_count, raw_data)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (platform, platform_post_id) DO UPDATE SET
        author_account_id=EXCLUDED.author_account_id, post_url=EXCLUDED.post_url,
        text_content=EXCLUDED.text_content, like_count=EXCLUDED.like_count,
        comment_count=EXCLUDED.comment_count, share_count=EXCLUDED.share_count,
        view_count=EXCLUDED.view_count, raw_data=EXCLUDED.raw_data, last_seen_at=now()
    `, [
            platform, postId, authorDbId, text(item.url ?? item.post_url),
            text(item.caption ?? item.text ?? item.desc),
            text(item.media_type),
            item.created_at ? new Date(Number(item.created_at) < 100000000000 ? Number(item.created_at) * 1000 : Number(item.created_at)) : null,
            number(item.like_count ?? item.digg_count), number(item.comment_count),
            number(item.share_count), number(item.view_count),
            item,
        ]);
        count++;
    }
    for (const item of record.interactions) {
        const sourceId = text(item.source_platform_id ?? item.id);
        if (!sourceId)
            continue;
        await client.query(`
      INSERT INTO social_interactions (platform, interaction_type, interaction_text, occurred_at, raw_data, source_platform_id)
      VALUES ($1,$2,$3,$4,$5,$6)
    `, [platform, text(item.type) || "UNKNOWN", text(item.text),
            item.occurred_at ? new Date(String(item.occurred_at)) : null, item, sourceId]);
        count++;
    }
    return count;
}
