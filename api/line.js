export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const ACCESS_TOKEN = 'lf2LNqitEO8q2YFSMTdf04Z+0dVmRedSW6Kk+I32M2Oevh8peZ2PS++vcHqzXzSvl66Zjg4Oy6wF6KLIpcFtZbSdIUzysZiMTk3Gyf2pXZ7P2gooeLzJWNyUQIEN2AauG4JvMid7RfN73YJNWqzSvgdB04t89/1O/w1cDnyilFU=';
  const GROUP_ID    = 'Cccff0e697e44e824874162bffd332fc2';
  const FIREBASE_URL = 'https://firestore.googleapis.com/v1/projects/food-court-orders/databases/(default)/documents/orders';
  const FIREBASE_API_KEY = 'AIzaSyDMZ_9LER29KpuL7d0NsSjbxKWeR_c_aCQ';

  // 發送 LINE 訊息
  async function sendToGroup(messages) {
    await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + ACCESS_TOKEN,
      },
      body: JSON.stringify({ to: GROUP_ID, messages }),
    });
  }

  // 取得 LINE 使用者名稱
  async function getDisplayName(groupId, userId) {
    try {
      const r = await fetch(`https://api.line.me/v2/bot/group/${groupId}/member/${userId}`, {
        headers: { 'Authorization': 'Bearer ' + ACCESS_TOKEN }
      });
      const d = await r.json();
      return d.displayName || '外送員';
    } catch(e) { return '外送員'; }
  }

  // 更新 Firestore 訂單（用 REST API，不需要 Admin SDK）
  async function getOrder(orderId) {
    const r = await fetch(`${FIREBASE_URL}/${orderId}?key=${FIREBASE_API_KEY}`);
    return await r.json();
  }

  async function updateOrder(orderId, fields) {
    const body = { fields: {} };
    for (const [k, v] of Object.entries(fields)) {
      body.fields[k] = { stringValue: v };
    }
    const updateMask = Object.keys(fields).map(k => `updateMask.fieldPaths=${k}`).join('&');
    await fetch(`${FIREBASE_URL}/${orderId}?key=${FIREBASE_API_KEY}&${updateMask}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  // 建立 Flex Message 訂單卡片
  function buildFlex(order) {
    const rows = [
      { label: '店家',     value: order.shop },
      order.customer    ? { label: '顧客',     value: order.customer } : null,
      order.pickupNumber ? { label: '取餐號碼', value: order.pickupNumber } : null,
      { label: '品項',     value: order.items },
      { label: '地址',     value: order.address },
      order.distance     ? { label: '距離',     value: `約 ${order.distance} 公里` } : null,
      order.deliveryTime ? { label: '送達時間', value: order.deliveryTime } : null,
      order.amount       ? { label: '訂單金額', value: `$${order.amount}` } : null,
      order.deliveryFee  ? { label: '外送費',   value: `$${order.deliveryFee}` } : null,
      order.note         ? { label: '備註',     value: order.note } : null,
    ].filter(Boolean);

    return {
      type: 'flex',
      altText: `🛵 新訂單 ${order.shop}${order.pickupNumber ? '-' + order.pickupNumber : ''} — Mula Kitchens`,
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#06C755',
          paddingAll: '16px',
          contents: [
            { type: 'text', text: `🛵 ${order.shop}${order.pickupNumber ? ' #' + order.pickupNumber : ''}`, color: '#ffffff', weight: 'bold', size: 'lg', wrap: true },
            { type: 'text', text: 'Mula Kitchens 外送派單系統', color: '#ccffdd', size: 'xs', margin: 'xs' },
          ],
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          paddingAll: '16px',
          contents: rows.map(r => ({
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: r.label, color: '#888888', size: 'sm', flex: 3, gravity: 'top' },
              { type: 'text', text: r.value, color: '#1a1a18', size: 'sm', flex: 7, wrap: true, weight: 'bold' },
            ],
          })),
        },
        footer: {
          type: 'box',
          layout: 'horizontal',
          spacing: 'sm',
          paddingAll: '12px',
          contents: [
            {
              type: 'button',
              style: 'primary',
              color: '#06C755',
              height: 'sm',
              action: {
                type: 'postback',
                label: '✋ 接單',
                data: `action=accept&orderId=${order.id}`,
              },
            },
            {
              type: 'button',
              style: 'secondary',
              height: 'sm',
              action: {
                type: 'postback',
                label: '略過',
                data: `action=skip&orderId=${order.id}`,
              },
            },
          ],
        },
      },
    };
  }

  const body = req.body;

  // ── LINE Webhook 事件（外送員按按鈕）──
  if (body?.events) {
    for (const event of body.events) {
      if (event.source?.type === 'group') {
        console.log('群組 ID：', event.source.groupId);
      }

      if (event.type === 'postback') {
        const params  = new URLSearchParams(event.postback.data);
        const action  = params.get('action');
        const orderId = params.get('orderId');

        if (action === 'accept' && orderId) {
          const driverName = await getDisplayName(event.source.groupId, event.source.userId);
          try {
            const doc = await getOrder(orderId);
            const currentStatus = doc.fields?.status?.stringValue;
            const shop = doc.fields?.shop?.stringValue || '';
            const pickupNumber = doc.fields?.pickupNumber?.stringValue || '';
            const shortId = orderId.slice(-6).toUpperCase();

            if (currentStatus === 'pending') {
              await updateOrder(orderId, { status: 'accepted', driver: driverName });

              // 廣播接單成功（含棄單按鈕）
              await sendToGroup([{
                type: 'flex',
                altText: `✅ ${driverName} 已接單 — ${shop}${pickupNumber ? ' #' + pickupNumber : ''}`,
                contents: {
                  type: 'bubble',
                  header: {
                    type: 'box',
                    layout: 'vertical',
                    backgroundColor: '#1a1a18',
                    paddingAll: '14px',
                    contents: [
                      { type: 'text', text: `✅ ${driverName} 已接單`, color: '#ffffff', weight: 'bold', size: 'md' },
                      { type: 'text', text: `${shop}${pickupNumber ? ' #' + pickupNumber : ''} — #${shortId}`, color: '#aaaaaa', size: 'xs', margin: 'xs' },
                    ],
                  },
                  body: {
                    type: 'box',
                    layout: 'vertical',
                    paddingAll: '14px',
                    contents: [
                      { type: 'text', text: '請其他外送員勿重複接單', color: '#888888', size: 'sm', wrap: true },
                    ],
                  },
                  footer: {
                    type: 'box',
                    layout: 'horizontal',
                    paddingAll: '12px',
                    contents: [
                      {
                        type: 'button',
                        style: 'secondary',
                        height: 'sm',
                        action: {
                          type: 'postback',
                          label: '棄單',
                          data: `action=drop&orderId=${orderId}&driverName=${encodeURIComponent(driverName)}`,
                        },
                      },
                    ],
                  },
                },
              }]);
            } else {
              const takenBy = doc.fields?.driver?.stringValue || '其他外送員';
              await sendToGroup([{
                type: 'text',
                text: `⚠️ 此訂單已由 ${takenBy} 接單，${driverName} 請等待下一張訂單。`,
              }]);
            }
          } catch(e) {
            console.error('處理接單失敗：', e.message);
          }
        }

        // 外送員按「棄單」
        if (action === 'drop' && orderId) {
          const driverName = decodeURIComponent(params.get('driverName') || '外送員');
          try {
            const doc = await getOrder(orderId);
            const currentStatus = doc.fields?.status?.stringValue;
            const shop = doc.fields?.shop?.stringValue || '';
            const pickupNumber = doc.fields?.pickupNumber?.stringValue || '';

            if (currentStatus === 'accepted') {
              // 回到待接單
              await updateOrder(orderId, { status: 'pending', driver: '' });

              // 取得完整訂單資料重新發派單通知
              const order = {
                id: orderId,
                shortId: orderId.slice(-6).toUpperCase(),
                shop,
                pickupNumber,
                items:        doc.fields?.items?.stringValue || '',
                address:      doc.fields?.address?.stringValue || '',
                distance:     doc.fields?.distance?.stringValue || '',
                deliveryTime: doc.fields?.deliveryTime?.stringValue || '',
                amount:       doc.fields?.amount?.stringValue || '',
                deliveryFee:  doc.fields?.deliveryFee?.stringValue || '',
                note:         doc.fields?.note?.stringValue || '',
                customer:     doc.fields?.customer?.stringValue || '',
              };

              // 先廣播棄單訊息
              await sendToGroup([{
                type: 'text',
                text: `🔄 ${driverName} 已棄單
${shop}${pickupNumber ? ' #' + pickupNumber : ''} 重新開放接單`,
              }]);

              // 重新發派單 Flex Message
              await sendToGroup([buildFlex(order)]);
            }
          } catch(e) {
            console.error('處理棄單失敗：', e.message);
          }
        }
      }
    }
    return res.status(200).json({ status: 'ok' });
  }

  // ── 來自網頁的發單請求 ──
  if (body?.order) {
    const flex = buildFlex(body.order);
    try {
      await sendToGroup([flex]);
      return res.status(200).json({ success: true });
    } catch(e) {
      return res.status(200).json({ error: e.message });
    }
  }

  // ── 舊的純文字發訊息（向下相容）──
  if (body?.message) {
    try {
      await sendToGroup([{ type: 'text', text: body.message }]);
      return res.status(200).json({ success: true });
    } catch(e) {
      return res.status(200).json({ error: e.message });
    }
  }

  return res.status(200).json({ status: 'ok' });
}
