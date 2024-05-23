import { Connection, PublicKey } from "@solana/web3.js";

export async function getATABalance(connection: Connection, ata: PublicKey) {
  const tokenAccountInfo = await connection.getTokenAccountBalance(
    ata,
    "confirmed"
  );

  if (tokenAccountInfo.value === null) {
    throw new Error("No token account found at address");
  }

  const balance = tokenAccountInfo.value.amount;
  const num = Number(balance);
  if (isNaN(num))
    throw new Error("Invalid balance: " + JSON.stringify(tokenAccountInfo));
  console.log({ balance: num });
  return num;
}
