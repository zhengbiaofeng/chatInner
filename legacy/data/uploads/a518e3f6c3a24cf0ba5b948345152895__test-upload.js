const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const dbFile = '/workspace/data/db.json';
const db = JSON.parse(fs.readFileSync(dbFile));
const user = db.users[0];

const secretFile = '/workspace/data/jwt_secret.txt';
const secret = fs.readFileSync(secretFile, 'utf-8').trim();

const token = jwt.sign({ id: user.id, username: user.username, role: user.role || 'user' }, secret, { expiresIn: '7d' });

const FormData = require('form-data');
const form = new FormData();
form.append('file', fs.createReadStream(__filename));

const fetch = require('node-fetch');

fetch('http://127.0.0.1:32123/api/upload', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    ...form.getHeaders()
  },
  body: form
})
.then(r => r.json())
.then(d => console.log("Upload result:", d))
.catch(e => console.error("Upload error:", e));

