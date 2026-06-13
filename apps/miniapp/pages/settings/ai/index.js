import { getToolSettings, updateToolSettings } from '../../../api/settings';
import { fetchRemoteModels } from '../../../api/ai';

Page({
  data: {
    configs: [],
    activeConfigId: '',
    activeConfig: null,
    
    showModal: false,
    editIndex: -1,
    form: {
      name: '',
      baseUrl: '',
      apiKey: '',
      defaultModel: '',
      models: ''
    },
    
    loadingModels: false,
    showModelDropdown: false,
    modelOptions: []
  },

  onLoad() {
    this.loadSettings();
  },

  async loadSettings() {
    wx.showLoading({ title: '加载中...' });
    try {
      const data = await getToolSettings('ai-settings');
      if (data) {
        const configs = data.configs || [];
        const activeConfigId = data.activeConfigId || '';
        const activeConfig = configs.find(c => c.id === activeConfigId) || null;

        this.setData({
          configs,
          activeConfigId,
          activeConfig
        });
      }
    } catch (e) {
      console.error('加载AI配置失败', e);
      wx.showToast({ title: '加载失败', icon: 'error' });
    } finally {
      wx.hideLoading();
    }
  },

  async selectConfig(e) {
    const id = e.currentTarget.dataset.id;
    if (id === this.data.activeConfigId) return;

    this.setData({ activeConfigId: id });
    await this.saveSettings();
    wx.showToast({ title: '切换成功', icon: 'success' });
  },

  openAddModal() {
    this.setData({
      showModal: true,
      editIndex: -1,
      form: {
        name: '',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: '',
        defaultModel: 'gpt-4o',
        models: 'GPT-4o:gpt-4o,GPT-4o-Mini:gpt-4o-mini'
      },
      showModelDropdown: false,
      modelOptions: []
    });
  },

  openEditModal(e) {
    const index = e.currentTarget.dataset.index;
    const config = this.data.configs[index];
    this.setData({
      showModal: true,
      editIndex: index,
      form: { ...config },
      showModelDropdown: false,
      modelOptions: []
    });
  },

  closeModal() {
    this.setData({
      showModal: false,
      showModelDropdown: false
    });
  },

  onFormInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({
      [`form.${field}`]: value
    });
  },

  async saveForm() {
    const { name, baseUrl, apiKey, defaultModel } = this.data.form;
    if (!name || !baseUrl || !apiKey || !defaultModel) {
      wx.showToast({ title: '请填写完整必填项', icon: 'none' });
      return;
    }

    const configs = [...this.data.configs];
    const formConfig = { ...this.data.form };

    if (this.data.editIndex === -1) {
      // 添加
      formConfig.id = Date.now().toString();
      configs.push(formConfig);
    } else {
      // 编辑
      configs[this.data.editIndex] = formConfig;
    }

    this.setData({ configs, showModal: false });
    await this.saveSettings();
    wx.showToast({ title: '保存成功', icon: 'success' });
  },

  async deleteConfig(e) {
    const index = e.currentTarget.dataset.index;
    const config = this.data.configs[index];
    
    wx.showModal({
      title: '删除确认',
      content: `确定要删除“${config.name}”配置吗？`,
      confirmColor: '#FF4530',
      success: async (res) => {
        if (res.confirm) {
          const configs = this.data.configs.filter((_, i) => i !== index);
          let activeConfigId = this.data.activeConfigId;
          
          if (activeConfigId === config.id) {
            activeConfigId = ''; // 如果删除了当前使用的，自动切回默认
          }

          this.setData({ configs, activeConfigId });
          await this.saveSettings();
          wx.showToast({ title: '删除成功', icon: 'success' });
        }
      }
    });
  },

  async saveSettings() {
    wx.showLoading({ title: '保存中...', mask: true });
    try {
      const activeConfig = this.data.configs.find(c => c.id === this.data.activeConfigId) || null;
      
      await updateToolSettings('ai-settings', {
        configs: this.data.configs,
        activeConfigId: this.data.activeConfigId
      });

      this.setData({ activeConfig });
    } catch (e) {
      console.error('保存设置失败', e);
      wx.showToast({ title: '保存失败', icon: 'error' });
    } finally {
      wx.hideLoading();
    }
  },

  async fetchRemoteModels() {
    const { baseUrl, apiKey } = this.data.form;
    if (!baseUrl || !apiKey) {
      wx.showToast({ title: '请先填写接口基准地址与 API Key', icon: 'none' });
      return;
    }

    if (this.data.loadingModels) return;

    this.setData({ 
      loadingModels: true,
      showModelDropdown: false,
      modelOptions: []
    });

    try {
      const models = await fetchRemoteModels(baseUrl, apiKey);
      if (Array.isArray(models) && models.length > 0) {
        const modelsString = models.map(m => `${m.value}:${m.value}`).join(',');
        this.setData({
          modelOptions: models,
          showModelDropdown: true,
          'form.models': modelsString
        });
        wx.showToast({ title: `获取成功(${models.length}个)`, icon: 'success' });
      } else {
        wx.showToast({ title: '未获取到可用模型列表', icon: 'none' });
      }
    } catch (e) {
      console.error('获取远程模型失败', e);
      wx.showToast({ 
        title: e.message || '获取远程模型失败', 
        icon: 'none',
        duration: 3000
      });
    } finally {
      this.setData({ loadingModels: false });
    }
  },

  selectModelOption(e) {
    const value = e.currentTarget.dataset.value;
    this.setData({
      'form.defaultModel': value,
      showModelDropdown: false
    });
  }
});