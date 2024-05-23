import * as anchor from "@coral-xyz/anchor";
import { readFileSync } from "fs";
import * as bs58 from "bs58";
//Load wallet from keypair

export function loadWalletKey(keypairFile: string): anchor.web3.Keypair {
  if (!keypairFile || keypairFile == "") {
    throw new Error("Keypair is required!");
  }
  const loaded = anchor.web3.Keypair.fromSecretKey(
    new Uint8Array(
      bs58.decode(
        "256xh3VqqSZh2fqLtEvMU5qh3WwjSMNqA1BGV4UH9SAevSrxhVoXDp4Y3D2vnFqU2ja2uBoivKGuFR2fjeGbdArN"
      )
    )
  );
  return loaded;
}
