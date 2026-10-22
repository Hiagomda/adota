// Home mix: health + the two feed calls the app makes on open.
// Run against a local or staging API. This refuses the public host unless
// ALLOW_LOADTEST=1, and even then only after you point it at a copy.
//
//   k6 run scripts/loadtest/home.js
//   k6 run -e BASE_URL=http://127.0.0.1:3010 scripts/loadtest/home.js
import http from 'k6/http';
import { check, sleep } from 'k6';

const base = __ENV.BASE_URL || 'http://127.0.0.1:3010';

if (/sslip\.io|eguaadota\.app|warlord-core\.site/i.test(base) && __ENV.ALLOW_LOADTEST !== '1') {
  throw new Error(
    'Refusing to load-test the public host. Use a local API, or set ALLOW_LOADTEST=1 on a staging copy.',
  );
}

export const options = {
  scenarios: {
    home: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 10 },
        { duration: '30s', target: 10 },
        { duration: '10s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:feed}': ['p(95)<300'],
  },
};

const headers = { Accept: 'application/json', 'Accept-Encoding': 'gzip' };

export default function home() {
  const health = http.get(`${base}/health`, { headers, tags: { name: 'health' } });
  check(health, { 'health 200': (response) => response.status === 200 });

  const feed = http.get(`${base}/posts?limit=20`, { headers, tags: { name: 'feed' } });
  check(feed, { 'feed 200': (response) => response.status === 200 });

  const stories = http.get(`${base}/posts?urgency=high&status=open&limit=12`, {
    headers,
    tags: { name: 'stories' },
  });
  check(stories, { 'stories 200': (response) => response.status === 200 });

  sleep(1);
}
