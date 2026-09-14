import { encodeFunctionData, type Abi, type Address, type Hex, type LocalAccount } from "viem";
import { attendanceEscrowAbi } from "@/lib/abi";
import { ESCROW_ADDRESS, publicClient, walletClientFor } from "@/lib/chain";
import { walletSendTransaction, type Eip1193 } from "@/lib/wallet";

/// Unifies the two ways in which someone can take part.
///
/// The contract separates the registered address from the key that signs rotating codes, and that
/// separation is what makes the fallback possible at all:
///
///   passkey path — the derived key *is* the participant. It holds the deposit and submits its own
///                  transactions, so nothing prompts after setup.
///   wallet path  — the wallet is the participant and the derived key is only the code signer. The
///                  wallet must confirm each transaction, which is worse, which is why it is the
///                  fallback and not the default.
///   privy path   — mechanically the wallet path, since Privy's embedded wallet is an EIP-1193
///                  provider like any other. It is named separately only so the interface can say
///                  which one someone is on.
export type Signer = {
  kind: "passkey" | "wallet" | "privy";
  /// The registered participant: pays the deposit, submits attestations, receives the payout.
  address: Address;
  /// What to call this account when showing it to its owner. An email address on the email path:
  /// somebody who signed in with an email has no idea which 0x… belongs to them, and "signed in as
  /// 0x7497…a80d" is not something they can check against anything they know.
  label?: string;
  /// Signs the rotating attendance codes. Never prompts.
  attest: LocalAccount;
  /// True when every write pops a confirmation dialog.
  prompts: boolean;
  /// Defaults to the escrow and its ABI. `to`/`abi` override that — the event directory is a
  /// second contract, and routing it through here keeps one code path for "sign and send",
  /// whichever of the three identity kinds is behind it.
  write: (args: {
    functionName: string;
    args: readonly unknown[];
    value?: bigint;
    gas?: bigint;
    to?: Address;
    abi?: Abi;
  }) => Promise<Hex>;
};

export function passkeySigner(account: LocalAccount): Signer {
  return {
    kind: "passkey",
    address: account.address,
    attest: account,
    prompts: false,
    write: async ({ functionName, args, value, gas, to, abi }) => {
      const { request } = await publicClient.simulateContract({
        address: to ?? ESCROW_ADDRESS,
        abi: abi ?? attendanceEscrowAbi,
        functionName,
        args,
        account,
        value,
        gas,
      } as never);
      return walletClientFor(account).writeContract(request as never);
    },
  };
}

export function walletSigner(
  owner: Address,
  attest: LocalAccount,
  opts?: { provider?: Eip1193 | null; kind?: "wallet" | "privy"; label?: string },
): Signer {
  return {
    kind: opts?.kind ?? "wallet",
    address: owner,
    label: opts?.label,
    attest,
    prompts: true,
    write: async ({ functionName, args, value, gas, to, abi }) => {
      // An email account has exactly one way to send a transaction, and it is this provider. Left
      // to fall through, walletSendTransaction reaches for window.ethereum instead — a different
      // wallet, or none — and the failure arrives as "your wallet has not authorised this site",
      // which is true of a wallet the person never chose and never knew was involved.
      if (opts?.kind === "privy" && !opts.provider) {
        throw new Error("This email session lost its connection. Reload the page to restore it.");
      }
      const target = to ?? ESCROW_ADDRESS;
      const useAbi = (abi ?? attendanceEscrowAbi) as Abi;
      // Simulate against the wallet address so a revert is caught before the user is asked to
      // confirm anything. Monad bills gas on the limit, so a doomed write is not free either.
      await publicClient.simulateContract({
        address: target,
        abi: useAbi,
        functionName,
        args,
        account: owner,
        value,
        gas,
      } as never);
      return walletSendTransaction(
        {
          from: owner,
          to: target,
          data: encodeFunctionData({ abi: useAbi, functionName, args: args as unknown[] }),
          value,
          gas,
        },
        opts?.provider,
      );
    },
  };
}
