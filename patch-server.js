const fs = require('fs');
let code = fs.readFileSync('.next/standalone/server.js', 'utf-8');

const patchCode = `
const http = require('http');
const originalCreateServer = http.createServer;
http.createServer = function() {
  const server = originalCreateServer.apply(this, arguments);
  try {
    require('./socket.js').initSocket(server);
    console.log('>>> Attached Socket.IO to Next.js server <<<');
  } catch (e) {
    console.error('Failed to attach socket.io', e);
  }
  return server;
};
`;

if (!code.includes('originalCreateServer')) {
  code = patchCode + code;
  fs.writeFileSync('.next/standalone/server.js', code);
  console.log('Patched server.js successfully!');
} else {
  console.log('Already patched!');
}
