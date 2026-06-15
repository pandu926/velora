import {
  toMetaMaskSmartAccount,
  Implementation,
  getSmartAccountsEnvironment,
  type MetaMaskSmartAccount,
} from "@metamask/smart-accounts-kit";
import {
  createPublicClient,
  http,
  type Chain,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config, getChain } from "../config/index.js";

/** Re-export the smart account type for use by other services */
export type SmartAccount = MetaMaskSmartAccount<Implementation.Hybrid>;

/**
 * Creates a MetaMask Smart Account using the Hybrid implementation.
 * The Hybrid DeleGator supports both EOA signers and WebAuthn signers,
 * making it suitable for delegation workflows.
 *
 * @param privateKey - The hex-encoded private key for the account signer
 * @returns The smart account instance ready for delegation operations
 */
export async function createSmartAccount(privateKey: Hex) {
  const signer = privateKeyToAccount(privateKey);

  // Cast to generic Chain to avoid OP Stack transaction type mismatch
  // between viem versions (backend viem vs smart-accounts-kit internal viem)
  const publicClient: PublicClient = createPublicClient({
    chain: getChain() as Chain,
    transport: http(config.rpcUrl),
  });

  const environment = getSmartAccountsEnvironment(config.chainId);

  const smartAccount = await toMetaMaskSmartAccount({
    client: publicClient,
    implementation: Implementation.Hybrid,
    deployParams: [signer.address, [], [], []],
    deploySalt: "0x0" as Hex,
    signer: { account: signer },
    environment,
  });

  return smartAccount;
}
