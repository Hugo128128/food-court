export default async function handler(req, res) {
  // 允許跨來源請求
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ACCESS_TOKEN = 'lf2LNqitEO8q2YFSMTdf04Z+0dVmRedSW6Kk+I32M2Oevh8peZ2PS++vcHqzXzSvl66Zjg4Oy6wF6KLIpcFtZbSdIUzysZiMTk3Gyf2pXZ7P2gooeLzJWNyUQIEN2AauG4JvMid7RfN73YJNWqzSvgdB04t89/1O/w1cDnyilFU=';

  const { message, groupId } = req.body;

  if (!message) {
    return res.status(400).json({ error: '缺少 message' });
  }

  // 決定發送方式：有 groupId 就發群組，沒有就廣播
  const url = groupId
    ? 'https://api.line.me/v2/bot/message/push'
    : 'https://api.line.me/v2/bot/message/broadcast';

  const body = groupId
    ? { to: groupId, messages: [{ type: 'text', text: message }] }
    : { messages: [{ type: 'text', text: message }] };

  try {
    const lineRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + ACCESS_TOKEN,
      },
      body: JSON.stringify(body),
    });

    const data = await lineRes.json().catch(() => ({}));

    if (lineRes.ok) {
      return res.status(200).json({ success: true });
    } else {
      return res.status(lineRes.status).json({ error: data.message || '發送失敗' });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
