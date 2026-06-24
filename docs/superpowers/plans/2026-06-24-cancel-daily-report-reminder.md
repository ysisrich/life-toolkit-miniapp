# 日报今日取消提醒功能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现日报“今日取消提醒”功能，用户可在小程序端一键取消今天的日报推送提醒，支持随时恢复，且不影响打卡统计。

**Architecture:** 
1. 后端 `SettingsService` 保存设置方法升级为“浅合并”（Shallow Merge），以防前端修改设置时覆盖其他静默配置项。
2. 后端 `TasksService` 在进行每日提醒推送前，判断用户设置中是否包含等于今日日期的 `cancelReminderDate`，若是则跳过推送。
3. 小程序端在工作日且未打卡状态下展示“今日取消提醒”按钮，点击调用接口更新设置，打卡成功后联动清理该状态。

**Tech Stack:** NestJS, TypeScript, TypeORM, SQLite, 微信小程序 (Javascript, WXML, WXSS)

---

### Task 1: 后端 SettingsService 支持浅合并 (Shallow Merge)

**Files:**
- Modify: `apps/api-server/src/settings/settings.service.ts`
- Create: `apps/api-server/src/settings/settings.service.spec.ts`

- [ ] **Step 1: 编写单元测试**
  在 `apps/api-server/src/settings/settings.service.spec.ts` 中编写测试，确保保存设置时能正确合并已有的 JSON 配置。
  ```typescript
  import { Test, TestingModule } from '@nestjs/testing';
  import { getRepositoryToken } from '@nestjs/typeorm';
  import { SettingsService } from './settings.service';
  import { UserSetting } from '../user-settings.entity';

  describe('SettingsService', () => {
    let service: SettingsService;
    let repoMock: any;

    beforeEach(async () => {
      repoMock = {
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SettingsService,
          {
            provide: getRepositoryToken(UserSetting),
            useValue: repoMock,
          },
        ],
      }).compile();

      service = module.get<SettingsService>(SettingsService);
    });

    it('should merge settings when saving', async () => {
      const existingSetting = {
        userId: 1,
        toolKey: 'daily-report',
        settingData: JSON.stringify({ reminderTime: '18:00', lastPushedDate: '2026-06-23' }),
        updatedAt: new Date(),
      };
      repoMock.findOne.mockResolvedValue(existingSetting);

      await service.saveSetting(1, 'daily-report', { cancelReminderDate: '2026-06-24' });

      expect(repoMock.save).toHaveBeenCalled();
      const saved = repoMock.save.mock.calls[0][0];
      expect(JSON.parse(saved.settingData)).toEqual({
        reminderTime: '18:00',
        lastPushedDate: '2026-06-23',
        cancelReminderDate: '2026-06-24',
      });
    });
  });
  ```

- [ ] **Step 2: 运行测试以确认失败**
  运行：`pnpm --filter api-server run test src/settings/settings.service.spec.ts`
  预期：测试运行失败，因为当前 `saveSetting` 是直接重写而非合并。

- [ ] **Step 3: 实现 SettingsService.saveSetting 的浅合并**
  修改 `apps/api-server/src/settings/settings.service.ts` 的 `saveSetting` 方法：
  ```typescript
  async saveSetting(userId: number, toolKey: string, data: any) {
    let setting = await this.settingsRepository.findOne({ where: { userId, toolKey } });
    let finalData = data;
    
    if (setting) {
      try {
        const oldData = JSON.parse(setting.settingData);
        finalData = { ...oldData, ...data };
      } catch {}
      setting.settingData = JSON.stringify(finalData);
      setting.updatedAt = new Date();
    } else {
      setting = this.settingsRepository.create({ userId, toolKey, settingData: JSON.stringify(finalData) });
    }
    
    await this.settingsRepository.save(setting);
    return { success: true };
  }
  ```

- [ ] **Step 4: 重新运行测试以确认通过**
  运行：`pnpm --filter api-server run test src/settings/settings.service.spec.ts`
  预期：测试通过。

- [ ] **Step 5: 提交代码**
  ```bash
  git add apps/api-server/src/settings/settings.service.ts apps/api-server/src/settings/settings.service.spec.ts
  git commit -m "feat: 后端设置保存支持浅合并 (Shallow Merge)"
  ```

---

### Task 2: 后端 TasksService 支持今日取消提醒过滤

**Files:**
- Modify: `apps/api-server/src/tasks/tasks.service.ts`
- Create: `apps/api-server/src/tasks/tasks.service.spec.ts`

- [ ] **Step 1: 编写推送过滤单元测试**
  在 `apps/api-server/src/tasks/tasks.service.spec.ts` 中编写测试，确保当配置中的 `cancelReminderDate` 为今天时，跳过微信消息发送。
  ```typescript
  import { Test, TestingModule } from '@nestjs/testing';
  import { getRepositoryToken } from '@nestjs/typeorm';
  import { TasksService } from './tasks.service';
  import { UserSetting } from '../user-settings.entity';
  import { TaskRecord } from '../task-record.entity';
  import { WechatService } from '../wechat/wechat.service';
  import dayjs from 'dayjs';

  describe('TasksService - Daily Report Filter', () => {
    let service: TasksService;
    let settingsRepoMock: any;
    let taskRecordRepoMock: any;
    let wechatServiceMock: any;

    beforeEach(async () => {
      settingsRepoMock = {
        find: jest.fn(),
        save: jest.fn(),
      };
      taskRecordRepoMock = {
        findOne: jest.fn(),
      };
      wechatServiceMock = {
        sendSubscribeMessage: jest.fn(),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TasksService,
          { provide: getRepositoryToken(UserSetting), useValue: settingsRepoMock },
          { provide: getRepositoryToken(TaskRecord), useValue: taskRecordRepoMock },
          { provide: WechatService, useValue: wechatServiceMock },
        ],
      }).compile();

      service = module.get<TasksService>(TasksService);
      // Mock checkIsWorkday
      jest.spyOn(service, 'checkIsWorkday').mockResolvedValue(true);
    });

    it('should skip daily report reminder if cancelReminderDate is today', async () => {
      const todayStr = dayjs().format('YYYY-MM-DD');
      const mockSettings = [
        {
          userId: 1,
          toolKey: 'daily-report',
          settingData: JSON.stringify({
            reminderTime: '00:00', // 设置为 00:00 确保当前时间一定已超过提醒时间
            cancelReminderDate: todayStr,
          }),
          user: { openId: 'mock-openid' },
        },
      ];

      settingsRepoMock.find.mockResolvedValue(mockSettings);
      taskRecordRepoMock.findOne.mockResolvedValue(null); // 今天未打卡

      await service.handleDailyReportReminders();

      expect(wechatServiceMock.sendSubscribeMessage).not.toHaveBeenCalled();
    });
  });
  ```

- [ ] **Step 2: 运行测试以确认失败**
  运行：`pnpm --filter api-server run test src/tasks/tasks.service.spec.ts`
  预期：测试运行失败，因为还没有添加过滤逻辑。

- [ ] **Step 3: 实现 TasksService 的取消提醒过滤逻辑**
  在 `apps/api-server/src/tasks/tasks.service.ts` 的 `handleDailyReportReminders` 方法中，解析 `data.cancelReminderDate`，如果等于今天，则跳过推送：
  在 `const todayRecord = await this.taskRecordRepository.findOne(...)` 之前（约第 185 行）添加：
  ```typescript
  // 检查今天用户是否手动取消了提醒
  if (data.cancelReminderDate === nowObj.format('YYYY-MM-DD')) {
    this.logger.log(`User ${setting.userId} has cancelled reminders for today, skipping.`);
    continue;
  }
  ```

- [ ] **Step 4: 重新运行测试以确认通过**
  运行：`pnpm --filter api-server run test src/tasks/tasks.service.spec.ts`
  预期：测试通过。

- [ ] **Step 5: 提交代码**
  ```bash
  git add apps/api-server/src/tasks/tasks.service.ts apps/api-server/src/tasks/tasks.service.spec.ts
  git commit -m "feat: 后端日报推送逻辑支持今日取消提醒过滤"
  ```

---

### Task 3: 小程序前端 daily-report 页面交互逻辑实现

**Files:**
- Modify: `apps/miniapp/pages/tools/daily-report/index.js`

- [ ] **Step 1: 修改页面状态及加载逻辑**
  修改 `apps/miniapp/pages/tools/daily-report/index.js`：
  1. 在 `data` 中新增 `isReminderCancelled: false`。
  2. 在 `loadData()` 中，在获取 `settings` 成功后，比对 `cancelReminderDate`：
  ```javascript
  const todayStr = today.format('YYYY-MM-DD');
  const isReminderCancelled = settings && settings.cancelReminderDate === todayStr;
  this.setData({ 
    reminderTime: settings.reminderTime || '18:00',
    isReminderCancelled
  });
  ```

- [ ] **Step 2: 实现 toggleTodayReminder 交互方法**
  在 `index.js` 中新增 `toggleTodayReminder` 方法，支持一键取消和恢复今日提醒：
  ```javascript
  async toggleTodayReminder() {
    if (this.data.isWritten || this.data.isRestDay) return;

    const todayStr = dayjs().format('YYYY-MM-DD');
    const nextState = !this.data.isReminderCancelled;
    
    try {
      await updateToolSettings('daily-report', {
        cancelReminderDate: nextState ? todayStr : null
      });
      this.setData({ isReminderCancelled: nextState });
      wx.showToast({
        title: nextState ? '已取消今日提醒' : '已恢复今日提醒',
        icon: 'success'
      });
    } catch (e) {
      wx.showToast({ title: '操作失败', icon: 'error' });
    }
  },
  ```

- [ ] **Step 3: 实现打卡成功时静默清理今日取消状态**
  在 `recordReport()` 打卡成功的回调中（约第 79 行），添加静默清理逻辑：
  ```javascript
  // 打卡成功后，自动清理取消提醒的状态，确保数据一致性
  try {
    await updateToolSettings('daily-report', { cancelReminderDate: null });
  } catch (e) {
    console.error('静默清理取消提醒配置失败', e);
  }
  ```

- [ ] **Step 4: 提交代码**
  ```bash
  git add apps/miniapp/pages/tools/daily-report/index.js
  git commit -m "feat: 小程序端实现日报今日取消提醒控制逻辑"
  ```

---

### Task 4: 小程序前端 daily-report 按钮布局与样式美化

**Files:**
- Modify: `apps/miniapp/pages/tools/daily-report/index.wxml`
- Modify: `apps/miniapp/pages/tools/daily-report/index.wxss`

- [ ] **Step 1: 在 WXML 中加入控制按钮**
  在 `apps/miniapp/pages/tools/daily-report/index.wxml` 中加入“今日取消提醒”按钮，放置于 `leave-btn` 下方（约第 26 行）：
  ```xml
      <view class="cancel-btn {{isReminderCancelled ? 'cancelled' : ''}}" bindtap="toggleTodayReminder" wx:if="{{!isWritten && !isRestDay}}">
        <text>{{isReminderCancelled ? '🔔 恢复今日提醒' : '🚫 今日取消提醒'}}</text>
      </view>
  ```

- [ ] **Step 2: 在 WXSS 中加入精美样式**
  在 `apps/miniapp/pages/tools/daily-report/index.wxss` 中，于底部加入按钮样式：
  ```css
  .cancel-btn {
    margin-top: 20rpx;
    margin-bottom: 40rpx;
    padding: 20rpx 40rpx;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 40rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #FF9F0A;
    font-size: 28rpx;
    border: 1px solid rgba(255, 159, 10, 0.2);
    transition: all 0.3s ease;
  }

  .cancel-btn.cancelled {
    color: #8E8E93;
    border-color: rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.02);
  }

  .cancel-btn:active {
    background: rgba(255, 255, 255, 0.1);
    transform: scale(0.98);
  }
  ```

- [ ] **Step 3: 模拟器手动测试验证**
  1. 启动小程序模拟器，进入“写日报提醒”页面。
  2. 确认工作日状态下，主控圆环下方出现“🚫 今日取消提醒”按钮。
  3. 点击按钮，确认弹出 Toast 提示“已取消今日提醒”，且按钮样式变灰，变为“🔔 恢复今日提醒”。
  4. 再次点击，确认状态正确恢复。
  5. 取消提醒后，点击主控大圆环进行一次日报打卡，打卡成功后，确认页面重新渲染（因打卡成功，取消提醒按钮消失）。
  6. 检查本地 SQLite 数据库或通过调试控制台，确认 `cancelReminderDate` 已被清理为 `null`。

- [ ] **Step 4: 提交代码**
  ```bash
  git add apps/miniapp/pages/tools/daily-report/index.wxml apps/miniapp/pages/tools/daily-report/index.wxss
  git commit -m "style: 日报今日取消提醒按钮及交互样式"
  ```
