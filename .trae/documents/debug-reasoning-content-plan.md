# DeepSeek Reasoning Content 问题调查计划

## 问题描述

即使已经：

1. 在 `turnToOpenAi` 中回传 assistant 的 reasoning_content
2. 在 `partToTurnPart` 中保留 reasoning part
3. 在 `ChatTurnSchema` 中添加 reasoning 类型
4. 在 `buildChatBody` 中添加 DeepSeek 模型的 reasoning_content=''

错误仍然持续：`"The reasoning_content in the thinking mode must be passed back to the API."`

## 需要调查的点

### 1. 确认编译产物是否包含最新代码

- 检查 `packages/core/dist/providers/impl/openai.js` 是否包含 reasoning_content 回传逻辑
- 检查桌面端 webpack bundle 是否使用了最新的 core dist

### 2. 检查消息历史中的 reasoning part 是否正确存储

- 当 assistant 回复包含推理内容时，reasoning part 是否被正确保存到数据库
- 查看 `buildAssistantParts` 函数是否正确构建了 reasoning parts

### 3. 检查 conversation history 构建

- 当发送第二轮请求时（包含 tool result），turns 数组中是否包含了上一轮 assistant 的 reasoning part
- 检查 `toChatTurn` 是否正确转换了包含 reasoning 的 parts

### 4. 检查 DeepSeek API 要求的格式

- 错误信息说 "must be passed back"，可能是指必须在每个请求中都包含 reasoning_content 字段
- 可能需要检查是否只在 assistant 消息中有 reasoning_content，而 request body 级别也需要

## 调查步骤

### Step 1: 验证编译产物

```bash
# 检查 core dist 中是否有 reasoning_content 回传逻辑
grep -n "reasoning_content" packages/core/dist/providers/impl/openai.js

# 检查桌面端 bundle
grep -n "reasoning_content" apps/desktop/dist/main/index.js | head -20
```

### Step 2: 添加调试日志

在关键位置添加 console.log 来查看实际发送的数据：

- `buildChatBody` 中打印最终的 body 对象
- `turnToOpenAi` 中打印每个 turn 的转换结果
- `partToTurnPart` 中打印 reasoning part 的处理

### Step 3: 检查数据库中的消息

查看实际存储在数据库中的 assistant 消息的 parts 结构，确认 reasoning 数据是否被正确保存。

### Step 4: 根据调查结果修复

根据上述调查发现的问题进行针对性修复。
