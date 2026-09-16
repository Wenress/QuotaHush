import { appendFileSync } from "node:fs";
import { createSign } from "node:crypto";

const credentialsJson = process.env.CWS_SERVICE_ACCOUNT_JSON;
const outputFile = process.env.GITHUB_OUTPUT;

if (!credentialsJson || !outputFile) {
  throw new Error("CWS_SERVICE_ACCOUNT_JSON and GITHUB_OUTPUT are required.");
}

const credentials = JSON.parse(credentialsJson);
if (!credentials.client_email || !credentials.private_key) {
  throw new Error("The service-account JSON is missing client_email or private_key.");
}

const base64url = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const unsignedToken = [
  base64url({ alg: "RS256", typ: "JWT" }),
  base64url({
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/chromewebstore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }),
].join(".");

const signer = createSign("RSA-SHA256");
signer.update(unsignedToken);
signer.end();
const assertion = `${unsignedToken}.${signer.sign(credentials.private_key, "base64url")}`;

const response = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  }),
});

if (!response.ok) {
  const message = await response.text();
  throw new Error(`Google OAuth token exchange failed (${response.status}): ${message}`);
}

const tokenResponse = await response.json();
if (!tokenResponse.access_token) {
  throw new Error("Google OAuth response did not include an access token.");
}

console.log(`::add-mask::${tokenResponse.access_token}`);
appendFileSync(outputFile, `access_token=${tokenResponse.access_token}\n`, { encoding: "utf8" });
