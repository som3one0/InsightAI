"use client";

import { ChartConfig, ChatMessage } from "@/store/chatStore";

export function sanitizeAny(value: any): any {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'object') {
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (Array.isArray(value)) {
      return value.map(item => sanitizeAny(item));
    }
    if (value.constructor === Object) {
      const sanitized: Record<string, any> = {};
      for (const key of Object.keys(value)) {
        sanitized[key] = sanitizeAny(value[key]);
      }
      return sanitized;
    }
    return String(value);
  }
  if (typeof value === 'number') {
    if (isNaN(value) || !isFinite(value)) {
      return null;
    }
    return value;
  }
  if (typeof value === 'string') {
    const lowerValue = value.toLowerCase();
    if (lowerValue === 'nan' || lowerValue === 'null' || lowerValue === 'undefined' || lowerValue === 'none') {
      return null;
    }
  }
  return value;
}

export function sanitizeChartData(data: any[]): { name: string; value: number }[] {
  if (!Array.isArray(data)) {
    return [];
  }
  return data
    .map(item => {
      const name = item?.name ?? item?.x ?? item?.label ?? String(item);
      let value = item?.value ?? item?.y ?? item?.count ?? item?.total ?? 0;
      
      if (typeof value === 'string') {
        value = parseFloat(value);
      }
      if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
        value = 0;
      }
      
      return { name: String(name), value };
    })
    .filter(item => item.name && item.name !== 'undefined' && item.name !== 'null');
}

export function sanitizeChartConfig(config: ChartConfig | null | undefined): ChartConfig | null {
  if (!config) {
    return null;
  }
  
  const validTypes = ['bar', 'line', 'pie', 'scatter', 'histogram', 'none'];
  const type = validTypes.includes(config.type) ? config.type : 'none';
  
  return {
    id: config.id,
    type,
    title: String(config.title || ''),
    xAxis: String(config.xAxis || ''),
    yAxis: String(config.yAxis || ''),
    data: sanitizeChartData(config.data || []),
    colors: Array.isArray(config.colors) ? config.colors.filter(c => typeof c === 'string') : [],
    showDataLabels: Boolean(config.showDataLabels),
  };
}

export function sanitizeMessage(msg: ChatMessage): ChatMessage {
  return {
    ...msg,
    content: String(msg.content || ''),
    charts: (msg.charts || []).map(sanitizeChartConfig).filter(Boolean) as ChartConfig[],
    chartData: sanitizeChartData(msg.chartData || []),
    chartType: String(msg.chartType || 'none'),
    resultTable: sanitizeAny(msg.resultTable),
    resultColumns: Array.isArray(msg.resultColumns) ? msg.resultColumns.map(String) : [],
    followUpQuestions: Array.isArray(msg.followUpQuestions) 
      ? msg.followUpQuestions.map(q => String(q)).filter(Boolean)
      : [],
    timestamp: typeof msg.timestamp === 'number' ? msg.timestamp : Date.now(),
    dataSource: String(msg.dataSource || 'computed'),
    backendCalculations: msg.backendCalculations ?? true,
  };
}

export function sanitizeMessages(messages: ChatMessage[]): ChatMessage[] {
  if (!Array.isArray(messages)) {
    return [];
  }
  return messages.map(sanitizeMessage).filter(msg => msg && msg.id && msg.content);
}

export function safeRenderValue(value: any): string {
  if (value === null || value === undefined) {
    return '—';
  }
  if (typeof value === 'number') {
    if (isNaN(value) || !isFinite(value)) {
      return '—';
    }
    return value.toLocaleString();
  }
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'nan' || value.toLowerCase() === 'null' || value.toLowerCase() === 'undefined' || value.toLowerCase() === 'none') {
      return '—';
    }
    return value;
  }
  if (typeof value === 'object') {
    if (value instanceof Date) {
      return value.toLocaleDateString();
    }
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    return String(value);
  }
  return String(value);
}
