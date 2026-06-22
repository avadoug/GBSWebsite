const {
  createSnapshotFromWall,
  getWall,
  logModeration,
  normalizeCanvasJson,
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
    const { data: snapshot, error: snapshotError } = await supabase
      .from('painting_snapshots')
      .select('id, wall_id, title, image_url, canvas_json, wall_version, created_by, reason, created_at')
      .eq('id', body.snapshotId)
      .eq('wall_id', wall.id)
      .single();

    if (snapshotError) throw snapshotError;

    const backup = await createSnapshotFromWall(supabase, wall, {
      title: 'Backup before snapshot restore',
      reason: `before restoring snapshot ${snapshot.id}`,
      actorUserId: admin.id,
      imageData: body.currentPreviewImageData || ''
    });

    const { data, error } = await supabase
      .from('painting_walls')
      .update({
        canvas_json: normalizeCanvasJson(snapshot.canvas_json),
        preview_image_url: snapshot.image_url || wall.preview_image_url || null,
        version: wall.version + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', wall.id)
      .select('id, slug, title, canvas_json, preview_image_url, version, updated_at, created_at')
      .single();

    if (error) throw error;
    await logModeration(supabase, wall.id, admin.id, 'restore_snapshot', 'painting_snapshot', snapshot.id, {
      restoredSnapshotId: snapshot.id,
      backupSnapshotId: backup.id,
      previousVersion: wall.version,
      newVersion: data.version
    });

    sendJson(res, 200, { wall: data, restoredSnapshot: snapshot, backupSnapshot: backup });
  });
};
