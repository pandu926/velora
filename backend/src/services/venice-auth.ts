import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import type { Hex } from "viem";

const SIWE_DOMAIN = "outerface.venice.ai";
const SIWE_URI = "https://outerface.venice.ai";
const SIWE_CHAIN_ID = 8453;
const SIWE_VERSION = "1";
const SIWE_STATEMENT = "Sign in to Venice API";
const SIWE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const VENICE_API_BASE = "https://api.venice.ai/api/v1";

/**
 * Generates a random nonce (16 hex characters).
 */
function generateNonce(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Formats a SIWE message per EIP-4361 specification.
 */
function formatSiweMessage(params: {
  domain: string;
  address: string;
  statement: string;
  uri: string;
  version: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
  expirationTime: string;
}): string {
  return [
    `${params.domain} wants you to sign in with your Ethereum account:`,
    params.address,
    "",
    params.statement,
    "",
    `URI: ${params.uri}`,
    `Version: ${params.version}`,
    `Chain ID: ${params.chainId}`,
    `Nonce: ${params.nonce}`,
    `Issued At: ${params.issuedAt}`,
    `Expiration Time: ${params.expirationTime}`,
  ].join("\n");
}

/**
 * Creates the X-Sign-In-With-X header value for Venice API authentication.
 * Uses SIWE (Sign-In with Ethereum) on Base chain (8453).
 *
 * @param wallet - A viem PrivateKeyAccount to sign the SIWE message
 * @returns Base64-encoded JSON string for the header value
 */
export async function createSiweHeader(
  wallet: PrivateKeyAccount
): Promise<string> {
  const now = new Date();
  const expiration = new Date(now.getTime() + SIWE_TTL_MS);

  const issuedAt = now.toISOString();
  const expirationTime = expiration.toISOString();
  const nonce = generateNonce();

  const message = formatSiweMessage({
    domain: SIWE_DOMAIN,
    address: wallet.address,
    statement: SIWE_STATEMENT,
    uri: SIWE_URI,
    version: SIWE_VERSION,
    chainId: SIWE_CHAIN_ID,
    nonce,
    issuedAt,
    expirationTime,
  });

  const signature = await wallet.signMessage({ message });

  const payload = {
    address: wallet.address,
    message,
    signature,
    timestamp: Date.now(),
    chainId: SIWE_CHAIN_ID,
  };

  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

/**
 * Balance response from Venice x402 API.
 */
export interface VeniceBalance {
  balanceUsd: number;
  canConsume: boolean;
}

/**
 * Fetches the x402 balance for a wallet address from Venice API.
 *
 * @param walletAddress - The Ethereum address to check balance for
 * @param siweHeader - The X-Sign-In-With-X header value
 * @returns Balance information including USD amount and consumption eligibility
 */
export async function getBalance(
  walletAddress: string,
  siweHeader: string
): Promise<VeniceBalance> {
  const url = `${VENICE_API_BASE}/x402/balance/${walletAddress}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-Sign-In-With-X": siweHeader,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(
      `Venice balance check failed (${response.status}): ${errorText}`
    );
  }

  const data = (await response.json()) as Record<string, unknown>;
  return {
    balanceUsd:
      typeof data.balanceUsd === "number"
        ? data.balanceUsd
        : typeof data.balance_usd === "number"
          ? data.balance_usd
          : 0,
    canConsume:
      typeof data.canConsume === "boolean"
        ? data.canConsume
        : typeof data.can_consume === "boolean"
          ? data.can_consume
          : false,
  };
}

/**
 * Creates a wallet account from a private key for Venice auth.
 */
export function createWalletFromKey(privateKey: Hex): PrivateKeyAccount {
  return privateKeyToAccount(privateKey);
}
