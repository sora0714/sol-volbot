import { QuoteResponse, DefaultApi as JUPApi } from "@jup-ag/api";
import { PublicKey } from "@solana/web3.js";

export const getQuote =
  (jupiterQuoteApi: JUPApi) =>
  async (tokenIn: string, tokenOut: string, amount: number) => {
    try {
      const quote = await jupiterQuoteApi.quoteGet({
        inputMint: tokenIn,
        outputMint: tokenOut,
        amount: amount,
        slippageBps: 30,
        onlyDirectRoutes: false,
        asLegacyTransaction: false,
      });
      return quote;
    } catch (err) {
      console.log(err);
    }
  };
export const getSwapResult =
  (jupiterQuoteApi: JUPApi) =>
  async (userPublicKey: PublicKey, quote: QuoteResponse) => {
    try {
      const swapResult = await jupiterQuoteApi.swapPost({
        swapRequest: {
          userPublicKey: userPublicKey.toBase58(),
          quoteResponse: quote,
          dynamicComputeUnitLimit: true,
        },
      });
      return swapResult;
    } catch (err) {
      console.log(err);
    }
  };
