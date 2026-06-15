import "dotenv/config";
import { base, baseSepolia } from "viem/chains";
import type { Chain } from "viem";

export const config = {
  privateKey: process.env.PRIVATE_KEY ?? "",
  rpcUrl: process.env.RPC_URL ?? "https://mainnet.base.org",
  chainId: Number(process.env.CHAIN_ID ?? "8453"),
  oneshotRelayerUrl:
    process.env.ONESHOT_RELAYER_URL ??
    "https://relayer.1shotapi.com/relayers",
  oneshotApiKey: process.env.ONESHOT_API_KEY ?? "",
  /** Public base URL the relayer can POST status webhooks to (e.g. https://velora.rbexp.com). */
  webhookBaseUrl: process.env.WEBHOOK_BASE_URL ?? "",
  port: Number(process.env.PORT ?? "8923"),

  // Venice AI (wallet-native auth via SIWE on Base)
  venicePrivateKey: process.env.VENICE_PRIVATE_KEY ?? "",
  veniceApiUrl:
    process.env.VENICE_API_URL ?? "https://api.venice.ai/api/v1",
  veniceModel: process.env.VENICE_MODEL ?? "zai-org-glm-5-1",

  // Venice AI inference (OpenAI-compatible endpoint for agents)
  veniceApiKey:
    process.env.VENICE_API_KEY ?? "sk-cd116f6df30bdd1a-eg4alz-416038a4",
  veniceBaseUrl:
    process.env.VENICE_BASE_URL ?? "https://wkwkwk.denkhultech.com/v1",
  veniceInferenceModel: process.env.VENICE_INFERENCE_MODEL ?? "cx/gpt-5.5",
} as const;

/** Resolve the active viem chain from the configured chainId (single source of truth). */
export function getChain(): Chain {
  switch (config.chainId) {
    case base.id:
      return base;
    case baseSepolia.id:
      return baseSepolia;
    default:
      throw new Error(
        `Unsupported chainId ${config.chainId}. Use 8453 (Base mainnet) or 84532 (Base Sepolia).`
      );
  }
}

export function validateConfig(): void {
  const required: Array<keyof typeof config> = ["privateKey", "rpcUrl"];
  const missing = required.filter((key) => !config[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. Check .env.example for reference.`
    );
  }
}
