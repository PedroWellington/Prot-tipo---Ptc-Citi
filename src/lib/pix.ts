// BR Code estático (padrão EMV QRCPS-MPM, Manual do BR Code do Banco Central)
const tlv = (id: string, value: string) => `${id}${String(value.length).padStart(2, "0")}${value}`;

/** CRC16-CCITT-FALSE: polinômio 0x1021, valor inicial 0xFFFF. */
export function crc16(text: string): string {
  let crc = 0xffff;
  for (let i = 0; i < text.length; i++) {
    crc ^= text.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

// O padrão aceita só ASCII nesses campos
const ascii = (text: string, max: number) =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 .\-]/g, "").trim().slice(0, max);

export type PixInput = { key: string; merchantName: string; merchantCity: string; amountCents?: number; txid?: string };

export function buildPixPayload({ key, merchantName, merchantCity, amountCents, txid }: PixInput): string {
  const body = [
    tlv("00", "01"),
    tlv("26", tlv("00", "br.gov.bcb.pix") + tlv("01", key)),
    tlv("52", "0000"),
    tlv("53", "986"),
    amountCents ? tlv("54", (amountCents / 100).toFixed(2)) : "",
    tlv("58", "BR"),
    tlv("59", ascii(merchantName, 25)),
    tlv("60", ascii(merchantCity, 15)),
    tlv("62", tlv("05", txid ? txid.replace(/[^A-Za-z0-9]/g, "").slice(0, 25) : "***")),
    "6304",
  ].join("");
  return body + crc16(body);
}
