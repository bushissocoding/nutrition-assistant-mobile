export const routes = Object.freeze({
  home: 'home',
  planner: 'planner',
  grocery: 'grocery',
  diary: 'diary',
  dashboard: 'dashboard',
  profile: 'profile',
  appointments: 'appointments',
  appointmentList: 'appointments-list',
  chat: 'chat',
  notifications: 'notifications',
  settings: 'settings',
  medicalRecord: 'medical-record',
  personalization: 'personalization',
});

export const bottomTabs = Object.freeze([
  { key: routes.home, icon: '⌂', title: 'Trang chủ' },
  { key: routes.chat, icon: '◌', title: 'Trò chuyện' },
  { key: routes.profile, icon: '♙', title: 'Hồ sơ' },
  { key: routes.appointments, icon: '▣', title: 'Đặt khám' },
]);
