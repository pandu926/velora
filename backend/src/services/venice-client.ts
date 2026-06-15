import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import type { Hex } from "viem";
import { config } from "../config/index.js";
import { createSiweHeader } from "./venice-auth.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
}

export interface ChatUsage {
  prompt_tokens: number;
  completion_tokens: number;
}

export interface ChatResponse {
  content: string;
  usage: ChatUsage;
}

export interface VeniceModel {
  id: string;
  type?: string;
}

/**
 * VeniceClient — wallet-native client for the Venice AI API.
 *
 * Authenticates with Venice's x402 flow using SIWE on Base (chain 8453):
 * a fresh signed Sign-In-With-Ethereum header is generated per request from
 * the agent wallet (no API key needed, paid in USDC via x402). Falls back to
 * a Bearer API key if VENICE_API_KEY is configured.
 *
 * Venice is the system's final decision-maker (the Commander judge and the
 * Evidence Court judge both run on Venice), keeping it central to the app.
 */
export class VeniceClient {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly apiKey: string;
  private readonly wallet: PrivateKeyAccount | null;

  constructor(privateKey?: string) {
    this.baseUrl = config.veniceApiUrl.replace(/\/$/, "");
    this.model = config.veniceModel;
    this.apiKey = process.env.VENICE_API_KEY ?? "";

    const key = (privateKey ?? config.venicePrivateKey) as Hex | "";
    this.wallet = key ? privateKeyToAccount(key) : null;
  }

  /**
   * Builds auth headers: Bearer API key if present, else a fresh SIWE header
   * signed by the agent wallet (x402 wallet-native auth).
   */
  private async authHeaders(): Promise<Record<string, string>> {
    if (this.apiKey) {
      return { Authorization: `Bearer ${this.apiKey}` };
    }
    if (this.wallet) {
      const siwe = await createSiweHeader(this.wallet);
      return { "X-Sign-In-With-X": siwe };
    }
    throw new Error(
      "Venice auth not configured: set VENICE_API_KEY or VENICE_PRIVATE_KEY"
    );
  }

  /**
   * Send a chat completion request to Venice (OpenAI-compatible endpoint).
   */
  async chat(
    messages: ChatMessage[],
    options?: ChatOptions
  ): Promise<ChatResponse> {
    const body = {
      model: options?.model ?? this.model,
      messages,
      temperature: options?.temperature ?? 0.7,
      stream: false,
    };

    const auth = await this.authHeaders();
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        ...auth,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(
        `Venice chat request failed (${response.status}): ${errorText}`
      );
    }

    const data = (await response.json()) as Record<string, unknown>;

    const choices = data.choices as
      | Array<{ message?: { content?: string } }>
      | undefined;
    const content = choices?.[0]?.message?.content ?? "";

    const usage = data.usage as Record<string, unknown> | undefined;
    const promptTokens =
      typeof usage?.prompt_tokens === "number" ? usage.prompt_tokens : 0;
    const completionTokens =
      typeof usage?.completion_tokens === "number"
        ? usage.completion_tokens
        : 0;

    return {
      content,
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
      },
    };
  }

  /**
   * Lists available Venice models (second distinct Venice endpoint).
   * Used to demonstrate Venice-native behavior — e.g. selecting the best model
   * for the asset class being judged.
   */
  async listModels(): Promise<VeniceModel[]> {
    const auth = await this.authHeaders();
    const response = await fetch(`${this.baseUrl}/models`, {
      method: "GET",
      headers: { ...auth, "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(
        `Venice models request failed (${response.status}): ${errorText}`
      );
    }

    const data = (await response.json()) as { data?: VeniceModel[] };
    return data.data ?? [];
  }

  /** The agent wallet address used for Venice x402 auth. */
  get address(): string {
    return this.wallet?.address ?? "0x0000000000000000000000000000000000000000";
  }
}
