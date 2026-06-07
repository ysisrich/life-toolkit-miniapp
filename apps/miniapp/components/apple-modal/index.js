Component({
  properties: {
    show: {
      type: Boolean,
      value: false
    }
  },
  methods: {
    close() {
      this.setData({ show: false });
      this.triggerEvent('close');
    },
    // WXS 可以通过 callMethod 调用逻辑层方法
    onWxsClose() {
      this.close();
    }
  }
})
