function registerGracefulShutdown(server, {
  processObject = process,
  logger = console,
  timeoutMs = 10000,
} = {}) {
  let shuttingDown = false;

  function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.log(JSON.stringify({ event: 'api_shutdown_started', entryPoint: 'http_api', signal }));

    const timeout = setTimeout(() => {
      logger.error(JSON.stringify({ event: 'api_shutdown_deadline_reached', entryPoint: 'http_api' }));
      try {
        // Gracefully close first, then force remaining sockets after the deadline.
        // https://nodejs.org/download/release/v22.23.0/docs/api/http.html#servercloseallconnections
        server.closeAllConnections();
      } catch (error) {
        logger.error(JSON.stringify({ event: 'api_forced_connection_close_failed', entryPoint: 'http_api', code: error?.code || 'FORCED_CLOSE_FAILED' }));
        processObject.exitCode = 1;
      }
    }, timeoutMs);

    server.close(error => {
      clearTimeout(timeout);
      if (error) {
        logger.error(JSON.stringify({ event: 'api_server_close_failed', entryPoint: 'http_api', code: error.code || 'SERVER_CLOSE_FAILED' }));
        processObject.exitCode = 1;
        return;
      }
      logger.log(JSON.stringify({ event: 'api_server_stopped', entryPoint: 'http_api' }));
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
