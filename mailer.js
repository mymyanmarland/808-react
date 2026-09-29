// Email OTP sender (Resend API). No API key → dev mode: log to console.
export async function sendOtpEmail(to, code) {
  const subject = '808 React — အကောင့်ဝင်ကုဒ် 🔑';
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2>⚛️ 808 React</h2>
      <p>မင်္ဂလာပါ! အကောင့်ဝင်ရန် (သို့) အကောင့်ဖွင့်ရန် ကုဒ်ပါ —</p>
      <div style="font-size:36px;font-weight:bold;letter-spacing:8px;text-align:center;
                  background:#f1f5f9;border-radius:12px;padding:16px;margin:16px 0">${code}</div>
      <p style="color:#64748b">ဒီကုဒ်ကို <b>၁၀ မိနစ်</b>အတွင်း သုံးပါ။ သင်တောင်းဆိုထားတာ မဟုတ်ရင် လျစ်လျူရှုလိုက်ပါ။</p>
    </div>`;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[OTP dev] to=${to} code=${code}`);
    return { ok: true, dev: true };
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.OTP_FROM || '808 React <noreply@react.kmnapps.xyz>',
      to,
      subject,
      html,
    }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    console.error('[OTP] resend failed:', r.status, t.slice(0, 200));
    return { ok: false, error: 'email_send_failed' };
  }
  return { ok: true };
}
