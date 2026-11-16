export const routes = Object.freeze({
  home: 'home',
  planner: 'planner',
  grocery: 'grocery',
  diary: 'diary',
  dashboard: 'dashboard',
  profile: 'profile',
  appointments: 'appointments',
});

export const bottomTabs = Object.freeze([
  { key: routes.home, icon: '⌂', title: 'Trang chủ' },
  { key: routes.planner, icon: '▤', title: 'Thực đơn' },
  { key: routes.profile, icon: '♡', title: 'Hồ sơ' },
  { key: routes.diary, icon: '▣', title: 'Nhật ký' },
]);
