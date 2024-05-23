import { Connection, PublicKey } from "@solana/web3.js";

export function formatMintAmount(amount: number, decimals: number) {
  const multiplier = Math.pow(10, decimals);
  const formattedAmount = (amount / multiplier).toFixed(decimals);
  return formattedAmount;
}

export async function getMintDecimals(
  connection: Connection,
  mintAdddr: PublicKey
) {
  const tokenSupply = await connection.getTokenSupply(mintAdddr, "confirmed");
  const decimals = tokenSupply.value.decimals;
  console.log(mintAdddr.toString(), "decimals", decimals);
  return decimals;
}
