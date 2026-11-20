function registerGracefulShutdown(server, {
  processObject = process,
  logger = console,
  timeoutMs = 10000,
} = {}) {
  let shuttingDown = false;

  function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.log(`Received ${signal}; shutting down API server.`);

    const timeout = setTimeout(() => {
      logger.error('Graceful shutdown timed out; closing active connections.');
      try {
        // Gracefully close first, then force remaining sockets after the deadline.
        // https://nodejs.org/download/release/v22.23.0/docs/api/http.html#servercloseallconnections
        server.closeAllConnections();
      } catch (error) {
        logger.error('Forced connection close failed.', { code: error?.code || 'FORCED_CLOSE_FAILED' });
        processObject.exitCode = 1;
      }
    }, timeoutMs);

    server.close(error => {
      clearTimeout(timeout);
      if (error) {
        logger.error('API server close failed.', { code: error.code || 'SERVER_CLOSE_FAILED' });
        processObject.exitCode = 1;
        return;
      }
      logger.log('API server stopped.');
    });
  }

  const onInterrupt = () => shutdown('SIGINT');
  const onTerminate = () => shutdown('SIGTERM');
  processObject.on('SIGINT', onInterrupt);
  processObject.on('SIGTERM', onTerminate);

  return () => {
    processObject.removeListener('SIGINT', onInterrupt);
    processObject.removeListener('SIGTERM', onTerminate);
  };
}

module.exports = { registerGracefulShutdown };
