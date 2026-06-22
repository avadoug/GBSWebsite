const {
  getWall,
  requireAdmin,
  sendJson,
  withHandler
} = require('../_painting');

module.exports = async function handler(req, res) {
  await withHandler(req, res, ['GET', 'POST'], async ({ req, res, supabase }) => {
    await requireAdmin(req, supabase);
    const wall = await getWall(supabase, true);

    const [reports, assets, logs, snapshots] = await Promise.all([
      supabase
        .from('painting_reports')
        .select('id, wall_id, object_id, reason, comment, snapshot_id, reporter_user_id, reporter_session_id, status, reviewed_by, reviewed_at, created_at')
        .eq('wall_id', wall.id)
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('painting_assets')
        .select('id, wall_id, file_path, public_url, width, height, file_type, created_by, moderation_status, hidden, deleted_at, created_at')
        .eq('wall_id', wall.id)
        .order('created_at', { ascending: false })
        .limit(40),
      supabase
        .from('moderation_logs')
        .select('id, wall_id, actor_user_id, action, target_type, target_id, details, created_at')
        .eq('wall_id', wall.id)
        .order('created_at', { ascending: false })
        .limit(40),
      supabase
        .from('painting_snapshots')
        .select('id, wall_id, title, image_url, canvas_json, wall_version, created_by, reason, created_at')
        .eq('wall_id', wall.id)
        .order('created_at', { ascending: false })
        .limit(30)
    ]);

    for (const result of [reports, assets, logs, snapshots]) {
      if (result.error) throw result.error;
    }

    sendJson(res, 200, {
      wall,
      reports: reports.data || [],
      assets: assets.data || [],
      logs: logs.data || [],
      snapshots: snapshots.data || []
    });
  });
};
