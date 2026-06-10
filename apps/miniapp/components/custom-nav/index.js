Component({
  properties: {
    title: {
      type: String,
      value: ''
    },
    back: {
      type: Boolean,
      value: true
    },
    placeholder: {
      type: Boolean,
      value: false
    },
    background: {
      type: String,
      value: 'transparent'
    }
  },

  data: {
    navBarHeight: 0,
    menuButtonTop: 0,
    menuButtonHeight: 0,
    isFirstPage: false
  },

  attached() {
    const app = getApp();
    const { navBarHeight, menuButtonInfo } = app.globalData;
    const pages = getCurrentPages();
    const isFirstPage = pages.length === 1;

    this.setData({
      navBarHeight: navBarHeight || 80,
      menuButtonTop: menuButtonInfo ? menuButtonInfo.top : 44,
      menuButtonHeight: menuButtonInfo ? menuButtonInfo.height : 32,
      isFirstPage
    });
  },

  methods: {
    goBack() {
      if (this.data.isFirstPage) {
        wx.reLaunch({ url: '/pages/hub/index' });
      } else {
        wx.navigateBack({
          fail: () => {
            wx.reLaunch({ url: '/pages/hub/index' });
          }
        });
      }
    }
  }
});
