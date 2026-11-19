const CONTRACT_VERSION = '1.0';

function validatePlannerRequest({ profile, budget }) {
  if (profile?.mode === 'healthy' && profile.redFlags?.length) return 'Có dấu hiệu cần được nhân viên y tế đánh giá. Ứng dụng không tạo thực đơn trong trường hợp này.';
  if (profile?.mode === 'patient' && (!profile.medicalLimitsConfirmed || Object.keys(profile.hardLimits || {}).length === 0)) return 'Hồ sơ bệnh nhân cần có ít nhất một giới hạn dinh dưỡng đã đối chiếu với bác sĩ. Hãy cập nhật hồ sơ trước.';
  const parsedBudget = Number(budget);
  if (!Number.isSafeInteger(parsedBudget) || parsedBudget < 0 || parsedBudget > 10000000) return 'Nhập ngân sách nguyên VNĐ từ 0 đến 10.000.000.';
  return '';
}

function buildPlannerPayload({ profile, budget, preferences }) {
  return {
    contractVersion: CONTRACT_VERSION,
    budgetVnd: Number(budget),
    preferences,
    allergies: profile?.allergies || [],
    hardLimits: profile?.mode === 'patient' ? profile.hardLimits : {},
  };
}

module.exports = { CONTRACT_VERSION, buildPlannerPayload, validatePlannerRequest };
