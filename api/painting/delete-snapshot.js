const {
  getWall,
  logModeration,
  requireAdmin,
  sendJson,
  withHandler
} = require('../_painting');

module.exports = async function handler(req, res) {
  await withHandler(req, res, ['POST'], async ({ req, res, supabase, body }) => {
    const admin = await requireAdmin(req, supabase);
    if (!body.snapshotId) {
      throw Object.assign(new Error('snapshotId is required'), { statusCode: 400 });
    }
    const wall = await getWall(supabase, true);

    const { error } = await supabase
      .from('painting_snapshots')
      .delete()
      .eq('id', body.snapshotId)
      .eq('wall_id', wall.id);
    if (error) throw error;

    await logModeration(supabase, wall.id, admin.id, 'delete_snapshot', 'painting_snapshot', body.snapshotId, {});
    sendJson(res, 200, { ok: true });
  });
};
