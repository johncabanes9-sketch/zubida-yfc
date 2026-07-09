import QRCode from "qrcode";

export async function generateQrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    width: 320,
    margin: 1,
    color: { dark: "#12224E", light: "#ffffff" },
  });
}

export function statusUrl(base: string, registrationId: string, token: string) {
  return `${base}/registration-status?id=${encodeURIComponent(registrationId)}&t=${encodeURIComponent(token)}`;
}
