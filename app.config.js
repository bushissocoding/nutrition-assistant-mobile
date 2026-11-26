'use strict';

const staticConfig = require('./app.json');

module.exports = ({ config = {} } = {}) => {
  const projectId = typeof process.env.EXPO_PUBLIC_EAS_PROJECT_ID === 'string'
    ? process.env.EXPO_PUBLIC_EAS_PROJECT_ID.trim()
    : '';
  const extra = { ...(config.extra || {}), ...(staticConfig.extra || {}) };
  const currentEas = extra.eas || {};
  if (projectId) extra.eas = { ...currentEas, projectId };
  return { ...config, ...staticConfig, extra };
};
