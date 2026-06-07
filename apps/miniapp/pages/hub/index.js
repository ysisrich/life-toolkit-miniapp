import { gsap } from 'gsap';

const app = getApp();

Page({
  data: {
    navBarHeight: 0,
    statusBarHeight: 0,
    greeting: '你好',
    // 供 GSAP 驱动的动画状态数组，与 tools 一一对应
    iconsAnimState: [],
    tools: [
      {
        id: 'nail-clipper',
        name: '剪指甲',
        icon: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M7,14C8.66,14 10,12.66 10,11C10,9.34 8.66,8 7,8C5.34,8 4,9.34 4,11C4,12.66 5.34,14 7,14M7,10C7.55,10 8,10.45 8,11C8,11.55 7.55,12 7,12C6.45,12 6,11.55 6,11C6,10.45 6.45,10 7,10M19,14C20.66,14 22,12.66 22,11C22,9.34 20.66,8 19,8C17.34,8 16,9.34 16,11C16,12.66 17.34,14 19,14M19,10C19.55,10 20,10.45 20,11C20,11.55 19.55,12 19,12C18.45,12 18,11.55 18,11C18,10.45 18.45,10 19,10M13,20C14.66,20 16,18.66 16,17C16,15.34 14.66,14 13,14C11.34,14 10,15.34 10,17C10,18.66 11.34,20 13,20M13,16C13.55,16 14,16.45 14,17C14,17.55 13.55,18 13,18C12.45,18 12,17.55 12,17C12,16.45 12.45,16 13,16Z" /></svg>',
        gradient: 'linear-gradient(135deg, rgba(10, 132, 255, 0.6) 0%, #000 100%)',
        path: '/pages/tools/nail-clipper/index'
      },
      {
        id: 'daily-report',
        name: '写日报',
        icon: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>',
        gradient: 'linear-gradient(135deg, rgba(255, 159, 10, 0.6) 0%, #000 100%)',
        path: '/pages/tools/daily-report/index'
      },
      // 增加几个占位图标，为了演示网格错开动画效果
      {
        id: 'sleep-tracker',
        name: '睡眠监测',
        icon: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M17.75,4.09L15.22,6.03L16.13,9.09L13.5,7.28L10.87,9.09L11.78,6.03L9.25,4.09L12.44,4L13.5,1L14.56,4L17.75,4.09M21.25,11L19.61,12.25L20.2,14.23L18.5,13.06L16.8,14.23L17.39,12.25L15.75,11L17.81,10.95L18.5,9L19.19,10.95L21.25,11M18.97,15.95C19.8,15.87 20.69,17.05 20.16,17.8C19.84,18.25 19.5,18.67 19.08,19.07C15.17,23 8.84,23 4.94,19.07C1.03,15.17 1.03,8.83 4.94,4.93C5.34,4.53 5.76,4.17 6.21,3.85C6.96,3.32 8.14,4.21 8.06,5.04C7.79,7.9 8.75,10.87 10.95,13.06C13.14,15.26 16.1,16.22 18.97,15.95Z" /></svg>',
        gradient: 'linear-gradient(135deg, rgba(94, 92, 230, 0.6) 0%, #000 100%)',
        path: ''
      },
      {
        id: 'medication',
        name: '吃药提醒',
        icon: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5A2,2 0 0,0 19,3M10,13.5V11H14V13.5H16.5V17.5H14V20H10V17.5H7.5V13.5H10Z" /></svg>',
        gradient: 'linear-gradient(135deg, rgba(255, 69, 58, 0.6) 0%, #000 100%)',
        path: ''
      }
    ]
  },

  onLoad() {
    const { navBarHeight, systemInfo } = app.globalData;
    
    this.setData({
      navBarHeight: navBarHeight,
      statusBarHeight: systemInfo.statusBarHeight
    });
  },

  updateGreeting() {
    const now = new Date();
    const hour = now.getHours();
    let greeting = '你好';
    if (hour < 5) greeting = '凌晨好';
    else if (hour < 9) greeting = '早上好';
    else if (hour < 12) greeting = '上午好';
    else if (hour < 14) greeting = '中午好';
    else if (hour < 18) greeting = '下午好';
    else if (hour < 22) greeting = '晚上好';
    else greeting = '夜深了';
    
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const date = now.getDate();
    const days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const day = days[now.getDay()];
    const dateString = `${year}年${month}月${date}日 ${day}`;

    this.setData({ greeting, dateString });
  },

  onShow() {
    this.updateGreeting();

    // 每次显示页面时（包括从其他页面返回），先将图标重置为隐藏、下沉状态
    const initialState = this.data.tools.map(() => ({
      y: 100,
      scale: 0.8,
      opacity: 0
    }));

    this.setData({
      iconsAnimState: initialState
    }, () => {
      // 在 setData 回调中执行，确保视图层已经重置完毕再开始动画，避免闪烁
      const animTargets = initialState.map(item => ({ ...item }));
      
      gsap.to(animTargets, {
        y: 0,
        scale: 1,
        opacity: 1,
        duration: 0.8,
        stagger: 0.1, // 错开入场
        ease: "elastic.out(1, 0.6)",
        onUpdate: () => {
          const safeStates = animTargets.map(t => ({
            y: t.y,
            scale: t.scale,
            opacity: t.opacity
          }));

          this.setData({
            iconsAnimState: safeStates
          });
        }
      });
    });
  },

  onSettingsTap() {
    wx.navigateTo({
      url: '/pages/settings/notification/index'
    });
  },

  onCardTap(e) {
    const path = e.currentTarget.dataset.path;
    if (path) {
      wx.navigateTo({
        url: path
      });
    } else {
      wx.showToast({
        title: '敬请期待',
        icon: 'none'
      });
    }
  }
});
