const makeDailyProgressDraftKey = ({ studentId, date, userId }) =>
  `dailyProgressDraft:${studentId}:${date}:${userId || "anonymous"}`;

const buildDailyProgressDraftPayload = ({ studentId, date, userId, formData }) => ({
  version: 1,
  studentId,
  date,
  userId: userId || "",
  updatedAt: new Date().toISOString(),
  ...(formData || {}),
});

module.exports = {
  makeDailyProgressDraftKey,
  buildDailyProgressDraftPayload,
};
