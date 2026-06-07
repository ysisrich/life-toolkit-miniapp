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
    menuButtonHeight: 0
  },

  attached() {
    const app = getApp();
    const { navBarHeight, menuButtonInfo } = app.globalData;
    this.setData({
      navBarHeight: navBarHeight || 80,
      menuButtonTop: menuButtonInfo ? menuButtonInfo.top : 44,
      menuButtonHeight: menuButtonInfo ? menuButtonInfo.height : 32
    });
  },

  methods: {
    goBack() {
      wx.navigateBack({
        fail: () => {
          wx.switchTab({ url: '/pages/hub/index' });
        }
      });
    }
  }
});
