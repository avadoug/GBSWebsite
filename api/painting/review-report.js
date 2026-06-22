const {
  getWall,
  logModeration,
  requireAdmin,
  sendJson,
  withHandler
} = require('../_painting');

const VALID_STATUS = new Set(['pending', 'reviewed', 'resolved', 'dismissed']);

module.exports = async function handler(req, res) {
  await withHandler(req, res, ['POST'], async ({ req, res, supabase, body }) => {
    const admin = await requireAdmin(req, supabase);
    if (!body.reportId || !VALID_STATUS.has(body.status)) {
      throw Object.assign(new Error('Valid reportId and status are required'), { statusCode: 400 });
    }

    const wall = await getWall(supabase, true);
    const { data, error } = await supabase
      .from('painting_reports')
      .update({
        status: body.status,
        reviewed_by: admin.id,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', body.reportId)
      .select('id, wall_id, object_id, reason, comment, snapshot_id, reporter_user_id, reporter_session_id, status, reviewed_by, reviewed_at, created_at')
      .single();

    if (error) throw error;
    await logModeration(supabase, wall.id, admin.id, 'review_report', 'painting_report', data.id, {
      status: data.status
    });

    sendJson(res, 200, { report: data });
  });
};
