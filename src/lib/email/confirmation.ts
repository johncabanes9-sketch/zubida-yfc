export function confirmationHtml(p: {
  fullName: string;
  eventName: string;
  registrationId: string;
  qrDataUrl: string;
  statusUrl: string;
}) {
  return `<!doctype html><html><body style="margin:0;font-family:Segoe UI,Helvetica,Arial,sans-serif;background:#FBF8F1;padding:24px">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #eee">
      <div style="background:linear-gradient(135deg,#1E40AF,#2A54C4 60%,#E09E1F);padding:28px 28px 22px;color:#fff">
        <p style="margin:0;letter-spacing:.16em;text-transform:uppercase;font-size:11px;color:#FCD980">Zubida YFC</p>
        <h1 style="margin:6px 0 0;font-size:22px">You're registered, ${escapeHtml(p.fullName)}!</h1>
      </div>
      <div style="padding:26px 28px">
        <p style="color:#333;font-size:15px;line-height:1.5">Your slot for <strong>${escapeHtml(p.eventName)}</strong> is reserved and now <strong>pending approval</strong>. Show this QR code at the venue as your event pass.</p>
        <div style="text-align:center;margin:22px 0">
          <img src="${p.qrDataUrl}" width="200" height="200" alt="Registration QR code" style="border-radius:12px"/>
        </div>
        <p style="text-align:center;margin:0;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:.1em">Registration ID</p>
        <p style="text-align:center;margin:4px 0 20px;color:#1E40AF;font-size:20px;font-weight:700;letter-spacing:.04em">${escapeHtml(p.registrationId)}</p>
        <div style="text-align:center">
          <a href="${p.statusUrl}" style="display:inline-block;background:#F5B942;color:#12224E;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px">Check your status</a>
        </div>
      </div>
      <div style="padding:18px 28px;border-top:1px solid #f0f0f0;color:#aaa;font-size:12px;text-align:center">
        One Province. One Mission. One Christ.
      </div>
    </div></body></html>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
