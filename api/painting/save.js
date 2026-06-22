const {
  enforceRateLimit,
  getActorId,
  getUser,
  getWall,
  isAdmin,
  normalizeCanvasJson,
  sendJson,
  uploadDataUrl,
  withHandler
} = require('../_painting');

function countCanvasObjects(objects = []) {
  return objects.reduce((count, object) => count + 1 + countCanvasObjects(object.objects || []), 0);
}

module.exports = async function handler(req, res) {
  await withHandler(req, res, ['POST'], async ({ req, res, supabase, body }) => {
    const user = await getUser(req, supabase);
    const actorId = getActorId(req, user, body);
    await enforceRateLimit(supabase, {
      actorId,
      action: 'save',
      limit: user ? 60 : 30,
      windowSeconds: 60
    });

    const wall = await getWall(supabase, true);
    const expectedVersion = Number(body.expectedVersion || 0);
    if (expectedVersion && wall.version > expectedVersion) {
      sendJson(res, 409, { error: 'Remote wall is newer', wall });
      return;
    }

    const canvasJson = normalizeCanvasJson(body.canvasJson);
    const admin = await isAdmin(supabase, user?.id);
    const previousObjectCount = countCanvasObjects(wall.canvas_json?.objects || []);
    const nextObjectCount = countCanvasObjects(canvasJson.objects || []);
    const minimumAllowedObjects = Math.max(1, Math.floor(previousObjectCount * 0.35));
    if (!admin && previousObjectCount > 2 && nextObjectCount < minimumAllowedObjects) {
      throw Object.assign(new Error('Large destructive edits require admin review.'), { statusCode: 403 });
    }

    let previewImageUrl = wall.preview_image_url;
    if (body.previewImageData) {
      previewImageUrl = await uploadDataUrl(
        supabase,
        body.previewImageData,
        'main/previews/latest.jpg',
        true
      );
    }

    const { data, error } = await supabase
      .from('painting_walls')
      .update({
        canvas_json: canvasJson,
        preview_image_url: previewImageUrl || null,
        version: wall.version + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', wall.id)
      .select('id, slug, title, canvas_json, preview_image_url, version, updated_at, created_at')
      .single();

    if (error) throw error;
    sendJson(res, 200, { wall: data });
  });
};
