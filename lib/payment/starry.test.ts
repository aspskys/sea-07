import {
  constants,
  createHash,
  createSign,
  generateKeyPairSync,
  privateDecrypt,
  randomUUID,
} from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import { resolvePaymentPublicBaseUrl } from "./config";
import {
  createPlatformRequestSignature,
  PAYMENT_SIGN_VERSION,
  verifyPlatformCallbackSignature,
} from "./starry";
import { amountToCents, centsToAmount } from "./validation";

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

test("creates the documented 3.0.1 request digest and RSA-OAEP signature", () => {
  const body = JSON.stringify({ cp_order_id: "IP_123", price: 9.99 });
  const key = "test-key";
  const requestId = randomUUID().replaceAll("-", "");
  const signature = createPlatformRequestSignature({
    body,
    key,
    publicKey,
    requestId,
  });
  const decryptedDigest = privateDecrypt(
    {
      key: privateKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha1",
    },
    Buffer.from(signature, "base64"),
  );
  const expectedDigest = createHash("sha256")
    .update(`node3.4.0${PAYMENT_SIGN_VERSION}${key}${requestId}${body}`)
    .digest();

  assert.deepEqual(decryptedDigest, expectedDigest);
});

test("verifies callbacks against the exact raw body", () => {
  const rawBody = '{"event_id":"event_1","event_type":1}';
  const key = "test-key";
  const requestId = randomUUID().replaceAll("-", "");
  const signer = createSign("RSA-SHA256");
  signer.update(`${PAYMENT_SIGN_VERSION}${key}${requestId}${rawBody}`);
  signer.end();
  const signature = signer.sign(privateKey, "base64");

  assert.equal(
    verifyPlatformCallbackSignature({
      rawBody,
      signVersion: PAYMENT_SIGN_VERSION,
      key,
      requestId,
      signature,
      publicKey,
    }),
    true,
  );
  assert.equal(
    verifyPlatformCallbackSignature({
      rawBody: `${rawBody}\n`,
      signVersion: PAYMENT_SIGN_VERSION,
      key,
      requestId,
      signature,
      publicKey,
    }),
    false,
  );
});

test("converts allowed USD amounts without floating-point parsing", () => {
  assert.equal(amountToCents("0.99"), null);
  assert.equal(amountToCents("1.00"), 100);
  assert.equal(amountToCents("9.9"), 990);
  assert.equal(amountToCents("9999.99"), 999_999);
  assert.equal(amountToCents("10000.00"), null);
  assert.equal(centsToAmount(990), "9.90");
});

test("uses the configured public origin when provided", () => {
  assert.equal(
    resolvePaymentPublicBaseUrl(
      "http://localhost:3000/api/payments/orders",
      "https://seachat.ai",
    ),
    "https://seachat.ai",
  );
});
