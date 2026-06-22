const {
  createSnapshotFromWall,
  enforceRateLimit,
  getActorId,
  getUser,
  getWall,
  sendJson,
  withHandler
} = require('../_painting');

const VALID_REASONS = new Set(['abuse', 'nsfw', 'hate', 'personal_info', 'spam', 'copyright', 'other']);

module.exports = async function handler(req, res) {
  await withHandler(req, res, ['POST'], async ({ req, res, supabase, body }) => {
    const user = await getUser(req, supabase);
    const actorId = getActorId(req, user, body);
    await enforceRateLimit(supabase, {
      actorId,
      action: 'report',
      limit: 10,
      windowSeconds: 60 * 60
    });

    const wall = await getWall(supabase, true);
    const reason = VALID_REASONS.has(body.reason) ? body.reason : 'other';
    const snapshot = await createSnapshotFromWall(supabase, wall, {
      title: 'Report evidence snapshot',
      reason: `report:${reason}`,
      actorUserId: user?.id || null,
      imageData: body.imageData || ''
    });

    const { data, error } = await supabase
      .from('painting_reports')
      .insert({
        wall_id: wall.id,
        object_id: body.objectId || null,
        reason,
        comment: String(body.comment || '').slice(0, 1000),
        snapshot_id: snapshot.id,
        reporter_user_id: user?.id || null,
        reporter_session_id: body.sessionId || null
      })
      .select('id, wall_id, object_id, reason, comment, snapshot_id, reporter_user_id, reporter_session_id, status, reviewed_by, reviewed_at, created_at')
      .single();

    if (error) throw error;
    sendJson(res, 200, { report: data, snapshot });
  });
};
