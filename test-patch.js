const http = require('http');
const originalCreateServer = http.createServer;
http.createServer = function() {
  const server = originalCreateServer.apply(this, arguments);
  console.log('Intercepted server creation!');
  return server;
};
require('http').createServer();
