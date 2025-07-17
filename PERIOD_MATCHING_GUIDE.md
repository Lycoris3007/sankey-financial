# 时期匹配功能说明

## 概述

本功能确保从FMP API获取的income statement和revenue segmentation数据来自同一时期，避免数据混淆。

## 问题背景

之前的实现存在以下问题：
- 当获取Q2 2025的income statement数据时，如果segmentation数据只有Q1 2025的最新数据
- 系统会错误地将Q1的segmentation数据与Q2的income statement数据混合使用
- 这会导致数据不一致和误导性的分析结果

## 解决方案

### 1. 时期匹配逻辑

新的实现会：
1. 首先获取指定时期的income statement数据
2. 在segmentation数据中查找**完全匹配**的时期数据
3. 只有当fiscalYear和period都匹配时，才使用segmentation数据
4. 如果没有匹配的segmentation数据，则跳过segmentation部分

### 2. 匹配规则

#### 年度数据匹配
```javascript
const fiscalYearMatch = segment.fiscalYear === selectedIncomeData.fiscalYear;
// 年度数据不需要检查period
```

#### 季度数据匹配
```javascript
const fiscalYearMatch = segment.fiscalYear === selectedIncomeData.fiscalYear;
const periodMatch = segment.period === selectedIncomeData.period;
// 两个条件都必须满足
```

### 3. 历史对比数据匹配

对于变化计算，系统也会确保历史数据的时期匹配：

#### 环比 (Q/Q) 计算
- Q2 → Q1 (同一财年)
- Q1 → Q4 (上一财年)
- Q3 → Q2 (同一财年)
- Q4 → Q3 (同一财年)

#### 同比 (Y/Y) 计算
- Q2 2025 → Q2 2024
- FY2025 → FY2024

### 4. 错误处理

当没有找到匹配的segmentation数据时：
1. 在控制台显示警告信息
2. 列出可用的segmentation时期
3. 跳过segmentation部分，只显示income statement数据
4. 不会使用错误时期的数据

## 代码实现

### 核心匹配函数

```javascript
// 查找与income statement同一时期的segmentation数据
const matchingSegmentData = segmentJson.find(segment => {
  // 检查fiscalYear和period是否匹配
  const fiscalYearMatch = segment.fiscalYear === selectedIncomeData.fiscalYear;
  const periodMatch = period === 'annual' || segment.period === selectedIncomeData.period;
  return fiscalYearMatch && periodMatch;
});
```

### 历史数据匹配

```javascript
// 计算目标时期
let targetFiscalYear, targetPeriod;

if (period === 'quarter' && changeComparison === 'qoq') {
  // 环比：上一季度
  targetPeriod = getPreviousQuarter(selectedIncomeData.period);
  // 如果当前是Q1，上一季度是上一财年的Q4
  targetFiscalYear = selectedIncomeData.period === 'Q1' 
    ? selectedIncomeData.fiscalYear - 1 
    : selectedIncomeData.fiscalYear;
} else {
  // 同比：上一财年的同一季度/年度
  targetFiscalYear = selectedIncomeData.fiscalYear - 1;
  targetPeriod = selectedIncomeData.period;
}
```

## 用户体验改进

### 控制台日志

系统会在控制台提供详细的匹配信息：

```
✅ Found matching segmentation data for Q2 FY2025
✅ Found matching comparison segmentation data for Q1 FY2025
⚠️  No segmentation data found for Q2 FY2025. Skipping segmentation to avoid period mismatch.
ℹ️  Available segmentation periods: Q1 FY2025, Q4 FY2024, Q3 FY2024
```

### 数据完整性保证

- 只有在数据时期完全匹配时才会显示segmentation
- 避免了数据混淆和错误分析
- 保持了income statement数据的准确性

## 测试用例

系统包含以下测试场景：
1. Q2 2025 环比 (Q/Q) → Q1 2025
2. Q1 2025 环比 (Q/Q) → Q4 2024 (跨财年)
3. Q2 2025 同比 (Y/Y) → Q2 2024
4. FY2025 年度同比 → FY2024

## 注意事项

1. **数据可用性**: 如果segmentation数据不完整，图表仍会显示income statement部分
2. **时期格式**: 确保FMP API返回的时期格式一致 (Q1, Q2, Q3, Q4)
3. **财年处理**: 正确处理跨财年的环比计算
4. **向后兼容**: 不影响现有的income statement功能

## 未来改进

1. 可以考虑添加用户界面提示，告知用户segmentation数据不可用的原因
2. 可以提供选项让用户选择是否使用最接近时期的segmentation数据
3. 可以添加数据质量检查，验证segmentation总和与revenue的一致性
