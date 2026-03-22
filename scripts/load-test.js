import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "30s", target: 50 },
    { duration: "1m", target: 200 },
    { duration: "30s", target: 500 },
    { duration: "30s", target: 0 }
  ],
  thresholds: {
    http_req_duration: ["p(95)<2000"],
    http_req_failed: ["rate<0.01"]
  }
};

const BASE = "http://localhost:4000";

export default function () {
  const login = http.post(
    `${BASE}/auth/login`,
    JSON.stringify({ identifier: "student1@univ.edu", password: "Student1234!" }),
    { headers: { "Content-Type": "application/json" } }
  );
  check(login, { "login 200": (response) => response.status === 200 });

  const cookie = login.headers["Set-Cookie"];
  const catalog = http.get(`${BASE}/academics/sections?termId=CURRENT_TERM_ID`, {
    headers: { Cookie: cookie }
  });
  check(catalog, { "catalog 200": (response) => response.status === 200 });

  const cart = http.get(`${BASE}/registration/cart?termId=CURRENT_TERM_ID`, {
    headers: { Cookie: cookie }
  });
  check(cart, { "cart 200": (response) => response.status === 200 });

  sleep(1);
}

// 使用方式：
// brew install k6
// k6 run scripts/load-test.js
