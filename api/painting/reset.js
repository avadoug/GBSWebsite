const {
  createSnapshotFromWall,
  emptyCanvasJson,
  getWall,
  logModeration,
  requireAdmin,
  sendJson,
  withHandler
} = require('../_painting');

module.exports = async function handler(req, res) {
  await withHandler(req, res, ['POST'], async ({ req, res, supabase, body }) => {
    const admin = await requireAdmin(req, supabase);
    const wall = await getWall(supabase, true);

    const backup = await createSnapshotFromWall(supabase, wall, {
      title: body.backupTitle || 'Backup before admin reset',
      reason: 'before admin reset',
      actorUserId: admin.id,
      imageData: body.currentPreviewImageData || ''
    });

    const canvasJson = emptyCanvasJson(body.backgroundMode || wall.canvas_json?.backgroundMode || 'brick');
    const { data, error } = await supabase
      .from('painting_walls')
      .update({
        canvas_json: canvasJson,
        preview_image_url: null,
        version: wall.version + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', wall.id)
      .select('id, slug, title, canvas_json, preview_image_url, version, updated_at, created_at')
      .single();

    if (error) throw error;
    await logModeration(supabase, wall.id, admin.id, 'reset_wall', 'painting_wall', wall.id, {
      backupSnapshotId: backup.id,
      previousVersion: wall.version,
      newVersion: data.version
    });

    sendJson(res, 200, { wall: data, backupSnapshot: backup });
  });
};
