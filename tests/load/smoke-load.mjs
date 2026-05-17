#!/usr/bin/env node

import { performance } from 'node:perf_hooks';

const BASE_URL = process.env.LOAD_BASE_URL || 'http://localhost:3003/api';
const REQUESTS = Number(process.env.LOAD_REQUESTS || 80);
const CONCURRENCY = Number(process.env.LOAD_CONCURRENCY || 10);
const AUTH_TOKEN = process.env.LOAD_AUTH_TOKEN || '';
const ADMIN_TOKEN = process.env.LOAD_ADMIN_TOKEN || AUTH_TOKEN;
const WECHAT_CODE = process.env.LOAD_WECHAT_CODE || '';
const ENABLE_WRITE = process.env.LOAD_ENABLE_WRITE === 'true';

const MAX_P95_MS = Number(process.env.LOAD_MAX_P95_MS || 1200);
const MAX_ERROR_RATE = Number(process.env.LOAD_MAX_ERROR_RATE || 0.02);

const percentile = (values, p) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
};

const runScenario = async (scenario) => {
  let cursor = 0;
  let success = 0;
  let failed = 0;
  const latencies = [];

  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < REQUESTS) {
      const current = cursor;
      cursor += 1;

      const started = performance.now();
      try {
        const resp = await fetch(`${BASE_URL}${scenario.path}`, {
          method: scenario.method,
          headers: {
            'Content-Type': 'application/json',
            ...(scenario.headers || {}),
          },
          body: scenario.body ? JSON.stringify(scenario.body) : undefined,
        });
        const elapsed = performance.now() - started;
        latencies.push(elapsed);

        if (resp.ok) {
          success += 1;
        } else {
          failed += 1;
          if (current < 3) {
            const text = await resp.text();
            console.error(`[${scenario.name}] request ${current + 1} failed: ${resp.status} ${text}`);
          }
        }
      } catch (error) {
        const elapsed = performance.now() - started;
        latencies.push(elapsed);
        failed += 1;
        if (current < 3) {
          console.error(`[${scenario.name}] request ${current + 1} error:`, error.message || error);
        }
      }
    }
  });

  const startedAll = performance.now();
  await Promise.all(workers);
  const totalMs = performance.now() - startedAll;
  const total = success + failed;
  const throughput = total > 0 ? (total * 1000) / totalMs : 0;
  const errorRate = total > 0 ? failed / total : 1;

  return {
    scenario: scenario.name,
    requests: total,
    success,
    failed,
    errorRate,
    throughput,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99),
    max: latencies.length ? Math.max(...latencies) : 0,
  };
};

const scenarios = [
  { name: 'health', method: 'GET', path: '/health' },
];

if (AUTH_TOKEN) {
  scenarios.push({
    name: 'profile-read',
    method: 'GET',
    path: '/profile',
    headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
  });
}

if (ADMIN_TOKEN) {
  scenarios.push({
    name: 'admin-pending-read',
    method: 'GET',
    path: '/admin/pending',
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
  });
}

if (ENABLE_WRITE && ADMIN_TOKEN) {
  scenarios.push({
    name: 'admin-approve-write',
    method: 'POST',
    path: '/admin/approve',
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    body: { id: '00000000-0000-0000-0000-000000000000', role: 'teacher' },
  });
}

if (WECHAT_CODE) {
  scenarios.push({
    name: 'wechat-login',
    method: 'POST',
    path: '/auth/wechat',
    body: { code: WECHAT_CODE, role: 'teacher' },
  });
}

console.log('--- 桐心成长 Beta Smoke Load Test ---');
console.log(`BASE_URL=${BASE_URL}`);
console.log(`REQUESTS=${REQUESTS}, CONCURRENCY=${CONCURRENCY}`);
console.log(`SCENARIOS=${scenarios.map((s) => s.name).join(', ')}`);

let hasFailure = false;
for (const scenario of scenarios) {
  const result = await runScenario(scenario);
  console.log('\nScenario:', result.scenario);
  console.log(`  requests=${result.requests} success=${result.success} failed=${result.failed}`);
  console.log(`  errorRate=${(result.errorRate * 100).toFixed(2)}% throughput=${result.throughput.toFixed(2)} req/s`);
  console.log(
    `  latency ms: p50=${result.p50.toFixed(2)} p95=${result.p95.toFixed(2)} p99=${result.p99.toFixed(2)} max=${result.max.toFixed(2)}`
  );

  if (result.errorRate > MAX_ERROR_RATE || result.p95 > MAX_P95_MS) {
    hasFailure = true;
    console.error(
      `  threshold failed (max errorRate=${MAX_ERROR_RATE}, max p95=${MAX_P95_MS}ms)`
    );
  }
}

if (hasFailure) {
  process.exitCode = 1;
  console.error('\nSmoke load test failed thresholds. Please inspect API logs and DB performance.');
} else {
  console.log('\nSmoke load test passed thresholds.');
}
