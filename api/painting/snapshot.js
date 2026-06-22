const {
  createSnapshotFromWall,
  enforceRateLimit,
  getActorId,
  getUser,
  getWall,
  normalizeCanvasJson,
  sendJson,
  uploadDataUrl,
  withHandler
} = require('../_painting');

module.exports = async function handler(req, res) {
  await withHandler(req, res, ['POST'], async ({ req, res, supabase, body }) => {
    const user = await getUser(req, supabase);
    const actorId = getActorId(req, user, body);
    await enforceRateLimit(supabase, {
      actorId,
      action: 'snapshot',
      limit: 5,
      windowSeconds: 60 * 60
    });

    const wall = await getWall(supabase, true);
    let imageUrl = '';
    if (body.imageData) {
      imageUrl = await uploadDataUrl(
        supabase,
        body.imageData,
        `main/snapshots/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
      );
    }

    const snapshot = await createSnapshotFromWall(supabase, {
      ...wall,
      canvas_json: normalizeCanvasJson(body.canvasJson || wall.canvas_json)
    }, {
      title: String(body.title || 'Wall snapshot').slice(0, 80),
      reason: String(body.reason || 'manual snapshot').slice(0, 140),
      actorUserId: user?.id || null,
      imageUrl
    });

    sendJson(res, 200, { snapshot });
  });
};
