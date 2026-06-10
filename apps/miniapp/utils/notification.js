import { getBarkConfig as apiGetBarkConfig, updateBarkConfig } from '../api/settings';
import config from '../config';

/**
 * 默默尝试增加一次微信订阅（如果用户之前勾选过“总是保持以上选择”）
 */
function silentAccumulateSubscription() {
  wx.getSetting({
    withSubscriptions: true,
    success(res) {
      if (
        res.subscriptionsSetting &&
        res.subscriptionsSetting.mainSwitch &&
        res.subscriptionsSetting.itemSettings &&
        res.subscriptionsSetting.itemSettings[config.SUBSCRIBE_TEMPLATE_ID] === 'accept'
      ) {
        wx.requestSubscribeMessage({
          tmplIds: [config.SUBSCRIBE_TEMPLATE_ID],
          success() {},
          fail() {}
        });
      }
    }
  });
}

/**
 * 发送 Bark 消息通知
 */
async function sendBarkNotification(title, body, url = '') {
  const config = await getBarkConfig();
  if (!config || !config.key) {
    console.warn('Bark 通知未配置');
    throw new Error('未配置 Bark Key');
  }

  const serverUrl = config.server || 'https://api.day.app';
  const barkKey = config.key;

  const pushUrl = `${serverUrl}/${barkKey}`;
  
  const payload = {
    title: title,
    body: body
  };
  if (url) {
    payload.url = url;
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: pushUrl,
      method: 'POST',
      data: payload,
      header: {
        'content-type': 'application/json'
      },
      success: (res) => {
        if (res.data && res.data.code === 200) {
          resolve(res.data);
        } else {
          reject(new Error(res.data.message || '发送失败'));
        }
      },
      fail: (err) => {
        reject(err);
      }
    });
  });
}

/**
 * 获取当前的 Bark 配置
 */
async function getBarkConfig() {
  try {
    const data = await apiGetBarkConfig();
    if (data) {
      return data;
    }
  } catch (e) {
    console.error('Failed to get bark config', e);
  }
  return { server: 'https://api.day.app', key: '' };
}

/**
 * 保存 Bark 配置
 */
async function saveBarkConfig(server, key) {
  const config = {
    server: server || 'https://api.day.app',
    key: key || ''
  };
  await updateBarkConfig(config);
}

module.exports = {
  sendBarkNotification,
  getBarkConfig,
  saveBarkConfig,
  silentAccumulateSubscription
};
