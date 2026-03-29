export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const ACCESS_TOKEN = 'lf2LNqitEO8q2YFSMTdf04Z+0dVmRedSW6Kk+I32M2Oevh8peZ2PS++vcHqzXzSvl66Zjg4Oy6wF6KLIpcFtZbSdIUzysZiMTk3Gyf2pXZ7P2gooeLzJWNyUQIEN2AauG4JvMid7RfN73YJNWqzSvgdB04t89/1O/w1cDnyilFU=';
  const GROUP_ID     = 'Cccff0e697e44e824874162bffd332fc2';
  const FIREBASE_URL = 'https://firestore.googleapis.com/v1/projects/food-court-orders/databases/(default)/documents/orders';
  const FIREBASE_API_KEY = 'AIzaSyDMZ_9LER29KpuL7d0NsSjbxKWeR_c_aCQ';
  const ORIGIN_ADDRESS = encodeURIComponent('臺中市西屯區國安一路128號');

  async function sendToGroup(messages) {
    await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + ACCESS_TOKEN },
      body: JSON.stringify({ to: GROUP_ID, messages }),
    });
  }

  async function getDisplayName(groupId, userId) {
    try {
      const r = await fetch(`https://api.line.me/v2/bot/group/${groupId}/member/${userId}`, {
        headers: { 'Authorization': 'Bearer ' + ACCESS_TOKEN }
      });
      const d = await r.json();
      return d.displayName || '外送員';
    } catch(e) { return '外送員'; }
  }

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

  // 派單卡片（待接單狀態）
  function buildPendingFlex(order) {
    // 店家＋顧客＋取餐號碼合一行
    const shopLine = [order.shop, order.customer, order.pickupNumber ? '#'+order.pickupNumber : ''].filter(Boolean).join('  ');
    // 金額合一行
    const amountLine = [order.amount ? '訂單 $'+order.amount : '', order.deliveryFee ? '外送費 $'+order.deliveryFee : ''].filter(Boolean).join('　');
    const rows = [
      { label: '取餐',     value: shopLine },
      { label: '品項',     value: order.items },
      { label: '地址',     value: order.address },
      order.distance     ? { label: '距離',   value: `約 ${order.distance} 公里` } : null,
      order.deliveryTime ? { label: '時間',   value: order.deliveryTime } : null,
      amountLine         ? { label: '費用',   value: amountLine } : null,
      order.note         ? { label: '備註',   value: order.note } : null,
      order.orderOpts    ? { label: '特殊',   value: order.orderOpts } : null,
      order.cashPayment==='是' ? { label: '付款', value: '💵 需收現金' } : null,
    ].filter(Boolean);

    const mapsUrl = `https://www.google.com/maps/dir/${ORIGIN_ADDRESS}/${encodeURIComponent(order.address)}`;

    return {
      type: 'flex',
      altText: `🛵 新訂單 ${order.shop}${order.pickupNumber ? ' #' + order.pickupNumber : ''} — Mula Kitchens`,
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
                type: 'uri',
                label: '📍 查看地圖',
                uri: mapsUrl,
              },
            },
          ],
        },
      },
    };
  }

  // 已接單卡片（顯示接單人，無按鈕）
  function buildAcceptedFlex(order, driverName) {
    const shopLine2 = [order.shop, order.customer, order.pickupNumber ? '#'+order.pickupNumber : ''].filter(Boolean).join('  ');
    const amountLine2 = [order.amount ? '訂單 $'+order.amount : '', order.deliveryFee ? '外送費 $'+order.deliveryFee : ''].filter(Boolean).join('　');
    const rows = [
      { label: '取餐',   value: shopLine2 },
      { label: '品項',   value: order.items },
      { label: '地址',   value: order.address },
      order.distance     ? { label: '距離', value: `約 ${order.distance} 公里` } : null,
      order.deliveryTime ? { label: '時間', value: order.deliveryTime } : null,
      amountLine2        ? { label: '費用', value: amountLine2 } : null,
      order.orderOpts    ? { label: '特殊', value: order.orderOpts } : null,
      order.cashPayment==='是' ? { label: '付款', value: '💵 需收現金' } : null,
    ].filter(Boolean);

    return {
      type: 'flex',
      altText: `✅ ${driverName} 已接單 — ${order.shop}${order.pickupNumber ? ' #' + order.pickupNumber : ''}`,
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#333333',
          paddingAll: '16px',
          contents: [
            { type: 'text', text: `✅ 已由 ${driverName} 接單`, color: '#ffffff', weight: 'bold', size: 'md', wrap: true },
            { type: 'text', text: `${order.shop}${order.pickupNumber ? ' #' + order.pickupNumber : ''} — 請勿重複接單`, color: '#aaaaaa', size: 'xs', margin: 'xs', wrap: true },
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
              { type: 'text', text: r.value, color: '#1a1a18', size: 'sm', flex: 7, wrap: true },
            ],
          })),
        },
      },
    };
  }

  // 棄單後重新派單卡片
  function buildReopenFlex(order, prevDriver) {
    const flex = buildPendingFlex(order);
    flex.contents.header.contents[0].text = `🔄 重新派單 — ${order.shop}${order.pickupNumber ? ' #' + order.pickupNumber : ''}`;
    flex.altText = `🔄 重新派單 — ${order.shop}`;
    flex.contents.header.backgroundColor = '#d97706';
    flex.contents.header.contents.push({
      type: 'text',
      text: `${prevDriver} 已棄單，重新開放接單`,
      color: '#fef3c7',
      size: 'xs',
      margin: 'xs',
    });
    return flex;
  }

  const body = req.body;

  // ── LINE Webhook 事件 ──
  if (body?.events) {
    for (const event of body.events) {
      if (event.source?.type === 'group') {
        console.log('群組 ID：', event.source.groupId);
      }

      if (event.type === 'postback') {
        const params  = new URLSearchParams(event.postback.data);
        const action  = params.get('action');
        const orderId = params.get('orderId');

        // 外送員按「接單」
        if (action === 'accept' && orderId) {
          const driverName = await getDisplayName(event.source.groupId, event.source.userId);
          try {
            const docSnap = await getOrder(orderId);
            const currentStatus = docSnap.fields?.status?.stringValue;
            const shop         = docSnap.fields?.shop?.stringValue || '';
            const pickupNumber = docSnap.fields?.pickupNumber?.stringValue || '';
            const shortId      = orderId.slice(-6).toUpperCase();

            if (currentStatus === 'pending') {
              await updateOrder(orderId, { status: 'accepted', driver: driverName });

              // 重新取得完整訂單資料
              const fullDoc = await getOrder(orderId);
              const order = {
                id: orderId, shortId,
                shop,        pickupNumber,
                customer:     fullDoc.fields?.customer?.stringValue || '',
                items:        fullDoc.fields?.items?.stringValue || '',
                address:      fullDoc.fields?.address?.stringValue || '',
                distance:     fullDoc.fields?.distance?.stringValue || '',
                deliveryTime: fullDoc.fields?.deliveryTime?.stringValue || '',
                amount:       fullDoc.fields?.amount?.stringValue || '',
                deliveryFee:  fullDoc.fields?.deliveryFee?.stringValue || '',
                note:         fullDoc.fields?.note?.stringValue || '',
              };

              // 發送已接單卡片（含棄單按鈕，合為一張卡）
              await sendToGroup([{
                type: 'flex',
                altText: `✅ ${driverName} 已接單 — ${shop}${pickupNumber ? ' #'+pickupNumber : ''}`,
                contents: {
                  type: 'bubble',
                  header: {
                    type: 'box',
                    layout: 'vertical',
                    backgroundColor: '#333333',
                    paddingAll: '14px',
                    contents: [
                      { type: 'text', text: `✅ 已由 ${driverName} 接單`, color: '#ffffff', weight: 'bold', size: 'md' },
                      { type: 'text', text: `${shop}${pickupNumber ? ' #'+pickupNumber : ''} — 請勿重複接單`, color: '#aaaaaa', size: 'xs', margin: 'xs', wrap: true },
                    ],
                  },
                  body: {
                    type: 'box',
                    layout: 'vertical',
                    spacing: 'md',
                    paddingAll: '14px',
                    contents: [
                      ...buildAcceptedFlex(order, driverName).contents.body.contents,
                      { type: 'separator', margin: 'md' },
                      { type: 'text', text: `${driverName}，請回覆預計到商場取餐的時間 🕐`, color: '#888888', size: 'sm', wrap: true, margin: 'md' },
                    ],
                  },
                  footer: {
                    type: 'box',
                    layout: 'horizontal',
                    paddingAll: '12px',
                    contents: [{
                      type: 'button',
                      style: 'secondary',
                      height: 'sm',
                      action: {
                        type: 'postback',
                        label: '棄單',
                        data: `action=drop&orderId=${orderId}&driverName=${encodeURIComponent(driverName)}`,
                      },
                    }],
                  },
                },
              }]);
            } else {
              // 已被別人接了
              const takenBy = docSnap.fields?.driver?.stringValue || '其他外送員';
              await sendToGroup([{
                type: 'text',
                text: `⚠️ 此訂單已由 ${takenBy} 接單，${driverName} 請接下一張。`,
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
            const docSnap = await getOrder(orderId);
            const currentStatus = docSnap.fields?.status?.stringValue;
            const actualDriver  = docSnap.fields?.driver?.stringValue || '';

            // 驗證：只有接單本人才能棄單
            const presserName = await getDisplayName(event.source.groupId, event.source.userId);
            if (presserName !== actualDriver) {
              await sendToGroup([{
                type: 'text',
                text: `⚠️ ${presserName}，此訂單由 ${actualDriver} 接單，只有接單人才能棄單。`,
              }]);
              continue;
            }

            if (currentStatus === 'accepted') {
              await updateOrder(orderId, { status: 'pending', driver: '' });

              const order = {
                id: orderId,
                shortId: orderId.slice(-6).toUpperCase(),
                shop:         docSnap.fields?.shop?.stringValue || '',
                pickupNumber: docSnap.fields?.pickupNumber?.stringValue || '',
                customer:     docSnap.fields?.customer?.stringValue || '',
                items:        docSnap.fields?.items?.stringValue || '',
                address:      docSnap.fields?.address?.stringValue || '',
                distance:     docSnap.fields?.distance?.stringValue || '',
                deliveryTime: docSnap.fields?.deliveryTime?.stringValue || '',
                amount:       docSnap.fields?.amount?.stringValue || '',
                deliveryFee:  docSnap.fields?.deliveryFee?.stringValue || '',
                note:         docSnap.fields?.note?.stringValue || '',
              };

              await sendToGroup([buildReopenFlex(order, driverName)]);
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
    try {
      await sendToGroup([buildPendingFlex(body.order)]);
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
