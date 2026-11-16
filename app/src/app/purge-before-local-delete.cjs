async function purgeBeforeLocalDelete(purgeRemote, clearLocal) {
  if (typeof purgeRemote !== 'function' || typeof clearLocal !== 'function') {
    throw new TypeError('Remote purge and local clear operations are required.');
  }
  await purgeRemote();
  await clearLocal();
}

module.exports = { purgeBeforeLocalDelete };
