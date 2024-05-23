import * as dotenv from "dotenv";
import * as bs58 from "bs58";
import { Wallet } from "@coral-xyz/anchor";
import { createJupiterApiClient } from "@jup-ag/api";
import {
  Connection,
  Keypair,
  VersionedTransaction,
  PublicKey,
  Signer,
} from "@solana/web3.js";
import {
  Account,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import { getQuote, getSwapResult } from "./sol/exchange.ts";
import { loadWalletKey } from "./sol/kp.ts";
import { getMintDecimals } from "./sol/mint.ts";
import { getATABalance } from "./sol/ata.ts";
import { retry, retryDecorator } from "ts-retry-promise";

dotenv.config();

import { JSONFilePreset } from "lowdb/node";
import { baseRetryConfig } from "./config/retry.ts";

interface TxnData {
  lastTxnType: "buy" | "sell";
  lastQuotePrice: number;
}
interface DbData {
  txns: TxnData[];
}

const WSOL_addy = "So11111111111111111111111111111111111111112";
const USDC_addy = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDC_decimals = 10 ** 6;
const WSOL_decimals = 10 ** 9;

const BASE_MINT = process.env.BASE_MINT;
const QUOTE_MINT = process.env.QUOTE_MINT || WSOL_addy;
if (!BASE_MINT) {
  throw new Error("Base Mint missing");
}

const baseMintPkey = new PublicKey(BASE_MINT);
const quoteMintPkey = new PublicKey(QUOTE_MINT);

const SOLANA_RPC = process.env.SOLANA_RPC;

if (!SOLANA_RPC) {
  throw new Error("SOLANA_RPC missing");
}

const walletKp = loadWalletKey("./kp.json");
const wallet = new Wallet(walletKp);

const connection = new Connection(SOLANA_RPC, "finalized");

const _getOrCreateATA = async (
  connection: Connection,
  mint: PublicKey,
  owner: PublicKey,
  payer: Signer
) => {
  const ata = await getAssociatedTokenAddress(
    mint,
    owner,
    false,
    undefined,
    undefined
  );
  return ata;
};

const main = async () => {
  const dbLoc = `./db/${BASE_MINT}:${QUOTE_MINT}.json`;
  const db = await JSONFilePreset<DbData>(dbLoc, { txns: [] });

  await db.read();
  const BASE_DECIMALS = 10 ** (await getMintDecimals(connection, baseMintPkey));
  const QUOTE_DECIMALS =
    10 ** (await getMintDecimals(connection, quoteMintPkey));
  const BASE_AMOUNT = process.env.BASE_AMOUNT;
  const QUOTE_AMOUNT = process.env.QUOTE_AMOUNT;

  const walletQuoteATA = await retry<Account>(
    () =>
      getOrCreateAssociatedTokenAccount(
        connection,
        walletKp,
        quoteMintPkey,
        wallet.publicKey,
        false,
        "finalized"
      ),
    baseRetryConfig
  );
  console.log({ walletQuoteATA });
  const walletBaseATA = await retry<Account>(
    () =>
      getOrCreateAssociatedTokenAccount(
        connection,
        walletKp,
        baseMintPkey,
        wallet.publicKey,
        false,
        "finalized"
      ),
    baseRetryConfig
  );
  console.log({ walletBaseATA });

  // const baseBalance = await getATABalance(connection, walletBaseATA.address);
  // const quoteBalance = await getATABalance(connection, walletQuoteATA.address);

  // const baseAmount = BASE_DECIMALS * Number(BASE_AMOUNT);
  // const quoteAmount = QUOTE_DECIMALS * Number(QUOTE_AMOUNT);
  const jupiterQuoteApi = createJupiterApiClient();

  let volume = 0;

  let previousBasePrice: number | null = null;
  let previousQuotePrice: number | null = null;

  const sellBase = async (baseAmount: number) => {
    try {
      const quote = await getQuote(jupiterQuoteApi)(
        BASE_MINT,
        QUOTE_MINT,
        baseAmount
      );
      if (!quote) {
        throw new Error("No quote found");
      }
      const currentQuotePrice =
        Number(quote?.outAmount) || 0 / Number(quote?.inAmount) || 1;
      if (!currentQuotePrice) {
        throw new Error("QuotePrice error, quote: " + JSON.stringify(quote));
      }
      if (
        previousQuotePrice === null ||
        currentQuotePrice > previousQuotePrice
      ) {
        console.log(
          `Swapping ${baseAmount / BASE_DECIMALS} Base Asset for ${
            Number(quote!.outAmount) / QUOTE_DECIMALS
          } Quote Asset`
        );
        if (quote) {
          const swapResult = await getSwapResult(jupiterQuoteApi)(
            wallet.publicKey,
            quote
          );
          if (swapResult) {
            const swapTransactionBuf = Buffer.from(
              swapResult.swapTransaction,
              "base64"
            );
            const transaction =
              VersionedTransaction.deserialize(swapTransactionBuf);
            transaction.sign([wallet.payer]);
            const rawTransaction = transaction.serialize();
            const txid = await connection.sendRawTransaction(rawTransaction, {
              skipPreflight: true,
              maxRetries: 20,
            });
            await connection.confirmTransaction(txid);
            console.log(`Swap success: https://solscan.io/tx/${txid}`);
            volume += parseFloat(BASE_AMOUNT!) * 100;
            previousQuotePrice = currentQuotePrice;
          }
        }
      } else {
        console.log("Price has not increased, not selling");
      }
    } catch (err) {
      console.log(err);
    }
  };

  const buyBase = async (quoteBalance: number) => {
    try {
      const quote = await getQuote(jupiterQuoteApi)(
        QUOTE_MINT,
        BASE_MINT,
        quoteBalance * QUOTE_DECIMALS
      );
      if (!quote) {
        throw new Error("No quote found");
      }
      const currentBasePrice =
        Number(quote?.outAmount) || 0 / Number(quote?.inAmount) || 1;
      if (!currentBasePrice) {
        throw new Error("QuotePrice error, quote: " + JSON.stringify(quote));
      }

      if (previousBasePrice === null || currentBasePrice < previousBasePrice) {
        console.log(
          `Swapping ${quoteBalance} Quote Asset for ${
            Number(quote!.outAmount) / BASE_DECIMALS
          } Base Asset`
        );
        if (quote) {
          const swapResult = await getSwapResult(jupiterQuoteApi)(
            wallet.publicKey,
            quote
          );
          if (swapResult) {
            const swapTransactionBuf = Buffer.from(
              swapResult.swapTransaction,
              "base64"
            );
            const transaction =
              VersionedTransaction.deserialize(swapTransactionBuf);
            transaction.sign([wallet.payer]);
            const rawTransaction = transaction.serialize();
            const txid = await connection.sendRawTransaction(rawTransaction, {
              skipPreflight: true,
              maxRetries: 20,
            });
            await connection.confirmTransaction(txid);
            console.log(`Swap success: https://solscan.io/tx/${txid}`);
            volume += parseFloat(quoteBalance.toString());
            previousBasePrice = currentBasePrice;
          }
        }
      } else {
        console.log("Price has not decreased, not buying");
      }
    } catch (err) {
      console.log(err);
    }
  };

  while (true) {
    try {
      const currQuoteBalance = await getATABalance(
        connection,
        walletQuoteATA.address
      );
      console.log(`Quote Asset balance: ${currQuoteBalance / QUOTE_DECIMALS}`);

      const currBaseBalance = await getATABalance(
        connection,
        walletBaseATA.address
      );
      console.log(`Base Asset balance: ${currBaseBalance / BASE_DECIMALS}`);

      const USDC_quote = await getQuote(jupiterQuoteApi)(
        BASE_MINT,
        USDC_addy,
        1 * USDC_decimals
      );
      const currBaseUSDCPrice = USDC_quote?.outAmount;
      console.log("curr base price: $", currBaseUSDCPrice);
      // await buyBase(currQuoteBalance);
      // await sellBase(currBaseBalance);
      console.log("Waiting 10s before next swap...");
      await sleep(10000);
    } catch (err) {
      console.log(err);
    }
  }
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

main();
