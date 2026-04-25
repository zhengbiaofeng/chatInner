#!/usr/bin/env node

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000';

async function smokeTest() {
  console.log('--- NEXT.JS APP ROUTER SMOKE TEST ---');
  
  // 1. Login
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: '123456' })
  });
  const loginData = await loginRes.json();
  if (!loginData.token) {
    console.error('❌ Login failed', loginData);
    process.exit(1);
  }
  const token = loginData.token;
  console.log('✅ Login OK');

  // 2. Test Channel Creation
  const channelRes = await fetch(`${BASE_URL}/api/channels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ name: 'smoke-channel' })
  });
  const channelData = await channelRes.json();
  if (!channelData.channel) {
    console.error('❌ Create Channel failed', channelData);
    process.exit(1);
  }
  console.log('✅ Create Channel OK');

  // 3. Create Todo
  const todoRes = await fetch(`${BASE_URL}/api/todos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ content: 'NEXTJS E2E SMOKE TODO' })
  });
  const todoData = await todoRes.json();
  if (!todoData.todo) {
    console.error('❌ Create Todo failed', todoData);
    process.exit(1);
  }
  console.log('✅ Create Todo OK');

  // 4. Complete Todo
  const putRes = await fetch(`${BASE_URL}/api/todos/${todoData.todo.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ completed: true })
  });
  if (!putRes.ok) {
    console.error('❌ Complete Todo failed');
    process.exit(1);
  }
  console.log('✅ Complete Todo OK');

  // 5. Delete Todo
  const delRes = await fetch(`${BASE_URL}/api/todos/${todoData.todo.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!delRes.ok) {
    console.error('❌ Delete Todo failed');
    process.exit(1);
  }
  console.log('✅ Delete Todo OK');

  // 6. Check Favorites
  const favRes = await fetch(`${BASE_URL}/api/favorites`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!favRes.ok) {
    console.error('❌ Fetch Favorites failed');
    process.exit(1);
  }
  console.log('✅ Fetch Favorites OK');

  console.log('🎉 ALL NEXT.JS API SMOKE TESTS PASSED');
  process.exit(0);
}

smokeTest().catch(console.error);
