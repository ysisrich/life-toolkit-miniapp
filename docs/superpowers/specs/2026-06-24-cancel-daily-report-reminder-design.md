# 写日报今天取消提醒功能设计文档

本文档定义了“写日报”提醒功能中新增的“今日取消提醒/今日免打扰”特性的技术实现与交互设计。

## 需求背景
目前系统支持每日定时推送写日报的微信模板消息。如果用户某天不需要提醒（例如临时有事、调休、或纯粹不想被打扰），目前只能选择“今天请假啦”，这会记录一次“请假打卡”并影响打卡历史统计。
为了提供更细粒度的控制，我们新增“今日取消提醒”功能。点击后今天不再接收推送，但不会记录任何请假打卡数据，不影响打卡统计。

## 功能特性
1. **今日免打扰**：用户可在日报主页随时取消今天的提醒推送。
2. **状态可逆**：取消后，按钮变为“恢复今日提醒”，用户可以随时恢复提醒。
3. **打卡自动解除**：若用户取消提醒后又进行了日报打卡，免打扰状态自动清理。
4. **不污染统计**：此操作仅更改用户的提醒配置，不向 `task_records`（打卡历史表）写入任何数据，不影响日历统计。

## 系统架构与数据流

### 1. 数据模型扩展
用户的工具配置存储在 `UserSetting` 表的 `settingData`（JSON 字符串）字段中。
我们在此 JSON 对象中新增一个可选字段：
* `cancelReminderDate`?: `string | null` (格式为 `YYYY-MM-DD`，代表用户取消提醒的日期)

### 2. 后端服务 (NestJS)

#### A. 保护并发配置：`SettingsService.saveSetting`
为了防止前端在修改配置（例如更新提醒时间）时抹除其他静默配置项，后端接口在保存用户设置时应采用**浅合并（Shallow Merge）**：
* 文件路径：`apps/api-server/src/settings/settings.service.ts`
* 逻辑：读取已有 `settingData`，解析为 JSON，使用 `Object.assign` 或展开运算符 `{ ...oldData, ...newData }` 合并，再序列化存回数据库。

#### B. 定时任务过滤：`TasksService.handleDailyReportReminders`
* 文件路径：`apps/api-server/src/tasks/tasks.service.ts`
* 逻辑：在每分钟的定时检查任务中，当检测到某个用户待推送时，解析其 `settingData`：
  ```typescript
  if (data.cancelReminderDate === nowObj.format('YYYY-MM-DD')) {
    this.logger.log(`User ${setting.userId} has cancelled reminders for today, skipping.`);
    continue;
  }
  ```

### 3. 前端设计 (微信小程序)

#### A. 页面逻辑：`pages/tools/daily-report/index.js`
* **页面 Data 新增**：
  * `isReminderCancelled`: `boolean` (默认 `false`)
* **加载时判断 (`loadData`)**：
  * 读取 `settings.cancelReminderDate`，若与今天日期一致，则 `isReminderCancelled` 设为 `true`。
* **交互方法 (`toggleTodayReminder`)**：
  * 调用 `updateToolSettings('daily-report', { cancelReminderDate: nextState ? todayStr : null })`。
  * 成功后更新 `isReminderCancelled` 状态，并显示 Toast 提示。
* **打卡联动 (`recordReport`)**：
  * 用户打卡成功后，静默调用 `updateToolSettings('daily-report', { cancelReminderDate: null })` 清除免打扰状态。

#### B. 页面结构：`pages/tools/daily-report/index.wxml`
在“今天请假啦”按钮下方（仅当今天未打卡且为工作日时展示）：
```xml
<view class="cancel-btn {{isReminderCancelled ? 'cancelled' : ''}}" bindtap="toggleTodayReminder" wx:if="{{!isWritten && !isRestDay}}">
  <text>{{isReminderCancelled ? '🔔 恢复今日提醒' : '🚫 今日取消提醒'}}</text>
</view>
```

#### C. 样式表现：`pages/tools/daily-report/index.wxss`
* 提供精致的毛玻璃加暗色边框设计。
* 取消状态（`cancelled`）呈现柔和的灰色；未取消状态呈现柔和的橙黄色。

## 验证计划
1. **配置合并验证**：调用修改配置接口，验证多次修改不同字段（例如提醒时间、取消提醒日期）时，数据能正确合并而不被覆盖。
2. **定时任务过滤验证**：
   * 设置 `cancelReminderDate` 为今天，观察定时推送任务日志，确保其显示 `skipping` 并不发送微信推送。
   * 恢复提醒或进行打卡后，确认能正常进入推送流水。
3. **打卡联动验证**：取消提醒后进行打卡，确认数据库中的 `cancelReminderDate` 被自动清理。
