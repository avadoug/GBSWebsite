const {
  createSnapshotFromWall,
  findCanvasObject,
  getWall,
  logModeration,
  normalizeCanvasJson,
  removeCanvasObject,
  requireAdmin,
  sendJson,
  withHandler
} = require('../_painting');

module.exports = async function handler(req, res) {
  await withHandler(req, res, ['POST'], async ({ req, res, supabase, body }) => {
    const admin = await requireAdmin(req, supabase);
    const { objectId, action } = body;
    if (!objectId || !['hide', 'delete', 'lock', 'unhide', 'unlock'].includes(action)) {
      throw Object.assign(new Error('Valid objectId and action are required'), { statusCode: 400 });
    }

    const wall = await getWall(supabase, true);
    const canvasJson = normalizeCanvasJson(wall.canvas_json);
    const target = findCanvasObject(canvasJson.objects, objectId);
    if (!target) {
      throw Object.assign(new Error('Object not found'), { statusCode: 404 });
    }

    await createSnapshotFromWall(supabase, wall, {
      title: `Backup before ${action} object`,
      reason: `before object moderation:${action}`,
      actorUserId: admin.id
    });

    if (action === 'delete') {
      removeCanvasObject(canvasJson.objects, objectId);
      canvasJson.tombstones = { ...(canvasJson.tombstones || {}), [objectId]: new Date().toISOString() };
    } else {
      target.hidden = action === 'hide' ? true : action === 'unhide' ? false : target.hidden;
      target.visible = action === 'hide' ? false : action === 'unhide' ? true : target.visible;
      target.locked = action === 'lock' ? true : action === 'unlock' ? false : target.locked;
      target.moderationStatus = action === 'hide' ? 'hidden' : action === 'unhide' ? 'active' : target.moderationStatus || 'active';
      target.updatedAt = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('painting_walls')
      .update({
        canvas_json: canvasJson,
        version: wall.version + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', wall.id)
      .select('id, slug, title, canvas_json, preview_image_url, version, updated_at, created_at')
      .single();
    if (error) throw error;

    await logModeration(supabase, wall.id, admin.id, `${action}_object`, 'canvas_object', objectId, {
      objectType: target.type || target.roomType || 'object',
      previousVersion: wall.version,
      newVersion: data.version
    });

    sendJson(res, 200, { wall: data });
  });
};
