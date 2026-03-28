export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // LINE Verify 和 Webhook 事件都用 POST
  if (req.method === 'POST') {
    const body = req.body;

    // 如果是 Webhook 事件（有 events 陣列）
    if (body && body.events) {
      body.events.forEach(event => {
        // 印出群組 ID（之後在 Vercel Logs 裡看）
        if (event.source && event.source.type === 'group') {
          console.log('群組 ID：', event.source.groupId);
        }
        console.log('收到事件：', JSON.stringify(event));
      });
      return res.status(200).json({ status: 'ok' });
    }

    // 如果是發送訊息的請求（從我們網頁呼叫）
    const ACCESS_TOKEN = 'lf2LNqitEO8q2YFSMTdf04Z+0dVmRedSW6Kk+I32M2Oevh8peZ2PS++vcHqzXzSvl66Zjg4Oy6wF6KLIpcFtZbSdIUzysZiMTk3Gyf2pXZ7P2gooeLzJWNyUQIEN2AauG4JvMid7RfN73YJNWqzSvgdB04t89/1O/w1cDnyilFU=';
    const { message, groupId } = body || {};

    if (!message) {
      return res.status(200).json({ status: 'ok' });
    }

    const url = groupId
      ? 'https://api.line.me/v2/bot/message/push'
      : 'https://api.line.me/v2/bot/message/broadcast';

    const lineBody = groupId
      ? { to: groupId, messages: [{ type: 'text', text: message }] }
      : { messages: [{ type: 'text', text: message }] };

    try {
      const lineRes = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + ACCESS_TOKEN,
        },
        body: JSON.stringify(lineBody),
      });

      const data = await lineRes.json().catch(() => ({}));

      if (lineRes.ok) {
        return res.status(200).json({ success: true });
      } else {
        return res.status(200).json({ error: data.message || '發送失敗' });
      }
    } catch (e) {
      return res.status(200).json({ error: e.message });
    }
  }

  return res.status(200).end();
}
